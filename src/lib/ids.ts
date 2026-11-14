import { dayKey } from '../domain/time'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

function randomChars(n: number): string {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/**
 * Unique, human-friendly reference, e.g. DEV-261106-K7QF (quote) or CMD-261106-9XHM (order).
 * Uniqueness is checked against existing references; a real backend must enforce it with a unique index.
 */
export function makeRef(prefix: 'CMD' | 'DEV' | 'ACH', existing: Iterable<string>): string {
  const taken = new Set(existing)
  // business day in Africa/Algiers (not the browser's timezone)
  const stamp = dayKey(new Date()).replaceAll('-', '').slice(2)
  for (let i = 0; i < 50; i++) {
    const ref = `${prefix}-${stamp}-${randomChars(4)}`
    if (!taken.has(ref)) return ref
  }
  return `${prefix}-${stamp}-${randomChars(8)}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}${randomChars(4).toLowerCase()}`
}
