import { useMemo, useState } from 'react'
import { useToast } from '../../components/Toast'
import { WILAYAS, wilayaValue } from '../../data/wilayas'
import { dayKey } from '../../domain/time'
import { formatDate } from '../../lib/format'
import { normalizeText } from '../../lib/search'
import { requireSupabase } from '../../lib/supabase'
import type { ContactKind, LeadSource, TraderStatus } from '../../types'
import { addTraderContact, fetchAdminOrders, fetchAdminQuotes, fetchTraderContacts, fetchTraders, phoneKey, saveTrader, validateTrader, type AdminTrader } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, PageHead, Pill, QUOTE_STATUS, quoteTone, useDebounced } from '../ui'

const STATUS: Record<TraderStatus, string> = { prospect: 'Prospect', active: 'Client actif', inactive: 'Inactif' }
const tone = (t: TraderStatus) => (t === 'active' ? 'ok' : t === 'inactive' ? 'neutral' : 'info')
const SOURCE: Record<LeadSource, string> = { website_quote: 'Demande de devis (site)', walk_in: 'Passage en magasin', phone: 'Téléphone', referral: 'Recommandation', social: 'Réseaux sociaux', other: 'Autre' }
const KIND: Record<ContactKind, string> = { call: 'Appel', visit: 'Visite', whatsapp: 'WhatsApp', email: 'Email', other: 'Autre' }
const blank = (): AdminTrader => ({ id: '', businessName: '', contactName: '', phone: '', wilaya: '', status: 'prospect', leadSource: 'phone', notes: '', createdAt: new Date().toISOString() })

/** Wholesale contacts stored in Supabase. A quote request creates a « prospect » automatically (submit_quote_request). */
export default function RemoteTraders() {
  const toast = useToast()
  const traders = useRemote(() => fetchTraders(requireSupabase()))
  const quotes = useRemote(() => fetchAdminQuotes(requireSupabase()))
  const orders = useRemote(() => fetchAdminOrders(requireSupabase()))
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [status, setStatus] = useState<TraderStatus | ''>('')
  const [editing, setEditing] = useState<{ t: AdminTrader; isNew: boolean } | null>(null)
  const today = dayKey(new Date())
  const all = useMemo(() => traders.data ?? [], [traders.data])

  const rows = useMemo(() => {
    const tokens = normalizeText(dq).split(/\s+/).filter(Boolean)
    return all
      .filter((t) => (!status || t.status === status) && (!tokens.length || tokens.every((k) => normalizeText(`${t.businessName} ${t.contactName} ${t.phone} ${t.wilaya}`).includes(k))))
      .sort((a, b) => (a.followUpDate ?? '9999').localeCompare(b.followUpDate ?? '9999') || b.createdAt.localeCompare(a.createdAt))
  }, [all, dq, status])

  return (
    <>
      <PageHead
        title="Commerçants (gros)"
        subtitle="Contacts professionnels enregistrés dans Supabase (une demande de devis crée un prospect)."
        actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({ t: blank(), isNew: true })}>+ Nouveau commerçant</button>}
      />
      {traders.error && <div className="alert alert--bad" role="alert">{traders.error}</div>}
      <div className="a-toolbar">
        <input type="search" placeholder="Rechercher (société, contact, téléphone)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select value={status} onChange={(e) => setStatus(e.target.value as TraderStatus | '')} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <thead><tr><th>Société</th><th>Contact</th><th>Téléphone</th><th>Wilaya</th><th>Statut</th><th>Prochaine relance</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.businessName}</strong></td>
                <td>{t.contactName}</td>
                <td dir="ltr"><a href={`tel:${t.phone}`}>{t.phone}</a></td>
                <td>{t.wilaya}</td>
                <td><Pill tone={tone(t.status)}>{STATUS[t.status]}</Pill></td>
                <td>{t.followUpDate ? <Pill tone={t.followUpDate < today ? 'bad' : t.followUpDate === today ? 'warn' : 'neutral'}>{t.followUpDate}</Pill> : '—'}</td>
                <td className="a-rowactions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ t: structuredClone(t), isNew: false })}>Fiche</button></td>
              </tr>
            ))}
            {!traders.loading && rows.length === 0 && !traders.error && <tr><td colSpan={7} className="muted a-empty">Aucun commerçant pour le moment.</td></tr>}
            {traders.loading && !traders.data && <tr><td colSpan={7} className="muted a-empty">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && (
        <TraderForm
          initial={editing.t}
          isNew={editing.isNew}
          all={all}
          quotes={(quotes.data ?? []).filter((x) => phoneKey(x.business.phone) === phoneKey(editing.t.phone))}
          orders={(orders.data ?? []).filter((o) => phoneKey(o.phone) === phoneKey(editing.t.phone))}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            toast.show('Commerçant enregistré')
            setEditing(null)
            await traders.reload()
          }}
        />
      )}
    </>
  )
}

