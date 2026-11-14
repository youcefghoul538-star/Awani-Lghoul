import type { Order, Payment, Refund } from '../types'
import { round2 } from './money'
import { dayKey, inPeriod, type Period } from './time'
import { statusTimestamp } from './orderStatus'
import { normalizeDzPhone } from '../lib/phone'

/**
 * SALES & CASH METRICS — every definition is explicit; nothing is called "revenue".
 *
 * Which date decides whether something is inside the selected period:
 *   • pipeline value of status S  → the instant the order ENTERED S (createdAt / confirmedAt / shippedAt / cancelledAt)
 *   • delivered sales             → deliveredAt
 *   • orders created / customers  → createdAt
 *   • collected cash              → payment.paidAt
 *   • refunds (cash out)          → refund.refundedAt
 *   • outstanding / credit        → point-in-time balance NOW (not period-filtered)
 *
 * Definitions:
 *   deliveredSalesValue = Σ order.total of DELIVERED orders             (amount invoiced incl. delivery fee)
 *   grossSales          = Σ order.listTotal of delivered orders          (items at regular price, before promotions)
 *   discounts           = Σ order.discountTotal of delivered orders      (a promotion, NOT a cost)
 *   deliveryFees        = Σ order.deliveryFee of delivered orders
 *        ⇒ deliveredSalesValue = grossSales − discounts + deliveryFees
 *   refundsOnDelivered  = Σ refunds (in period) whose order is delivered
 *   netSales            = deliveredSalesValue − refundsOnDelivered
 *   collected           = Σ payments (in period)
 *   refundedCash        = Σ refunds (in period)
 *   netCollected        = collected − refundedCash
 *   outstanding         = Σ over DELIVERED orders of max(0, total − paid)      (receivable)
 *   customerCredit      = Σ over DELIVERED orders of max(0, paid − total)      (overpayment)
 *   customerDeposits    = Σ net payments on orders NOT yet delivered/cancelled (cash received before delivery)
 *
 * A refund on a non-delivered order only reverses cash; it does not reduce sales (none was recognised).
 */
export interface SalesMetrics {
  newOrderValue: number
  confirmedOrderValue: number
  shippedOrderValue: number
  deliveredSalesValue: number
  cancelledOrderValue: number
  grossSales: number
  discounts: number
  deliveryFees: number
  refundsOnDelivered: number
  netSales: number
  collected: number
  refundedCash: number
  netCollected: number
  outstanding: number
  customerCredit: number
  customerDeposits: number
  counts: { created: number; new: number; confirmed: number; shipped: number; delivered: number; cancelled: number }
  /** Distinct phone numbers with ≥1 non-cancelled order created in the period. */
  uniqueCustomers: number
  /** Distinct phone numbers with ≥1 delivered order in the period. */
  uniqueDeliveredCustomers: number
  deliveredOrderCount: number
  /** deliveredSalesValue / deliveredOrderCount — null when there is no delivered order. */
  avgDeliveredOrderValue: number | null
}

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0))
export const customerKey = (phone: string): string => normalizeDzPhone(phone) || phone

export function paidByOrder(payments: Payment[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of payments) m.set(p.orderId, round2((m.get(p.orderId) ?? 0) + p.amount))
  return m
}
export function refundedByOrder(refunds: Refund[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of refunds) m.set(r.orderId, round2((m.get(r.orderId) ?? 0) + r.amount))
  return m
}

/** Balance of ONE order: total − paid (positive = customer owes, negative = overpaid). Refunds cancel out (see header). */
export function orderBalance(order: Order, payments: Payment[], refunds: Refund[]): { paid: number; refunded: number; netPaid: number; balance: number } {
  const paid = sum(payments.filter((p) => p.orderId === order.id).map((p) => p.amount))
  const refunded = sum(refunds.filter((r) => r.orderId === order.id).map((r) => r.amount))
  return { paid, refunded, netPaid: round2(paid - refunded), balance: round2(order.total - refunded - (paid - refunded)) }
}

