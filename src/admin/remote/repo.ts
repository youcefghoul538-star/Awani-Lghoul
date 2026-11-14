import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS } from '../../data/defaultSettings'
import { normalizeDzPhone, isValidDzPhone } from '../../lib/phone'
import type {
  AllocationMethod,
  ContactKind,
  CostType,
  ExpenseCategory,
  LeadSource,
  LocalText,
  Note,
  OrderStatus,
  Quote,
  QuoteStatus,
  Settings,
  TraderStatus,
  WholesalePrice,
} from '../../types'

/**
 * Admin data access against Supabase (authenticated session + RLS). Nothing here touches localStorage.
 * Writes that affect stock/status go through the SQL functions that enforce the business rules
 * (admin_adjust_stock, admin_change_order_status); clients can never write products.stock_on_hand.
 */
export const IMAGE_BUCKET = 'product-images'

type Row = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}
function text(v: unknown): LocalText {
  if (v && typeof v === 'object') {
    const o = v as Row
    const t: LocalText = { fr: str(o.fr) }
    if (typeof o.ar === 'string' && o.ar) t.ar = o.ar
    if (typeof o.en === 'string' && o.en) t.en = o.en
    return t
  }
  return { fr: typeof v === 'string' ? v : '' }
}
const cleanText = (t: LocalText): LocalText => ({ fr: t.fr.trim(), ...(t.ar?.trim() ? { ar: t.ar.trim() } : {}), ...(t.en?.trim() ? { en: t.en.trim() } : {}) })

/** Turns PostgREST / Postgres / function errors into messages an admin can act on. */
export function explainError(e: unknown): string {
  const o = (e ?? {}) as { message?: string; details?: string; hint?: string; code?: string; statusCode?: string | number }
  const raw = [o.message, o.details, o.hint].filter(Boolean).join(' — ')
  if (/INSUFFICIENT_STOCK/.test(raw)) return 'Stock insuffisant pour confirmer cette commande. Ajustez le stock d’abord.'
  if (/INVALID_TRANSITION/.test(raw)) return 'Ce changement de statut n’est pas autorisé (la commande a peut-être déjà été modifiée). Actualisez la liste.'
  if (/FORBIDDEN/.test(raw) || o.code === '42501' || /row-level security|permission denied/i.test(raw)) return 'Accès refusé : votre rôle ne permet pas cette action.'
  if (o.code === '23505' || /duplicate key/i.test(raw)) return 'Cette valeur existe déjà (SKU ou identifiant en double).'
  if (o.code === '23503' || /foreign key/i.test(raw)) return 'Référence invalide (catégorie ou produit introuvable, ou élément encore utilisé).'
  if (o.code === '23514' || /violates check constraint/i.test(raw)) return 'Valeur refusée par la base (prix > 0, prix promo < prix normal).'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) return 'Connexion impossible au serveur. Vérifiez Internet puis réessayez.'
  if (/VALIDATION/.test(raw)) return `Données invalides : ${raw.replace(/^.*VALIDATION:?\s*/, '')}`
  if (/Bucket not found/i.test(raw)) return 'Bucket « product-images » introuvable : appliquez la migration 0008.'
  return raw || 'Erreur serveur. Réessayez.'
}

async function ok<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(explainError(error))
  return (data ?? ([] as unknown as T)) as T
}
async function done(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p
  if (error) throw new Error(explainError(error))
}

/* ───────────── categories ───────────── */
export interface AdminCategory {
  id: string
  name: LocalText
  order: number
  active: boolean
}

export async function fetchAdminCategories(c: SupabaseClient): Promise<AdminCategory[]> {
  const rows = await ok<Row[]>(c.from('categories').select('id,name,sort_order,active').order('sort_order'))
  return rows.map((r) => ({ id: str(r.id), name: text(r.name), order: num(r.sort_order), active: r.active === true }))
}

export async function saveCategory(c: SupabaseClient, cat: AdminCategory): Promise<void> {
  const name = cleanText(cat.name)
  if (!cat.id || !name.fr) throw new Error('Nom (français) obligatoire.')
  await done(c.from('categories').upsert({ id: cat.id, name, sort_order: Math.trunc(cat.order), active: cat.active }, { onConflict: 'id' }))
}

/* ───────────── products ───────────── */
export interface AdminProduct {
  id: string
  sku: string
  name: LocalText
  categoryId: string
  description?: LocalText
  price: number
  salePrice?: number
  featured: boolean
  active: boolean
  stock: number
  image?: string
  createdAt: string
}

