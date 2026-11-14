import { useSyncExternalStore } from 'react'

/**
 * Tiny persisted store used for BOTH business collections (db.ts) and UI state (cart, mode).
 * localStorage is the "mock backend". db.ts is the single seam to replace with Supabase.
 */
export const NS = 'dm:v2:'

/**
 * v1 → v2 data reset. v1 stored auto-generated wholesale prices (72 % of retail), orders without payments /
 * ledger links and trader notes keyed by phone. Those records are incompatible with the corrected model and the
 * generated prices must not survive, so every legacy key is removed once, at start-up. (Demo data only.)
 */
export function purgeLegacyStorage(): void {
  try {
    const legacy: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('dm:v1:')) legacy.push(k)
    }
    legacy.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable */
  }
}
purgeLegacyStorage()

export class StorageFullError extends Error {
  constructor() {
    super('Local storage is full')
    this.name = 'StorageFullError'
  }
}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(NS + key)
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value))
  } catch {
    throw new StorageFullError()
  }
}

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(fn: () => void): () => void
  reset(): void
}

export function createStore<T>(key: string, init: () => T): Store<T> {
  const stored = read<T>(key)
  let state: T = stored !== undefined ? stored : init()
  if (stored === undefined) {
    try {
      write(key, state)
    } catch {
      /* seed not persisted; still works in memory */
    }
  }
  const subs = new Set<() => void>()
  const notify = () => subs.forEach((f) => f())

  // keep tabs in sync
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === NS + key) {
        const v = read<T>(key)
        state = v !== undefined ? v : init()
        notify()
      }
    })
  }

  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next
      write(key, value) // throws StorageFullError before state changes
      state = value
      notify()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    reset() {
      state = init()
      try {
        write(key, state)
      } catch {
        /* ignore */
      }
      notify()
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Collection helpers on top of a store ------------------------------------ */
export interface Collection<T extends { id: string }> {
  store: Store<T[]>
  all(): T[]
  get(id: string): T | undefined
  upsert(item: T): void
  remove(id: string): void
  replaceAll(items: T[]): void
}

export function createCollection<T extends { id: string }>(key: string, seed: () => T[]): Collection<T> {
  const store = createStore<T[]>(key, seed)
  return {
    store,
    all: () => store.get(),
    get: (id) => store.get().find((x) => x.id === id),
    upsert(item) {
      store.set((prev) => {
        const i = prev.findIndex((x) => x.id === item.id)
        if (i === -1) return [...prev, item]
        const copy = prev.slice()
        copy[i] = item
        return copy
      })
    },
    remove(id) {
      store.set((prev) => prev.filter((x) => x.id !== id))
    },
    replaceAll(items) {
      store.set(items)
    },
  }
}

export function useCollection<T extends { id: string }>(c: Collection<T>): T[] {
  return useStore(c.store)
}

/** Remove every key written by this app (used by "reset demo data"). */
export function wipeAll(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(NS)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
