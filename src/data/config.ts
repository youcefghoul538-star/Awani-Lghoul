/**
 * Supabase browser configuration. Only the project URL + publishable/legacy anon key belong here.
 * Never place sb_secret_ or service_role keys in VITE_* variables.
 */
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim()

function looksSecret(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true
  try {
    const segment = k.split('.')[1]
    if (!segment) return false
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

// VITE_SUPABASE_URL must be the project root, e.g. https://xxxx.supabase.co (no /rest/v1).
const url = rawUrl?.replace(/\/+$/, '')
export const SUPABASE_KEY_REJECTED = Boolean(key && looksSecret(key))
export const SUPABASE_URL_INVALID = Boolean(url && /\/(rest\/v1|auth\/v1|storage\/v1)$/i.test(url))
export const SUPABASE_CONFIGURED = Boolean(url && key && !SUPABASE_KEY_REJECTED && !SUPABASE_URL_INVALID)

if (SUPABASE_KEY_REJECTED) {
  console.error('[Supabase] Secret/service_role keys are forbidden in browser configuration.')
}
if (SUPABASE_URL_INVALID) {
  console.error('[Supabase] Use the project root URL, not an API path such as /rest/v1.')
}

export const SUPABASE_URL = SUPABASE_CONFIGURED ? url : undefined
export const SUPABASE_PUBLIC_KEY = SUPABASE_CONFIGURED ? key : undefined
