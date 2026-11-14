import { useMemo, useState } from 'react'
import { useToast } from '../../components/Toast'
import { landedPurchase } from '../../domain'
import { requireSupabase } from '../../lib/supabase'
import type { AllocationMethod, CostType, ExpenseCategory } from '../../types'
import {
  addExpense,
  addSupplier,
  cancelPurchase,
  deleteExpense,
  fetchAdminProducts,
  fetchExpenses,
  fetchPurchases,
  fetchSuppliers,
  receivePurchase,
  savePurchaseDraft,
  type AdminPurchase,
} from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, PageHead, Pill } from '../ui'

type Tab = 'purchases' | 'suppliers' | 'expenses'
const num = (s: string) => Number(s.replace(',', '.'))
const COST_TYPES: Record<CostType, string> = { transport: 'Transport', customs: 'Douane', handling: 'Manutention', packaging: 'Emballage', other: 'Autre' }
const EXP: Record<ExpenseCategory, string> = { rent: 'Loyer', salaries: 'Salaires', utilities: 'Eau/électricité/internet', transport: 'Transport', marketing: 'Marketing', taxes: 'Impôts et taxes', other: 'Autre' }
const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  id?: string
  supplierId: string
  date: string
  allocation: AllocationMethod
  items: { productId: string; qty: string; unitCost: string }[]
  costs: { type: CostType; amount: string }[]
}
const blankDraft = (): Draft => ({ supplierId: '', date: today(), allocation: 'by_value', items: [{ productId: '', qty: '', unitCost: '' }], costs: [] })

