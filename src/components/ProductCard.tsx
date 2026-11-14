import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { addToCart, addToQuote, type Mode } from '../state/cart'
import type { Product } from '../types'
import { IconCart, IconQuote } from './Icons'
import { Price, ProductImage, QtyStepper, StockBadge } from './ProductBits'
import { useToast } from './Toast'

export const ProductCard = memo(function ProductCard({ product, mode }: { product: Product; mode: Mode }) {
  const { t, L } = useI18n()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const out = product.stock <= 0
  const name = L(product.name)

  const addRetail = () => {
    addToCart('product', product.id, 1, product.stock)
    toast.show(t('toast.added', { name }), { to: '/panier', actionLabel: t('toast.view') })
  }
  const addWholesale = (n: number) => {
    addToQuote(product.id, n)
    toast.show(t('toast.addedQuote', { name }), { to: '/devis', actionLabel: t('toast.view') })
  }

  return (
    <article className="pcard">
      <Link to={`/produit/${product.id}`} className="pcard__media" aria-label={name}>
        <ProductImage product={product} />
        {out && <span className="pcard__out">{t('stock.out')}</span>}
        {product.demo && <span className="pcard__demo">{t('product.demo')}</span>}
      </Link>
      <div className="pcard__body">
        <h3 className="pcard__name">
          <Link to={`/produit/${product.id}`}>{name}</Link>
        </h3>
        <div className="pcard__sku">
          {t('product.sku')} <bdi>{product.sku}</bdi>
        </div>
        <Price product={product} />
        <StockBadge stock={product.stock} />
      </div>
      <div className="pcard__actions">
        {mode === 'retail' ? (
          <>
            <button type="button" className="btn btn--primary btn--block" onClick={addRetail} disabled={out}>
              <IconCart size={17} /> {t('product.add')}
            </button>
            <button type="button" className="linkbtn" onClick={() => addWholesale(1)}>
              <IconQuote size={15} /> {t('product.wholesale')}
            </button>
          </>
        ) : (
          <div className="pcard__ws">
            <QtyStepper value={qty} onChange={setQty} compact />
            <button
              type="button"
              className="btn btn--accent btn--block"
              onClick={() => {
                addWholesale(qty)
                setQty(1)
              }}
            >
              <IconQuote size={17} /> {t('product.addQuote')}
            </button>
          </div>
        )}
      </div>
    </article>
  )
})
