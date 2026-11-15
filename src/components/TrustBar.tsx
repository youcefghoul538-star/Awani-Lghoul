import { useI18n } from '../i18n'
import type { TKey } from '../i18n/fr'

/** Reassurance strip. The product count is computed from the real catalogue (rounded DOWN to the ten), so it can never overstate it. */
export function TrustBar({ productCount }: { productCount: number }) {
  const { t } = useI18n()
  const n = Math.floor(productCount / 10) * 10
  const items: { icon: string; title: TKey; text: string }[] = [
    { icon: '🚚', title: 'trust.delivery.t', text: t('trust.delivery.d') },
    { icon: '💬', title: 'trust.service.t', text: t('trust.service.d') },
    { icon: '🏷️', title: 'trust.quality.t', text: t('trust.quality.d') },
    ...(n >= 10 ? [{ icon: '🛍️', title: 'trust.choice.t' as TKey, text: t('trust.choice.d', { n }) }] : []),
  ]
  return (
    <ul className="trust" aria-label="AWANI L'GHOUL">
      {items.map((i) => (
        <li key={i.title} className="trust__item">
          <span className="trust__icon" aria-hidden="true">{i.icon}</span>
          <span>
            <strong>{t(i.title)}</strong>
            <small>{i.text}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}