function TraderForm({ initial, isNew, all, quotes, orders, onSaved, onClose }: { initial: AdminTrader; isNew: boolean; all: AdminTrader[]; quotes: Awaited<ReturnType<typeof fetchAdminQuotes>>; orders: Awaited<ReturnType<typeof fetchAdminOrders>>; onSaved: () => Promise<void>; onClose: () => void }) {
  const toast = useToast()
  const [t, setT] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState({ kind: 'call' as ContactKind, summary: '' })
  const contacts = useRemote(() => (isNew ? Promise.resolve([]) : fetchTraderContacts(requireSupabase(), initial.id)))
  const delivered = orders.filter((o) => o.status === 'delivered')

  const save = async () => {
    if (busy) return
    const e = validateTrader(t, all)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setErr('')
    try {
      await saveTrader(requireSupabase(), t, isNew)
      await onSaved()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
      setBusy(false)
    }
  }
  const addContact = async () => {
    try {
      await addTraderContact(requireSupabase(), t.id, note.kind, note.summary)
      setNote({ ...note, summary: '' })
      await contacts.reload()
    } catch (ex) {
      toast.show(ex instanceof Error ? ex.message : String(ex))
    }
  }

  return (
    <Modal title={isNew ? 'Nouveau commerçant' : t.businessName} onClose={onClose} wide>
      <div className="a-grid2">
        <div className="field"><label htmlFor="tb">Société *</label><input id="tb" value={t.businessName} onChange={(e) => setT({ ...t, businessName: e.target.value })} aria-invalid={!!errors.businessName} />{errors.businessName && <div className="field__msg field__msg--error">{errors.businessName}</div>}</div>
        <div className="field"><label htmlFor="tc">Contact *</label><input id="tc" value={t.contactName} onChange={(e) => setT({ ...t, contactName: e.target.value })} aria-invalid={!!errors.contactName} />{errors.contactName && <div className="field__msg field__msg--error">{errors.contactName}</div>}</div>
        <div className="field"><label htmlFor="tp">Téléphone *</label><input id="tp" dir="ltr" value={t.phone} onChange={(e) => setT({ ...t, phone: e.target.value })} aria-invalid={!!errors.phone} />{errors.phone && <div className="field__msg field__msg--error">{errors.phone}</div>}</div>
        <div className="field"><label htmlFor="te">Email</label><input id="te" type="email" value={t.email ?? ''} onChange={(e) => setT({ ...t, email: e.target.value || undefined })} /></div>
        <div className="field">
          <label htmlFor="tw">Wilaya *</label>
          <select id="tw" value={t.wilaya} onChange={(e) => setT({ ...t, wilaya: e.target.value })} aria-invalid={!!errors.wilaya}>
            <option value="">—</option>
            {WILAYAS.map((w) => <option key={w.code} value={wilayaValue(w)}>{wilayaValue(w)}</option>)}
          </select>
          {errors.wilaya && <div className="field__msg field__msg--error">{errors.wilaya}</div>}
        </div>
        <div className="field"><label htmlFor="ts">Statut</label><select id="ts" value={t.status} onChange={(e) => setT({ ...t, status: e.target.value as TraderStatus })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="tl">Origine du contact</label><select id="tl" value={t.leadSource} onChange={(e) => setT({ ...t, leadSource: e.target.value as LeadSource })}>{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="tf">Prochaine relance</label><input id="tf" type="date" value={t.followUpDate ?? ''} onChange={(e) => setT({ ...t, followUpDate: e.target.value || undefined })} /></div>
      </div>
      <div className="field"><label htmlFor="tn">Notes internes</label><textarea id="tn" rows={2} value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} /></div>

      {!isNew && (
        <>
          <h3>Activité (liée par numéro de téléphone)</h3>
          <ul className="a-list">
            <li><span>Demandes de devis</span><strong>{quotes.length} ({quotes.filter((x) => x.status === 'new' || x.status === 'contacted' || x.status === 'quoted').length} en cours, {quotes.filter((x) => x.status === 'won').length} gagnée(s))</strong></li>
            <li><span>Commandes détail livrées</span><strong>{delivered.length} · {fmt(delivered.reduce((s, o) => s + o.total, 0))}</strong></li>
          </ul>
          {quotes.length > 0 && (
            <ul className="a-list">
              {quotes.map((x) => (
                <li key={x.id}><span><strong dir="ltr">{x.ref}</strong><br /><small className="muted">{formatDate(x.createdAt, 'fr')} · {x.lines.length} ligne(s)</small></span><Pill tone={quoteTone(x.status)}>{QUOTE_STATUS[x.status]}</Pill></li>
              ))}
            </ul>
          )}
          <h3>Historique des contacts</h3>
          <div className="a-toolbar">
            <select value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as ContactKind })} aria-label="Type de contact">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} placeholder="Résumé de l’échange…" aria-label="Résumé" />
            <button type="button" className="btn btn--ghost btn--sm" disabled={!note.summary.trim()} onClick={() => void addContact()}>Ajouter</button>
          </div>
          <ul className="a-list">
            {(contacts.data ?? []).map((c) => <li key={c.id}><span><strong>{KIND[c.kind]}</strong> · <small className="muted">{formatDate(c.at, 'fr')}</small><br />{c.summary}</span></li>)}
            {contacts.data?.length === 0 && <li className="muted">Aucun échange enregistré.</li>}
          </ul>
        </>
      )}
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      <div className="a-modal__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>Fermer</button>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </Modal>
  )
}
