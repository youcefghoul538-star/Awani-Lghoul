import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useCatalog, useMode } from '../state/hooks'

export function CategoryBar() {
  const { t, L } = useI18n()
  const { categories, activeBundles } = useCatalog()
  const [params] = useSearchParams()
  const loc = useLocation()
  const active = loc.pathname === '/' ? params.get('cat') ?? '' : null
  const mode = useMode()
  return (
    <nav className="catbar" aria-label={t('nav.categories')}>
      <div className="container catbar__row">
        <Link to="/" className={active === '' && !params.get('q') ? 'chip chip--on' : 'chip'} aria-current={active === '' ? 'page' : undefined}>
          {t('cat.all')}
        </Link>
        {categories.map((c) => (
          <Link key={c.id} to={`/?cat=${c.id}`} className={active === c.id ? 'chip chip--on' : 'chip'} aria-current={active === c.id ? 'page' : undefined}>
            {L(c.name)}
          </Link>
        ))}
        {activeBundles.length > 0 && (
          <Link to="/packs" className={loc.pathname === '/packs' ? 'chip chip--on chip--pack' : 'chip chip--pack'}>
            {t('cat.packs')}
          </Link>
        )}
      </div>
      <div className={mode === 'wholesale' ? 'offerstrip offerstrip--ws' : 'offerstrip'}>
        <div className="container offerstrip__row">
          {mode === 'wholesale' ? (
            <>
              <span>{t('mode.banner')}</span>
              <Link to="/devis" className="offerstrip__link">
                {t('nav.quote')} →
              </Link>
            </>
          ) : (
            <OfferText />
          )}
        </div>
      </div>
    </nav>
  )
}

function OfferText() {
  const { t, L } = useI18n()
  const { settings } = useCatalog()
  return (
    <>
      <span>{L(settings.promoText)}</span>
      <Link to="/packs" className="offerstrip__link">
        {t('bundles.seeAll')} →
      </Link>
    </>
  )
}
