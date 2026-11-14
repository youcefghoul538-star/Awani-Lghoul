import type { Bundle, BundleItem, InventoryMovement, MovementType, Product } from '../types'

/**
 * INVENTORY ENGINE
 *
 * Source of truth = the movement ledger. on_hand(product) = Σ qtyDelta. `Product.stock` is only a cache.
 *
 * WHEN STOCK MOVES (business rule — flagged for approval, see BUSINESS_FORMULAS.md §Assumptions):
 *   order created        → sale_committed   (− qty, per component)   [reservation == deduction]
 *   order cancelled      → sale_cancelled   (+ qty, once)            [only if still committed]
 *   delivered + return   → customer_return  (+ qty, resellable only)
 *   purchase received    → purchase_received (+ qty)
 *   supplier return / damage / adjustments → their own typed movements
 *
 * REQUIRED STOCK = Σ over cart lines of (line qty × component qty), AGGREGATED PER PRODUCT before checking,
 * so "2 units + 3 bundles of 3" needs 11 units, not "2 ≤ stock and 3 ≤ stock".
 */

/** Sign allowed for each movement type: +1 inbound, −1 outbound, 0 either (adjustments). */
export const MOVEMENT_SIGN: Record<MovementType, 1 | -1 | 0> = {
  purchase_received: 1,
  sale_cancelled: 1,
  customer_return: 1,
  sale_committed: -1,
  supplier_return: -1,
  damaged: -1,
  manual_adjustment: 0,
  other_adjustment: 0,
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  purchase_received: 'Achat reçu',
  sale_committed: 'Vente engagée',
  sale_cancelled: 'Vente annulée (stock libéré)',
  customer_return: 'Retour client',
  supplier_return: 'Retour fournisseur',
  manual_adjustment: 'Ajustement manuel',
  damaged: 'Stock endommagé',
  other_adjustment: 'Autre ajustement approuvé',
}

export class InsufficientStockError extends Error {
  readonly shortages: Shortage[]
  constructor(shortages: Shortage[]) {
    super(`Insufficient stock for ${shortages.map((s) => s.productId).join(', ')}`)
    this.name = 'InsufficientStockError'
    this.shortages = shortages
  }
}

export class InvalidMovementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidMovementError'
  }
}

export interface Shortage {
  productId: string
  requested: number
  available: number
  reason: 'insufficient' | 'inactive' | 'missing'
}

export interface RequestLine {
  kind: 'product' | 'bundle'
  refId: string
  qty: number
}

/** Components consumed by ONE unit of a line. Throws for unknown references. */
export function lineComponents(line: Pick<RequestLine, 'kind' | 'refId'>, bundlesById: Map<string, Bundle>): BundleItem[] {
  if (line.kind === 'product') return [{ productId: line.refId, qty: 1 }]
  const b = bundlesById.get(line.refId)
  if (!b) throw new InvalidMovementError(`Unknown bundle ${line.refId}`)
  return b.items
}

/** productId → total units required by all lines (bundle qty × component qty, summed with plain products). */
export function aggregateRequirements(lines: RequestLine[], bundlesById: Map<string, Bundle>): Map<string, number> {
  const req = new Map<string, number>()
  for (const l of lines) {
    for (const c of lineComponents(l, bundlesById)) {
      req.set(c.productId, (req.get(c.productId) ?? 0) + l.qty * c.qty)
    }
  }
  return req
}

/** Compare aggregated requirements with on-hand stock. Inactive/missing products can never be sold. */
export function findShortages(requirements: Map<string, number>, productsById: Map<string, Pick<Product, 'stock' | 'active'>>): Shortage[] {
  const out: Shortage[] = []
  for (const [productId, requested] of requirements) {
    const p = productsById.get(productId)
    if (!p) out.push({ productId, requested, available: 0, reason: 'missing' })
    else if (!p.active) out.push({ productId, requested, available: 0, reason: 'inactive' })
    else if (p.stock < requested) out.push({ productId, requested, available: Math.max(0, p.stock), reason: 'insufficient' })
  }
  return out
}

/**
 * Largest quantity of `kind/refId` that can still be added while other lines keep their reservation.
 * Used by the cart so the limit is REAL stock (never a fixed 99).
 */
