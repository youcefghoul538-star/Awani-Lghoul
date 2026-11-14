import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { IconCart, IconQuote } from '../components/Icons'
import { ProductCard } from '../components/ProductCard'
import { Price, ProductImage, QtyStepper, StockBadge } from '../components/ProductBits'
import { useToast } from '../components/Toast'
import { useI18n } from '../i18n'
import { addToCart, addToQuote } from '../state/cart'
import { useCatalog, useMode } from '../state/hooks'

export default function ProductPage() {
  const { id } = useParams()
  const { t, L } = useI18n()
  const { productById, categoryById, activeProducts } = useCatalog()
  const mode = useMode()
  const toast = useToast()
  const product = id ? productById.get(id) : undefined
  const [qty, setQty] = useState(1)
  useEffect(() => setQty(1), [id])

  const related = useMemo(
    () => (product ? activeProducts.filter((p) => p.categoryId === product.categoryId && p.id !== product.id).slice(0, 5) : []),
    [activeProducts, product],
  )

  if (!product || !product.active) {
    return (
      <div className="empty">
        <p>{t('product.notFound')}</p>
        <Link to="/" className="btn btn--primary">
          {t('confirm.back')}
        </Link>
      </div>
    )
  }

  const name = L(product.name)
  const cat = categoryById.get(product.categoryId)
  const out = product.stock <= 0
  const desc = L(product.description)
  const specs = product.specs ?? []
  const retailMax = Math.max(1, product.stock)

  const addRetail = () => {
    addToCart('product', product.id, qty, product.stock)
    toast.show(t('toast.added', { name }), { to: '/panier', actionLabel: t('toast.view') })
  }
  const addWholesale = () => {
    addToQuote(product.id, qty)
    toast.show(t('toast.addedQuote', { name }), { to: '/devis', actionLabel: t('toast.view') })
  }

  return (
    <article className="pdp">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">{t('cat.all')}</Link>
        {cat && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/?cat=${cat.id}`}>{L(cat.name)}</Link>
          </>
        )}
      </nav>

      <div className="pdp__grid">
        <div className="pdp__media">
          <ProductImage product={product} eager />
          {product.demo && <span className="pcard__demo">{t('product.demo')}</span>}
        </div>

        <div className="pdp__info">
          <h1>{name}</h1>
          <div className="pcard__sku">
            {t('product.sku')} <bdi>{product.sku}</bdi>
          </div>
          <Price product={product} size="lg" />
          <StockBadge stock={product.stock} />

          <div className="pdp__buy">
            <div className="pdp__qtyrow">
              <span className="label">{t('product.qty')}</span>
              <QtyStepper value={qty} onChange={setQty} max={mode === 'retail' && !out ? retailMax : 9999} />
            </div>
            {mode === 'retail' && !out && qty >= retailMax && <p className="muted small">{t('stock.max', { n: retailMax })}</p>}

            {mode === 'retail' ? (
              <>
                <button type="button" className="btn btn--primary btn--lg btn--block" onClick={addRetail} disabled={out}>
                  <IconCart size={20} /> {t('product.add')}
                </button>
                <button type="button" className="btn btn--ghost btn--block" onClick={addWholesale}>
                  <IconQuote size={18} /> {t('product.wholesale')}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--accent btn--lg btn--block" onClick={addWholesale}>
                <IconQuote size={20} /> {t('product.addQuote')}
              </button>
            )}
          </div>

          {desc && (
            <section className="pdp__block">
              <h2>{t('product.description')}</h2>
              <p>{desc}</p>
            </section>
          )}

          {specs.length > 0 && (
            <section className="pdp__block">
              <h2>{t('product.specs')}</h2>
              <dl className="dl">
                {specs.map((s, i) => (
                  <div key={i}>
                    <dt>{L(s.label)}</dt>
                    <dd>{L(s.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="pdp__block">
            <h2>{t('product.info')}</h2>
            <dl className="dl">
              <div>
                <dt>{t('product.sku')}</dt>
                <dd>
                  <bdi>{product.sku}</bdi>
                </dd>
              </div>
              {cat && (
                <div>
                  <dt>{t('product.category')}</dt>
                  <dd>{L(cat.name)}</dd>
                </div>
              )}
              <div>
                <dt>{t('product.availability')}</dt>
                <dd>
                  <StockBadge stock={product.stock} />
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>{t('product.related')}</h2>
          </div>
          <div className="hscroll">
            {related.map((p) => (
              <div key={p.id} className="hscroll__item">
                <ProductCard product={p} mode={mode} />
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
