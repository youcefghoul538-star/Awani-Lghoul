import { BundleCard } from '../components/BundleCard'
import { useI18n } from '../i18n'
import { useCatalog, useMode } from '../state/hooks'

export default function Packs() {
  const { t } = useI18n()
  const { activeBundles } = useCatalog()
  const mode = useMode()
  return (
    <section className="section">
      <div className="section__head">
        <h1>{t('bundles.title')}</h1>
      </div>
      {activeBundles.length === 0 ? (
        <div className="empty">
          <p>{t('bundles.empty')}</p>
        </div>
      ) : (
        <div className="bgrid">
          {activeBundles.map((b) => (
            <BundleCard key={b.id} bundle={b} mode={mode} />
          ))}
        </div>
      )}
    </section>
  )
}
