import { useState, type FormEvent } from 'react'
import { Field } from '../../components/Form'
import { useToast } from '../../components/Toast'
import { requireSupabase } from '../../lib/supabase'
import { uid } from '../../lib/ids'
import { fetchAdminCategories, fetchAdminProducts, saveCategory, type AdminCategory } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { Modal, PageHead, Pill } from '../ui'

/** Categories stored in Supabase. They are never deleted (products reference them): hide with « Visible » off. */
export default function RemoteCategories() {
  const toast = useToast()
  const cats = useRemote(() => fetchAdminCategories(requireSupabase()))
  const prods = useRemote(() => fetchAdminProducts(requireSupabase()))
  const [editing, setEditing] = useState<{ cat: AdminCategory; isNew: boolean } | null>(null)
  const list = cats.data ?? []
  const count = (id: string) => (prods.data ?? []).filter((p) => p.categoryId === id).length

  const save = async (c: AdminCategory) => {
    try {
      await saveCategory(requireSupabase(), c)
      toast.show('Catégorie enregistrée')
      setEditing(null)
      await cats.reload()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <PageHead
        title="Catégories"
        subtitle="Enregistrées dans Supabase — visibles dans la barre de navigation de la boutique."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setEditing({ cat: { id: uid('c'), name: { fr: '' }, order: list.length + 1, active: true }, isNew: true })}>
            + Nouvelle catégorie
          </button>
        }
      />
      {cats.error && (
        <div className="alert alert--bad" role="alert">
          {cats.error} <button type="button" className="btn btn--ghost btn--sm" onClick={() => void cats.reload()}>Réessayer</button>
        </div>
      )}
      <div className="a-tablewrap">
        <table className="a-table">
          <thead>
            <tr><th>Ordre</th><th>Nom (FR)</th><th>Nom (AR)</th><th>Nom (EN)</th><th>Produits</th><th>État</th><th /></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.order}</td>
                <td><strong>{c.name.fr}</strong></td>
                <td dir="rtl">{c.name.ar}</td>
                <td>{c.name.en}</td>
                <td>{count(c.id)}</td>
                <td>{c.active ? <Pill tone="ok">Visible</Pill> : <Pill tone="neutral">Masquée</Pill>}</td>
                <td className="a-rowactions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ cat: structuredClone(c), isNew: false })}>Modifier</button>
                </td>
              </tr>
            ))}
            {!cats.loading && list.length === 0 && !cats.error && (
              <tr><td colSpan={7} className="muted a-empty">Aucune catégorie. Créez-en une avant d’ajouter des produits.</td></tr>
            )}
            {cats.loading && list.length === 0 && (
              <tr><td colSpan={7} className="muted a-empty">Chargement…</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <CategoryForm initial={editing.cat} isNew={editing.isNew} onClose={() => setEditing(null)} onSave={save} />}
    </>
  )
}

function CategoryForm({ initial, isNew, onSave, onClose }: { initial: AdminCategory; isNew: boolean; onSave: (c: AdminCategory) => Promise<void>; onClose: () => void }) {
  const [c, setC] = useState(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!c.name.fr.trim()) return setErr('Nom (français) obligatoire.')
    setBusy(true)
    await onSave(c)
    setBusy(false)
  }
  return (
    <Modal title={isNew ? 'Nouvelle catégorie' : 'Modifier la catégorie'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="form">
        <Field label="Nom (français)" required error={err}>
          {(a) => <input id={a.id} value={c.name.fr} onChange={(e) => setC({ ...c, name: { ...c.name, fr: e.target.value } })} aria-invalid={a.invalid} aria-describedby={a.describedBy} />}
        </Field>
        <Field label="Nom (arabe)">{(a) => <input id={a.id} dir="rtl" value={c.name.ar ?? ''} onChange={(e) => setC({ ...c, name: { ...c.name, ar: e.target.value } })} />}</Field>
        <Field label="Nom (anglais)">{(a) => <input id={a.id} value={c.name.en ?? ''} onChange={(e) => setC({ ...c, name: { ...c.name, en: e.target.value } })} />}</Field>
        <Field label="Ordre d’affichage">
          {(a) => <input id={a.id} type="number" min={0} value={c.order} onChange={(e) => setC({ ...c, order: Number(e.target.value) || 0 })} />}
        </Field>
        <label className="check">
          <input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> Visible sur la boutique
        </label>
        <div className="a-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  )
}
