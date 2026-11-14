import type { Shortage } from '../domain'

export type ServiceErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_TRANSITION'
  | 'OVERPAYMENT'
  | 'REFUND_EXCEEDS_PAID'
  | 'RETURN_EXCEEDS_SOLD'
  | 'ALREADY_PROCESSED'
  | 'IN_USE'

/** Business-rule failure. `fields` maps a field name → message for forms; `shortages` for stock errors. */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly fields: Record<string, string>
  readonly shortages: Shortage[]
  constructor(code: ServiceErrorCode, message: string, extra: { fields?: Record<string, string>; shortages?: Shortage[] } = {}) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.fields = extra.fields ?? {}
    this.shortages = extra.shortages ?? []
  }
}

export const nowIso = (): string => new Date().toISOString()

/** Amount with at most 2 decimals, strictly positive, finite. */
export const isValidAmount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6

export const MAX_LINE_QTY = 100_000
