import { db, transaction } from '../data/db'
import { isPositiveInt } from '../domain'
import { uid } from '../lib/ids'
import type { Product, WholesalePrice } from '../types'
import { ServiceError, nowIso } from './common'
import { createOpeningStock } from './inventoryService'

/** Product fields editable by the UI. `stock` is deliberately absent: stock changes only via the ledger. */
export type ProductInput = Omit<Product, 'id' | 'stock' | 'createdAt'> & { id?: string }

export function saveProduct(input: ProductInput, opening?: { qty: number; unitCost?: number }): Product {
  if (!input.sku.trim() || !input.name.fr.trim()) throw new ServiceError('VALIDATION', 'SKU et nom obligatoires.')
  if (!(input.price > 0)) throw new ServiceError('VALIDATION', 'Prix invalide.', { fields: { price: 'Prix invalide.' } })
  if (input.salePrice != null && !(input.salePrice > 0 && input.salePrice < input.price)) throw new ServiceError('VALIDATION', 'Prix promo invalide.', { fields: { salePrice: 'Doit être inférieur au prix.' } })
  return transaction(() => {
    const dup = db.products.all().find((p) => p.sku.toLowerCase() === input.sku.trim().toLowerCase() && p.id !== input.id)
    if (dup) throw new ServiceError('VALIDATION', 'SKU déjà utilisé.', { fields: { sku: 'SKU déjà utilisé.' } })
    const existing = input.id ? db.products.get(input.id) : undefined
    const p: Product = { ...input, sku: input.sku.trim(), id: existing?.id ?? uid('p'), stock: existing?.stock ?? 0, createdAt: existing?.createdAt ?? nowIso() }
    db.products.upsert(p)
    if (!existing && opening && opening.qty > 0) {
      if (!isPositiveInt(opening.qty)) throw new ServiceError('VALIDATION', 'Stock initial invalide.')
      createOpeningStock(p.id, opening.qty, opening.unitCost)
    }
    return db.products.get(p.id)!
  })
}

export function productUsage(id: string): string[] {
  const used: string[] = []
  if (db.movements.all().some((m) => m.productId === id)) used.push('mouvements de stock')
  if (db.orders.all().some((o) => o.lines.some((l) => l.components.some((c) => c.productId === id) || l.refId === id))) used.push('commandes')
  if (db.purchases.all().some((p) => p.items.some((i) => i.productId === id))) used.push('achats')
  if (db.bundles.all().some((b) => b.items.some((i) => i.productId === id))) used.push('packs')
  if (db.quotes.all().some((q) => q.lines.some((l) => l.productId === id))) used.push('devis')
  return used
}

/** Delete only if nothing references the product; otherwise deactivate instead. */
export function deleteProduct(id: string): void {
  const used = productUsage(id)
  if (used.length) throw new ServiceError('IN_USE', `Produit référencé (${used.join(', ')}). Désactivez-le plutôt.`)
  db.products.remove(id)
}

/** Wholesale price entered MANUALLY by an admin. Never derived from retail. */
export function saveWholesalePrice(productId: string, price: number, minQty?: number): WholesalePrice {
  if (!db.products.get(productId)) throw new ServiceError('NOT_FOUND', 'Produit introuvable.')
  if (!(price > 0) || !Number.isFinite(price) || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) throw new ServiceError('VALIDATION', 'Prix de gros invalide.', { fields: { price: 'Prix invalide.' } })
  if (minQty != null && !isPositiveInt(minQty)) throw new ServiceError('VALIDATION', 'Quantité minimale invalide.', { fields: { minQty: 'Entier ≥ 1.' } })
  const wp: WholesalePrice = { id: productId, price, ...(minQty != null ? { minQty } : {}) }
  db.wholesalePrices.upsert(wp)
  return wp
}

export function removeWholesalePrice(productId: string): void {
  db.wholesalePrices.remove(productId)
}
