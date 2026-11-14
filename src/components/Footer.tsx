import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useSettings } from '../state/hooks'
import { BrandLogo } from './BrandLogo'

export function Footer() {
  const { t } = useI18n()
  const s = useSettings()
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div>
          <div className="brand brand--footer">
            <BrandLogo name={s.businessName} variant="full" className="brandlogo--footer" />
          </div>
          {s.phone && (
            <p>
              <bdi dir="ltr">{s.phone}</bdi>
            </p>
          )}
          {s.address && <p>{s.address}</p>}
        </div>
        <div>
          <h4>{t('footer.shop')}</h4>
          <ul>
            <li>
              <Link to="/">{t('home.all')}</Link>
            </li>
            <li>
              <Link to="/packs">{t('bundles.title')}</Link>
            </li>
            <li>
              <Link to="/devis">{t('quote.title')}</Link>
            </li>
          </ul>
        </div>
        <div>
          <h4>{t('footer.help')}</h4>
          <ul>
            <li>
              <Link to="/contact">{t('nav.contact')}</Link>
            </li>
            <li>
              <Link to="/contact#suivi">{t('contact.track')}</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer__bottom">
        <div className="container">
          <span>{t('footer.rights', { year: new Date().getFullYear(), name: s.businessName })}</span>
        </div>
      </div>
    </footer>
  )
}
