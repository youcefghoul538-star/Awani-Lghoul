import { useMemo, useState } from 'react'
import { estimateQuote, resolveWholesaleLine } from '../../domain'
import { useToast } from '../../components/Toast'
import { formatDate } from '../../lib/format'
import { normalizeText } from '../../lib/search'
import { requireSupabase } from '../../lib/supabase'
import type { Quote, QuoteStatus } from '../../types'
import { Notes } from '../Notes'
import { addNote, fetchAdminQuotes, fetchNotes, fetchWholesalePrices, setQuoteStatus } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, PageHead, Pill, QUOTE_STATUS, quoteTone, useDebounced } from '../ui'

const TYPE_LABEL: Record<string, string> = {
  retailer: 'Commerce de détail',
  reseller: 'Revendeur / grossiste',
  horeca: 'Restaurant / hôtel / café',
  institution: 'Collectivité / institution',
  other: 'Autre',
}

/** Wholesale quote requests read from Supabase (submit_quote_request writes them there). Quotes carry no price. */
export default function RemoteQuotes() {
  const toast = useToast()
  const quotes = useRemote(() => fetchAdminQuotes(requireSupabase()), 30000)
  const prices = useRemote(() => fetchWholesalePrices(requireSupabase()))
  const [status, setStatus] = useState<QuoteStatus | ''>('')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const all = useMemo(() => quotes.data ?? [], [quotes.data])
  const open = openId ? all.find((x) => x.id === openId) : undefined
  const notes = useRemote(() => (openId ? fetchNotes(requireSupabase(), 'quote', openId) : Promise.resolve([])), 0, openId)

  const list = useMemo(() => {
    const tokens = normalizeText(dq).split(/\s+/).filter(Boolean)
    return all
      .filter((x) => !status || x.status === status)
      .filter((x) => !tokens.length || tokens.every((t) => normalizeText(`${x.ref} ${x.business.companyName} ${x.business.contactName} ${x.business.phone}`).includes(t)))
  }, [all, status, dq])

  const changeStatus = async (x: Quote, next: QuoteStatus) => {
    if (busy) return
    setBusy(true)
    try {
      await setQuoteStatus(requireSupabase(), x.id, next)
      toast.show('Statut mis à jour')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      await quotes.reload()
    }
  }

  const wp = prices.data ?? new Map()

  return (
    <>
      <PageHead
        title="Demandes de devis (gros)"
        subtitle={`${all.length} demande(s) — ce ne sont pas des commandes confirmées. Actualisation automatique toutes les 30 s.`}
        actions={<button type="button" className="btn btn--ghost" onClick={() => void quotes.reload()} disabled={quotes.loading}>{quotes.loading ? 'Actualisation…' : 'Actualiser'}</button>}
      />
      {quotes.error && (
        <div className="alert alert--bad" role="alert">
          {quotes.error} <button type="button" className="btn btn--ghost btn--sm" onClick={() => void quotes.reload()}>Réessayer</button>
        </div>
      )}
      <div className="a-toolbar">
        <input type="search" placeholder="Rechercher (référence, société, contact)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus | '')} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <thead>
            <tr><th>Référence</th><th>Date</th><th>Société</th><th>Contact</th><th>Wilaya</th><th>Lignes</th><th>Statut</th><th /></tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id}>
                <td><strong dir="ltr">{x.ref}</strong></td>
                <td>{formatDate(x.createdAt, 'fr')}</td>
                <td>{x.business.companyName}</td>
                <td>{x.business.contactName}<br /><small className="muted" dir="ltr">{x.business.phone}</small></td>
                <td>{x.business.wilaya}</td>
                <td>{x.lines.length}</td>
                <td><Pill tone={quoteTone(x.status)}>{QUOTE_STATUS[x.status]}</Pill></td>
                <td className="a-rowactions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpenId(x.id)}>Ouvrir</button></td>
              </tr>
            ))}
            {!quotes.loading && list.length === 0 && !quotes.error && <tr><td colSpan={8} className="muted a-empty">Aucune demande de devis.</td></tr>}
            {quotes.loading && !quotes.data && <tr><td colSpan={8} className="muted a-empty">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title={`Devis ${open.ref}`} onClose={() => setOpenId(null)} wide>
          <div className="a-detail">
            <div>
              <div className="field">
                <label htmlFor="qstatus">Statut</label>
                <select id="qstatus" value={open.status} disabled={busy} onChange={(e) => void changeStatus(open, e.target.value as QuoteStatus)}>
                  {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <dl className="dl">
                <div><dt>Date</dt><dd>{formatDate(open.createdAt, 'fr')}</dd></div>
                <div><dt>Société</dt><dd>{open.business.companyName}</dd></div>
                <div><dt>Activité</dt><dd>{TYPE_LABEL[open.business.businessType] ?? open.business.businessType}</dd></div>
                <div><dt>Contact</dt><dd>{open.business.contactName}</dd></div>
                <div><dt>Téléphone</dt><dd><a href={`tel:${open.business.phone.replace(/\s/g, '')}`} dir="ltr">{open.business.phone}</a></dd></div>
                {open.business.email && <div><dt>E-mail</dt><dd><a href={`mailto:${open.business.email}`} dir="ltr">{open.business.email}</a></dd></div>}
                <div><dt>Wilaya</dt><dd>{open.business.wilaya}</dd></div>
                {open.business.address && <div><dt>Adresse</dt><dd>{open.business.address}</dd></div>}
                {open.business.notes && <div><dt>Précisions</dt><dd>{open.business.notes}</dd></div>}
              </dl>
              <h3>Produits demandés</h3>
              <p className="muted small">Prix de gros : confidentiels (owner/admin). S’ils sont « non défini », renseignez-les dans « Prix de gros (privé) ».</p>
              <table className="a-table a-table--tight">
                <thead><tr><th>Produit</th><th>Qté</th><th>Prix gros (privé)</th><th>Total estimé</th></tr></thead>
                <tbody>
                  {open.lines.map((l, i) => {
                    const r = resolveWholesaleLine(wp.get(l.productId), l.qty)
                    return (
                      <tr key={i}>
                        <td>{l.name} <small className="muted">({l.sku})</small></td>
                        <td>{l.qty}</td>
                        <td>
                          {r.status === 'missing_price' ? <span className="muted">non défini</span> : fmt(r.unitPrice)}
                          {r.status === 'below_min' && <Pill tone="warn">Sous la qté minimale ({r.minQty})</Pill>}
                        </td>
                        <td>{r.status === 'ok' ? fmt(r.unitPrice * l.qty) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const est = estimateQuote(open.lines, wp)
                    return (
                      <tr>
                        <td colSpan={3}>
                          <strong>{est.complete ? 'Total estimé' : 'Total partiel (lignes chiffrées uniquement)'}</strong>
                          {!est.complete && <small className="muted"> — {est.missingPriceLines} sans prix, {est.belowMinLines} sous la quantité minimale : non inclus</small>}
                        </td>
                        <td><strong>{fmt(est.pricedTotal)}</strong></td>
                      </tr>
                    )
                  })()}
                </tfoot>
              </table>
            </div>
            <Notes
              notes={notes.data ?? []}
              onAdd={async (n) => {
                try {
                  await addNote(requireSupabase(), 'quote', open.id, n.text)
                  await notes.reload()
                } catch (e) {
                  toast.show(e instanceof Error ? e.message : String(e))
                }
              }}
            />
          </div>
        </Modal>
      )}
    </>
  )
}