export function computeSalesMetrics(orders: Order[], payments: Payment[], refunds: Refund[], period?: Period): SalesMetrics {
  const ordersById = new Map(orders.map((o) => [o.id, o]))
  const paid = paidByOrder(payments)
  const refunded = refundedByOrder(refunds)

  const inStatus = (s: Order['status']) => orders.filter((o) => o.status === s && inPeriod(statusTimestamp(o), period))
  const delivered = inStatus('delivered')
  const created = orders.filter((o) => inPeriod(o.createdAt, period))

  const periodPayments = payments.filter((p) => inPeriod(p.paidAt, period))
  const periodRefunds = refunds.filter((r) => inPeriod(r.refundedAt, period))
  const refundsOnDelivered = sum(periodRefunds.filter((r) => ordersById.get(r.orderId)?.status === 'delivered').map((r) => r.amount))

  const deliveredSalesValue = sum(delivered.map((o) => o.total))
  const collected = sum(periodPayments.map((p) => p.amount))
  const refundedCash = sum(periodRefunds.map((r) => r.amount))

  let outstanding = 0
  let customerCredit = 0
  let customerDeposits = 0
  for (const o of orders) {
    const p = paid.get(o.id) ?? 0
    const r = refunded.get(o.id) ?? 0
    if (o.status === 'delivered') {
      const bal = round2(o.total - p)
      if (bal > 0) outstanding = round2(outstanding + bal)
      else if (bal < 0) customerCredit = round2(customerCredit - bal)
    } else if (o.status !== 'cancelled') {
      customerDeposits = round2(customerDeposits + (p - r))
    }
  }

  const nonCancelledCreated = created.filter((o) => o.status !== 'cancelled')
  const deliveredCount = delivered.length

  return {
    newOrderValue: sum(inStatus('new').map((o) => o.total)),
    confirmedOrderValue: sum(inStatus('confirmed').map((o) => o.total)),
    shippedOrderValue: sum(inStatus('shipped').map((o) => o.total)),
    deliveredSalesValue,
    cancelledOrderValue: sum(inStatus('cancelled').map((o) => o.total)),
    grossSales: sum(delivered.map((o) => o.listTotal)),
    discounts: sum(delivered.map((o) => o.discountTotal)),
    deliveryFees: sum(delivered.map((o) => o.deliveryFee)),
    refundsOnDelivered,
    netSales: round2(deliveredSalesValue - refundsOnDelivered),
    collected,
    refundedCash,
    netCollected: round2(collected - refundedCash),
    outstanding,
    customerCredit,
    customerDeposits,
    counts: {
      created: created.length,
      new: inStatus('new').length,
      confirmed: inStatus('confirmed').length,
      shipped: inStatus('shipped').length,
      delivered: deliveredCount,
      cancelled: inStatus('cancelled').length,
    },
    uniqueCustomers: new Set(nonCancelledCreated.map((o) => customerKey(o.customer.phone))).size,
    uniqueDeliveredCustomers: new Set(delivered.map((o) => customerKey(o.customer.phone))).size,
    deliveredOrderCount: deliveredCount,
    avgDeliveredOrderValue: deliveredCount > 0 ? round2(deliveredSalesValue / deliveredCount) : null,
  }
}

export interface DayPoint {
  day: string
  /** Delivered sales dated by deliveredAt. Cancelled / open orders are NEVER included. */
  deliveredSales: number
  /** Cash received that day (payments) minus cash refunded that day. */
  netCollected: number
  /** Orders created that day, excluding cancelled ones (volume indicator, not sales). */
  ordersCreated: number
}

/** Daily series on Africa/Algiers business days. */
export function dailySeries(orders: Order[], payments: Payment[], refunds: Refund[], days: string[]): DayPoint[] {
  const idx = new Map(days.map((d, i) => [d, i]))
  const pts: DayPoint[] = days.map((day) => ({ day, deliveredSales: 0, netCollected: 0, ordersCreated: 0 }))
  for (const o of orders) {
    if (o.status === 'delivered') {
      const i = idx.get(dayKey(o.deliveredAt ?? o.createdAt))
      if (i != null) pts[i].deliveredSales = round2(pts[i].deliveredSales + o.total)
    }
    if (o.status !== 'cancelled') {
      const i = idx.get(dayKey(o.createdAt))
      if (i != null) pts[i].ordersCreated++
    }
  }
  for (const p of payments) {
    const i = idx.get(dayKey(p.paidAt))
    if (i != null) pts[i].netCollected = round2(pts[i].netCollected + p.amount)
  }
  for (const r of refunds) {
    const i = idx.get(dayKey(r.refundedAt))
    if (i != null) pts[i].netCollected = round2(pts[i].netCollected - r.amount)
  }
  return pts
}