export async function fetchAdminProducts(c: SupabaseClient): Promise<AdminProduct[]> {
  const [prods, imgs] = await Promise.all([
    ok<Row[]>(c.from('products').select('id,sku,name,category_id,description,price,sale_price,featured,active,stock_on_hand,created_at').order('created_at', { ascending: false })),
    ok<Row[]>(c.from('product_images').select('product_id,url,position').order('position')),
  ])
  const first = new Map<string, string>()
  for (const i of imgs) if (!first.has(str(i.product_id)) && str(i.url)) first.set(str(i.product_id), str(i.url))
  return prods.map((p) => ({
    id: str(p.id),
    sku: str(p.sku),
    name: text(p.name),
    categoryId: str(p.category_id),
    description: p.description ? text(p.description) : undefined,
    price: num(p.price),
    salePrice: p.sale_price == null ? undefined : num(p.sale_price),
    featured: p.featured === true,
    active: p.active === true,
    stock: Math.max(0, Math.trunc(num(p.stock_on_hand))),
    image: first.get(str(p.id)),
    createdAt: str(p.created_at),
  }))
}

export function validateProduct(p: Pick<AdminProduct, 'sku' | 'name' | 'categoryId' | 'price' | 'salePrice'>): string | null {
  if (!p.name.fr.trim()) return 'Nom (français) obligatoire.'
  if (!p.sku.trim()) return 'SKU obligatoire.'
  if (!p.categoryId) return 'Choisissez une catégorie (créez-en une d’abord si la liste est vide).'
  if (!(p.price > 0)) return 'Le prix doit être supérieur à 0.'
  if (p.salePrice != null && !(p.salePrice > 0 && p.salePrice < p.price)) return 'Le prix promo doit être supérieur à 0 et inférieur au prix normal.'
  return null
}

/** Inserts or updates the product row only (no image, no stock). stock_on_hand is never sent. */
export async function saveProductRow(c: SupabaseClient, p: AdminProduct, isNew: boolean): Promise<void> {
  const invalid = validateProduct(p)
  if (invalid) throw new Error(invalid)
  const fields = {
    sku: p.sku.trim(),
    name: cleanText(p.name),
    category_id: p.categoryId,
    description: p.description && p.description.fr.trim() ? cleanText(p.description) : null,
    price: p.price,
    sale_price: p.salePrice ?? null,
    featured: p.featured,
    active: p.active,
    demo: false,
  }
  if (isNew) await done(c.from('products').insert({ id: p.id, ...fields }))
  else await done(c.from('products').update(fields).eq('id', p.id))
}

/** Uploads a JPEG blob and makes it the product's single (first) image. */
export async function setProductImage(c: SupabaseClient, productId: string, blob: Blob): Promise<string> {
  const path = `${productId}/${Date.now()}.jpg`
  const up = await c.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw new Error(explainError(up.error))
  const url = c.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
  await done(c.from('product_images').delete().eq('product_id', productId))
  await done(c.from('product_images').insert({ product_id: productId, url, position: 0 }))
  return url
}

/** Stock changes only through the SQL function (ledger movement). qty is a signed delta. */
export async function adjustStock(c: SupabaseClient, productId: string, qty: number, note: string): Promise<void> {
  if (!Number.isInteger(qty) || qty === 0) throw new Error('La quantité doit être un entier non nul.')
  if (!note.trim()) throw new Error('Une note est obligatoire pour un ajustement de stock.')
  await done(c.rpc('admin_adjust_stock', { p_product: productId, p_type: 'manual_adjustment', p_qty: qty, p_note: note.trim() }))
}

/* ───────────── orders ───────────── */
export interface AdminOrderLine {
  name: string
  qty: number
  unitPrice: number
}
export interface AdminOrder {
  id: string
  ref: string
  status: OrderStatus
  customerName: string
  phone: string
  wilaya: string
  address: string
  notes: string
  total: number
  createdAt: string
  deliveredAt?: string
  lines: AdminOrderLine[]
}

const STATUSES: OrderStatus[] = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled']

