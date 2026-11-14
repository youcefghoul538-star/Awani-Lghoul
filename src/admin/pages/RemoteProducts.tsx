import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Field } from '../../components/Form'
import { useToast } from '../../components/Toast'
import { uid } from '../../lib/ids'
import { resizeImageBlob } from '../../lib/image'
import { placeholderImage } from '../../lib/placeholder'
import { normalizeText } from '../../lib/search'
import { requireSupabase } from '../../lib/supabase'
import {
  adjustStock,
  fetchAdminCategories,
  fetchAdminProducts,
  saveProductRow,
  setProductImage,
  validateProduct,
  type AdminProduct,
} from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, NumInput, PageHead, Pill, useDebounced } from '../ui'

const blank = (): AdminProduct => ({
  id: uid('p'),
  sku: '',
  name: { fr: '', ar: '', en: '' },
  categoryId: '',
  price: 0,
  featured: false,
  active: true,
  stock: 0,
  createdAt: new Date().toISOString(),
})

const thumb = (p: AdminProduct) => p.image || placeholderImage('default', p.sku || p.id)

/** Products stored in Supabase: what you save here is what the storefront shows (when « Visible » is on). */
export default function RemoteProducts() {
  const toast = useToast()
  const products = useRemote(() => fetchAdminProducts(requireSupabase()))
  const cats = useRemote(() => fetchAdminCategories(requireSupabase()))
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState<{ product: AdminProduct; isNew: boolean } | null>(null)
  const [stockFor, setStockFor] = useState<AdminProduct | null>(null)
  const catList = cats.data ?? []
  const catName = (id: string) => catList.find((c) => c.id === id)?.name.fr ?? '—'

  const list = useMemo(() => {
    const tokens = normalizeText(dq).split(/\s+/).filter(Boolean)
    return (products.data ?? [])
      .filter((p) => !cat || p.categoryId === cat)
      .filter((p) => !tokens.length || tokens.every((t) => normalizeText(`${p.name.fr} ${p.name.ar ?? ''} ${p.name.en ?? ''} ${p.sku}`).includes(t)))
  }, [products.data, dq, cat])

  const saved = async (msg: string) => {
    toast.show(msg)
    setEditing(null)
    setStockFor(null)
    await products.reload()
  }

  return (
    <>
      <PageHead
        title="Produits"
        subtitle={`${products.data?.length ?? 0} produit(s) — enregistrés dans Supabase`}
        actions={
          <button type="button" className="btn btn--primary" disabled={catList.length === 0} onClick={() => setEditing({ product: blank(), isNew: true })}>
            + Nouveau produit
          </button>
        }
      />
      {cats.data && catList.length === 0 && <div className="alert alert--warn" role="status">Aucune catégorie : créez-en une dans « Catégories » avant d’ajouter un produit.</div>}
      {products.error && (
        <div className="alert alert--bad" role="alert">
          {products.error} <button type="button" className="btn btn--ghost btn--sm" onClick={() => void products.reload()}>Réessayer</button>
        </div>
      )}
      <div className="a-toolbar">
        <input type="search" placeholder="Rechercher (nom, SKU)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {catList.map((c) => <option key={c.id} value={c.id}>{c.name.fr}</option>)}
        </select>
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <thead>
            <tr><th /><th>Produit</th><th>SKU</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>État</th><th /></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="a-thumb"><img src={thumb(p)} alt="" width={48} height={48} loading="lazy" className="pimg" /></td>
                <td><strong>{p.name.fr}</strong></td>
                <td><code>{p.sku}</code></td>
                <td>{catName(p.categoryId)}</td>
                <td>
                  {fmt(p.salePrice ?? p.price)}
                  {p.salePrice != null && <small className="muted"> (barré {fmt(p.price)})</small>}
                </td>
                <td>{p.stock}</td>
                <td>{p.active ? <Pill tone="ok">Visible</Pill> : <Pill tone="neutral">Masqué</Pill>}</td>
                <td className="a-rowactions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ product: structuredClone(p), isNew: false })}>Modifier</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStockFor(p)}>Stock</button>
                </td>
              </tr>
            ))}
            {!products.loading && list.length === 0 && !products.error && <tr><td colSpan={8} className="muted a-empty">Aucun produit.</td></tr>}
            {products.loading && list.length === 0 && <tr><td colSpan={8} className="muted a-empty">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <ProductForm initial={editing.product} isNew={editing.isNew} categories={catList.map((c) => ({ id: c.id, label: c.name.fr }))} onClose={() => setEditing(null)} onDone={saved} />}
      {stockFor && <StockForm product={stockFor} onClose={() => setStockFor(null)} onDone={saved} />}
    </>
  )
}