export function maxAddableQty(
  line: Pick<RequestLine, 'kind' | 'refId'>,
  otherLines: RequestLine[],
  bundlesById: Map<string, Bundle>,
  productsById: Map<string, Pick<Product, 'stock' | 'active'>>,
): number {
  const used = aggregateRequirements(otherLines, bundlesById)
  let max = Infinity
  for (const c of lineComponents(line, bundlesById)) {
    const p = productsById.get(c.productId)
    if (!p || !p.active) return 0
    max = Math.min(max, Math.floor(Math.max(0, p.stock - (used.get(c.productId) ?? 0)) / c.qty))
  }
  return Number.isFinite(max) ? max : 0
}

// ───────────────────────── Ledger ─────────────────────────

export function validateMovement(m: Pick<InventoryMovement, 'type' | 'qtyDelta' | 'idempotencyKey'>): string | null {
  if (!Number.isInteger(m.qtyDelta) || m.qtyDelta === 0) return 'qtyDelta must be a non-zero integer'
  const sign = MOVEMENT_SIGN[m.type]
  if (sign === 1 && m.qtyDelta < 0) return `${m.type} must be positive`
  if (sign === -1 && m.qtyDelta > 0) return `${m.type} must be negative`
  if (!m.idempotencyKey) return 'idempotencyKey is required'
  return null
}

export function stockFromLedger(ledger: InventoryMovement[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of ledger) m.set(x.productId, (m.get(x.productId) ?? 0) + x.qtyDelta)
  return m
}

export interface ApplyResult {
  ledger: InventoryMovement[]
  applied: InventoryMovement[]
  /** Movements ignored because their idempotency key already exists (no double deduction / restoration). */
  skipped: InventoryMovement[]
}

/**
 * ATOMIC append: either every new movement is applied or none is (throws).
 *  • invalid sign / zero quantity → InvalidMovementError
 *  • a duplicate idempotency key is skipped, not applied twice (also duplicates inside the same batch)
 *  • any product that would go below zero → InsufficientStockError (negative stock is impossible)
 */
export function applyMovements(ledger: InventoryMovement[], incoming: InventoryMovement[]): ApplyResult {
  const seen = new Set(ledger.map((m) => m.idempotencyKey))
  const applied: InventoryMovement[] = []
  const skipped: InventoryMovement[] = []
  for (const m of incoming) {
    const err = validateMovement(m)
    if (err) throw new InvalidMovementError(err)
    if (seen.has(m.idempotencyKey)) skipped.push(m)
    else {
      seen.add(m.idempotencyKey)
      applied.push(m)
    }
  }
  const stock = stockFromLedger(ledger)
  const shortages: Shortage[] = []
  const projected = new Map(stock)
  for (const m of applied) projected.set(m.productId, (projected.get(m.productId) ?? 0) + m.qtyDelta)
  for (const [productId, q] of projected) {
    if (q < 0) shortages.push({ productId, requested: Math.abs((q - (stock.get(productId) ?? 0))), available: stock.get(productId) ?? 0, reason: 'insufficient' })
  }
  if (shortages.length) throw new InsufficientStockError(shortages)
  return { ledger: [...ledger, ...applied], applied, skipped }
}

// ───────────────────────── Reconciliation ─────────────────────────

export interface ReconcileRow {
  productId: string
  /** Σ ledger. */
  ledgerQty: number
  /** Product.stock cache. */
  cachedQty: number
  /** cachedQty − ledgerQty ≠ 0 means the cache drifted from the ledger (a bug / manual tampering). */
  cacheDrift: number
  /** Physical count entered by staff (if any). */
  physicalQty?: number
  /** physicalQty − ledgerQty: the adjustment needed to make the books match the shelf. */
  variance?: number
}

export function reconcile(ledger: InventoryMovement[], products: Pick<Product, 'id' | 'stock'>[], physical?: Map<string, number>): ReconcileRow[] {
  const led = stockFromLedger(ledger)
  return products.map((p) => {
    const ledgerQty = led.get(p.id) ?? 0
    const physicalQty = physical?.get(p.id)
    return {
      productId: p.id,
      ledgerQty,
      cachedQty: p.stock,
      cacheDrift: p.stock - ledgerQty,
      physicalQty,
      variance: physicalQty == null ? undefined : physicalQty - ledgerQty,
    }
  })
}