/** Purchases, suppliers and expenses in Supabase (owner/admin only). Receiving a purchase adds the stock and updates the average cost server-side. */
export default function RemotePurchases() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('purchases')
  const purchases = useRemote(() => fetchPurchases(requireSupabase()))
  const suppliers = useRemote(() => fetchSuppliers(requireSupabase()))
  const expenses = useRemote(() => fetchExpenses(requireSupabase()))
  const products = useRemote(() => fetchAdminProducts(requireSupabase()))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftErr, setDraftErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sup, setSup] = useState({ name: '', phone: '' })
  const [exp, setExp] = useState({ date: today(), category: 'rent' as ExpenseCategory, amount: '', description: '' })
  const supList = suppliers.data ?? []
  const prodList = products.data ?? []
  const supById = useMemo(() => new Map(supList.map((s) => [s.id, s])), [supList])
  const prodById = useMemo(() => new Map(prodList.map((p) => [p.id, p])), [prodList])
  const err = purchases.error || suppliers.error || expenses.error

  const run = async (fn: () => Promise<void>, ok: string, after: () => Promise<void>) => {
    if (busy) return false
    setBusy(true)
    try {
      await fn()
      toast.show(ok)
      await after()
      return true
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const toInput = (d: Draft) => ({
    id: d.id,
    supplierId: d.supplierId,
    date: d.date,
    allocation: d.allocation,
    items: d.items.filter((i) => i.productId).map((i) => ({ productId: i.productId, qty: Math.trunc(num(i.qty)), unitCost: num(i.unitCost) })),
    additionalCosts: d.costs.filter((c) => c.amount.trim()).map((c) => ({ type: c.type, amount: num(c.amount) })),
  })
  const preview = draft
    ? (() => {
        const p = toInput(draft)
        return p.items.length && p.items.every((i) => i.qty > 0 && i.unitCost >= 0) ? landedPurchase(p) : null
      })()
    : null
  const totalOf = (p: AdminPurchase) => landedPurchase(p).reduce((s, l) => s + l.totalCentimes, 0) / 100

  const saveDraft = async () => {
    if (!draft) return
    setDraftErr('')
    if (busy) return
    setBusy(true)
    try {
      await savePurchaseDraft(requireSupabase(), toInput(draft))
      toast.show('Brouillon enregistré.')
      setDraft(null)
      await purchases.reload()
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="Achats & charges" subtitle="Enregistrés dans Supabase (owner/admin). Réceptionner un achat ajoute le stock et met à jour le coût moyen pondéré." />
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      <div className="seg" role="tablist">
        {([['purchases', 'Achats'], ['suppliers', 'Fournisseurs'], ['expenses', 'Charges']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'purchases' && (
        <>
          <div className="a-toolbar">
            <button type="button" className="btn btn--primary btn--sm" disabled={supList.length === 0 || prodList.length === 0} onClick={() => { setDraftErr(''); setDraft(blankDraft()) }}>+ Nouvel achat</button>
            {supList.length === 0 && <small className="muted">Ajoutez d’abord un fournisseur.</small>}
          </div>
          <div className="a-tablewrap">
            <table className="a-table">
              <thead><tr><th>Réf.</th><th>Date</th><th>Fournisseur</th><th>Lignes</th><th>Total (frais inclus)</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {(purchases.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td><strong dir="ltr">{p.ref}</strong></td>
                    <td>{p.date}</td>
                    <td>{supById.get(p.supplierId)?.name ?? '—'}</td>
                    <td>{p.items.length}</td>
                    <td>{fmt(totalOf(p))}</td>
                    <td><Pill tone={p.status === 'received' ? 'ok' : p.status === 'cancelled' ? 'bad' : 'warn'}>{p.status === 'received' ? 'Reçu' : p.status === 'cancelled' ? 'Annulé' : 'Brouillon'}</Pill></td>
                    <td className="a-rowactions">
                      {p.status === 'draft' && (
                        <>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDraftErr(''); setDraft({ id: p.id, supplierId: p.supplierId, date: p.date, allocation: p.allocation, items: p.items.map((i) => ({ productId: i.productId, qty: String(i.qty), unitCost: String(i.unitCost) })), costs: p.additionalCosts.map((c) => ({ type: c.type, amount: String(c.amount) })) }) }}>Modifier</button>
                          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void run(() => receivePurchase(requireSupabase(), p.id), 'Achat reçu : stock et coûts mis à jour.', () => purchases.reload())}>Réceptionner</button>
                          <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => void run(() => cancelPurchase(requireSupabase(), p.id), 'Achat annulé.', () => purchases.reload())}>Annuler</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!purchases.loading && (purchases.data ?? []).length === 0 && !purchases.error && <tr><td colSpan={7} className="muted a-empty">Aucun achat.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <div className="a-toolbar">
            <input placeholder="Nom du fournisseur" value={sup.name} onChange={(e) => setSup({ ...sup, name: e.target.value })} aria-label="Nom du fournisseur" />
            <input dir="ltr" placeholder="Téléphone (facultatif)" value={sup.phone} onChange={(e) => setSup({ ...sup, phone: e.target.value })} aria-label="Téléphone" />
            <button type="button" className="btn btn--primary btn--sm" disabled={!sup.name.trim() || busy} onClick={() => void run(() => addSupplier(requireSupabase(), sup.name, sup.phone), 'Fournisseur ajouté.', async () => { setSup({ name: '', phone: '' }); await suppliers.reload() })}>Ajouter</button>
          </div>
          <ul className="a-list">
            {supList.map((s) => <li key={s.id}><span>{s.name}{s.phone && <small className="muted"> · <bdi dir="ltr">{s.phone}</bdi></small>}</span></li>)}
            {supList.length === 0 && <li className="muted">Aucun fournisseur.</li>}
          </ul>
        </>
      )}

      {tab === 'expenses' && (
        <>
          <p className="muted">Les charges servent à calculer le bénéfice net dans la vue d’ensemble. Sans charges saisies, le bénéfice net reste « Données insuffisantes ».</p>
          <div className="a-toolbar">
            <input type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} aria-label="Date" />
            <select value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value as ExpenseCategory })} aria-label="Catégorie">{Object.entries(EXP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input inputMode="decimal" placeholder="Montant (DA)" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} aria-label="Montant" />
            <input placeholder="Description" value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} aria-label="Description" />
            <button type="button" className="btn btn--primary btn--sm" disabled={!(num(exp.amount) > 0) || !exp.description.trim() || busy} onClick={() => void run(() => addExpense(requireSupabase(), { date: exp.date, category: exp.category, amount: num(exp.amount), description: exp.description }), 'Charge enregistrée.', async () => { setExp({ ...exp, amount: '', description: '' }); await expenses.reload() })}>Ajouter</button>
          </div>
          <div className="a-tablewrap">
            <table className="a-table a-table--tight">
              <thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Montant</th><th /></tr></thead>
              <tbody>
                {(expenses.data ?? []).map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td><td>{EXP[e.category] ?? e.category}</td><td>{e.description}</td><td>{fmt(e.amount)}</td>
                    <td><button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => void run(() => deleteExpense(requireSupabase(), e.id), 'Charge supprimée.', () => expenses.reload())}>Supprimer</button></td>
                  </tr>
                ))}
                {!expenses.loading && (expenses.data ?? []).length === 0 && !expenses.error && <tr><td colSpan={5} className="muted a-empty">Aucune charge saisie.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {draft && (
        <Modal title={draft.id ? 'Modifier l’achat' : 'Nouvel achat'} onClose={() => setDraft(null)} wide>
          <div className="a-grid2">
            <div className="field"><label htmlFor="ps">Fournisseur *</label>
              <select id="ps" value={draft.supplierId} onChange={(e) => setDraft({ ...draft, supplierId: e.target.value })}><option value="">—</option>{supList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label htmlFor="pd">Date</label><input id="pd" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
          </div>
          <h3>Lignes</h3>
          {draft.items.map((it, i) => (
            <div key={i} className="a-toolbar">
              <select value={it.productId} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)) })} aria-label="Produit"><option value="">Produit…</option>{prodList.map((p) => <option key={p.id} value={p.id}>{p.name.fr} ({p.sku})</option>)}</select>
              <input inputMode="numeric" placeholder="Qté" style={{ width: 80 }} value={it.qty} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)) })} aria-label="Quantité" />
              <input inputMode="decimal" placeholder="Coût unitaire (DA)" style={{ width: 150 }} value={it.unitCost} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)) })} aria-label="Coût unitaire" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} aria-label="Retirer la ligne">×</button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft({ ...draft, items: [...draft.items, { productId: '', qty: '', unitCost: '' }] })}>+ Ligne</button>
          <h3>Frais additionnels (répartis sur les lignes)</h3>
          {draft.costs.map((c, i) => (
            <div key={i} className="a-toolbar">
              <select value={c.type} onChange={(e) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, type: e.target.value as CostType } : x)) })} aria-label="Type de frais">{Object.entries(COST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input inputMode="decimal" placeholder="Montant (DA)" value={c.amount} onChange={(e) => setDraft({ ...draft, costs: draft.costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} aria-label="Montant du frais" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft({ ...draft, costs: draft.costs.filter((_, j) => j !== i) })} aria-label="Retirer le frais">×</button>
            </div>
          ))}
          <div className="a-toolbar">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft({ ...draft, costs: [...draft.costs, { type: 'transport', amount: '' }] })}>+ Frais</button>
            <label htmlFor="alloc">Répartition</label>
            <select id="alloc" value={draft.allocation} onChange={(e) => setDraft({ ...draft, allocation: e.target.value as AllocationMethod })}><option value="by_value">Au prorata de la valeur</option><option value="by_quantity">Au prorata des quantités</option></select>
          </div>
          {preview && (
            <table className="a-table a-table--tight">
              <thead><tr><th>Produit</th><th>Qté</th><th>Marchandise</th><th>Frais répartis</th><th>Coût unitaire complet</th></tr></thead>
              <tbody>{preview.map((l) => <tr key={l.index}><td>{prodById.get(l.productId)?.name.fr}</td><td>{l.qty}</td><td>{fmt(l.goodsCentimes / 100)}</td><td>{fmt(l.allocatedCentimes / 100)}</td><td>{fmt(l.landedUnitCentimes / 100)}</td></tr>)}</tbody>
            </table>
          )}
          {draftErr && <div className="alert alert--bad" role="alert">{draftErr}</div>}
          <div className="a-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>Annuler</button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void saveDraft()}>Enregistrer le brouillon</button>
          </div>
        </Modal>
      )}
    </>
  )
}
