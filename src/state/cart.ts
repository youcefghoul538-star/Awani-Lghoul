import { createStore } from '../data/store'
import type { Lang } from '../types'

export type Mode = 'retail' | 'wholesale'

export interface CartLine {
  kind: 'product' | 'bundle'
  id: string
  qty: number
}
export interface QuoteItem {
  productId: string
  qty: number
}

export const MAX_QTY = 9999

export const cartStore = createStore<CartLine[]>('cart', () => [])
export const quoteStore = createStore<QuoteItem[]>('quote', () => [])
export const modeStore = createStore<Mode>('mode', () => 'retail')
export const langStore = createStore<Lang>('lang', () => 'fr')

const clamp = (n: number, max = MAX_QTY) => Math.max(1, Math.min(max, Math.floor(Number.isFinite(n) ? n : 1)))

export function addToCart(kind: CartLine['kind'], id: string, qty = 1, max = MAX_QTY): void {
  cartStore.set((prev) => {
    const i = prev.findIndex((l) => l.kind === kind && l.id === id)
    if (i === -1) return [...prev, { kind, id, qty: clamp(qty, max) }]
    const copy = prev.slice()
    copy[i] = { ...copy[i], qty: clamp(copy[i].qty + qty, max) }
    return copy
  })
}

export function setCartQty(kind: CartLine['kind'], id: string, qty: number, max = MAX_QTY): void {
  cartStore.set((prev) => prev.map((l) => (l.kind === kind && l.id === id ? { ...l, qty: clamp(qty, max) } : l)))
}

export function removeFromCart(kind: CartLine['kind'], id: string): void {
  cartStore.set((prev) => prev.filter((l) => !(l.kind === kind && l.id === id)))
}

export const clearCart = () => cartStore.set([])

export function addToQuote(productId: string, qty = 1): void {
  quoteStore.set((prev) => {
    const i = prev.findIndex((l) => l.productId === productId)
    if (i === -1) return [...prev, { productId, qty: clamp(qty) }]
    const copy = prev.slice()
    copy[i] = { ...copy[i], qty: clamp(copy[i].qty + qty) }
    return copy
  })
}

export function setQuoteQty(productId: string, qty: number): void {
  quoteStore.set((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty: clamp(qty) } : l)))
}

export function removeFromQuote(productId: string): void {
  quoteStore.set((prev) => prev.filter((l) => l.productId !== productId))
}

export const clearQuote = () => quoteStore.set([])
