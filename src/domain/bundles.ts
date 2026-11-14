import type { Bundle, BundleItem, Product } from '../types'
import { bundleEffectivePrice, effectivePrice, isPositiveInt, round2 } from './money'

/**
 * BUNDLES
 *   reference value = Σ effectiveRetailPrice(component) × qty    (active sale prices count)
 *   bundle price    = promoPrice if valid, else price
 *   saving          = reference value − bundle price             (a customer-facing DISCOUNT, not profit)
 *   gross profit    = bundle price − Σ component average cost × qty   (only when every cost is known)
 *   sets available  = min over components of floor(stock / qty)     (inactive/missing ⇒ 0)
 */
type P = Pick<Product, 'id' | 'price' | 'salePrice' | 'stock' | 'active'>

/** Merge duplicate product rows by summing quantities (safe normalisation). */
export function normalizeBundleItems(items: BundleItem[]): BundleItem[] {
  const m = new Map<string, number>()
  for (const it of items) if (it.productId) m.set(it.productId, (m.get(it.productId) ?? 0) + it.qty)
  return [...m].map(([productId, qty]) => ({ productId, qty }))
}

export interface BundleValidation {
  errors: string[]
  warnings: string[]
}

export function validateBundle(b: Pick<Bundle, 'items' | 'price' | 'promoPrice'>, productsById: Map<string, P>): BundleValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (b.items.length === 0) errors.push('Ajoutez au moins un produit.')
  const ids = b.items.map((i) => i.productId)
  if (new Set(ids).size !== ids.length) warnings.push('Produits en double : les quantités seront additionnées.')
  for (const it of b.items) {
    if (!it.productId) errors.push('Un produit n’est pas sélectionné.')
    else if (!productsById.has(it.productId)) errors.push(`Produit introuvable : ${it.productId}`)
    else if (!productsById.get(it.productId)!.active) warnings.push(`Produit masqué dans le pack : ${it.productId}`)
    if (!isPositiveInt(it.qty)) errors.push('Les quantités doivent être des entiers positifs.')
  }
  if (!(b.price > 0)) errors.push('Le prix du pack doit être supérieur à 0.')
  if (b.promoPrice != null && !(b.promoPrice > 0 && b.promoPrice < b.price)) errors.push('Le prix promo doit être supérieur à 0 et inférieur au prix du pack.')
  return { errors, warnings }
}

/** null when a referenced product does not exist (value cannot be computed). */
export function bundleReferenceValue(items: BundleItem[], productsById: Map<string, P>): number | null {
  let total = 0
  for (const it of items) {
    const p = productsById.get(it.productId)
    if (!p) return null
    total += effectivePrice(p) * it.qty
  }
  return round2(total)
}

export interface BundleSaving {
  referenceValue: number
  bundlePrice: number
  /** referenceValue − bundlePrice. Negative ⇒ the pack costs MORE than its parts. */
  saving: number
  savingPct: number | null
  pricedAboveParts: boolean
}

export function bundleSaving(b: Pick<Bundle, 'items' | 'price' | 'promoPrice'>, productsById: Map<string, P>): BundleSaving | null {
  const ref = bundleReferenceValue(b.items, productsById)
  if (ref == null) return null
  const price = bundleEffectivePrice(b)
  const saving = round2(ref - price)
  return { referenceValue: ref, bundlePrice: price, saving, savingPct: ref > 0 ? (saving / ref) * 100 : null, pricedAboveParts: saving < 0 }
}

/** Number of complete bundles that can be sold with current stock. */
export function bundleAvailability(items: BundleItem[], productsById: Map<string, P>): number {
  if (items.length === 0) return 0
  let sets = Infinity
  for (const it of items) {
    const p = productsById.get(it.productId)
    if (!p || !p.active || !isPositiveInt(it.qty)) return 0
    sets = Math.min(sets, Math.floor(Math.max(0, p.stock) / it.qty))
  }
  return sets
}

/** Gross profit of one bundle from real component costs (centimes per unit). null ⇒ Not enough data. */
export function bundleGrossProfit(b: Pick<Bundle, 'items' | 'price' | 'promoPrice'>, avgUnitCostCentimes: Map<string, number | null>): { cost: number; profit: number; marginPct: number | null } | null {
  let cost = 0
  for (const it of b.items) {
    const c = avgUnitCostCentimes.get(it.productId)
    if (c == null) return null
    cost += (c / 100) * it.qty
  }
  const price = bundleEffectivePrice(b)
  const profit = round2(price - cost)
  return { cost: round2(cost), profit, marginPct: price > 0 ? (profit / price) * 100 : null }
}
