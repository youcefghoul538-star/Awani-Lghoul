import type { AllocationMethod, InventoryMovement, Order, Purchase } from '../types'
import { pct, round2 } from './money'

/**
 * COSTING & PROFITABILITY
 *
 * 1. LANDED COST (per purchase)
 *      goods_i      = qty_i × unitCost_i
 *      extra        = Σ additional costs (transport, customs, handling, packaging, other)
 *      allocated_i  = extra × weight_i / Σ weight      weight = goods value (by_value, default) or qty (by_quantity)
 *      landed_i     = goods_i + allocated_i            landedUnit_i = landed_i / qty_i
 *    Done in integer centimes with the LARGEST-REMAINDER method so Σ allocated_i == extra exactly.
 *    If every weight is 0 (e.g. free goods) it falls back to by_quantity.
 *
 * 2. INVENTORY VALUATION — WEIGHTED AVERAGE COST (WAC), per product, replayed from the movement ledger
 *      receipt  : value += landed cost,            qty += q
 *      issue    : cost out = value × q / qty,      value −= cost out,  qty −= q   (average unchanged)
 *      return in: re-enters at the ORIGINAL sale cost (so COGS is reversed exactly)
 *      adjust + : valued at current average (neutral) unless `restateCost` re-states the whole holding
 *    Units on hand with NO known cost make the product's cost UNKNOWN until its stock reaches 0 or a
 *    cost restatement is entered. Unknown ⇒ profit is "Not enough data" (null), never an estimate.
 *    Limits: WAC hides cost differences between batches; no FIFO/lot tracking (extensible: replace replayCosting).
 *
 * 3. PROFIT
 *      netSales      = amount invoiced − refunds
 *      COGS          = Σ cost of units sold − cost of resellable units returned
 *      grossProfit   = netSales − COGS                      (NOT net profit)
 *      grossMargin % = grossProfit / netSales × 100
 *      markup %      = grossProfit / COGS × 100
 *      netProfit     = grossProfit − operating expenses     (only when expenses have been recorded)
 */

// ───────────────────────── Landed cost ─────────────────────────

export interface LandedLine {
  index: number
  productId: string
  qty: number
  goodsCentimes: number
  allocatedCentimes: number
  totalCentimes: number
  /** totalCentimes / qty (may be fractional centimes; the valuation uses totals, so no rounding drift). */
  landedUnitCentimes: number
}

export function allocateAdditionalCosts(lines: { qty: number; goodsCentimes: number }[], extraCentimes: number, method: AllocationMethod): number[] {
  if (lines.length === 0) return []
  if (extraCentimes === 0) return lines.map(() => 0)
  let weights = lines.map((l) => (method === 'by_quantity' ? l.qty : l.goodsCentimes))
  if (weights.reduce((a, b) => a + b, 0) <= 0) weights = lines.map((l) => l.qty)
  const total = weights.reduce((a, b) => a + b, 0)
  const T = BigInt(total)
  const E = BigInt(extraCentimes)
  const base = weights.map((w) => (E * BigInt(w)) / T)
  const rem = weights.map((w, i) => ({ i, r: (E * BigInt(w)) % T }))
  let left = Number(E - base.reduce((a, b) => a + b, 0n))
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))
  const out = base.map(Number)
  for (let k = 0; k < left && k < rem.length; k++) out[rem[k].i] += 1
  left = 0
  return out
}

export function landedPurchase(p: Pick<Purchase, 'items' | 'additionalCosts' | 'allocation'>): LandedLine[] {
  const goods = p.items.map((it) => Math.round(it.qty * it.unitCost * 100))
  const extra = p.additionalCosts.reduce((s, c) => s + Math.round(c.amount * 100), 0)
  const alloc = allocateAdditionalCosts(p.items.map((it, i) => ({ qty: it.qty, goodsCentimes: goods[i] })), extra, p.allocation)
  return p.items.map((it, i) => ({
    index: i,
    productId: it.productId,
    qty: it.qty,
    goodsCentimes: goods[i],
    allocatedCentimes: alloc[i],
    totalCentimes: goods[i] + alloc[i],
    landedUnitCentimes: (goods[i] + alloc[i]) / it.qty,
  }))
}

