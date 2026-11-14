import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Field, WilayaSelect } from '../components/Form'
import { IconTrash } from '../components/Icons'
import { ProductImage, QtyStepper } from '../components/ProductBits'
import { StorageFullError } from '../data/store'
import { useI18n, type TKey } from '../i18n'
import { isValidDzPhone, isValidEmail } from '../lib/phone'
import { ServiceError, submitQuote, submitQuoteRemote } from '../services'
import { SUPABASE_CONFIGURED } from '../data/config'
import { clearQuote, removeFromQuote, setQuoteQty } from '../state/cart'
import { useResolvedQuote } from '../state/hooks'

const TYPES = ['retailer', 'reseller', 'horeca', 'institution', 'other'] as const

interface Form {
  companyName: string
  contactName: string
  phone: string
  email: string
  wilaya: string
  businessType: string
  address: string
  notes: string
}
type Errors = Partial<Record<keyof Form, TKey>>

function validate(f: Form): Errors {
  const e: Errors = {}
  if (!f.companyName.trim()) e.companyName = 'err.required'
  if (!f.contactName.trim()) e.contactName = 'err.required'
  if (!f.phone.trim()) e.phone = 'err.required'
  else if (!isValidDzPhone(f.phone)) e.phone = 'err.phone'
  if (f.email.trim() && !isValidEmail(f.email)) e.email = 'err.email'
  if (!f.wilaya) e.wilaya = 'err.required'
  return e
}

/** Wholesale quotation request. Deliberately shows NO prices of any kind. */
export default function QuoteRequest() {
  const { t, lang, L } = useI18n()
  const { resolved } = useResolvedQuote()
  const nav = useNavigate()
  const [f, setF] = useState<Form>({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    wilaya: '',
    businessType: 'retailer',
    address: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  if (resolved.length === 0) {
    return (
      <div className="empty">
        <h1>{t('quote.title')}</h1>
        <p>{t('quote.empty')}</p>
        <Link to="/" className="btn btn--accent">
          {t('quote.browse')}
        </Link>
      </div>
    )
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (inFlight.current) return
    const errs = validate(f)
    setErrors(errs)
    if (Object.keys(errs).length) {
      setSubmitError(t('err.fix'))
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    setSubmitError('')
    inFlight.current = true
    setSubmitting(true)
    let ref: string
    try {
      // only product ids and quantities are sent — a quotation request never carries a price
      const input = {
        business: { companyName: f.companyName, contactName: f.contactName, phone: f.phone, email: f.email, wilaya: f.wilaya, businessType: f.businessType, address: f.address, notes: f.notes },
        lines: resolved.map((r) => ({ productId: r.product.id, qty: r.item.qty })),
        lang,
      }
      ref = SUPABASE_CONFIGURED ? (await submitQuoteRemote(input)).ref : submitQuote(input).ref
    } catch (err) {
      setSubmitError(err instanceof StorageFullError ? t('err.storage') : err instanceof Error ? err.message : err instanceof ServiceError ? err.message : String(err))
      inFlight.current = false
      setSubmitting(false)
      return
    }
    nav(`/devis/confirmation/${ref}`, { replace: true, state: SUPABASE_CONFIGURED ? { remote: true } : undefined })
    clearQuote()
  }

  return (
    <div className="cartpage">
      <h1>{t('quote.title')}</h1>
      <p className="muted">{t('quote.intro')}</p>
      <div className="cartgrid cartgrid--quote">
        <form className="form" onSubmit={submit} noValidate>
          <section className="card">
            <h2>{t('quote.items')}</h2>
            <ul className="lines lines--plain">
              {resolved.map((r) => (
                <li key={r.product.id} className="line line--quote">
                  <Link to={`/produit/${r.product.id}`} className="line__img line__img--sm">
                    <ProductImage product={r.product} />
                  </Link>
                  <div className="line__main">
                    <div className="line__name">{L(r.product.name)}</div>
                    <div className="muted small">
                      {t('product.sku')} <bdi>{r.product.sku}</bdi>
                    </div>
                  </div>
                  <div className="line__qty">
                    <QtyStepper value={r.item.qty} onChange={(n) => setQuoteQty(r.product.id, n)} compact />
                    <button type="button" className="linkbtn linkbtn--bad" onClick={() => removeFromQuote(r.product.id)}>
                      <IconTrash size={15} /> {t('cart.remove')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/" className="link">
              + {t('quote.browse')}
            </Link>
          </section>

          <section className="card">
            <h2>{t('quote.business')}</h2>
            <Field label={t('quote.company')} required error={errors.companyName && t(errors.companyName)}>
              {(a) => <input id={a.id} value={f.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" aria-invalid={a.invalid} aria-describedby={a.describedBy} />}
            </Field>
            <div className="row2">
              <Field label={t('quote.contact')} required error={errors.contactName && t(errors.contactName)}>
                {(a) => <input id={a.id} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} autoComplete="name" aria-invalid={a.invalid} aria-describedby={a.describedBy} />}
              </Field>
              <Field label={t('quote.phone')} required hint={t('checkout.phoneHint')} error={errors.phone && t(errors.phone)}>
                {(a) => <input id={a.id} type="tel" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" aria-invalid={a.invalid} aria-describedby={a.describedBy} placeholder="05 55 12 34 56" />}
              </Field>
            </div>
            <div className="row2">
              <Field label={t('quote.email')} error={errors.email && t(errors.email)}>
                {(a) => <input id={a.id} type="email" dir="ltr" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" aria-invalid={a.invalid} aria-describedby={a.describedBy} />}
              </Field>
              <Field label={t('quote.wilaya')} required error={errors.wilaya && t(errors.wilaya)}>
                {(a) => <WilayaSelect id={a.id} value={f.wilaya} onChange={(v) => set('wilaya', v)} invalid={a.invalid} describedBy={a.describedBy} />}
              </Field>
            </div>
            <Field label={t('quote.type')}>
              {(a) => (
                <select id={a.id} value={f.businessType} onChange={(e) => set('businessType', e.target.value)}>
                  {TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`quote.type.${ty}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('quote.address')}>{(a) => <input id={a.id} value={f.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" />}</Field>
            <Field label={t('quote.notes')}>{(a) => <textarea id={a.id} rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
            {submitError && (
              <div className="alert alert--bad" role="alert">
                {submitError}
              </div>
            )}
            <button type="submit" disabled={submitting} className="btn btn--accent btn--lg btn--block">
              {submitting ? 'Envoi en cours…' : t('quote.submit')}
            </button>
          </section>
        </form>
      </div>
    </div>
  )
}
