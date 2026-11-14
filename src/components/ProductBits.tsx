import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { effectivePrice, discountPct, hasDiscount } from '../lib/format'
import { placeholderImage } from '../lib/placeholder'
import { stockState, useCatalog } from '../state/hooks'
import type { Product } from '../types'
import { IconMinus, IconPlus } from './Icons'

export function ProductImage({ product, eager = false }: { product: Product; eager?: boolean }) {
  const { categoryById } = useCatalog()
  const { L } = useI18n()
  const icon = categoryById.get(product.categoryId)?.icon ?? 'default'
  const src = product.image || placeholderImage(icon, product.sku)
  return (
    <img
      src={src}
      alt={L(product.name)}
      width={400}
      height={400}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="pimg"
    />
  )
}

export function Price({ product, size = 'md' }: { product: { price: number; salePrice?: number }; size?: 'md' | 'lg' }) {
  const { money } = useI18n()
  const sale = hasDiscount(product)
  return (
    <div className={`price price--${size}`}>
      <span className={sale ? 'price__now price__now--sale' : 'price__now'}>{money(effectivePrice(product))}</span>
      {sale && <s className="price__old">{money(product.price)}</s>}
      {sale && <span className="badge badge--sale">-{discountPct(product)}%</span>}
    </div>
  )
}

export function StockBadge({ stock }: { stock: number }) {
  const { t } = useI18n()
  const { settings } = useCatalog()
  const s = stockState(stock, settings.lowStockThreshold)
  const label = s === 'in' ? t('stock.in') : s === 'low' ? t('stock.low') : t('stock.out')
  return (
    <span className={`stock stock--${s}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  )
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  compact = false,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  compact?: boolean
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = (raw: string) => {
    const n = parseInt(raw, 10)
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
    setDraft(String(next))
    if (next !== value) onChange(next)
  }
  return (
    <div className={compact ? 'qty qty--compact' : 'qty'}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t('product.decrease')}>
        <IconMinus size={16} />
      </button>
      <input
        inputMode="numeric"
        value={draft}
        aria-label={t('product.qty')}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(draft)
          }
        }}
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t('product.increase')}>
        <IconPlus size={16} />
      </button>
    </div>
  )
}