export async function fetchAdminOrders(c: SupabaseClient): Promise<AdminOrder[]> {
  const rows = await ok<Row[]>(
    c
      .from('orders')
      .select('id,ref,status,customer_name,customer_phone,wilaya,address,notes,total,created_at,delivered_at,order_items(line_index,name,qty,unit_price)')
      .order('created_at', { ascending: false })
      .limit(300),
  )
  return rows.map((r) => {
    const items = Array.isArray(r.order_items) ? (r.order_items as Row[]) : []
    const status = STATUSES.includes(r.status as OrderStatus) ? (r.status as OrderStatus) : 'new'
    return {
      id: str(r.id),
      ref: str(r.ref),
      status,
      customerName: str(r.customer_name),
      phone: str(r.customer_phone),
      wilaya: str(r.wilaya),
      address: str(r.address),
      notes: str(r.notes),
      total: num(r.total),
      createdAt: str(r.created_at),
      deliveredAt: str(r.delivered_at) || undefined,
      lines: [...items].sort((a, b) => num(a.line_index) - num(b.line_index)).map((i) => ({ name: str(i.name), qty: num(i.qty), unitPrice: num(i.unit_price) })),
    }
  })
}

export async function countNewOrders(c: SupabaseClient): Promise<number> {
  const { count, error } = await c.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new')
  if (error) throw new Error(explainError(error))
  return count ?? 0
}

/** Allowed next statuses — mirrors the transition table in admin_change_order_status (server stays the authority). */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export async function changeOrderStatus(c: SupabaseClient, orderId: string, to: OrderStatus, restock = false): Promise<void> {
  await done(c.rpc('admin_change_order_status', { p_order: orderId, p_to: to, p_restock: restock }))
}


/* ───────────── quotes (wholesale requests) ───────────── */
const QUOTE_STATUSES: QuoteStatus[] = ['new', 'contacted', 'quoted', 'won', 'lost']

export async function fetchAdminQuotes(c: SupabaseClient): Promise<Quote[]> {
  const rows = await ok<Row[]>(
    c
      .from('quotes')
      .select('id,ref,status,company_name,contact_name,phone,email,wilaya,business_type,address,notes,lang,created_at,quote_items(product_id,qty,products(sku,name))')
      .order('created_at', { ascending: false })
      .limit(300),
  )
  return rows.map((r) => {
    const items = Array.isArray(r.quote_items) ? (r.quote_items as Row[]) : []
    const status = QUOTE_STATUSES.includes(r.status as QuoteStatus) ? (r.status as QuoteStatus) : 'new'
    const lang = r.lang === 'ar' || r.lang === 'en' ? r.lang : 'fr'
    return {
      id: str(r.id),
      ref: str(r.ref),
      createdAt: str(r.created_at),
      status,
      business: {
        companyName: str(r.company_name),
        contactName: str(r.contact_name),
        phone: str(r.phone),
        email: str(r.email) || undefined,
        wilaya: str(r.wilaya),
        businessType: str(r.business_type),
        address: str(r.address) || undefined,
        notes: str(r.notes) || undefined,
      },
      lines: items.map((i) => {
        const pr = (Array.isArray(i.products) ? i.products[0] : i.products) as Row | undefined
        return { productId: str(i.product_id), sku: str(pr?.sku), name: text(pr?.name).fr || str(i.product_id), qty: num(i.qty) }
      }),
      lang,
      internalNotes: [],
      localOnly: false,
    }
  })
}

export async function countNewQuotes(c: SupabaseClient): Promise<number> {
  const { count, error } = await c.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'new')
  if (error) throw new Error(explainError(error))
  return count ?? 0
}

export async function setQuoteStatus(c: SupabaseClient, quoteId: string, status: QuoteStatus): Promise<void> {
  await done(c.rpc('admin_set_quote_status', { p_quote: quoteId, p_status: status }))
}

export async function fetchNotes(c: SupabaseClient, entity: 'quote' | 'order' | 'trader', entityId: string): Promise<Note[]> {
  const rows = await ok<Row[]>(c.from('internal_notes').select('id,body,created_at').eq('entity', entity).eq('entity_id', entityId).order('created_at'))
  return rows.map((r) => ({ id: str(r.id), at: str(r.created_at), text: str(r.body) }))
}

export async function addNote(c: SupabaseClient, entity: 'quote' | 'order' | 'trader', entityId: string, body: string): Promise<void> {
  if (!body.trim()) throw new Error('La note est vide.')
  await done(c.rpc('admin_add_note', { p_entity: entity, p_entity_id: entityId, p_body: body.trim() }))
}

