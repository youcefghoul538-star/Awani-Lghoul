import { useSyncExternalStore } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AdminRole = 'owner' | 'admin' | 'staff'
type AuthState = { ready: boolean; authenticated: boolean; role: AdminRole | null }

const SERVER_STATE: AuthState = { ready: false, authenticated: false, role: null }
let state: AuthState = SERVER_STATE
const subs = new Set<() => void>()
let initialized = false
let authSubscription: { unsubscribe: () => void } | null = null

function publish(next: AuthState) {
  state = next
  subs.forEach((fn) => fn())
}

let resolveSeq = 0

async function resolveSession(session: Session | null) {
  const seq = ++resolveSeq // only the most recent resolution may publish (prevents stale results after logout/refresh)
  if (!session || !supabase) {
    publish({ ready: true, authenticated: false, role: null })
    return
  }
  const { data, error } = await supabase.from('admin_users').select('role').eq('user_id', session.user.id).maybeSingle()
  if (seq !== resolveSeq) return
  if (error) {
    // Transient failure (network, 5xx): do NOT destroy the session. Show logged-out UI; a retry/refresh re-checks.
    publish({ ready: true, authenticated: false, role: null })
    return
  }
  const role = data && ['owner', 'admin', 'staff'].includes(data.role) ? (data.role as AdminRole) : null
  publish({ ready: true, authenticated: role !== null, role })
  if (!role) await supabase.auth.signOut() // authenticated but not an admin: definitively no access
}

function initialize() {
  if (initialized) return
  initialized = true
  if (!supabase) {
    publish({ ready: true, authenticated: false, role: null })
    return
  }
  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) publish({ ready: true, authenticated: false, role: null })
    else void resolveSession(data.session)
  })
  const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session) => {
    // Defer the role query until Supabase finishes its internal auth event processing.
    queueMicrotask(() => void resolveSession(session))
  })
  authSubscription = data.subscription
}

export async function adminLogin(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Connexion Supabase non configurée.' }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.session) return { ok: false, message: 'Adresse e-mail ou mot de passe incorrect.' }
  await resolveSession(data.session)
  if (!state.authenticated) return { ok: false, message: 'Ce compte ne possède aucun rôle administrateur autorisé, ou la vérification a échoué. Réessayez.' }
  return { ok: true }
}

export async function adminLogout(): Promise<void> {
  if (supabase) await supabase.auth.signOut()
  publish({ ready: true, authenticated: false, role: null })
}

export function useAdminAuth() {
  initialize()
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => state,
    () => SERVER_STATE,
  )
}

export function disposeAdminAuthForTests() {
  authSubscription?.unsubscribe()
  authSubscription = null
  initialized = false
}
