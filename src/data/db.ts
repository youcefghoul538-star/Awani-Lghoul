/**
 * DATA ACCESS SEAM — LOCAL (DEMO) IMPLEMENTATION
 * ----------------------------------------------
 * Layers:
 *   UI components → services/* (business rules, validation, atomic writes) → db (this file)
 *   domain/*  = pure formulas, no I/O.
 *
 * `db` is backed by localStorage (browser-only, EMPTY by default — no seeded products, stock or prices). It is NOT a trustworthy authority: anything in a browser
 * can be edited by its user. The real authority is the Supabase implementation, where the same rules live in
 * SQL functions (supabase/migrations/0006_functions.sql). Components must call `services/*`, never write
 * orders, payments or stock directly.
 */
import type {
  Bundle,
  Category,
  Expense,
  InventoryMovement,
  Order,
  Payment,
  Product,
  Purchase,
  Quote,
  Refund,
  Settings,
  Supplier,
  Trader,
  WholesalePrice,
} from '../types'
import { createCollection, createStore, wipeAll, type Collection } from './store'
import { DEFAULT_SETTINGS } from './defaultSettings'

/** true while there is no real backend: submissions stay on this device only. */
export const LOCAL_ONLY = true

export const db = {
  categories: createCollection<Category>('categories', () => []),
  products: createCollection<Product>('products', () => []),
  bundles: createCollection<Bundle>('bundles', () => []),
  orders: createCollection<Order>('orders', () => []),
  payments: createCollection<Payment>('payments', () => []),
  refunds: createCollection<Refund>('refunds', () => []),
  quotes: createCollection<Quote>('quotes', () => []),
  traders: createCollection<Trader>('traders', () => []),
  /** Append-only inventory ledger — the source of truth for stock. */
  movements: createCollection<InventoryMovement>('movements', () => []),
  suppliers: createCollection<Supplier>('suppliers', () => []),
  purchases: createCollection<Purchase>('purchases', () => []),
  expenses: createCollection<Expense>('expenses', () => []),
  /**
   * PRIVATE. Starts EMPTY and is never auto-filled: wholesale prices are entered manually by an administrator.
   */
  wholesalePrices: createCollection<WholesalePrice>('wholesalePrices', () => []),
  settings: createStore<Settings>('settings', () => DEFAULT_SETTINGS),
}

const ALL = [db.categories, db.products, db.bundles, db.orders, db.payments, db.refunds, db.quotes, db.traders, db.movements, db.suppliers, db.purchases, db.expenses, db.wholesalePrices] as unknown as Collection<{ id: string }>[]

/**
 * All-or-nothing write. If `fn` throws (validation error, storage full…) every collection is restored to its
 * state before the call, so a half-written order (e.g. order saved but stock not deducted) cannot exist.
 * In Supabase this is a database transaction inside a SECURITY DEFINER function.
 */
export function transaction<T>(fn: () => T): T {
  const before = ALL.map((c) => [c, c.all()] as const)
  const settingsBefore = db.settings.get()
  try {
    return fn()
  } catch (e) {
    for (const [c, snap] of before) {
      try {
        c.store.set(snap)
      } catch {
        /* best effort */
      }
    }
    try {
      db.settings.set(settingsBefore)
    } catch {
      /* best effort */
    }
    throw e
  }
}

export function resetDemoData(): void {
  wipeAll()
  window.location.assign('/')
}
