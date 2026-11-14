import { useMemo } from 'react'
import { db } from '../data/db'
import { useCollection, useStore } from '../data/store'
import { bundleEffectivePrice, effectivePrice, maxAddableQty, type RequestLine } from '../domain'
import type { Bundle, Category, Product, Settings } from '../types'
import { SUPABASE_CONFIGURED } from '../data/config'
import { DEFAULT_SETTINGS } from '../data/defaultSettings'
import { cartStore, modeStore, quoteStore, type CartLine } from './cart'
import { useCatalogState } from './catalog'

export function useCatalog() {
  const localProducts = useCollection(db.products)
  const localCategories = useCollection(db.categories)
  const localBundles = useCollection(db.bundles)
  const localSettings = useStore(db.settings)
  const remote = useCatalogState()
  // Supabase configured → remote data ONLY (never local/demo fallback). Otherwise the (empty by default) local db.
  const src = SUPABASE_CONFIGURED
    ? { products: remote.data?.products ?? [], categories: remote.data?.categories ?? [], bundles: remote.data?.bundles ?? [], settings: remote.data?.settings ?? DEFAULT_SETTINGS }
    : { products: localProducts, categories: localCategories, bundles: localBundles, settings: localSettings }
  const { products, categories, bundles, settings } = src
  const memo = useMemo(() => {
    const sortedCats = [...categories].sort((a, b) => a.order - b.order)
    return {
      products,
      activeProducts: products.filter((p) => p.active),
      categories: sortedCats,
      bundles,
      activeBundles: bundles.filter((b) => b.active),
      settings,
      productById: new Map<string, Product>(products.map((p) => [p.id, p])),
      categoryById: new Map<string, Category>(sortedCats.map((c) => [c.id, c])),
    }
  }, [products, categories, bundles, settings])
  return { ...memo, status: remote.status, error: remote.error, ready: remote.status === 'ready' }
}

export function useSettings(): Settings {
  return useCatalog().settings
}

export function useMode() {
  return useStore(modeStore)
}

export const stockState = (stock: number, threshold: number): 'in' | 'low' | 'out' =>
  stock <= 0 ? 'out' : stock <= threshold ? 'low' : 'in'

export interface ResolvedCartLine {
  line: CartLine
  product?: Product
  bundle?: Bundle
  name: string
  sku?: string
  unitPrice: number
  max: number
  available: boolean
}

/**
 * Resolves stored cart lines against the live catalogue (prices are never trusted from storage).
 * `max` is the real remaining stock for the line given every OTHER line in the cart (products and bundle components
 * are aggregated), never a fixed number.
 */
export function useResolvedCart() {
  const lines = useStore(cartStore)
  const { productById, bundles, ready } = useCatalog()
  return useMemo(() => {
    const bundleById = new Map(bundles.map((b) => [b.id, b]))
    const live = lines.filter((l) => (l.kind === 'product' ? productById.get(l.id)?.active : bundleById.get(l.id)?.active))
    const req: RequestLine[] = live.map((l) => ({ kind: l.kind, refId: l.id, qty: l.qty }))
    const resolved: ResolvedCartLine[] = live.map((line, i) => {
      const max = maxAddableQty(req[i], req.filter((_, k) => k !== i), bundleById, productById)
      if (line.kind === 'product') {
        const p = productById.get(line.id)!
        return { line, product: p, name: p.name.fr, sku: p.sku, unitPrice: effectivePrice(p), max, available: max > 0 }
      }
      const b = bundleById.get(line.id)!
      return { line, bundle: b, name: b.title.fr, unitPrice: bundleEffectivePrice(b), max, available: max > 0 }
    })
    const subtotal = resolved.reduce((s, r) => s + (r.available ? r.unitPrice * r.line.qty : 0), 0)
    const count = resolved.reduce((s, r) => s + r.line.qty, 0)
    return { resolved, subtotal, count, ready }
  }, [lines, productById, bundles, ready])
}

export function useResolvedQuote() {
  const items = useStore(quoteStore)
  const { productById, ready } = useCatalog()
  return useMemo(() => {
    const resolved = items.flatMap((it) => {
      const p = productById.get(it.productId)
      return p && p.active ? [{ item: it, product: p }] : []
    })
    return { resolved, ready, count: resolved.reduce((s, r) => s + r.item.qty, 0) }
  }, [items, productById, ready])
}
