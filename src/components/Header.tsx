import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LANGS, useI18n } from '../i18n'
import { modeStore, type Mode } from '../state/cart'
import { useMode, useResolvedCart, useResolvedQuote, useSettings } from '../state/hooks'
import { BrandLogo } from './BrandLogo'
import { IconCart, IconPhone, IconQuote } from './Icons'
import { SearchBox } from './SearchBox'

export function ModeSwitch({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const mode = useMode()
  const nav = useNavigate()
  const set = (m: Mode) => {
    modeStore.set(m)
    if (m === 'wholesale') nav('/')
  }
  return (
    <div className={`modesw ${className}`} role="group" aria-label={t('mode.wholesale')}>
      <button type="button" aria-pressed={mode === 'retail'} onClick={() => set('retail')}>
        {t('mode.retail')}
      </button>
      <button type="button" className="modesw__ws" aria-pressed={mode === 'wholesale'} onClick={() => set('wholesale')}>
        {t('mode.wholesale')}
      </button>
    </div>
  )
}

function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="langsw" role="group" aria-label={t('a11y.langMenu')}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          title={l.label}
        >
          {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function Header() {
  const { t } = useI18n()
  const mode = useMode()
  const settings = useSettings()
  const cart = useResolvedCart()
  const quote = useResolvedQuote()
  const main = mode === 'retail' ? { to: '/panier', count: cart.count, label: t('nav.cart'), icon: <IconCart size={22} /> } : { to: '/devis', count: quote.count, label: t('nav.quote'), icon: <IconQuote size={22} /> }
  const other = mode === 'retail' ? { to: '/devis', count: quote.count, label: t('nav.quote'), icon: <IconQuote size={20} /> } : { to: '/panier', count: cart.count, label: t('nav.cart'), icon: <IconCart size={20} /> }

  return (
    <>
      <header className="header">
        <div className="container header__row">
          <Link to="/" className="brand" aria-label={settings.businessName}>
            <BrandLogo name={settings.businessName} className="brandlogo--header" />
          </Link>
          <div className="header__search">
            <SearchBox />
          </div>
          <ModeSwitch className="header__mode" />
          <nav className="header__actions" aria-label="Principal">
            <NavLink to="/contact" className="hact">
              <IconPhone size={22} />
              <span>{t('nav.contact')}</span>
            </NavLink>
            <LangSwitch />
            {other.count > 0 && (
              <Link to={other.to} className="hact hact--secondary" aria-label={`${other.label} (${other.count})`}>
                {other.icon}
                <b className="count">{other.count}</b>
              </Link>
            )}
            <Link to={main.to} className="hact hact--main" aria-label={`${main.label} (${main.count})`}>
              <span className="hact__icon">
                {main.icon}
                <b className={main.count ? 'count' : 'count count--zero'}>{main.count}</b>
              </span>
              <span>{main.label}</span>
            </Link>
          </nav>
        </div>
      </header>
      <div className="modebar container">
        <ModeSwitch />
      </div>
    </>
  )
}