/* ───────────── wholesale prices (PRIVATE: owner/admin only, enforced by RLS) ───────────── */
export async function fetchWholesalePrices(c: SupabaseClient): Promise<Map<string, WholesalePrice>> {
  const rows = await ok<Row[]>(c.from('wholesale_prices').select('product_id,price,min_qty'))
  return new Map(rows.map((r) => [str(r.product_id), { id: str(r.product_id), price: num(r.price), minQty: r.min_qty == null ? undefined : num(r.min_qty) }]))
}

/** price undefined/0 removes the wholesale price. */
export async function saveWholesalePrice(c: SupabaseClient, productId: string, price: number | undefined, minQty: number | undefined): Promise<void> {
  if (!price || price <= 0) return done(c.from('wholesale_prices').delete().eq('product_id', productId))
  if (minQty != null && (!Number.isInteger(minQty) || minQty < 1)) throw new Error('Quantité minimale invalide (entier ≥ 1).')
  await done(c.from('wholesale_prices').upsert({ product_id: productId, price, min_qty: minQty ?? null }, { onConflict: 'product_id' }))
}


/* ───────────── settings (owner/admin write, public read) ───────────── */
export function validateSettings(s: Settings): string | null {
  if (!s.businessName.trim()) return 'Nom de l’entreprise obligatoire.'
  if (!Number.isFinite(s.lowStockThreshold) || s.lowStockThreshold < 0) return 'Seuil de stock faible invalide.'
  if (s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim())) return 'E-mail invalide.'
  return null
}

export async function fetchSettings(c: SupabaseClient): Promise<Settings> {
  const rows = await ok<Row[]>(c.from('settings').select('data').eq('id', 'settings'))
  const data = (rows[0]?.data ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    id: 'settings',
    promoText: { ...DEFAULT_SETTINGS.promoText, ...(data.promoText ?? {}) },
    lowStockThreshold: typeof data.lowStockThreshold === 'number' ? data.lowStockThreshold : DEFAULT_SETTINGS.lowStockThreshold,
  }
}

export async function saveSettings(c: SupabaseClient, s: Settings): Promise<void> {
  const invalid = validateSettings(s)
  if (invalid) throw new Error(invalid)
  const data: Settings = {
    id: 'settings',
    businessName: s.businessName.trim(),
    tagline: s.tagline.trim(),
    phone: s.phone.trim(),
    whatsapp: s.whatsapp.trim(),
    email: s.email.trim(),
    address: s.address.trim(),
    hours: s.hours.trim(),
    promoText: cleanText(s.promoText),
    lowStockThreshold: Math.trunc(s.lowStockThreshold),
  }
  await done(c.from('settings').upsert({ id: 'settings', data }, { onConflict: 'id' }))
}

/* ───────────── bundles (packs). Never deleted: hide with « Visible » off ───────────── */
export interface AdminBundle {
  id: string
  title: LocalText
  items: { productId: string; qty: number }[]
  price: number
  promoPrice?: number
  active: boolean
}

export async function fetchAdminBundles(c: SupabaseClient): Promise<AdminBundle[]> {
  const rows = await ok<Row[]>(c.from('bundles').select('id,title,price,promo_price,active,bundle_items(product_id,qty)').order('id'))
  return rows.map((r) => ({
    id: str(r.id),
    title: text(r.title),
    price: num(r.price),
    promoPrice: r.promo_price == null ? undefined : num(r.promo_price),
    active: r.active === true,
    items: (Array.isArray(r.bundle_items) ? (r.bundle_items as Row[]) : []).map((i) => ({ productId: str(i.product_id), qty: num(i.qty) })),
  }))
}

export function validateBundleBasics(b: Pick<AdminBundle, 'title' | 'price' | 'promoPrice' | 'items'>): string | null {
  if (!b.title.fr.trim()) return 'Titre (français) obligatoire.'
  if (!(b.price > 0)) return 'Le prix du pack doit être supérieur à 0.'
  if (b.promoPrice != null && !(b.promoPrice > 0 && b.promoPrice < b.price)) return 'Le prix promo doit être supérieur à 0 et inférieur au prix normal.'
  if (b.items.length === 0) return 'Ajoutez au moins un produit.'
  if (b.items.some((i) => !i.productId || !Number.isInteger(i.qty) || i.qty < 1)) return 'Chaque produit doit avoir une quantité entière ≥ 1.'
  return null
}

