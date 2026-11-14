import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { suggest } from '../lib/search'
import { useCatalog } from '../state/hooks'
import { IconSearch } from './Icons'
import { Price, ProductImage } from './ProductBits'

export function SearchBox() {
  const { t, lang, L } = useI18n()
  const { activeProducts, categories } = useCatalog()
  const nav = useNavigate()
  const loc = useLocation()
  const [params, setParams] = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const [value, setValue] = useState(urlQ)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const onHome = loc.pathname === '/'

  // external changes (clear filters, category click) → reflect in the box
  useEffect(() => setValue(urlQ), [urlQ])

  // live filtering of the grid while typing on the home page
  useEffect(() => {
    if (!onHome || value === urlQ) return
    const id = window.setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value.trim()) next.set('q', value)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, 250)
    return () => window.clearTimeout(id)
  }, [value, urlQ, onHome, setParams])

  const sugg = useMemo(() => suggest(activeProducts, categories, value, lang), [activeProducts, categories, value, lang])
  const showPanel = open && (sugg.products.length > 0 || sugg.categories.length > 0)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setOpen(false)
    const q = value.trim()
    nav(q ? `/?q=${encodeURIComponent(q)}` : '/')
  }

  return (
    <form className="search" role="search" onSubmit={submit}>
      <label className="sr-only" htmlFor="site-search">
        {t('nav.search')}
      </label>
      <input
        id="site-search"
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={t('nav.searchPlaceholder')}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          window.clearTimeout(closeTimer.current)
          setOpen(true)
        }}
        onBlur={() => {
          closeTimer.current = window.setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      <button type="submit" className="search__btn" aria-label={t('nav.search')}>
        <IconSearch size={20} />
      </button>
      {showPanel && (
        <div className="suggest" onMouseDown={(e) => e.preventDefault()}>
          {sugg.categories.length > 0 && (
            <div className="suggest__group">
              <div className="suggest__label">{t('nav.suggestCategories')}</div>
              {sugg.categories.map((c) => (
                <Link key={c.id} to={`/?cat=${c.id}`} className="suggest__row" onClick={() => setOpen(false)}>
                  {L(c.name)}
                </Link>
              ))}
            </div>
          )}
          {sugg.products.length > 0 && (
            <div className="suggest__group">
              <div className="suggest__label">{t('nav.suggestProducts')}</div>
              {sugg.products.map((p) => (
                <Link key={p.id} to={`/produit/${p.id}`} className="suggest__row suggest__row--product" onClick={() => setOpen(false)}>
                  <span className="suggest__thumb">
                    <ProductImage product={p} />
                  </span>
                  <span className="suggest__text">
                    <span>{L(p.name)}</span>
                    <small>
                      <bdi>{p.sku}</bdi>
                    </small>
                  </span>
                  <Price product={p} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  )
}
