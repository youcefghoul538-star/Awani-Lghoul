/**
 * TIMEZONE STRATEGY
 * All timestamps are stored as UTC ISO strings (timestamptz in SQL). Every *business day* bucket
 * (daily charts, "last 7 days", follow-up dates) is computed in Africa/Algiers (UTC+1, no DST),
 * regardless of the browser's timezone, so figures never depend on where the admin opens the app.
 */
export const BUSINESS_TZ = 'Africa/Algiers'

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "YYYY-MM-DD" of an instant, in Algiers time. */
export const dayKey = (instant: string | Date): string => dayFmt.format(typeof instant === 'string' ? new Date(instant) : instant)

/** The last `n` business days ending at `now` (inclusive), oldest first. */
export function lastDayKeys(n: number, now: Date = new Date()): string[] {
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * 86_400_000)))
  return keys
}

/** Inclusive range of business days. Either bound may be omitted. */
export interface Period {
  fromDay?: string
  toDay?: string
}

export function inPeriod(instant: string | undefined, p?: Period): boolean {
  if (!p || (!p.fromDay && !p.toDay)) return true
  if (!instant) return false
  const d = dayKey(instant)
  return (!p.fromDay || d >= p.fromDay) && (!p.toDay || d <= p.toDay)
}
