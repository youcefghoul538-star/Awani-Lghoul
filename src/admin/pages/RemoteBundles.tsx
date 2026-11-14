import { useMemo, useState, type FormEvent } from 'react'
import { Field } from '../../components/Form'
import { useToast } from '../../components/Toast'
import { bundleAvailability, bundleSaving, normalizeBundleItems } from '../../domain'
import { uid } from '../../lib/ids'
import { requireSupabase } from '../../lib/supabase'
import { loadCatalog } from '../../state/catalog'
import { fetchAdminBundles, fetchAdminProducts, saveBundle, validateBundleBasics, type AdminBundle } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, NumInput, PageHead, Pill } from '../ui'

/** Packs stored in Supabase. They are never deleted (past orders reference them): hide with « Visible » off. */
export default function RemoteBundles() {
  const toast = useToast()
  const bundles = useRemote(() => fetchAdminBundles(requireSupabase()))
  const products = useRemote(() => fetchAdminProducts(requireSupabase()))
  const [editing, setEditing] = useState<{ bundle: AdminBundle; isNew: boolean } | null>(null)
  const list = bundles.data ?? []
  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data])
  const err = bundles.error || products.error

  const saved = async () => {
    toast.show('Pack enregistré')
    setEditing(null)
    void loadCatalog()
    await bundles.reload()
  }

  return (
    <>
      <PageHead
        title="Packs"
        subtitle="Packs à prix public affiché (jamais de prix de gros). Enregistrés dans Supabase."
        actions={
          <button type="button" className="btn btn--primary" disabled={(products.data ?? []).length === 0} onClick={() => setEditing({ bundle: { id: uid('b'), title: { fr: '' }, items: [], price: 0, active: true }, isNew: true })}>
            + Nouveau pack
          </button>
        }
      />
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      <div className="a-tablewrap">
        <table className="a-table">
          <thead>
            <tr><th>Pack</th><th>Contenu</th><th>Prix</th><th>Promo</th><th>Économie client</th><th>Dispo.</th><th>État</th><th /></tr>
          </thead>
          <tbody>
            {list.map((b) => {
              const sv = bundleSaving(b, byId)
              return (
                <tr key={b.id}>
                  <td><strong>{b.title.fr}</strong></td>
                  <td>{b.items.map((i) => `${i.qty}× ${byId.get(i.productId)?.name.fr ?? '(inconnu)'}`).join(', ')}</td>
                  <td>{fmt(b.price)}</td>
                  <td>{b.promoPrice ? fmt(b.promoPrice) : '—'}</td>
                  <td>{sv ? (sv.pricedAboveParts ? <Pill tone="warn">Plus cher que les articles</Pill> : `${fmt(sv.saving)}${sv.savingPct != null ? ` (${sv.savingPct.toFixed(0)} %)` : ''}`) : '—'}</td>
                  <td>{bundleAvailability(b.items, byId)}</td>
                  <td>{b.active ? <Pill tone="ok">Visible</Pill> : <Pill tone="neutral">Masqué</Pill>}</td>
                  <td className="a-rowactions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ bundle: structuredClone(b), isNew: false })}>Modifier</button></td>
                </tr>
              )
            })}
            {!bundles.loading && list.length === 0 && !bundles.error && <tr><td colSpan={8} className="muted a-empty">Aucun pack.</td></tr>}
            {bundles.loading && !bundles.data && <tr><td colSpan={8} className="muted a-empty">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <BundleForm initial={editing.bundle} isNew={editing.isNew} products={products.data ?? []} onClose={() => setEditing(null)} onDone={saved} />}
    </>
  )
}

function BundleForm({ initial, isNew, products, onDone, onClose }: { initial: AdminBundle; isNew: boolean; products: Awaited<ReturnType<typeof fetchAdminProducts>>; onDone: () => Promise<void>; onClose: () => void }) {
  const [b, setB] = useState(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const byId = new Map(products.map((p) => [p.id, p]))
  const valid = normalizeBundleItems(b.items.filter((i) => i.productId))
  const sv = bundleSaving({ ...b, items: valid }, byId)
  const sorted = [...products].sort((a, c) => a.name.fr.localeCompare(c.name.fr, 'fr'))
  const setItem = (idx: number, patch: Partial<{ productId: string; qty: number }>) => setB((x) => ({ ...x, items: x.items.map((it, j) => (j === idx ? { ...it, ...patch } : it)) }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const next: AdminBundle = { ...b, items: valid }
    const invalid = validateBundleBasics(next)
    if (invalid) return setErr(invalid)
    setBusy(true)
    setErr('')
    try {
      await saveBundle(requireSupabase(), next, isNew)
      await onDone()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Nouveau pack' : 'Modifier le pack'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="form">
        <Field label="Titre (français)" required>{(a) => <input id={a.id} value={b.title.fr} onChange={(e) => setB({ ...b, title: { ...b.title, fr: e.target.value } })} />}</Field>
        <div className="row2">
          <Field label="Titre (arabe)">{(a) => <input id={a.id} dir="rtl" value={b.title.ar ?? ''} onChange={(e) => setB({ ...b, title: { ...b.title, ar: e.target.value } })} />}</Field>
          <Field label="Titre (anglais)">{(a) => <input id={a.id} value={b.title.en ?? ''} onChange={(e) => setB({ ...b, title: { ...b.title, en: e.target.value } })} />}</Field>
        </div>
        <fieldset className="a-fieldset">
          <legend>Produits inclus</legend>
          {b.items.map((it, i) => (
            <div key={i} className="a-specrow">
              <select aria-label="Produit" value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value })}>
                <option value="">— Choisir —</option>
                {sorted.map((p) => <option key={p.id} value={p.id}>{p.name.fr} ({p.sku})</option>)}
              </select>
              <NumInput value={it.qty} width={80} onChange={(n) => setItem(i, { qty: n ?? 1 })} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setB({ ...b, items: b.items.filter((_, j) => j !== i) })}>Retirer</button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setB({ ...b, items: [...b.items, { productId: '', qty: 1 }] })}>+ Ajouter un produit</button>
          <p className="muted small">Valeur de référence des articles : {sv ? fmt(sv.referenceValue) : '—'}{sv && (sv.pricedAboveParts ? ' — attention : le pack est plus cher que les articles séparés.' : ` · économie client : ${fmt(sv.saving)}`)}</p>
        </fieldset>
        <div className="row3">
          <Field label="Prix public du pack (DA)" required>{(a) => <NumInput id={a.id} value={b.price || undefined} onChange={(n) => setB({ ...b, price: n ?? 0 })} />}</Field>
          <Field label="Prix promo (DA)" hint="Facultatif">{(a) => <NumInput id={a.id} value={b.promoPrice} onChange={(n) => setB({ ...b, promoPrice: n })} />}</Field>
        </div>
        <label className="check"><input type="checkbox" checked={b.active} onChange={(e) => setB({ ...b, active: e.target.checked })} /> Visible sur la boutique</label>
        {err && <div className="alert alert--bad" role="alert">{err}</div>}
        <div className="a-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  )
}
