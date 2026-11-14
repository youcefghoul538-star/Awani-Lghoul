import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_CONFIGURED, SUPABASE_PUBLIC_KEY, SUPABASE_URL } from '../data/config'

/**
 * Shared browser client. This is connection scaffolding only: business data still uses the local demo adapter
 * until the async Supabase repositories/RPC gateway and Auth flow are implemented and tested.
 */
export const supabase: SupabaseClient | null =
  SUPABASE_CONFIGURED && SUPABASE_URL && SUPABASE_PUBLIC_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.')
  }
  return supabase
}
