import { useState, type FormEvent } from 'react'
import { Field } from '../components/Form'
import { db } from '../data/db'
import { useCollection } from '../data/store'
import { useI18n } from '../i18n'
import { normalizeDzPhone } from '../lib/phone'
import { useSettings } from '../state/hooks'
import type { Order, Quote } from '../types'

export default function Contact() {
  const { t } = useI18n()
  const s = useSettings()
  const orders = useCollection(db.orders)
  const quotes = useCollection(db.quotes)
  const [ref, setRef] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<{ order?: Order; quote?: Quote } | 'none' | null>(null)

  const hasInfo = s.phone || s.whatsapp || s.email || s.address || s.hours
  const wa = s.whatsapp.replace(/\D/g, '')

  const search = (e: FormEvent) => {
    e.preventDefault()
    const r = ref.trim().toUpperCase()
    const p = normalizeDzPhone(phone)
    const order = orders.find((o) => o.ref === r && normalizeDzPhone(o.customer.phone) === p)
    const quote = quotes.find((q) => q.ref === r && normalizeDzPhone(q.business.phone) === p)
    setResult(order || quote ? { order, quote } : 'none')
  }

  return (
    <div className="contactpage">
      <h1>{t('contact.title')}</h1>
      <section className="card">
        {hasInfo ? (
          <dl className="dl">
            {s.phone && (
              <div>
                <dt>{t('contact.phone')}</dt>
                <dd>
                  <a href={`tel:${s.phone.replace(/\s/g, '')}`} dir="ltr">
                    {s.phone}
                  </a>
                </dd>
              </div>
            )}
            {wa && (
              <div>
                <dt>{t('contact.whatsapp')}</dt>
                <dd>
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" dir="ltr">
                    {s.whatsapp}
                  </a>
                </dd>
              </div>
            )}
            {s.email && (
              <div>
                <dt>{t('contact.email')}</dt>
                <dd>
                  <a href={`mailto:${s.email}`} dir="ltr">
                    {s.email}
                  </a>
                </dd>
              </div>
            )}
            {s.address && (
              <div>
                <dt>{t('contact.address')}</dt>
                <dd>{s.address}</dd>
              </div>
            )}
            {s.hours && (
              <div>
                <dt>{t('contact.hours')}</dt>
                <dd>{s.hours}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="muted">{t('contact.notSet')}</p>
        )}
      </section>

      <section className="card" id="suivi">
        <h2>{t('contact.track')}</h2>
        <p className="muted small">{t('contact.trackHint')}</p>
        <form className="form" onSubmit={search}>
          <div className="row2">
            <Field label={t('contact.trackRef')}>
              {(a) => <input id={a.id} dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="CMD-261106-ABCD" />}
            </Field>
            <Field label={t('checkout.phone')}>
              {(a) => <input id={a.id} dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
          </div>
          <button type="submit" className="btn btn--primary">
            {t('contact.trackBtn')}
          </button>
        </form>
        {result === 'none' && <div className="alert alert--warn">{t('contact.trackNone')}</div>}
        {result && result !== 'none' && (
          <div className="alert alert--ok">
            <strong dir="ltr">{result.order?.ref ?? result.quote?.ref}</strong> — {t(`status.${(result.order?.status ?? result.quote?.status) as 'new'}`)}
          </div>
        )}
      </section>
    </div>
  )
}