// ───────────────────────── Weighted-average replay ─────────────────────────

export interface CostState {
  qty: number
  valueCentimes: number
  /** units on hand whose cost is not known */
  unknown: boolean
}

export interface CostingResult {
  states: Map<string, CostState>
  /** Cost carried by each movement in centimes (inbound: value added, outbound: value removed). null = unknown. */
  movementCost: Map<string, number | null>
}

const fresh = (): CostState => ({ qty: 0, valueCentimes: 0, unknown: false })

export function replayCosting(ledger: InventoryMovement[]): CostingResult {
  const ordered = ledger.map((m, i) => ({ m, i })).sort((a, b) => (a.m.createdAt === b.m.createdAt ? a.i - b.i : a.m.createdAt < b.m.createdAt ? -1 : 1))
  const states = new Map<string, CostState>()
  const movementCost = new Map<string, number | null>()
  for (const { m } of ordered) {
    const s = states.get(m.productId) ?? fresh()
    states.set(m.productId, s)
    const d = m.qtyDelta
    if (d > 0) {
      if (m.restateCost && m.totalCostCentimes != null) {
        s.qty += d
        s.valueCentimes = Math.round((m.totalCostCentimes / d) * s.qty)
        s.unknown = false
        movementCost.set(m.id, m.totalCostCentimes)
      } else if (m.totalCostCentimes != null) {
        if (s.qty === 0) {
          s.unknown = false
          s.valueCentimes = 0
        }
        s.qty += d
        if (!s.unknown) s.valueCentimes += m.totalCostCentimes
        movementCost.set(m.id, m.totalCostCentimes)
      } else if (s.qty === 0) {
        s.qty = d
        s.valueCentimes = 0
        s.unknown = true
        movementCost.set(m.id, null)
      } else if (s.unknown) {
        s.qty += d
        movementCost.set(m.id, null)
      } else {
        const add = Math.round((s.valueCentimes * d) / s.qty)
        s.valueCentimes += add
        s.qty += d
        movementCost.set(m.id, add)
      }
    } else {
      const out = -d
      if (s.qty < out) {
        // Should be impossible (ledger validation). Fail safe: unknown cost, clamp at zero.
        movementCost.set(m.id, null)
        s.qty = 0
        s.valueCentimes = 0
        s.unknown = false
        continue
      }
      if (s.unknown) {
        movementCost.set(m.id, null)
        s.qty -= out
      } else {
        const cost = out === s.qty ? s.valueCentimes : Math.round((s.valueCentimes * out) / s.qty)
        movementCost.set(m.id, cost)
        s.valueCentimes -= cost
        s.qty -= out
      }
      if (s.qty === 0) {
        s.valueCentimes = 0
        s.unknown = false
      }
    }
  }
  return { states, movementCost }
}

/** Average cost per unit in centimes, or null when unknown / no stock. */
export const averageUnitCost = (s: CostState | undefined): number | null => (s && s.qty > 0 && !s.unknown ? s.valueCentimes / s.qty : null)

export interface Valuation {
  totalCentimes: number
  /** Products holding stock whose cost is unknown (so the total is incomplete). */
  incompleteProductIds: string[]
  complete: boolean
}

export function inventoryValuation(states: Map<string, CostState>): Valuation {
  let total = 0
  const incomplete: string[] = []
  for (const [id, s] of states) {
    if (s.qty <= 0) continue
    if (s.unknown) incomplete.push(id)
    else total += s.valueCentimes
  }
  return { totalCentimes: total, incompleteProductIds: incomplete, complete: incomplete.length === 0 }
}

// ───────────────────────── COGS & profit ─────────────────────────

/** COGS of one order, per line index, in centimes. null = at least one component cost unknown. */
export function orderLineCogs(orderId: string, ledger: InventoryMovement[], movementCost: Map<string, number | null>): Map<number, number | null> {
  const out = new Map<number, number | null>()
  for (const m of ledger) {
    if (m.refId !== orderId || m.refLine == null) continue
    if (m.type !== 'sale_committed' && m.type !== 'customer_return') continue
    const c = movementCost.get(m.id)
    const prev = out.get(m.refLine)
    if (prev === null) continue
    if (c == null) {
      out.set(m.refLine, null)
      continue
    }
    const signed = m.type === 'sale_committed' ? c : -c
    out.set(m.refLine, (prev ?? 0) + signed)
  }
  return out
}

