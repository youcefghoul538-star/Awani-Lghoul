import type { WholesalePrice } from '../types'
import { round2 } from './money'

/**
 * WHOLESALE PRICING — PRIVATE.
 *  • Wholesale prices are NEVER computed from retail prices. They are typed in by an administrator
 *    (or, later, produced by an explicitly approved pricing policy based on real costs).
 *  • A price only applies when qty ≥ minQty. Below it the line is flagged and NO price is applied.
 *  • (retail − wholesale) is a "price difference", NOT a margin. Margin needs the acquisition cost.
 */
export type WholesaleResolution =
  | { status: 'ok'; unitPrice: number; minQty?: number }
  | { status: 'below_min'; minQty: number; unitPrice: number }
  | { status: 'missing_price' }

export function resolveWholesaleLine(wp: Pick<WholesalePrice, 'price' | 'minQty'> | undefined, qty: number): WholesaleResolution {
  if (!wp || !(wp.price > 0)) return { status: 'missing_price' }
  if (wp.minQty != null && wp.minQty > 1 && qty < wp.minQty) return { status: 'below_min', minQty: wp.minQty, unitPrice: wp.price }
  return { status: 'ok', unitPrice: wp.price, minQty: wp.minQty }
}

export interface QuoteEstimate {
  /** Σ price × qty over lines that resolved to 'ok' only. */
  pricedTotal: number
  pricedLines: number
  belowMinLines: number
  missingPriceLines: number
  /** true when every line is priced — only then is pricedTotal a complete estimate. */
  complete: boolean
}

export function estimateQuote(lines: { productId: string; qty: number }[], prices: Map<string, WholesalePrice>): QuoteEstimate {
  let total = 0
  let ok = 0
  let below = 0
  let missing = 0
  for (const l of lines) {
    const r = resolveWholesaleLine(prices.get(l.productId), l.qty)
    if (r.status === 'ok') {
      total += r.unitPrice * l.qty
      ok++
    } else if (r.status === 'below_min') below++
    else missing++
  }
  return { pricedTotal: round2(total), pricedLines: ok, belowMinLines: below, missingPriceLines: missing, complete: below + missing === 0 && lines.length > 0 }
}

/** retail − wholesale, per unit. Informational only — this is NOT profit and NOT margin. */
export function priceDifference(retailEffective: number, wholesale: number | undefined): { amount: number; pctOfRetail: number | null } | null {
  if (wholesale == null || !(retailEffective > 0)) return null
  const amount = round2(retailEffective - wholesale)
  return { amount, pctOfRetail: (amount / retailEffective) * 100 }
}

/** Wholesale gross profit per unit = wholesale price − average unit cost. null when either is unknown. */
export function wholesaleUnitProfit(wholesale: number | undefined, avgUnitCostDzd: number | null): { profit: number; marginPct: number } | null {
  if (wholesale == null || wholesale <= 0 || avgUnitCostDzd == null) return null
  const profit = round2(wholesale - avgUnitCostDzd)
  return { profit, marginPct: (profit / wholesale) * 100 }
}
