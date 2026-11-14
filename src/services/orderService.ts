import { db, LOCAL_ONLY, transaction } from '../data/db'
import { WILAYAS, wilayaValue } from '../data/wilayas'
import {
  bundleEffectivePrice,
  canTransition,
  effectivePrice,
  findShortages,
  isPositiveInt,
  lineComponents,
  orderBalance,
  replayCosting,
  round2,
  validateBundle,
  type RequestLine,
} from '../domain'
import { makeRef, uid } from '../lib/ids'
import { formatDzPhone, isValidDzPhone, normalizeDzPhone } from '../lib/phone'
import type { InventoryMovement, Lang, Order, OrderLine, OrderStatus, Payment, PaymentMethod, Refund } from '../types'
import { MAX_LINE_QTY, ServiceError, isValidAmount, nowIso } from './common'
import { commitMovements } from './inventoryService'

/**
 * ORDER SERVICE — server-style authority for retail orders.
 *  • never trusts client prices, totals or stock: lines carry only (kind, id, qty) and everything else is
 *    re-read from the catalogue and the ledger;
 *  • INVENTORY POLICY: submitting an order never deducts or reserves stock. Stock is deducted ONLY when an
 *    administrator confirms the order (changeOrderStatus → 'confirmed'), validating the AGGREGATED requirements
 *    (products + bundle components) and writing every movement in ONE transaction (all or nothing);
 *  • status changes follow domain/orderStatus.ts; later transitions never deduct again; cancelling a confirmed order
 *    restores stock at most once.
 */

export interface PlaceOrderInput {
  customer: { fullName: string; phone: string; wilaya: string; address: string; notes?: string }
  lines: { kind: 'product' | 'bundle'; refId: string; qty: number }[]
  lang: Lang
}

const WILAYA_VALUES = new Set(WILAYAS.map(wilayaValue))

function validateCustomer(c: PlaceOrderInput['customer']): Record<string, string> {
  const f: Record<string, string> = {}
  if (!c.fullName?.trim()) f.fullName = 'required'
  if (!c.phone?.trim()) f.phone = 'required'
  else if (!isValidDzPhone(c.phone)) f.phone = 'phone'
  if (!c.wilaya || !WILAYA_VALUES.has(c.wilaya)) f.wilaya = 'required'
  if (!c.address?.trim()) f.address = 'required'
  return f
}

/** Merge identical lines and validate kind / qty. Returns normalised request lines. */
function normalizeLines(lines: PlaceOrderInput['lines']): RequestLine[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new ServiceError('VALIDATION', 'Panier vide.')
  const merged = new Map<string, RequestLine>()
  for (const l of lines) {
    if ((l.kind !== 'product' && l.kind !== 'bundle') || !l.refId) throw new ServiceError('VALIDATION', 'Ligne invalide.')
    if (!isPositiveInt(l.qty) || l.qty > MAX_LINE_QTY) throw new ServiceError('VALIDATION', 'Quantité invalide.')
    const k = `${l.kind}:${l.refId}`
    const cur = merged.get(k)
    if (cur) cur.qty += l.qty
    else merged.set(k, { kind: l.kind, refId: l.refId, qty: l.qty })
  }
  return [...merged.values()]
}

export function placeRetailOrder(input: PlaceOrderInput): Order {
  const fields = validateCustomer(input.customer)
  if (Object.keys(fields).length) throw new ServiceError('VALIDATION', 'Informations client invalides.', { fields })
  const reqLines = normalizeLines(input.lines)

  return transaction(() => {
    const productsById = new Map(db.products.all().map((p) => [p.id, p]))
    const bundlesById = new Map(db.bundles.all().map((b) => [b.id, b]))

    // 1. re-price from the catalogue (client-supplied prices do not exist in the input type)
    const lines: OrderLine[] = reqLines.map((l) => {
      if (l.kind === 'product') {
        const p = productsById.get(l.refId)
        if (!p || !p.active) throw new ServiceError('NOT_FOUND', `Produit indisponible : ${l.refId}`, { shortages: [{ productId: l.refId, requested: l.qty, available: 0, reason: p ? 'inactive' : 'missing' }] })
        return { kind: 'product', refId: p.id, sku: p.sku, name: p.name.fr, qty: l.qty, unitPrice: effectivePrice(p), listPrice: p.price, components: [{ productId: p.id, qty: 1 }] }
      }
      const b = bundlesById.get(l.refId)
      if (!b || !b.active) throw new ServiceError('NOT_FOUND', `Pack indisponible : ${l.refId}`)
      const v = validateBundle(b, productsById)
      if (v.errors.length) throw new ServiceError('VALIDATION', `Pack invalide : ${v.errors[0]}`)
      return { kind: 'bundle', refId: b.id, name: b.title.fr, qty: l.qty, unitPrice: bundleEffectivePrice(b), listPrice: b.price, components: lineComponents(l, bundlesById).map((c) => ({ ...c })) }
    })

    // 2. NO stock check, NO reservation: availability is validated only when an admin confirms the order

    // 3. totals computed here
    const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0))
    const listTotal = round2(lines.reduce((s, l) => s + l.listPrice * l.qty, 0))
    const deliveryFee = 0
    const ref = makeRef('CMD', db.orders.all().map((o) => o.ref))
    const createdAt = nowIso()
    const order: Order = {
      id: ref,
      ref,
      createdAt,
      status: 'new',
      customer: {
        fullName: input.customer.fullName.trim(),
        phone: formatDzPhone(input.customer.phone) || normalizeDzPhone(input.customer.phone),
        wilaya: input.customer.wilaya,
        address: input.customer.address.trim(),
        notes: input.customer.notes?.trim() || undefined,
      },
      lines,
      subtotal,
      listTotal,
      discountTotal: round2(listTotal - subtotal),
      deliveryFee,
      total: round2(subtotal + deliveryFee),
      lang: input.lang,
      internalNotes: [],
      localOnly: LOCAL_ONLY,
    }

    db.orders.upsert(order)
    return order
  })
}

