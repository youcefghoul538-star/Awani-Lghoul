import { db, transaction } from '../data/db'
import {
  applyMovements,
  InsufficientStockError,
  InvalidMovementError,
  MOVEMENT_SIGN,
  reconcile,
  replayCosting,
  stockFromLedger,
  validateMovement,
  type ApplyResult,
  type ReconcileRow,
} from '../domain'
import { uid } from '../lib/ids'
import type { InventoryMovement, MovementType } from '../types'
import { ServiceError, nowIso } from './common'

/**
 * INVENTORY SERVICE — the only code allowed to change stock.
 * Every change is a ledger movement; Product.stock is refreshed from the ledger inside the same transaction.
 */

/** Atomically append movements (idempotent, never negative) and refresh the stock cache of touched products. */
export function commitMovements(incoming: InventoryMovement[]): ApplyResult {
  return transaction(() => {
    let result: ApplyResult
    try {
      result = applyMovements(db.movements.all(), incoming)
    } catch (e) {
      if (e instanceof InsufficientStockError) throw new ServiceError('INSUFFICIENT_STOCK', e.message, { shortages: e.shortages })
      if (e instanceof InvalidMovementError) throw new ServiceError('VALIDATION', e.message)
      throw e
    }
    if (result.applied.length) {
      db.movements.replaceAll(result.ledger)
      syncStockCache(new Set(result.applied.map((m) => m.productId)))
    }
    return result
  })
}

/** Set Product.stock = Σ ledger for the given products (or all). */
export function syncStockCache(only?: Set<string>): void {
  const led = stockFromLedger(db.movements.all())
  for (const p of db.products.all()) {
    if (only && !only.has(p.id)) continue
    const q = led.get(p.id) ?? 0
    if (p.stock !== q) db.products.upsert({ ...p, stock: q })
  }
}

export const ADJUSTMENT_TYPES: MovementType[] = ['manual_adjustment', 'damaged', 'supplier_return', 'other_adjustment']

export interface AdjustInput {
  productId: string
  type: MovementType
  /** Signed. Sign must agree with the type (damaged / supplier_return are always negative). */
  qtyDelta: number
  /** Mandatory justification — every manual change must be explainable. */
  note: string
  /** Optional unit cost (DZD) for positive manual adjustments. */
  unitCost?: number
  /** Re-state the valuation of ALL units on hand at `unitCost` (fixes "unknown cost" stock). */
  restateCost?: boolean
}

export function adjustStock(input: AdjustInput): ApplyResult {
  if (!db.products.get(input.productId)) throw new ServiceError('NOT_FOUND', 'Produit introuvable.')
  if (!ADJUSTMENT_TYPES.includes(input.type)) throw new ServiceError('VALIDATION', 'Type de mouvement non autorisé ici.')
  if (!input.note.trim()) throw new ServiceError('VALIDATION', 'Un motif est obligatoire.', { fields: { note: 'Motif obligatoire.' } })
  if (input.unitCost != null && !(input.unitCost >= 0)) throw new ServiceError('VALIDATION', 'Coût invalide.')
  if (input.restateCost && (input.unitCost == null || input.qtyDelta <= 0)) {
    throw new ServiceError('VALIDATION', 'Une réévaluation du coût exige une entrée positive avec un coût unitaire.')
  }
  const m: InventoryMovement = {
    id: uid('mv'),
    productId: input.productId,
    type: input.type,
    qtyDelta: input.qtyDelta,
    totalCostCentimes: input.unitCost != null && input.qtyDelta > 0 ? Math.round(input.unitCost * input.qtyDelta * 100) : undefined,
    restateCost: input.restateCost || undefined,
    refType: 'adjustment',
    refId: uid('adj'),
    idempotencyKey: `adj:${uid('k')}`,
    note: input.note.trim(),
    createdAt: nowIso(),
  }
  const err = validateMovement(m)
  if (err) throw new ServiceError('VALIDATION', err, { fields: { qtyDelta: err } })
  void MOVEMENT_SIGN
  return commitMovements([m])
}

/** Opening stock for a NEW product (optionally with its real unit cost). Idempotent per product. */
export function createOpeningStock(productId: string, qty: number, unitCost?: number): ApplyResult | null {
  if (qty <= 0) return null
  return commitMovements([
    {
      id: uid('mv'),
      productId,
      type: 'manual_adjustment',
      qtyDelta: qty,
      totalCostCentimes: unitCost != null ? Math.round(unitCost * qty * 100) : undefined,
      refType: 'opening',
      refId: productId,
      idempotencyKey: `opening:${productId}`,
      note: 'Stock d’ouverture',
      createdAt: nowIso(),
    },
  ])
}

export function reconciliationReport(physical?: Map<string, number>): ReconcileRow[] {
  return reconcile(db.movements.all(), db.products.all(), physical)
}

/**
 * Physical count: for every counted product whose count ≠ ledger, append ONE manual_adjustment of the variance.
 * `sessionId` makes re-submitting the same count a no-op (idempotent).
 */
export function applyPhysicalCount(counts: Map<string, number>, sessionId: string, note: string): ApplyResult {
  if (!note.trim()) throw new ServiceError('VALIDATION', 'Un motif est obligatoire.', { fields: { note: 'Motif obligatoire.' } })
  for (const [, q] of counts) if (!Number.isInteger(q) || q < 0) throw new ServiceError('VALIDATION', 'Quantités comptées invalides.')
  const rows = reconciliationReport(counts).filter((r) => r.variance != null && r.variance !== 0)
  const moves: InventoryMovement[] = rows.map((r) => ({
    id: uid('mv'),
    productId: r.productId,
    type: 'manual_adjustment',
    qtyDelta: r.variance!,
    refType: 'count',
    refId: sessionId,
    idempotencyKey: `count:${sessionId}:${r.productId}`,
    note: `Inventaire physique : ${note.trim()}`,
    createdAt: nowIso(),
  }))
  return commitMovements(moves)
}

/** Weighted-average cost state + valuation for the whole ledger. */
export function costingSnapshot() {
  return replayCosting(db.movements.all())
}
