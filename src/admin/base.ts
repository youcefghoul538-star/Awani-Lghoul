/**
 * The admin lives on a long random path, NOT on /admin, and no public page links to it.
 * This is an extra layer only: the real protection is the Supabase login + Row Level Security.
 * Override per deployment with VITE_ADMIN_PATH (letters, digits, - and _, at least 10 characters).
 */
const fromEnv = (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim().replace(/^\/+|\/+$/g, '')
export const ADMIN_PATH = fromEnv && /^[a-z0-9][a-z0-9_-]{9,}$/i.test(fromEnv) ? fromEnv : 'gestion-hv7rw1p9ofzlogph'
export const ADMIN_BASE = `/${ADMIN_PATH}`
export const adminUrl = (sub = ''): string => (sub ? `${ADMIN_BASE}/${sub}` : ADMIN_BASE)
