import { memo } from 'react'
import { bundleAvailability, bundleEffectivePrice, bundleSaving } from '../domain'
import { useI18n } from '../i18n'
import { addToCart, addToQuote, type Mode } from '../state/cart'
import { useCatalog } from '../state/hooks'
import type { Bundle } from '../types'
import { IconCart, IconQuote } from './Icons'
import { ProductImage } from './ProductBits'
import { useToast } from './Toast'

export const BundleCard = memo(function BundleCard({ bundle, mode }: { bundle: Bundle; mode: Mode }) {
  const { t, L, money } = useI18n()
  const { productById } = useCatalog()
  const toast = useToast()
  const items = bundle.items.flatMap((it) => {
    const p = productById.get(it.productId)
    return p ? [{ p, qty: it.qty }] : []
  })
  const unavailable = items.length !== bundle.items.length || bundleAvailability(bundle.items, productById) < 1
  const price = bundleEffectivePrice(bundle)
  const promo = price < bundle.price
  // reference value of the parts (active sale prices counted): shown only when the pack is genuinely cheaper
  const sv = bundleSaving(bundle, productById)
  const parts = sv && sv.saving > 0 ? sv : null
  const title = L(bundle.title)

  return (
    <article className="bcard">
      <div className="bcard__collage" aria-hidden="true">
        {items.slice(0, 4).map((i) => (
          <ProductImage key={i.p.id} product={i.p} />
        ))}
      </div>
      <div className="bcard__body">
        <h3 className="bcard__title">{title}</h3>
        <div className="bcard__incl">{t('bundles.includes')}</div>
        <ul className="bcard__list">
          {items.map((i) => (
            <li key={i.p.id}>
              <bdi>{i.qty}×</bdi> {L(i.p.name)}
            </li>
          ))}
        </ul>
        <div className="price price--lg">
          <span className={promo ? 'price__now price__now--sale' : 'price__now'}>{money(price)}</span>
          {(promo || parts) && <s className="price__old">{money(parts ? parts.referenceValue : bundle.price)}</s>}
          {(promo || parts) && <span className="badge badge--sale">{t('bundles.save', { amount: money(parts ? parts.saving : bundle.price - price) })}</span>}
        </div>
        {unavailable && <p className="muted small">{t('bundles.unavailable')}</p>}
      </div>
      <div className="bcard__actions">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={unavailable}
          onClick={() => {
            addToCart('bundle', bundle.id, 1)
            toast.show(t('toast.added', { name: title }), { to: '/panier', actionLabel: t('toast.view') })
          }}
        >
          <IconCart size={17} /> {t('product.add')}
        </button>
        {mode === 'wholesale' && (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => {
              items.forEach((i) => addToQuote(i.p.id, i.qty))
              toast.show(t('toast.addedQuote', { name: title }), { to: '/devis', actionLabel: t('toast.view') })
            }}
          >
            <IconQuote size={17} /> {t('bundles.addItemsToQuote')}
          </button>
        )}
      </div>
    </article>
  )
})