export const grossProfit = (netSales: number | null, cogs: number | null): number | null => (netSales == null || cogs == null ? null : round2(netSales - cogs))
export const grossMarginPct = (gp: number | null, netSales: number | null): number | null => (gp == null || netSales == null ? null : pct(gp, netSales))
export const markupPct = (gp: number | null, cogs: number | null): number | null => (gp == null || cogs == null ? null : pct(gp, cogs))
export const netProfit = (gp: number | null, operatingExpenses: number | null): number | null => (gp == null || operatingExpenses == null ? null : round2(gp - operatingExpenses))

export interface OrderProfit {
  netSales: number
  cogs: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  markupPct: number | null
}

/** Gross profit of one delivered order. `refunds` = cash refunded on that order. */
export function orderProfit(order: Pick<Order, 'id' | 'total' | 'lines'>, refunds: number, ledger: InventoryMovement[], movementCost: Map<string, number | null>): OrderProfit {
  const lineCogs = orderLineCogs(order.id, ledger, movementCost)
  let cogsCentimes: number | null = 0
  for (let i = 0; i < order.lines.length; i++) {
    const c = lineCogs.get(i)
    if (c == null) {
      cogsCentimes = null
      break
    }
    cogsCentimes += c
  }
  const netSales = round2(order.total - refunds)
  const cogs = cogsCentimes == null ? null : round2(cogsCentimes / 100)
  const gp = grossProfit(netSales, cogs)
  return { netSales, cogs, grossProfit: gp, grossMarginPct: grossMarginPct(gp, netSales), markupPct: markupPct(gp, cogs) }
}

export interface LineProfit {
  orderId: string
  lineIndex: number
  kind: 'product' | 'bundle'
  refId: string
  qty: number
  revenue: number
  cogs: number | null
  grossProfit: number | null
  grossMarginPct: number | null
}

/**
 * Per-line profit for delivered orders (revenue = unitPrice × qty after promotions; delivery fee and
 * order-level refunds are NOT allocated to lines — see order-level orderProfit for those).
 */
export function lineProfits(orders: Order[], ledger: InventoryMovement[], movementCost: Map<string, number | null>): LineProfit[] {
  const res: LineProfit[] = []
  for (const o of orders) {
    if (o.status !== 'delivered') continue
    const cogsMap = orderLineCogs(o.id, ledger, movementCost)
    o.lines.forEach((l, i) => {
      const revenue = round2(l.unitPrice * l.qty)
      const c = cogsMap.get(i)
      const cogs = c == null ? null : round2(c / 100)
      const gp = grossProfit(revenue, cogs)
      res.push({ orderId: o.id, lineIndex: i, kind: l.kind, refId: l.refId, qty: l.qty, revenue, cogs, grossProfit: gp, grossMarginPct: grossMarginPct(gp, revenue) })
    })
  }
  return res
}

export interface ProductPerformance {
  productId: string
  qtySold: number
  revenue: number
  cogs: number | null
  grossProfit: number | null
  grossMarginPct: number | null
}

/** Performance of PRODUCT lines only (bundle lines are reported as bundles, never split by guesswork). */
export function productPerformance(lines: LineProfit[]): ProductPerformance[] {
  const map = new Map<string, { qty: number; revenue: number; cogs: number | null }>()
  for (const l of lines) {
    if (l.kind !== 'product') continue
    const cur = map.get(l.refId) ?? { qty: 0, revenue: 0, cogs: 0 }
    cur.qty += l.qty
    cur.revenue = round2(cur.revenue + l.revenue)
    cur.cogs = cur.cogs == null || l.cogs == null ? null : round2(cur.cogs + l.cogs)
    map.set(l.refId, cur)
  }
  return [...map].map(([productId, v]) => {
    const gp = grossProfit(v.revenue, v.cogs)
    return { productId, qtySold: v.qty, revenue: v.revenue, cogs: v.cogs, grossProfit: gp, grossMarginPct: grossMarginPct(gp, v.revenue) }
  })
}