/** Upserts the pack, then its items (items are upserted first and the removed ones deleted after, so the pack is never left empty). */
export async function saveBundle(c: SupabaseClient, b: AdminBundle, isNew: boolean): Promise<void> {
  const invalid = validateBundleBasics(b)
  if (invalid) throw new Error(invalid)
  const fields = { title: cleanText(b.title), price: b.price, promo_price: b.promoPrice ?? null, active: b.active }
  if (isNew) await done(c.from('bundles').insert({ id: b.id, ...fields }))
  else await done(c.from('bundles').update(fields).eq('id', b.id))
  const ids = b.items.map((i) => i.productId)
  await done(c.from('bundle_items').upsert(b.items.map((i) => ({ bundle_id: b.id, product_id: i.productId, qty: i.qty })), { onConflict: 'bundle_id,product_id' }))
  await done(c.from('bundle_items').delete().eq('bundle_id', b.id).not('product_id', 'in', `(${ids.map((i) => `"${i.replace(/"/g, '')}"`).join(',')})`))
}

/* ───────────── customers (derived from orders, grouped by phone) ───────────── */
export interface AdminCustomer {
  key: string
  name: string
  phone: string
  wilaya: string
  orderCount: number
  deliveredSales: number
  openValue: number
  lastOrderAt: string
}

export const phoneKey = (p: string): string => normalizeDzPhone(p).replace(/\D/g, '').slice(-9)

export function groupCustomers(orders: AdminOrder[]): AdminCustomer[] {
  const m = new Map<string, AdminCustomer>()
  for (const o of [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = phoneKey(o.phone) || o.phone
    const cur = m.get(k) ?? { key: k, name: o.customerName, phone: o.phone, wilaya: o.wilaya, orderCount: 0, deliveredSales: 0, openValue: 0, lastOrderAt: o.createdAt }
    cur.name = o.customerName
    cur.wilaya = o.wilaya
    cur.lastOrderAt = o.createdAt
    if (o.status !== 'cancelled') cur.orderCount += 1
    if (o.status === 'delivered') cur.deliveredSales += o.total
    if (o.status === 'new' || o.status === 'confirmed' || o.status === 'shipped') cur.openValue += o.total
    m.set(k, cur)
  }
  return [...m.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt))
}

/* ───────────── traders (wholesale CRM) ───────────── */
export interface AdminTrader {
  id: string
  businessName: string
  contactName: string
  phone: string
  email?: string
  wilaya: string
  status: TraderStatus
  leadSource: LeadSource
  notes: string
  followUpDate?: string
  createdAt: string
}
export interface AdminContact {
  id: string
  at: string
  kind: ContactKind
  summary: string
}
const TRADER_STATUSES: TraderStatus[] = ['prospect', 'active', 'inactive']
const LEAD_SOURCES: LeadSource[] = ['website_quote', 'walk_in', 'phone', 'referral', 'social', 'other']
const CONTACT_KINDS: ContactKind[] = ['call', 'visit', 'whatsapp', 'email', 'other']

export async function fetchTraders(c: SupabaseClient): Promise<AdminTrader[]> {
  const rows = await ok<Row[]>(c.from('traders').select('id,business_name,contact_name,phone,email,wilaya,status,lead_source,notes,follow_up_date,created_at').order('created_at', { ascending: false }))
  return rows.map((r) => ({
    id: str(r.id),
    businessName: str(r.business_name),
    contactName: str(r.contact_name),
    phone: str(r.phone),
    email: str(r.email) || undefined,
    wilaya: str(r.wilaya),
    status: TRADER_STATUSES.includes(r.status as TraderStatus) ? (r.status as TraderStatus) : 'prospect',
    leadSource: LEAD_SOURCES.includes(r.lead_source as LeadSource) ? (r.lead_source as LeadSource) : 'other',
    notes: str(r.notes),
    followUpDate: str(r.follow_up_date) || undefined,
    createdAt: str(r.created_at),
  }))
}

export function validateTrader(t: AdminTrader, others: AdminTrader[]): Record<string, string> {
  const e: Record<string, string> = {}
  if (!t.businessName.trim()) e.businessName = 'Obligatoire.'
  if (!t.contactName.trim()) e.contactName = 'Obligatoire.'
  if (!isValidDzPhone(t.phone)) e.phone = 'Numéro algérien invalide.'
  else if (others.some((o) => o.id !== t.id && phoneKey(o.phone) === phoneKey(t.phone))) e.phone = 'Ce numéro existe déjà.'
  if (!t.wilaya.trim()) e.wilaya = 'Obligatoire.'
  return e
}

