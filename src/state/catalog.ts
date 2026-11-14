import { useSyncExternalStore } from 'react'
import { SUPABASE_CONFIGURED } from '../data/config'
import { DEFAULT_SETTINGS } from '../data/defaultSettings'
import { supabase } from '../lib/supabase'
import { fetchPublicCatalog, type PublicCatalog } from '../services/catalogRemote'

/**
 * Storefront catalogue state.
 *  - Supabase configured: data comes ONLY from Supabase. On failure the status is 'error' (never fake/local data).
 *  - Not configured: 'unconfigured' in production builds (storefront closed); in dev the empty local db is used.
 */
export type CatalogStatus = 'loading' | 'ready' | 'error' | 'unconfigured'
export interface CatalogState {
  status: CatalogStatus
  data: PublicCatalog | null
  error: string
}

const EMPTY: PublicCatalog = { categories: [], products: [], bundles: [], settings: DEFAULT_SETTINGS }
let state: CatalogState = SUPABASE_CONFIGURED
  ? { status: 'loading', data: null, error: '' }
  : import.meta.env.PROD
    ? { status: 'unconfigured', data: null, error: '' }
    : { status: 'ready', data: null, error: '' }
const subs = new Set<() => void>()
const publish = (n: CatalogState) => {
  state = n
  subs.forEach((f) => f())
}
let inflight: Promise<void> | null = null

export function loadCatalog(): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return Promise.resolve()
  if (inflight) return inflight
  if (state.status === 'error') publish({ ...state, status: 'loading' })
  inflight = fetchPublicCatalog(supabase)
    .then((data) => publish({ status: 'ready', data, error: '' }))
    .catch((e: unknown) => publish({ status: 'error', data: state.data, error: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useCatalogState(): CatalogState {
  if (SUPABASE_CONFIGURED && state.status === 'loading' && !inflight) void loadCatalog()
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
    () => state,
  )
}

export { EMPTY as EMPTY_CATALOG }