/** Stock release for every still-committed sale movement of an order. Idempotent: keys are derived from the sale keys. */
function releaseMovements(order: Order): InventoryMovement[] {
  const ledger = db.movements.all()
  const { movementCost } = replayCosting(ledger)
  return ledger
    .filter((m) => m.type === 'sale_committed' && m.refType === 'order' && m.refId === order.id)
    .map((m) => ({
      id: uid('mv'),
      productId: m.productId,
      type: 'sale_cancelled' as const,
      qtyDelta: -m.qtyDelta,
      totalCostCentimes: movementCost.get(m.id) ?? undefined,
      refType: 'order' as const,
      refId: order.id,
      refLine: m.refLine,
      idempotencyKey: `release:${m.idempotencyKey}`,
      createdAt: nowIso(),
    }))
}

/** Movements that deduct the stock of an order (one per line × component). Keys make the deduction idempotent. */
function saleMovements(order: Order, at: string): InventoryMovement[] {
  const moves: InventoryMovement[] = []
  order.lines.forEach((l, i) => {
    for (const c of l.components) {
      moves.push({
        id: uid('mv'),
        productId: c.productId,
        type: 'sale_committed',
        qtyDelta: -(l.qty * c.qty),
        refType: 'order',
        refId: order.id,
        refLine: i,
        idempotencyKey: `sale:${order.id}:${i}:${c.productId}`,
        createdAt: at,
      })
    }
  })
  return moves
}

export interface StatusOptions {
  /**
   * Only for cancelling a SHIPPED order: true = the goods came back resellable and are restocked.
   * Default false (goods left the premises; use a customer return / adjustment once they are back).
   * Cancelling a CONFIRMED (not yet shipped) order always restores the stock; cancelling a NEW order touches nothing.
   */
  restockOnCancel?: boolean
}

/** Availability of an order's full requirement against current stock (used by the confirm action and the admin UI). */
export function orderShortages(order: Order) {
  const productsById = new Map(db.products.all().map((p) => [p.id, p]))
  const need = new Map<string, number>()
  for (const l of order.lines) for (const c of l.components) need.set(c.productId, (need.get(c.productId) ?? 0) + l.qty * c.qty)
  // an order that is already confirmed has its stock deducted: nothing is missing
  if (order.status !== 'new') return []
  return findShortages(need, productsById)
}

export function changeOrderStatus(orderId: string, to: OrderStatus, opts: StatusOptions = {}): Order {
  return transaction(() => {
    const o = db.orders.get(orderId)
    if (!o) throw new ServiceError('NOT_FOUND', 'Commande introuvable.')
    if (!canTransition(o.status, to)) throw new ServiceError('INVALID_TRANSITION', `Transition interdite : ${o.status} → ${to}`)
    const at = nowIso()
    const next: Order = { ...o, status: to }
    if (to === 'confirmed') {
      // THE single point where stock is deducted. Validate every product / bundle component, then deduct all at once.
      const shortages = orderShortages(o)
      if (shortages.length) {
        const names = shortages.map((s) => `${db.products.get(s.productId)?.name.fr ?? s.productId} (demandé ${s.requested}, disponible ${s.available})`).join(' ; ')
        throw new ServiceError('INSUFFICIENT_STOCK', `Confirmation impossible, stock insuffisant : ${names}`, { shortages })
      }
      commitMovements(saleMovements(o, at)) // idempotent keys: a duplicate deduction is impossible
      next.confirmedAt = at
    }
    if (to === 'shipped') next.shippedAt = at
    if (to === 'delivered') next.deliveredAt = at
    if (to === 'cancelled') {
      next.cancelledAt = at
      // new → nothing was deducted, nothing to restore · confirmed → restore · shipped → only if explicitly restocked
      if (o.status === 'confirmed' || (o.status === 'shipped' && opts.restockOnCancel === true)) commitMovements(releaseMovements(o))
    }
    db.orders.upsert(next)
    return next
  })
}