export async function saveTrader(c: SupabaseClient, t: AdminTrader, isNew: boolean): Promise<void> {
  const fields = {
    business_name: t.businessName.trim(),
    contact_name: t.contactName.trim(),
    phone: normalizeDzPhone(t.phone),
    email: t.email?.trim() || null,
    wilaya: t.wilaya.trim(),
    status: t.status,
    lead_source: t.leadSource,
    notes: t.notes.trim(),
    follow_up_date: t.followUpDate || null,
  }
  if (isNew) await done(c.from('traders').insert(fields)) // id generated by the database (uuid)
  else await done(c.from('traders').update(fields).eq('id', t.id))
}

export async function fetchTraderContacts(c: SupabaseClient, traderId: string): Promise<AdminContact[]> {
  const rows = await ok<Row[]>(c.from('trader_contacts').select('id,at,kind,summary').eq('trader_id', traderId).order('at', { ascending: false }))
  return rows.map((r) => ({ id: str(r.id), at: str(r.at), kind: CONTACT_KINDS.includes(r.kind as ContactKind) ? (r.kind as ContactKind) : 'other', summary: str(r.summary) }))
}

export async function addTraderContact(c: SupabaseClient, traderId: string, kind: ContactKind, summary: string): Promise<void> {
  if (!summary.trim()) throw new Error('Le résumé est vide.')
  await done(c.from('trader_contacts').insert({ trader_id: traderId, kind, summary: summary.trim() }))
}

/* ───────────── suppliers, purchases, expenses (owner/admin only) ───────────── */
export interface AdminSupplier {
  id: string
  name: string
  phone?: string
}
export async function fetchSuppliers(c: SupabaseClient): Promise<AdminSupplier[]> {
  const rows = await ok<Row[]>(c.from('suppliers').select('id,name,phone').order('name'))
  return rows.map((r) => ({ id: str(r.id), name: str(r.name), phone: str(r.phone) || undefined }))
}
export async function addSupplier(c: SupabaseClient, name: string, phone?: string): Promise<void> {
  if (!name.trim()) throw new Error('Nom du fournisseur obligatoire.')
  await done(c.from('suppliers').insert({ name: name.trim(), phone: phone?.trim() || null }))
}

export interface AdminPurchase {
  id: string
  ref: string
  supplierId: string
  date: string
  status: 'draft' | 'received' | 'cancelled'
  allocation: AllocationMethod
  notes?: string
  createdAt: string
  items: { productId: string; qty: number; unitCost: number }[]
  additionalCosts: { type: CostType; amount: number }[]
}

export async function fetchPurchases(c: SupabaseClient): Promise<AdminPurchase[]> {
  const rows = await ok<Row[]>(
    c
      .from('purchases')
      .select('id,ref,supplier_id,purchase_date,status,allocation,notes,created_at,purchase_items(line_index,product_id,qty,unit_cost),purchase_costs(type,amount)')
      .order('created_at', { ascending: false })
      .limit(300),
  )
  return rows.map((r) => ({
    id: str(r.id),
    ref: str(r.ref),
    supplierId: str(r.supplier_id),
    date: str(r.purchase_date),
    status: r.status === 'received' || r.status === 'cancelled' ? r.status : 'draft',
    allocation: r.allocation === 'by_quantity' ? 'by_quantity' : 'by_value',
    notes: str(r.notes) || undefined,
    createdAt: str(r.created_at),
    items: [...(Array.isArray(r.purchase_items) ? (r.purchase_items as Row[]) : [])]
      .sort((a, b) => num(a.line_index) - num(b.line_index))
      .map((i) => ({ productId: str(i.product_id), qty: num(i.qty), unitCost: num(i.unit_cost) })),
    additionalCosts: (Array.isArray(r.purchase_costs) ? (r.purchase_costs as Row[]) : []).map((x) => ({ type: str(x.type) as CostType, amount: num(x.amount) })),
  }))
}

export interface PurchaseDraftInput {
  id?: string
  supplierId: string
  date: string
  allocation: AllocationMethod
  items: { productId: string; qty: number; unitCost: number }[]
  additionalCosts: { type: CostType; amount: number }[]
}

