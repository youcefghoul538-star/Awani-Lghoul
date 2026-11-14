import type { Lang, LocalText } from '../types'

/** Pick the text for a language, falling back to French (the required base language). */
export function loc(text: LocalText | undefined, lang: Lang): string {
  if (!text) return ''
  return (text[lang] && text[lang]!.trim()) || text.fr || ''
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

export function formatDZD(amount: number, lang: Lang): string {
  const n = nf.format(Math.round(amount)).replace(/[  ]/g, ' ')
  const unit = lang === 'ar' ? 'د.ج' : lang === 'en' ? 'DZD' : 'DA'
  return `${n} ${unit}`
}

export function formatDate(iso: string, lang: Lang, withTime = true): string {
  const d = new Date(iso)
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : lang === 'en' ? 'en-GB' : 'fr-FR'
  return d.toLocaleString(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
}

export { effectivePrice } from '../domain/money'
import { effectivePrice as _eff } from '../domain/money'

export const hasDiscount = (p: { price: number; salePrice?: number }): boolean => _eff(p) < p.price

export const discountPct = (p: { price: number; salePrice?: number }): number =>
  Math.round(((p.price - _eff(p)) / p.price) * 100)
