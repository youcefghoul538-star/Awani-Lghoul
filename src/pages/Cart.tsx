import { Link, useNavigate } from 'react-router-dom'
import { IconTrash } from '../components/Icons'
import { ProductImage, QtyStepper } from '../components/ProductBits'
import { BundleThumb } from '../components/BundleThumb'
import { useI18n } from '../i18n'
import { removeFromCart, setCartQty } from '../state/cart'
import { useResolvedCart } from '../state/hooks'

export default function Cart() {
  const { t, L, money } = useI18n()
  const { resolved, subtotal, count } = useResolvedCart()
  const nav = useNavigate()

  if (resolved.length === 0) {
    return (
      <div className="empty">
        <h1>{t('cart.title')}</h1>
        <p>{t('cart.empty')}</p>
        <Link to="/" className="btn btn--primary">
          {t('cart.continue')}
        </Link>
      </div>
    )
  }

  const blocked = resolved.some((r) => !r.available || r.line.qty > r.max)

  return (
    <div className="cartpage">
      <h1>{t('cart.title')}</h1>
      <div className="cartgrid">
        <ul className="lines">
          {resolved.map((r) => {
            const key = `${r.line.kind}-${r.line.id}`
            const over = r.line.qty > r.max
            return (
              <li key={key} className="line">
                <Link to={r.product ? `/produit/${r.product.id}` : '/packs'} className="line__img">
                  {r.product ? <ProductImage product={r.product} /> : r.bundle && <BundleThumb bundle={r.bundle} />}
                </Link>
                <div className="line__main">
                  <div className="line__name">{r.product ? L(r.product.name) : L(r.bundle?.title)}</div>
                  <div className="muted small">{r.product ? <><span>{t('product.sku')} </span><bdi>{r.sku}</bdi></> : t('cart.pack')}</div>
                  <div className="muted small">
                    {t('cart.unit')} : {money(r.unitPrice)}
                  </div>
                  {!r.available && <div className="alert alert--bad">{t('stock.out')}</div>}
                  {r.available && over && <div className="alert alert--warn">{t('stock.max', { n: r.max })}</div>}
                </div>
                <div className="line__qty">
                  <QtyStepper
                    value={r.line.qty}
                    max={Math.max(1, r.max)}
                    onChange={(n) => setCartQty(r.line.kind, r.line.id, n, r.max || 9999)}
                    compact
                  />
                  <button type="button" className="linkbtn linkbtn--bad" onClick={() => removeFromCart(r.line.kind, r.line.id)}>
                    <IconTrash size={15} /> {t('cart.remove')}
                  </button>
                </div>
                <div className="line__total">{money(r.available ? r.unitPrice * r.line.qty : 0)}</div>
              </li>
            )
          })}
        </ul>

        <aside className="summary">
          <h2>{t('checkout.summary')}</h2>
          <div className="summary__row">
            <span>{t('cart.items', { n: count })}</span>
          </div>
          <div className="summary__row summary__row--total">
            <span>{t('cart.subtotal')}</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <p className="muted small">{t('cart.deliveryNote')}</p>
          <button type="button" className="btn btn--primary btn--lg btn--block" disabled={blocked || subtotal <= 0} onClick={() => nav('/commande')}>
            {t('cart.checkout')}
          </button>
          <Link to="/" className="btn btn--ghost btn--block">
            {t('cart.continue')}
          </Link>
        </aside>
      </div>
    </div>
  )
}
