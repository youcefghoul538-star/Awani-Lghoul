import { db, LOCAL_ONLY, transaction } from '../data/db'
import { WILAYAS, wilayaValue } from '../data/wilayas'
import { isPositiveInt } from '../domain'
import { makeRef, uid } from '../lib/ids'
import { isValidDzPhone, isValidEmail, normalizeDzPhone } from '../lib/phone'
import type { Lang, Quote, QuoteLine, Trader } from '../types'
import { MAX_LINE_QTY, ServiceError, nowIso } from './common'

/**
 * QUOTE SERVICE — wholesale quotation requests. A request NEVER carries or receives a price:
 * wholesale prices are private and only used by administrators when answering.
 */
export interface SubmitQuoteInput {
  business: { companyName: string; contactName: string; phone: string; email?: string; wilaya: string; businessType: string; address?: string; notes?: string }
  lines: { productId: string; qty: number }[]
  lang: Lang
}

export function submitQuote(input: SubmitQuoteInput): Quote {
  const b = input.business
  const f: Record<string, string> = {}
  if (!b.companyName?.trim()) f.companyName = 'required'
  if (!b.contactName?.trim()) f.contactName = 'required'
  if (!b.phone?.trim()) f.phone = 'required'
  else if (!isValidDzPhone(b.phone)) f.phone = 'phone'
  if (b.email?.trim() && !isValidEmail(b.email)) f.email = 'email'
  if (!b.wilaya || !WILAYAS.map(wilayaValue).includes(b.wilaya)) f.wilaya = 'required'
  if (!b.businessType?.trim()) f.businessType = 'required'
  if (Object.keys(f).length) throw new ServiceError('VALIDATION', 'Informations invalides.', { fields: f })
  if (!Array.isArray(input.lines) || !input.lines.length) throw new ServiceError('VALIDATION', 'Aucun produit sélectionné.')

  return transaction(() => {
    const merged = new Map<string, number>()
    for (const l of input.lines) {
      if (!isPositiveInt(l.qty) || l.qty > MAX_LINE_QTY) throw new ServiceError('VALIDATION', 'Quantité invalide.')
      merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.qty)
    }
    const lines: QuoteLine[] = [...merged].map(([productId, qty]) => {
      const p = db.products.get(productId)
      if (!p || !p.active) throw new ServiceError('NOT_FOUND', `Produit indisponible : ${productId}`)
      return { productId, sku: p.sku, name: p.name.fr, qty }
    })
    const ref = makeRef('DEV', db.quotes.all().map((q) => q.ref))
    const phone = normalizeDzPhone(b.phone)
    const quote: Quote = {
      id: ref,
      ref,
      createdAt: nowIso(),
      status: 'new',
      business: { ...b, companyName: b.companyName.trim(), contactName: b.contactName.trim(), phone: b.phone.trim(), email: b.email?.trim() || undefined, businessType: b.businessType.trim(), address: b.address?.trim() || undefined, notes: b.notes?.trim() || undefined },
      lines,
      lang: input.lang,
      internalNotes: [],
      localOnly: LOCAL_ONLY,
    }
    db.quotes.upsert(quote)
    if (!db.traders.all().some((t) => normalizeDzPhone(t.phone) === phone)) {
      const t: Trader = {
        id: uid('trd'),
        businessName: quote.business.companyName,
        contactName: quote.business.contactName,
        phone: quote.business.phone,
        email: quote.business.email,
        wilaya: b.wilaya,
        status: 'prospect',
        leadSource: 'website_quote',
        notes: '',
        contacts: [],
        createdAt: quote.createdAt,
      }
      db.traders.upsert(t)
    }
    return quote
  })
}
