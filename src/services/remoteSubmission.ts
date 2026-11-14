import { requireSupabase } from '../lib/supabase'
import type { Lang } from '../types'

export interface RemoteRetailOrderInput {
  customer: { fullName: string; phone: string; wilaya: string; address: string; notes?: string }
  lines: { kind: 'product' | 'bundle'; refId: string; qty: number }[]
  lang: Lang
}

export interface RemoteQuoteInput {
  business: { companyName: string; contactName: string; phone: string; email?: string; wilaya: string; businessType: string; address?: string; notes?: string }
  lines: { productId: string; qty: number }[]
  lang: Lang
}

function message(error: { message?: string; details?: string; hint?: string }): string {
  const raw = [error.message, error.details, error.hint].filter(Boolean).join(' — ')
  if (/INSUFFICIENT_STOCK/i.test(raw)) return 'Stock insuffisant pour confirmer cette demande. Contactez le magasin.'
  if (/NOT_FOUND/i.test(raw)) return 'Un produit sélectionné n’est plus disponible. Actualisez le catalogue.'
  if (/RATE_LIMIT/i.test(raw)) return 'Trop de demandes depuis ce numéro. Réessayez dans une heure ou appelez-nous.'
  if (/VALIDATION/i.test(raw)) return 'Les informations envoyées sont invalides. Vérifiez le formulaire et réessayez.'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) return 'Connexion impossible au serveur. Vérifiez Internet puis réessayez.'
  return raw || 'Une erreur serveur est survenue. Réessayez plus tard.'
}

export async function createRetailOrderRemote(input: RemoteRetailOrderInput): Promise<{ ref: string; receiptToken: string; total: number }> {
  const { data, error } = await requireSupabase().rpc('create_retail_order', {
    p_customer: input.customer,
    p_lines: input.lines,
    p_lang: input.lang,
  })
  if (error) throw new Error(message(error))
  if (!data || typeof data.ref !== 'string' || typeof data.receipt_token !== 'string') {
    throw new Error('Le serveur n’a pas retourné une référence de commande valide.')
  }
  return { ref: data.ref, receiptToken: data.receipt_token, total: Number(data.total ?? 0) }
}

export async function submitQuoteRemote(input: RemoteQuoteInput): Promise<{ ref: string }> {
  const { data, error } = await requireSupabase().rpc('submit_quote_request', {
    p_business: input.business,
    p_lines: input.lines,
    p_lang: input.lang,
  })
  if (error) throw new Error(message(error))
  if (!data || typeof data.ref !== 'string') throw new Error('Le serveur n’a pas retourné une référence de demande valide.')
  return { ref: data.ref }
}

export interface RemoteReceipt {
  ref: string
  status: string
  total: number
  lines: { name: string; qty: number; unitPrice: number }[]
}

/** Server-side receipt (needs the secret token returned at checkout). Returns null when it cannot be verified. */
export async function fetchOrderReceiptRemote(ref: string, token: string): Promise<RemoteReceipt | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const { data, error } = await requireSupabase().rpc('order_receipt', { p_ref: ref, p_token: token })
  if (error || !data || typeof data.ref !== 'string' || !Array.isArray(data.lines)) return null
  return {
    ref: data.ref,
    status: String(data.status ?? ''),
    total: Number(data.total ?? 0),
    lines: data.lines.map((l: { name?: unknown; qty?: unknown; unit_price?: unknown }) => ({ name: String(l.name ?? ''), qty: Number(l.qty ?? 0), unitPrice: Number(l.unit_price ?? 0) })),
  }
}
