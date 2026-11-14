import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { IconCheck } from '../components/Icons'
import { db } from '../data/db'
import { useCollection } from '../data/store'
import { useI18n } from '../i18n'
import { formatDate } from '../lib/format'
import { fetchOrderReceiptRemote, type RemoteReceipt } from '../services/remoteSubmission'

function DemoNotice({ show }: { show: boolean }) {
  const { t } = useI18n()
  if (!show) return null
  return (
    <div className="alert alert--warn" role="note">
      {t('confirm.demo')}
    </div>
  )
}

export function OrderConfirmation() {
  const { ref } = useParams()
  const { t, lang, money } = useI18n()
  const location = useLocation()
  const navState = location.state as { remote?: boolean; receiptToken?: string } | null
  const remote = Boolean(navState?.remote)
  const token = navState?.receiptToken
  const orders = useCollection(db.orders)
  const order = orders.find((o) => o.ref === ref)
  const [receipt, setReceipt] = useState<RemoteReceipt | null>(null)
  useEffect(() => {
    if (!remote || !ref || !token) return
    let cancelled = false
    fetchOrderReceiptRemote(ref, token)
      .then((r) => !cancelled && setReceipt(r))
      .catch(() => undefined) // receipt is a convenience: the reference alone is already shown
    return () => {
      cancelled = true
    }
  }, [remote, ref, token])
  if (remote) return (
    <div className="confirm">
      <div className="confirm__icon"><IconCheck size={34} /></div>
      <h1>{t('confirm.orderTitle')}</h1>
      <p className="confirm__msg">{t('confirm.orderMsg')}</p>
      <div className="refbox"><span>{t('confirm.ref')}</span><strong dir="ltr">{ref}</strong><small>{t('confirm.keepRef')}</small></div>
      <p className="muted">Votre demande a été enregistrée. L’équipe vous contactera pour confirmer la disponibilité et les modalités. Aucun stock n’est réservé à cette étape.</p>
      {receipt && (
        <div className="card confirm__detail">
          <h2>{t('confirm.details')}</h2>
          <ul className="mini">
            {receipt.lines.map((l, i) => (
              <li key={i}>
                <span>
                  <bdi>{l.qty}×</bdi> {l.name}
                </span>
                <span>{money(l.unitPrice * l.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="summary__row summary__row--total">
            <span>{t('cart.subtotal')}</span>
            <strong>{money(receipt.total)}</strong>
          </div>
        </div>
      )}
      <Link to="/" className="btn btn--primary">{t('confirm.back')}</Link>
    </div>
  )
  if (!order) return <NotFound />
  return (
    <div className="confirm">
      <div className="confirm__icon">
        <IconCheck size={34} />
      </div>
      <h1>{t('confirm.orderTitle')}</h1>
      <p className="confirm__msg">{t('confirm.orderMsg')}</p>
      <div className="refbox">
        <span>{t('confirm.ref')}</span>
        <strong dir="ltr">{order.ref}</strong>
        <small>{t('confirm.keepRef')}</small>
      </div>
      <DemoNotice show={order.localOnly} />
      <div className="card confirm__detail">
        <h2>{t('confirm.details')}</h2>
        <p className="muted small">{formatDate(order.createdAt, lang)}</p>
        <ul className="mini">
          {order.lines.map((l, i) => (
            <li key={i}>
              <span>
                <bdi>{l.qty}×</bdi> {l.name}
              </span>
              <span>{money(l.unitPrice * l.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="summary__row summary__row--total">
          <span>{t('cart.subtotal')}</span>
          <strong>{money(order.subtotal)}</strong>
        </div>
        <p className="muted small">{t('cart.deliveryNote')}</p>
      </div>
      <Link to="/" className="btn btn--primary">
        {t('confirm.back')}
      </Link>
    </div>
  )
}

export function QuoteConfirmation() {
  const { ref } = useParams()
  const { t, lang } = useI18n()
  const location = useLocation()
  const remote = Boolean((location.state as { remote?: boolean } | null)?.remote)
  const quotes = useCollection(db.quotes)
  const quote = quotes.find((q) => q.ref === ref)
  if (remote) return (
    <div className="confirm">
      <div className="confirm__icon confirm__icon--ws"><IconCheck size={34} /></div>
      <h1>{t('quote.confirmTitle')}</h1>
      <p className="confirm__msg">{t('quote.confirmMsg')}</p>
      <div className="refbox"><span>{t('confirm.ref')}</span><strong dir="ltr">{ref}</strong><small>{t('confirm.keepRef')}</small></div>
      <p className="muted">{t('quote.notPurchase')}</p>
      <Link to="/" className="btn btn--primary">{t('confirm.back')}</Link>
    </div>
  )
  if (!quote) return <NotFound />
  return (
    <div className="confirm">
      <div className="confirm__icon confirm__icon--ws">
        <IconCheck size={34} />
      </div>
      <h1>{t('quote.confirmTitle')}</h1>
      <p className="confirm__msg">{t('quote.confirmMsg')}</p>
      <div className="refbox">
        <span>{t('confirm.ref')}</span>
        <strong dir="ltr">{quote.ref}</strong>
        <small>{t('confirm.keepRef')}</small>
      </div>
      <p className="muted">{t('quote.notPurchase')}</p>
      <DemoNotice show={quote.localOnly} />
      <div className="card confirm__detail">
        <h2>{t('quote.items')}</h2>
        <p className="muted small">{formatDate(quote.createdAt, lang)}</p>
        <ul className="mini">
          {quote.lines.map((l, i) => (
            <li key={i}>
              <span>
                {l.name} <small className="muted">(<bdi>{l.sku}</bdi>)</small>
              </span>
              <span>
                <bdi>×{l.qty}</bdi>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Link to="/" className="btn btn--primary">
        {t('confirm.back')}
      </Link>
    </div>
  )
}

function NotFound() {
  const { t } = useI18n()
  return (
    <div className="empty">
      <p>{t('confirm.notFound')}</p>
      <Link to="/" className="btn btn--primary">
        {t('confirm.back')}
      </Link>
    </div>
  )
}