export function validatePurchase(d: PurchaseDraftInput): string | null {
  if (!d.supplierId) return 'Choisissez un fournisseur.'
  if (!d.date) return 'Date obligatoire.'
  if (d.items.length === 0) return 'Ajoutez au moins une ligne.'
  if (d.items.some((i) => !i.productId || !Number.isInteger(i.qty) || i.qty < 1 || !(i.unitCost >= 0))) return 'Chaque ligne doit avoir un produit, une quantité entière ≥ 1 et un coût ≥ 0.'
  if (d.additionalCosts.some((x) => !(x.amount >= 0))) return 'Montant de frais invalide.'
  return null
}

export async function savePurchaseDraft(c: SupabaseClient, d: PurchaseDraftInput): Promise<void> {
  const invalid = validatePurchase(d)
  if (invalid) throw new Error(invalid)
  await done(
    c.rpc('admin_save_purchase', {
      p_id: d.id ?? null,
      p_supplier: d.supplierId,
      p_date: d.date,
      p_allocation: d.allocation,
      p_items: d.items.map((i) => ({ productId: i.productId, qty: i.qty, unitCost: i.unitCost })),
      p_costs: d.additionalCosts.map((x) => ({ type: x.type, amount: x.amount })),
      p_notes: null,
    }),
  )
}
export async function receivePurchase(c: SupabaseClient, id: string): Promise<void> {
  await done(c.rpc('admin_receive_purchase', { p_purchase: id }))
}
export async function cancelPurchase(c: SupabaseClient, id: string): Promise<void> {
  await done(c.rpc('admin_cancel_purchase', { p_id: id }))
}

export interface AdminExpense {
  id: string
  date: string
  category: ExpenseCategory
  amount: number
  description: string
}
export async function fetchExpenses(c: SupabaseClient): Promise<AdminExpense[]> {
  const rows = await ok<Row[]>(c.from('expenses').select('id,expense_date,category,amount,description').order('expense_date', { ascending: false }).limit(500))
  return rows.map((r) => ({ id: str(r.id), date: str(r.expense_date), category: str(r.category) as ExpenseCategory, amount: num(r.amount), description: str(r.description) }))
}
export async function addExpense(c: SupabaseClient, e: Omit<AdminExpense, 'id'>): Promise<void> {
  if (!(e.amount > 0)) throw new Error('Le montant doit être supérieur à 0.')
  if (!e.description.trim()) throw new Error('Description obligatoire.')
  await done(c.from('expenses').insert({ expense_date: e.date, category: e.category, amount: e.amount, description: e.description.trim() }))
}
export async function deleteExpense(c: SupabaseClient, id: string): Promise<void> {
  await done(c.rpc('admin_delete_expense', { p_id: id }))
}

/* ───────────── dashboard: cost of goods of delivered orders, read from the immutable stock ledger ───────────── */
export interface SaleMovement {
  orderId: string
  type: string
  costCentimes: number | null
}
export async function fetchSaleMovements(c: SupabaseClient): Promise<SaleMovement[]> {
  const rows = await ok<Row[]>(
    c.from('inventory_movements').select('ref_id,type,total_cost_centimes').eq('ref_type', 'order').order('created_at', { ascending: false }).limit(3000),
  )
  return rows.map((r) => ({ orderId: str(r.ref_id), type: str(r.type), costCentimes: r.total_cost_centimes == null ? null : num(r.total_cost_centimes) }))
}

/** Gross profit of delivered orders = their sales − the cost the ledger removed from stock. null as soon as one cost is unknown. */
export function grossProfitOf(delivered: AdminOrder[], movements: SaleMovement[]): number | null {
  if (delivered.length === 0) return null
  const byOrder = new Map<string, SaleMovement[]>()
  for (const m of movements) byOrder.set(m.orderId, [...(byOrder.get(m.orderId) ?? []), m])
  let cost = 0
  let sales = 0
  for (const o of delivered) {
    const ms = (byOrder.get(o.id) ?? []).filter((m) => m.type === 'sale_committed' || m.type === 'sale_cancelled' || m.type === 'customer_return')
    if (!ms.some((m) => m.type === 'sale_committed')) return null
    for (const m of ms) {
      if (m.costCentimes == null) return null
      cost += m.type === 'sale_committed' ? m.costCentimes : -m.costCentimes
    }
    sales += o.total
  }
  return Math.round((sales - cost / 100) * 100) / 100
}
