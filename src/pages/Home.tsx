import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BundleCard } from '../components/BundleCard'
import { ProductCard } from '../components/ProductCard'
import { TrustBar } from '../components/TrustBar'
import { useI18n } from '../i18n'
import { filterProducts, type SortKey } from '../lib/search'
import { useCatalog, useMode } from '../state/hooks'

const PAGE_SIZE = 20
const SORTS: SortKey[] = ['featured', 'price-asc', 'price-desc', 'newest', 'name']
const SORT_LABEL = {
  featured: 'sort.featured',
  'price-asc': 'sort.priceAsc',
  'price-desc': 'sort.priceDesc',
  newest: 'sort.newest',
  name: 'sort.name',
} as const

export default function Home() {
  const { t, lang, L } = useI18n()
  const { activeProducts, categories, activeBundles, categoryById } = useCatalog()
  const mode = useMode()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const cat = params.get('cat') ?? ''
  const rawSort = params.get('sort') as SortKey | null
  const sort: SortKey = rawSort && SORTS.includes(rawSort) ? rawSort : 'featured'
  const inStockOnly = params.get('stock') === '1'
  const filtersActive = !!(q || cat || inStockOnly)

  const results = useMemo(
    () => filterProducts(activeProducts, categories, { q, categoryId: cat, inStockOnly, sort }, lang),
    [activeProducts, categories, q, cat, inStockOnly, sort, lang],
  )

  const [visible, setVisible] = useState(PAGE_SIZE)
  useEffect(() => setVisible(PAGE_SIZE), [q, cat, inStockOnly, sort])

  const featured = useMemo(() => activeProducts.filter((p) => p.featured && p.stock > 0).slice(0, 10), [activeProducts])

  const update = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      // flushSync: keep the controlled checkbox/select in step with the URL (no one-frame lag)
      { replace: true, flushSync: true },
    )

  const title = cat ? L(categoryById.get(cat)?.name) : q ? t('home.results') : t('home.all')

  return (
    <>
      {!filtersActive && <TrustBar productCount={activeProducts.length} />}
      {!filtersActive && featured.length > 0 && (
        <section className="section" aria-labelledby="h-featured">
          <div className="section__head">
            <h2 id="h-featured">{t('home.featured')}</h2>
          </div>
          <div className="hscroll">
            {featured.map((p) => (
              <div key={p.id} className="hscroll__item">
                <ProductCard product={p} mode={mode} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="h-all">
        <div className="section__head section__head--bar">
          <div>
            <h2 id="h-all">{title}</h2>
            <span className="muted small">{t('home.count', { n: results.length })}</span>
          </div>
          <div className="toolbar">
            <label className="check">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => update('stock', e.target.checked ? '1' : '')} />
              <span>{t('filter.inStock')}</span>
            </label>
            <label className="selectwrap">
              <span className="sr-only">{t('sort.label')}</span>
              <select value={sort} onChange={(e) => update('sort', e.target.value === 'featured' ? '' : e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t('sort.label')} : {t(SORT_LABEL[s])}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="empty">
            <p>{activeProducts.length === 0 ? t('home.empty') : t('home.noResults')}</p>
            {filtersActive && (
              <Link to="/" className="btn btn--ghost">
                {t('home.clear')}
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="pgrid">
              {results.slice(0, visible).map((p) => (
                <ProductCard key={p.id} product={p} mode={mode} />
              ))}
            </div>
            <div className="loadmore">
              <span className="muted small">{t('home.shown', { shown: Math.min(visible, results.length), total: results.length })}</span>
              {visible < results.length && (
                <button type="button" className="btn btn--ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  {t('home.loadMore')}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {!filtersActive && activeBundles.length > 0 && (
        <section className="section" aria-labelledby="h-bundles">
          <div className="section__head">
            <h2 id="h-bundles">{t('bundles.title')}</h2>
            <Link to="/packs" className="link">
              {t('bundles.seeAll')}
            </Link>
          </div>
          <div className="bgrid">
            {activeBundles.slice(0, 3).map((b) => (
              <BundleCard key={b.id} bundle={b} mode={mode} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
