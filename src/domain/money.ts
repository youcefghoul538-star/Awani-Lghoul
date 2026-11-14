/**
 * MONEY
 * Retail/wholesale prices are whole DZD. Costs can have centimes (1 DZD = 100 centimes), so all cost
 * and valuation maths is done in INTEGER CENTIMES to avoid floating-point drift.
 */
export const toCentimes = (dzd: number): number => Math.round(dzd * 100)
export const fromCentimes = (c: number): number => c / 100
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Regular price vs. active promotion. A sale price only applies if it is > 0 and < the regular price. */
export const effectivePrice = (p: { price: number; salePrice?: number }): number =>
  p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price

/** Same rule for bundles (promoPrice). */
export const bundleEffectivePrice = (b: { price: number; promoPrice?: number }): number =>
  b.promoPrice != null && b.promoPrice > 0 && b.promoPrice < b.price ? b.promoPrice : b.price

export const isPositiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

/** Percentage helper: null when the denominator is not strictly positive (never divide by zero). */
export const pct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null)
