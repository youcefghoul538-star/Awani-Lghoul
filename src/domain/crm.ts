import type { Order, Payment, Quote, Refund, Trader } from '../types'
import { round2 } from './money'
import { customerKey } from './salesMetrics'

/**
 * CUSTOMER / TRADER STATISTICS
 * Spending counts DELIVERED orders only, net of refunds. Cancelled, new, confirmed and shipped orders are
 * never "completed purchases". Cash is taken from payment records.
 *   deliveredSales = Σ total(delivered) − Σ refunds(on delivered)
 *   collected      = Σ payments − Σ refunds   (all non-cancelled + cancelled-with-deposit orders of the customer)
 *   outstanding    = Σ over delivered orders of max(0, total − paid)
 */
export interface CustomerStats {
  key: string
  name: string
  phone: string
  wilaya: string
  orderCount: number
  openOrderCount: number
  cancelledOrderCount: number
  deliveredOrderCount: number
  deliveredSales: number
  collected: number
  outstanding: number
  lastOrderAt: string
  lastDeliveredAt?: string
}

export function customerStats(orders: Order[], payments: Payment[], refunds: Refund[]): CustomerStats[] {
  const map = new Map<string, CustomerStats>()
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const paidBy = new Map<string, number>()
  for (const p of payments) paidBy.set(p.orderId, (paidBy.get(p.orderId) ?? 0) + p.amount)
  const refBy = new Map<string, number>()
  for (const r of refunds) refBy.set(r.orderId, (refBy.get(r.orderId) ?? 0) + r.amount)

  for (const o of sorted) {
    const key = customerKey(o.customer.phone)
    const c =
      map.get(key) ??
      ({ key, name: o.customer.fullName, phone: o.customer.phone, wilaya: o.customer.wilaya, orderCount: 0, openOrderCount: 0, cancelledOrderCount: 0, deliveredOrderCount: 0, deliveredSales: 0, collected: 0, outstanding: 0, lastOrderAt: o.createdAt } as CustomerStats)
    c.name = o.customer.fullName
    c.wilaya = o.customer.wilaya
    c.orderCount++
    c.lastOrderAt = o.createdAt
    const paid = paidBy.get(o.id) ?? 0
    const refunded = refBy.get(o.id) ?? 0
    c.collected = round2(c.collected + paid - refunded)
    if (o.status === 'delivered') {
      c.deliveredOrderCount++
      c.deliveredSales = round2(c.deliveredSales + o.total - refunded)
      c.outstanding = round2(c.outstanding + Math.max(0, o.total - paid))
      c.lastDeliveredAt = o.deliveredAt ?? o.createdAt
    } else if (o.status === 'cancelled') c.cancelledOrderCount++
    else c.openOrderCount++
    map.set(key, c)
  }
  return [...map.values()]
}

export interface TraderStats {
  quoteCount: number
  openQuoteCount: number
  wonQuoteCount: number
  lastQuoteAt?: string
  /** Orders placed through the retail checkout with the same phone number (a trader may also buy retail). */
  deliveredOrderCount: number
  deliveredSales: number
  collected: number
  outstanding: number
}

/** Quotes and orders are linked to a trader by normalised phone number. */
export function traderStats(trader: Pick<Trader, 'phone'>, quotes: Quote[], orders: Order[], payments: Payment[], refunds: Refund[]): TraderStats {
  const key = customerKey(trader.phone)
  const q = quotes.filter((x) => customerKey(x.business.phone) === key)
  const cust = customerStats(
    orders.filter((o) => customerKey(o.customer.phone) === key),
    payments,
    refunds,
  )[0]
  return {
    quoteCount: q.length,
    openQuoteCount: q.filter((x) => x.status === 'new' || x.status === 'contacted' || x.status === 'quoted').length,
    wonQuoteCount: q.filter((x) => x.status === 'won').length,
    lastQuoteAt: q.map((x) => x.createdAt).sort().pop(),
    deliveredOrderCount: cust?.deliveredOrderCount ?? 0,
    deliveredSales: cust?.deliveredSales ?? 0,
    collected: cust?.collected ?? 0,
    outstanding: cust?.outstanding ?? 0,
  }
}
