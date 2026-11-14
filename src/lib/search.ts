import type { Category, Lang, Product } from '../types'
import { effectivePrice } from './format'

/** Lowercase, strip latin accents and Arabic diacritics/tatweel, unify alef/ya/ta-marbuta variants. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
}

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'name'

export interface Filters {
  q: string
  categoryId: string
  inStockOnly: boolean
  sort: SortKey
}

/** Searchable haystack: names in every language + SKU + category names. Built once per product. */
function haystack(p: Product, cats: Map<string, Category>): string {
  const c = cats.get(p.categoryId)
  return normalizeText(
    [p.name.fr, p.name.ar, p.name.en, p.sku, c?.name.fr, c?.name.ar, c?.name.en, p.description?.fr].filter(Boolean).join(' '),
  )
}

export function filterProducts(products: Product[], categories: Category[], f: Filters, lang: Lang): Product[] {
  const cats = new Map(categories.map((c) => [c.id, c]))
  const tokens = normalizeText(f.q).split(/\s+/).filter(Boolean)
  let list = products.filter((p) => p.active)
  if (f.categoryId) list = list.filter((p) => p.categoryId === f.categoryId)
  if (f.inStockOnly) list = list.filter((p) => p.stock > 0)
  if (tokens.length) {
    list = list.filter((p) => {
      const h = haystack(p, cats)
      return tokens.every((t) => h.includes(t))
    })
  }
  const byName = (a: Product, b: Product) =>
    (a.name[lang] || a.name.fr).localeCompare(b.name[lang] || b.name.fr, lang)
  switch (f.sort) {
    case 'price-asc':
      return [...list].sort((a, b) => effectivePrice(a) - effectivePrice(b))
    case 'price-desc':
      return [...list].sort((a, b) => effectivePrice(b) - effectivePrice(a))
    case 'newest':
      return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'name':
      return [...list].sort(byName)
    default:
      // featured first, in-stock before out-of-stock, then catalogue order
      return [...list].sort(
        (a, b) => Number(!!b.featured) - Number(!!a.featured) || Number(b.stock > 0) - Number(a.stock > 0),
      )
  }
}

export function suggest(products: Product[], categories: Category[], q: string, lang: Lang) {
  const nq = normalizeText(q)
  if (nq.length < 2) return { products: [] as Product[], categories: [] as Category[] }
  const prods = filterProducts(products, categories, { q, categoryId: '', inStockOnly: false, sort: 'featured' }, lang).slice(0, 6)
  const cats = categories.filter((c) => normalizeText(Object.values(c.name).join(' ')).includes(nq)).slice(0, 3)
  return { products: prods, categories: cats }
}