function ProductForm({ initial, isNew, categories, onDone, onClose }: { initial: AdminProduct; isNew: boolean; categories: { id: string; label: string }[]; onDone: (msg: string) => Promise<void>; onClose: () => void }) {
  const [p, setP] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | undefined>(initial.image)
  const [openStock, setOpenStock] = useState<number | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false) // synchronous guard against double submit
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof AdminProduct>(k: K, v: AdminProduct[K]) => setP((x) => ({ ...x, [k]: v }))
  const setDesc = (lang: 'fr' | 'ar' | 'en', v: string) => setP((x) => ({ ...x, description: { fr: '', ...x.description, [lang]: v } }))

  const pick = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setErr('Le fichier doit être une image.')
    setErr('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (lock.current) return
    const invalid = validateProduct(p)
    if (invalid) return setErr(invalid)
    lock.current = true
    setBusy(true)
    setErr('')
    const c = requireSupabase()
    const warnings: string[] = []
    try {
      await saveProductRow(c, p, isNew)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
      lock.current = false
      setBusy(false)
      return
    }
    if (file) {
      try {
        await setProductImage(c, p.id, await resizeImageBlob(file))
      } catch (ex) {
        warnings.push(`image non enregistrée (${ex instanceof Error ? ex.message : ex})`)
      }
    }
    if (isNew && openStock && openStock > 0) {
      try {
        await adjustStock(c, p.id, openStock, 'Stock initial')
      } catch (ex) {
        warnings.push(`stock initial non enregistré (${ex instanceof Error ? ex.message : ex})`)
      }
    }
    lock.current = false
    setBusy(false)
    await onDone(warnings.length ? `Produit enregistré, mais : ${warnings.join(' ; ')}. Rouvrez-le pour réessayer.` : 'Produit enregistré')
  }

  return (
    <Modal title={isNew ? 'Nouveau produit' : 'Modifier le produit'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="form">
        <div className="a-formgrid">
          <div>
            <div className="row2">
              <Field label="SKU" required>{(a) => <input id={a.id} value={p.sku} onChange={(e) => set('sku', e.target.value)} />}</Field>
              <Field label="Catégorie" required>
                {(a) => (
                  <select id={a.id} value={p.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <Field label="Nom (français)" required>{(a) => <input id={a.id} value={p.name.fr} onChange={(e) => set('name', { ...p.name, fr: e.target.value })} />}</Field>
            <div className="row2">
              <Field label="Nom (arabe)">{(a) => <input id={a.id} dir="rtl" value={p.name.ar ?? ''} onChange={(e) => set('name', { ...p.name, ar: e.target.value })} />}</Field>
              <Field label="Nom (anglais)">{(a) => <input id={a.id} value={p.name.en ?? ''} onChange={(e) => set('name', { ...p.name, en: e.target.value })} />}</Field>
            </div>
            <div className="row3">
              <Field label="Prix (DA)" required>{(a) => <NumInput id={a.id} value={p.price || undefined} onChange={(n) => set('price', n ?? 0)} />}</Field>
              <Field label="Prix promo (DA)" hint="Facultatif">{(a) => <NumInput id={a.id} value={p.salePrice} onChange={(n) => set('salePrice', n)} />}</Field>
              {isNew ? (
                <Field label="Stock initial" hint="Enregistré comme mouvement de stock.">{(a) => <NumInput id={a.id} value={openStock} onChange={setOpenStock} />}</Field>
              ) : (
                <Field label="Stock actuel" hint="Lecture seule — bouton « Stock » dans la liste.">{(a) => <input id={a.id} value={p.stock} readOnly />}</Field>
              )}
            </div>
            <div className="a-checks">
              <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => set('active', e.target.checked)} /> Visible sur la boutique</label>
              <label className="check"><input type="checkbox" checked={p.featured} onChange={(e) => set('featured', e.target.checked)} /> Produit en vedette</label>
            </div>
          </div>
          <div>
            <div className="a-imgbox"><img src={preview || placeholderImage('default', p.sku || p.id)} alt="" width={200} height={200} className="pimg" /></div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <div className="a-actions a-actions--start">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>{preview ? "Changer l'image" : 'Téléverser une image'}</button>
            </div>
            <p className="muted small">L’image est redimensionnée puis envoyée dans Supabase Storage (bucket product-images).</p>
          </div>
        </div>
        <fieldset className="a-fieldset">
          <legend>Description (facultatif)</legend>
          <Field label="Français">{(a) => <textarea id={a.id} rows={2} value={p.description?.fr ?? ''} onChange={(e) => setDesc('fr', e.target.value)} />}</Field>
          <div className="row2">
            <Field label="Arabe">{(a) => <textarea id={a.id} dir="rtl" rows={2} value={p.description?.ar ?? ''} onChange={(e) => setDesc('ar', e.target.value)} />}</Field>
            <Field label="Anglais">{(a) => <textarea id={a.id} rows={2} value={p.description?.en ?? ''} onChange={(e) => setDesc('en', e.target.value)} />}</Field>
          </div>
        </fieldset>
        {err && <div className="alert alert--bad" role="alert">{err}</div>}
        <div className="a-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  )
}

function StockForm({ product, onDone, onClose }: { product: AdminProduct; onDone: (msg: string) => Promise<void>; onClose: () => void }) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const n = Number(delta)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (lock.current) return
    if (!Number.isInteger(n) || n === 0) return setErr('Saisissez un entier non nul (ex. 20 pour ajouter, -3 pour retirer).')
    if (!note.trim()) return setErr('Une note est obligatoire.')
    lock.current = true
    setBusy(true)
    try {
      await adjustStock(requireSupabase(), product.id, n, note)
      lock.current = false
      setBusy(false)
      await onDone('Stock mis à jour')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <Modal title={`Stock — ${product.name.fr}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="form">
        <p>Stock actuel : <strong>{product.stock}</strong>{Number.isInteger(n) && n !== 0 && <> → <strong>{product.stock + n}</strong></>}</p>
        <Field label="Variation (+ ajoute, − retire)" required>
          {(a) => <input id={a.id} inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} />}
        </Field>
        <Field label="Note" required hint="Ex. réception fournisseur, inventaire, casse…">
          {(a) => <input id={a.id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <p className="muted small">Réservé aux rôles owner/admin. Chaque ajustement est inscrit dans le journal de stock.</p>
        {err && <div className="alert alert--bad" role="alert">{err}</div>}
        <div className="a-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Valider'}</button>
        </div>
      </form>
    </Modal>
  )
}
