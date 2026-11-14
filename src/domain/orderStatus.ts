import type { Order, OrderStatus } from '../types'

/**
 * ORDER STATUS RULES (single source of truth — mirrored by SQL function admin_change_order_status)
 *
 *   new ──▶ confirmed ──▶ shipped ──▶ delivered   (terminal: sale is recognised)
 *    │         │            │
 *    └─────────┴────────────┴──▶ cancelled        (terminal: stock released exactly once)
 *
 * • Stock is COMMITTED (deducted) when the order is created → no overselling between order and delivery.
 * • Cancelling releases the committed stock once (idempotent).
 * • A DELIVERED order can never be cancelled: use a refund (+ optional restock) instead.
 * • A sale is "recognised" (counted in delivered sales) only when status = delivered.
 */
export const ORDER_STATUSES: readonly OrderStatus[] = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled']

export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to)

/** Timestamp at which an order ENTERED its current status (falls back to creation time for legacy rows). */
export function statusTimestamp(o: Pick<Order, 'status' | 'createdAt' | 'confirmedAt' | 'shippedAt' | 'deliveredAt' | 'cancelledAt'>): string {
  switch (o.status) {
    case 'confirmed':
      return o.confirmedAt ?? o.createdAt
    case 'shipped':
      return o.shippedAt ?? o.confirmedAt ?? o.createdAt
    case 'delivered':
      return o.deliveredAt ?? o.shippedAt ?? o.createdAt
    case 'cancelled':
      return o.cancelledAt ?? o.createdAt
    default:
      return o.createdAt
  }
}

/** Statuses that hold stock (committed, not yet delivered or released). */
export const isOpenOrder = (s: OrderStatus): boolean => s === 'new' || s === 'confirmed' || s === 'shipped'
