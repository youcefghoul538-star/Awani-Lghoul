import { useMemo, useState } from 'react'
import { formatDate } from '../../lib/format'
import { normalizeText } from '../../lib/search'
import { requireSupabase } from '../../lib/supabase'
import { fetchAdminOrders, groupCustomers, phoneKey } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, ORDER_STATUS, orderTone, PageHead, Pill, useDebounced } from '../ui'

/** Retail customers are derived from the orders stored in Supabase and grouped by phone number (no customer accounts exist). */
export default function RemoteCustomers() {
  const orders = useRemote(() => fetchAdminOrders(requireSupabase()))
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const all = useMemo(() => orders.data ?? [], [orders.data])
  const customers = useMemo(() => {
    const tokens = normalizeText(dq).split(/\s+/).filter(Boolean)
    return groupCustomers(all).filter((c) => !tokens.length || tokens.every((t) => normalizeText(`${c.name} ${c.phone} ${c.wilaya}`).includes(t)))
  }, [all, dq])
  const open = customers.find((c) => c.key === openKey)

  return (
    <>
      <PageHead title="Clients" subtitle="Clients détail regroupés par numéro de téléphone, à partir des commandes enregistrées dans Supabase." />
      {orders.error && <div className="alert alert--bad" role="alert">{orders.error}</div>}
      <div className="a-toolbar">
        <input type="search" placeholder="Rechercher (nom, téléphone)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <thead><tr><th>Client</th><th>Téléphone</th><th>Wilaya</th><th>Commandes</th><th>Ventes livrées</th><th>En cours</th><th>Dernière commande</th><th /></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.key}>
                <td><strong>{c.name}</strong></td>
                <td dir="ltr"><a href={`tel:${c.phone}`}>{c.phone}</a></td>
                <td>{c.wilaya}</td>
                <td>{c.orderCount}</td>
                <td>{fmt(c.deliveredSales)}</td>
                <td>{fmt(c.openValue)}</td>
                <td>{formatDate(c.lastOrderAt, 'fr', false)}</td>
                <td className="a-rowactions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpenKey(c.key)}>Historique</button></td>
              </tr>
            ))}
            {!orders.loading && customers.length === 0 && !orders.error && <tr><td colSpan={8} className="muted a-empty">Aucun client pour le moment.</td></tr>}
            {orders.loading && !orders.data && <tr><td colSpan={8} className="muted a-empty">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">Les 300 dernières commandes sont prises en compte.</p>
      {open && (
        <Modal title={`Historique — ${open.name}`} onClose={() => setOpenKey(null)}>
          <ul className="a-list">
            {all.filter((o) => (phoneKey(o.phone) || o.phone) === open.key).map((o) => (
              <li key={o.id}>
                <span><strong dir="ltr">{o.ref}</strong><br /><small className="muted">{formatDate(o.createdAt, 'fr')}</small></span>
                <span className="a-list__right">{fmt(o.total)} <Pill tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Pill></span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  )
}
