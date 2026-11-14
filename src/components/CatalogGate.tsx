import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { loadCatalog } from '../state/catalog'
import { useCatalog } from '../state/hooks'

/**
 * Renders children only once the catalogue is available. While loading / on error / when Supabase is not
 * configured in production, an explicit state is shown — never a fake or stale catalogue.
 */
export function CatalogGate({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const { status } = useCatalog()
  if (status === 'ready') return <>{children}</>
  if (status === 'loading') {
    return (
      <div className="empty" role="status" aria-live="polite">
        <p>{t('catalog.loading')}</p>
      </div>
    )
  }
  if (status === 'unconfigured') {
    return (
      <div className="empty" role="alert">
        <p>{t('catalog.unavailable')}</p>
      </div>
    )
  }
  return (
    <div className="empty" role="alert">
      <p>{t('catalog.error')}</p>
      <button type="button" className="btn btn--primary" onClick={() => void loadCatalog()}>
        {t('catalog.retry')}
      </button>
    </div>
  )
}
