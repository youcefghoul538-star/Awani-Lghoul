import { Fragment, useState } from 'react'
import { useToast } from '../../components/Toast'
import { formatDate } from '../../lib/format'
import { requireSupabase } from '../../lib/supabase'
import type { OrderStatus } from '../../types'
import { changeOrderStatus, fetchAdminOrders, NEXT_STATUS, type AdminOrder } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, Modal, ORDER_STATUS, orderTone, PageHead, Pill } from '../ui'

const ACTION_LABEL: Record<OrderStatus, string> = {
  new: 'Nouvelle',
  confirmed: 'Confirmer',
  shipped: 'Marquer expédiée',
  delivered: 'Marquer livrée',
  cancelled: 'Annuler',
}

/** Orders read from Supabase (customer checkout writes them there). Status changes go through admin_change_order_status. */
export default function RemoteOrders() {
  const toast = useToast()
  const orders = useRemote(() => fetchAdminOrders(requireSupabase()), 30000)
  const [filter, setFilter] = useState<'' | OrderStatus>('')
  const [open, setOpen] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelShipped, setCancelShipped] = useState<AdminOrder | null>(null)
  const [restock, setRestock] = useState(false)
  const list = (orders.data ?? []).filter((o) => !filter || o.status === filter)

  const move = async (o: AdminOrder, to: OrderStatus, withRestock = false) => {
    if (busyId) return
    setBusyId(o.id)
    try {
      await changeOrderStatus(requireSupabase(), o.id, to, withRestock)
      toast.show(`Commande ${o.ref} : ${ORDER_STATUS[to].toLowerCase()}`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
      await orders.reload()
    }
  }

  const onAction = (o: AdminOrder, to: OrderStatus) => {
    if (to === 'cancelled' && o.status === 'shipped') {
      setRestock(false)
      setCancelShipped(o)
    } else void move(o, to)
  }

  return (
    <>
      <PageHead
        title="Commandes détail"
        subtitle="Commandes reçues depuis la boutique (Supabase). Actualisation automatique toutes les 30 s."
        actions={<button type="button" className="btn btn--ghost" onClick={() => void orders.reload()} disabled={orders.loading}>{orders.loading ? 'Actualisation…' : 'Actualiser'}</button>}
      />
      {orders.error && (
        <div className="alert alert--bad" role="alert">
          {orders.error} <button type="button" className="btn btn--ghost btn--sm" onClick={() => void orders.reload()}>Réessayer</button>
        </div>
      )}
      <div className="a-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value as '' | OrderStatus)} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS[s]}</option>)}
        </select>
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <thead>
            <tr><th>Référence</th><th>Date</th><th>Client</th><th>Téléphone</th><th>Wilaya</th><th>Total</th><th>Statut</th><th /></tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td><code>{o.ref}</code></td>
                  <td>{formatDate(o.createdAt, 'fr')}</td>
                  <td><strong>{o.customerName}</strong></td>
                  <td><a className="link" href={`tel:${o.phone}`}>{o.phone}</a></td>
                  <td>{o.wilaya}</td>
                  <td>{fmt(o.total)}</td>
                  <td><Pill tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Pill></td>
                  <td className="a-rowactions">
                    <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
                      {open === o.id ? 'Masquer' : 'Détails'}
                    </button>
                  </td>
                </tr>
                {open === o.id && (
                  <tr>
                    <td colSpan={8}>
                      <div className="a-detail">
                        <p><strong>Adresse :</strong> {o.address}</p>
                        {o.notes && <p><strong>Notes du client :</strong> {o.notes}</p>}
                        <table className="a-table a-table--tight">
                          <thead><tr><th>Article</th><th>Qté</th><th>Prix unitaire</th><th>Sous-total</th></tr></thead>
                          <tbody>
                            {o.lines.map((l, i) => <tr key={i}><td>{l.name}</td><td>{l.qty}</td><td>{fmt(l.unitPrice)}</td><td>{fmt(l.unitPrice * l.qty)}</td></tr>)}
                          </tbody>
                        </table>
                        <div className="a-actions a-actions--start">
                          {NEXT_STATUS[o.status].map((to) => (
                            <button key={to} type="button" className={to === 'cancelled' ? 'btn btn--danger btn--sm' : 'btn btn--primary btn--sm'} disabled={busyId === o.id} onClick={() => onAction(o, to)}>
                              {ACTION_LABEL[to]}
                            </button>
                          ))}
                          {NEXT_STATUS[o.status].length === 0 && <span className="muted small">Statut final.</span>}
                        </div>
                        {o.status === 'new' && <p className="muted small">La confirmation déduit le stock ; elle échoue si le stock est insuffisant.</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!orders.loading && list.length === 0 && !orders.error && <tr><td colSpan={8} className="muted a-empty">Aucune commande.</td></tr>}
            {orders.loading && !orders.data && <tr><td colSpan={8} className="muted a-empty">Chargement…</td></tr>}
          </tbody>
        </table>
      </div>
      {cancelShipped && (
        <Modal title={`Annuler ${cancelShipped.ref}`} onClose={() => setCancelShipped(null)}>
          <p>Cette commande est déjà expédiée. Les articles doivent-ils être remis en stock ?</p>
          <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Remettre les articles en stock</label>
          <div className="a-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setCancelShipped(null)}>Retour</button>
            <button type="button" className="btn btn--danger" onClick={() => { const o = cancelShipped; setCancelShipped(null); void move(o, 'cancelled', restock) }}>Annuler la commande</button>
          </div>
        </Modal>
      )}
    </>
  )
}
