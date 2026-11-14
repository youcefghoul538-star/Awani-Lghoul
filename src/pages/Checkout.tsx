import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Field, WilayaSelect } from '../components/Form'
import { StorageFullError } from '../data/store'
import { useI18n, type TKey } from '../i18n'
import { isValidDzPhone } from '../lib/phone'
import { placeRetailOrder, ServiceError, createRetailOrderRemote } from '../services'
import { SUPABASE_CONFIGURED } from '../data/config'
import { clearCart } from '../state/cart'
import { useCatalog, useResolvedCart } from '../state/hooks'

interface Form {
  fullName: string
  phone: string
  wilaya: string
  address: string
  notes: string
}
type Errors = Partial<Record<keyof Form, TKey>>

function validate(f: Form): Errors {
  const e: Errors = {}
  if (!f.fullName.trim()) e.fullName = 'err.required'
  if (!f.phone.trim()) e.phone = 'err.required'
  else if (!isValidDzPhone(f.phone)) e.phone = 'err.phone'
  if (!f.wilaya) e.wilaya = 'err.required'
  if (!f.address.trim()) e.address = 'err.required'
  return e
}

export default function Checkout() {
  const { t, lang, money } = useI18n()
  const { resolved, subtotal, count } = useResolvedCart()
  const { productById } = useCatalog()
  const nav = useNavigate()
  const [f, setF] = useState<Form>({ fullName: '', phone: '', wilaya: '', address: '', notes: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  // set once the order is saved, so emptying the cart does not trigger the "empty cart" redirect
  const submitted = useRef(false)
  // synchronous lock: React state updates are async, so two fast clicks could otherwise both submit
  const inFlight = useRef(false)

  const orderable = resolved.filter((r) => r.available && r.line.qty <= r.max)
  if (resolved.length === 0) return submitted.current ? null : <Navigate to="/panier" replace />

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
    if (orderable.length !== resolved.length) {
      nav('/panier')
      return
    }
    setSubmitError('')
    inFlight.current = true
    setSubmitting(true)
    let ref: string
    let remoteReceiptToken: string | undefined
    try {
      const input = {
        customer: { fullName: f.fullName, phone: f.phone, wilaya: f.wilaya, address: f.address, notes: f.notes },
        lines: orderable.map((r) => ({ kind: r.line.kind, refId: r.line.id, qty: r.line.qty })),
        lang,
      }
      // When Supabase is configured, fail closed: never silently save a real order only in this browser.
      if (SUPABASE_CONFIGURED) {
        const result = await createRetailOrderRemote(input)
        ref = result.ref
        remoteReceiptToken = result.receiptToken
      } else {
        ref = placeRetailOrder(input).ref
      }
    } catch (err) {
      if (err instanceof ServiceError && err.code === 'INSUFFICIENT_STOCK') {
        const names = err.shortages.map((s) => productById.get(s.productId)?.name.fr ?? s.productId).join(', ')
        setSubmitError(`${t('err.stock')} ${names}`)
        inFlight.current = false
        setSubmitting(false)
        return
      }
      if (err instanceof ServiceError && err.code === 'VALIDATION' && Object.keys(err.fields).length) {
        const e: Errors = {}
        for (const k of Object.keys(err.fields) as (keyof Form)[]) e[k] = err.fields[k] === 'phone' ? 'err.phone' : 'err.required'
        setErrors(e)
        setSubmitError(t('err.fix'))
        inFlight.current = false
        setSubmitting(false)
        return
      }
      setSubmitError(err instanceof StorageFullError ? t('err.storage') : err instanceof Error ? err.message : err instanceof ServiceError ? err.message : String(err))
      inFlight.current = false
      setSubmitting(false)
      return
    }
    submitted.current = true
    nav(`/confirmation/${ref}`, { replace: true, state: SUPABASE_CONFIGURED ? { remote: true, receiptToken: remoteReceiptToken } : undefined })
    clearCart()
  }

  return (
    <div className="cartpage">
      <h1>{t('checkout.title')}</h1>
      <p className="muted">{t('checkout.subtitle')}</p>
      <div className="cartgrid">
        <form className="card form" onSubmit={submit} noValidate>
          <Field label={t('checkout.fullName')} required error={errors.fullName && t(errors.fullName)}>
            {(a) => (
              <input id={a.id} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" aria-invalid={a.invalid} aria-describedby={a.describedBy} />
            )}
          </Field>
          <Field label={t('checkout.phone')} required hint={t('checkout.phoneHint')} error={errors.phone && t(errors.phone)}>
            {(a) => (
              <input id={a.id} type="tel" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" aria-invalid={a.invalid} aria-describedby={a.describedBy} placeholder="05 55 12 34 56" />
            )}
          </Field>
          <Field label={t('checkout.wilaya')} required error={errors.wilaya && t(errors.wilaya)}>
            {(a) => <WilayaSelect id={a.id} value={f.wilaya} onChange={(v) => set('wilaya', v)} invalid={a.invalid} describedBy={a.describedBy} />}
          </Field>
          <Field label={t('checkout.address')} required error={errors.address && t(errors.address)}>
            {(a) => (
              <textarea id={a.id} rows={3} value={f.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" aria-invalid={a.invalid} aria-describedby={a.describedBy} />
            )}
          </Field>
          <Field label={t('checkout.notes')}>
            {(a) => <textarea id={a.id} rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
          {submitError && (
            <div className="alert alert--bad" role="alert">
              {submitError}
            </div>
          )}
          <button type="submit" disabled={submitting} className="btn btn--primary btn--lg btn--block">
            {submitting ? 'Envoi en cours…' : t('checkout.submit')}
          </button>
        </form>

        <aside className="summary">
          <h2>{t('checkout.summary')}</h2>
          <ul className="mini">
            {resolved.map((r) => (
              <li key={`${r.line.kind}-${r.line.id}`}>
                <span>
                  <bdi>{r.line.qty}×</bdi> {r.name}
                </span>
                <span>{money(r.unitPrice * r.line.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="summary__row summary__row--total">
            <span>
              {t('cart.subtotal')} · {t('cart.items', { n: count })}
            </span>
            <strong>{money(subtotal)}</strong>
          </div>
          <p className="muted small">{t('cart.deliveryNote')}</p>
          <Link to="/panier" className="linkbtn">
            {t('common.back')}
          </Link>
        </aside>
      </div>
    </div>
  )
}