export interface PaymentInput {
  amount: number
  method: PaymentMethod
  paidAt?: string
  note?: string
}

export function recordPayment(orderId: string, input: PaymentInput): Payment {
  return transaction(() => {
    const o = db.orders.get(orderId)
    if (!o) throw new ServiceError('NOT_FOUND', 'Commande introuvable.')
    if (o.status === 'cancelled') throw new ServiceError('VALIDATION', 'Impossible d’encaisser sur une commande annulée.')
    if (!isValidAmount(input.amount)) throw new ServiceError('VALIDATION', 'Montant invalide.', { fields: { amount: 'Montant invalide.' } })
    const { netPaid } = orderBalance(o, db.payments.all(), db.refunds.all())
    if (round2(netPaid + input.amount) > o.total) throw new ServiceError('OVERPAYMENT', `Le total encaissé dépasserait le montant de la commande (${o.total}).`, { fields: { amount: 'Dépasse le solde.' } })
    const p: Payment = { id: uid('pay'), orderId, amount: round2(input.amount), method: input.method, paidAt: input.paidAt ?? nowIso(), note: input.note?.trim() || undefined }
    db.payments.upsert(p)
    return p
  })
}

export interface RefundInput {
  amount: number
  reason: string
  /** Units physically returned in RESELLABLE condition (delivered orders only). */
  restock?: { lineIndex: number; qty: number }[]
}

export function recordRefund(orderId: string, input: RefundInput): Refund {
  return transaction(() => {
    const o = db.orders.get(orderId)
    if (!o) throw new ServiceError('NOT_FOUND', 'Commande introuvable.')
    if (!isValidAmount(input.amount)) throw new ServiceError('VALIDATION', 'Montant invalide.', { fields: { amount: 'Montant invalide.' } })
    if (!input.reason.trim()) throw new ServiceError('VALIDATION', 'Motif obligatoire.', { fields: { reason: 'Motif obligatoire.' } })
    const { netPaid } = orderBalance(o, db.payments.all(), db.refunds.all())
    if (input.amount > netPaid) throw new ServiceError('REFUND_EXCEEDS_PAID', 'Remboursement supérieur au montant encaissé.', { fields: { amount: 'Supérieur au montant encaissé.' } })

    const refund: Refund = { id: uid('ref'), orderId, amount: round2(input.amount), refundedAt: nowIso(), reason: input.reason.trim() }
    const restock = (input.restock ?? []).filter((r) => r.qty > 0)
    if (restock.length) {
      if (o.status !== 'delivered') throw new ServiceError('VALIDATION', 'Une remise en stock n’est possible que pour une commande livrée.')
      const ledger = db.movements.all()
      const { movementCost } = replayCosting(ledger)
      const moves: InventoryMovement[] = []
      for (const r of restock) {
        const l = o.lines[r.lineIndex]
        if (!l || !isPositiveInt(r.qty)) throw new ServiceError('VALIDATION', 'Ligne de retour invalide.')
        for (const c of l.components) {
          const sold = l.qty * c.qty
          const already = ledger.filter((m) => m.type === 'customer_return' && m.refId === o.id && m.refLine === r.lineIndex && m.productId === c.productId).reduce((s, m) => s + m.qtyDelta, 0)
          const back = r.qty * c.qty
          if (already + back > sold) throw new ServiceError('RETURN_EXCEEDS_SOLD', 'Quantité retournée supérieure à la quantité vendue.')
          const sale = ledger.find((m) => m.type === 'sale_committed' && m.refId === o.id && m.refLine === r.lineIndex && m.productId === c.productId)
          const saleCost = sale ? movementCost.get(sale.id) : null
          moves.push({
            id: uid('mv'),
            productId: c.productId,
            type: 'customer_return',
            qtyDelta: back,
            // re-enters at the ORIGINAL sale cost so COGS is reversed exactly
            totalCostCentimes: saleCost != null && sale ? Math.round((saleCost * back) / -sale.qtyDelta) : undefined,
            refType: 'return',
            refId: o.id,
            refLine: r.lineIndex,
            idempotencyKey: `return:${refund.id}:${r.lineIndex}:${c.productId}`,
            note: input.reason.trim(),
            createdAt: refund.refundedAt,
          })
        }
      }
      commitMovements(moves)
    }
    db.refunds.upsert(refund)
    return refund
  })
}
