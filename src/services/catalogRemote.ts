import type { SupabaseClient } from '@supabase/supabase-js'
import { GLYPH_KEYS } from '../lib/placeholder'
import type { Bundle, Category, LocalText, Product, Settings, SpecRow } from '../types'
import { DEFAULT_SETTINGS } from '../data/defaultSettings'

/**
 * Public, READ-ONLY catalogue loaded from Supabase with the anon key. RLS only exposes active rows.
 * Columns are listed explicitly (no select('*')). Nothing here is ever written back or merged with local data.
 * Wholesale prices, costs, orders and movements are never requested.
 */
export interface PublicCatalog {
  categories: Category[]
  products: Product[]
  bundles: Bundle[]
  settings: Settings
}

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function localText(v: unknown): LocalText {
  if (v && typeof v === 'object') {
    const o = v as Row
    const t: LocalText = { fr: str(o.fr) }
    if (typeof o.ar === 'string' && o.ar) t.ar = o.ar
    if (typeof o.en === 'string' && o.en) t.en = o.en
    return t
  }
  return { fr: typeof v === 'string' ? v : '' }
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`${what}: ${error.message}`)
  return data ?? ([] as unknown as T)
}

export async function fetchPublicCatalog(client: SupabaseClient): Promise<PublicCatalog> {
  const [cats, prods, imgs, specs, buns, items, settingsRows] = await Promise.all([
    must<Row[]>(client.from('categories').select('id,name,sort_order'), 'categories'),
    must<Row[]>(client.from('products').select('id,sku,name,category_id,description,price,sale_price,featured,active,demo,stock_on_hand,created_at'), 'products'),
    must<Row[]>(client.from('product_images').select('product_id,url,position').order('position'), 'product_images'),
    must<Row[]>(client.from('product_specs').select('product_id,label,value,position').order('position'), 'product_specs'),
    must<Row[]>(client.from('bundles').select('id,title,description,price,promo_price,active'), 'bundles'),
    must<Row[]>(client.from('bundle_items').select('bundle_id,product_id,qty'), 'bundle_items'),
    must<Row[]>(client.from('settings').select('data'), 'settings'),
  ])

  const categories: Category[] = cats
    .map((c) => ({ id: str(c.id), name: localText(c.name), icon: GLYPH_KEYS.includes(str(c.id)) ? str(c.id) : 'default', order: num(c.sort_order) }))
    .sort((a, b) => a.order - b.order)

  const firstImage = new Map<string, string>()
  for (const i of imgs) if (!firstImage.has(str(i.product_id)) && str(i.url)) firstImage.set(str(i.product_id), str(i.url))
  const specsBy = new Map<string, SpecRow[]>()
  for (const s of specs) {
    const k = str(s.product_id)
    const arr = specsBy.get(k) ?? []
    arr.push({ label: localText(s.label), value: localText(s.value) })
    specsBy.set(k, arr)
  }

  const products: Product[] = prods
    .filter((p) => p.active === true)
    .map((p) => ({
      id: str(p.id),
      sku: str(p.sku),
      name: localText(p.name),
      categoryId: str(p.category_id),
      description: p.description ? localText(p.description) : undefined,
      specs: specsBy.get(str(p.id)),
      price: num(p.price),
      salePrice: p.sale_price == null ? undefined : num(p.sale_price),
      stock: Math.max(0, Math.trunc(num(p.stock_on_hand))),
      image: firstImage.get(str(p.id)),
      featured: p.featured === true,
      active: true,
      demo: p.demo === true,
      createdAt: str(p.created_at),
    }))
    .filter((p) => p.id && p.price > 0)

  const itemsBy = new Map<string, { productId: string; qty: number }[]>()
  for (const i of items) {
    const k = str(i.bundle_id)
    const arr = itemsBy.get(k) ?? []
    arr.push({ productId: str(i.product_id), qty: Math.max(1, Math.trunc(num(i.qty))) })
    itemsBy.set(k, arr)
  }
  const bundles: Bundle[] = buns
    .filter((b) => b.active === true)
    .map((b) => ({
      id: str(b.id),
      title: localText(b.title),
      description: b.description ? localText(b.description) : undefined,
      items: itemsBy.get(str(b.id)) ?? [],
      price: num(b.price),
      promoPrice: b.promo_price == null ? undefined : num(b.promo_price),
      active: true,
    }))
    .filter((b) => b.id && b.price > 0 && b.items.length > 0)

  const data = (settingsRows[0]?.data ?? {}) as Partial<Settings>
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...data,
    id: 'settings',
    promoText: { ...DEFAULT_SETTINGS.promoText, ...(data.promoText ?? {}) },
    lowStockThreshold: typeof data.lowStockThreshold === 'number' ? data.lowStockThreshold : DEFAULT_SETTINGS.lowStockThreshold,
  }
  return { categories, products, bundles, settings }
}
