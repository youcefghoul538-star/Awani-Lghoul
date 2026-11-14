import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOT_ENOUGH_DATA, round2 } from '../../domain'
import { dayKey, inPeriod, lastDayKeys, type Period } from '../../domain/time'
import { formatDate } from '../../lib/format'
import { requireSupabase } from '../../lib/supabase'
import { adminUrl } from '../base'
import { fetchAdminOrders, fetchAdminProducts, fetchAdminQuotes, fetchExpenses, fetchSaleMovements, fetchSettings, grossProfitOf } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, ORDER_STATUS, orderTone, PageHead, Pill, QUOTE_STATUS, quoteTone } from '../ui'

type Range = '7' | '30' | 'all'

/** Overview computed from Supabase (orders, quotes, stock, stock ledger, expenses). Refreshes every minute. */
export default function RemoteDashboard() {
  const orders = useRemote(() => fetchAdminOrders(requireSupabase()), 60000)
  const quotes = useRemote(() => fetchAdminQuotes(requireSupabase()), 60000)
  const products = useRemote(() => fetchAdminProducts(requireSupabase()), 60000)
  const settings = useRemote(() => fetchSettings(requireSupabase()))
  const movements = useRemote(() => fetchSaleMovements(requireSupabase()), 60000)
  const expenses = useRemote(() => fetchExpenses(requireSupabase()), 60000) // owner/admin only: staff simply see « Données insuffisantes »
  const [range, setRange] = useState<Range>('30')
  const err = orders.error || quotes.error || products.error

  const stats = useMemo(() => {
    const os = orders.data ?? []
    const qs = quotes.data ?? []
    const ps = products.data ?? []
    const threshold = settings.data?.lowStockThreshold ?? 10
    const period: Period | undefined = range === 'all' ? undefined : { fromDay: lastDayKeys(Number(range))[0], toDay: dayKey(new Date()) }
    const count = (s: string) => os.filter((o) => o.status === s).length
    const valueOf = (s: string) => round2(os.filter((o) => o.status === s).reduce((a, o) => a + o.total, 0))
    const delivered = os.filter((o) => o.status === 'delivered' && inPeriod(o.deliveredAt ?? o.createdAt, period))
    const sales = round2(delivered.reduce((a, o) => a + o.total, 0))
    const gp = grossProfitOf(delivered, movements.data ?? [])
    const ex = (expenses.data ?? []).filter((e) => inPeriod(e.date, period))
    const exTotal = expenses.data && ex.length ? round2(ex.reduce((a, e) => a + e.amount, 0)) : null
    const dayKeys = lastDayKeys(7)
    const days = dayKeys.map((k) => ({
      key: k,
      orders: os.filter((o) => dayKey(o.createdAt) === k).length,
      quotes: qs.filter((x) => dayKey(x.createdAt) === k).length,
      label: new Date(`${k}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }),
    }))
    return {
      newCount: count('new'),
      newValue: valueOf('new'),
      openCount: count('confirmed') + count('shipped'),
      openValue: round2(valueOf('confirmed') + valueOf('shipped')),
      cancelled: count('cancelled'),
      deliveredCount: delivered.length,
      sales,
      gp,
      margin: gp != null && sales > 0 ? (gp / sales) * 100 : null,
      net: gp != null && exTotal != null ? round2(gp - exTotal) : null,
      low: ps.filter((p) => p.active && p.stock > 0 && p.stock <= threshold),
      out: ps.filter((p) => p.active && p.stock <= 0),
      days,
      newQuotes: qs.filter((x) => x.status === 'new').length,
      totalQuotes: qs.length,
      recentOrders: os.slice(0, 5),
      recentQuotes: qs.slice(0, 5),
    }
  }, [orders.data, quotes.data, products.data, settings.data, movements.data, expenses.data, range])

  const max = Math.max(1, ...stats.days.map((d) => Math.max(d.orders, d.quotes)))
  const loading = (orders.loading && !orders.data) || (products.loading && !products.data)

  return (
    <>
      <PageHead title="Vue d'ensemble" subtitle="Activité de la boutique, calculée depuis Supabase." />
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      {loading && !err && <p className="muted">Chargement…</p>}
      <div className="a-toolbar">
        <label htmlFor="range">Période</label>
        <select id="range" value={range} onChange={(e) => setRange(e.target.value as Range)}>
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="all">Tout</option>
        </select>
        <small className="muted">Jours calculés en heure d’Alger · 300 dernières commandes prises en compte.</small>
      </div>
      <div className="kpis">
        <Link to={adminUrl('commandes')} className="kpi">
          <span>Demandes à confirmer</span>
          <strong>{stats.newCount}</strong>
          <small>{fmt(stats.newValue)} · stock non déduit tant qu’elles ne sont pas confirmées</small>
        </Link>
        <div className="kpi">
          <span>Commandes confirmées / expédiées</span>
          <strong>{stats.openCount}</strong>
          <small>{fmt(stats.openValue)} · {stats.cancelled} annulée(s)</small>
        </div>
        <div className="kpi">
          <span>Ventes livrées</span>
          <strong>{fmt(stats.sales)}</strong>
          <small>{stats.deliveredCount} commande(s) livrée(s)</small>
        </div>
        <div className="kpi">
          <span>Marge brute</span>
          <strong>{stats.gp == null ? NOT_ENOUGH_DATA : fmt(stats.gp)}</strong>
          <small>{stats.gp == null ? 'coûts d’achat manquants (réceptionnez vos achats)' : stats.margin == null ? '' : `${stats.margin.toFixed(1)} % des ventes`} · avant charges</small>
        </div>
        <div className="kpi">
          <span>Bénéfice net</span>
          <strong>{stats.net == null ? NOT_ENOUGH_DATA : fmt(stats.net)}</strong>
          <small>{stats.net == null ? 'marge brute ou charges manquantes' : 'marge brute − charges saisies'}</small>
        </div>
        <Link to={adminUrl('devis')} className="kpi kpi--ws">
          <span>Demandes de devis</span>
          <strong>{stats.totalQuotes}</strong>
          <small>{stats.newQuotes} à traiter</small>
        </Link>
        <Link to={adminUrl('produits')} className="kpi">
          <span>Alertes stock</span>
          <strong>{stats.low.length + stats.out.length}</strong>
          <small>{stats.out.length} rupture(s) · {stats.low.length} faible(s)</small>
        </Link>
      </div>

      <div className="a-cols">
        <section className="card">
          <h2>7 derniers jours</h2>
          <div className="bars" role="img" aria-label="Commandes et demandes de devis par jour">
            {stats.days.map((d) => (
              <div key={d.key} className="bars__col">
                <div className="bars__pair">
                  <i className="bars__bar bars__bar--o" style={{ height: `${(d.orders / max) * 100}%` }} title={`${d.orders} commande(s)`} />
                  <i className="bars__bar bars__bar--q" style={{ height: `${(d.quotes / max) * 100}%` }} title={`${d.quotes} devis`} />
                </div>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i className="bars__bar--o" /> Commandes</span>
            <span><i className="bars__bar--q" /> Devis (gros)</span>
          </div>
        </section>
        <section className="card">
          <h2>Stock à surveiller</h2>
          {stats.low.length + stats.out.length === 0 ? (
            <p className="muted">Aucune alerte.</p>
          ) : (
            <ul className="a-list">
              {[...stats.out, ...stats.low].slice(0, 8).map((p) => (
                <li key={p.id}>
                  <span>{p.name.fr} <small className="muted">{p.sku}</small></span>
                  {p.stock <= 0 ? <Pill tone="bad">Rupture</Pill> : <Pill tone="warn">{p.stock} restant(s)</Pill>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="a-cols">
        <section className="card">
          <h2>Dernières commandes</h2>
          {stats.recentOrders.length === 0 ? (
            <p className="muted">Aucune commande pour le moment.</p>
          ) : (
            <ul className="a-list">
              {stats.recentOrders.map((o) => (
                <li key={o.id}>
                  <span><strong dir="ltr">{o.ref}</strong> · {o.customerName}<br /><small className="muted">{formatDate(o.createdAt, 'fr')}</small></span>
                  <span className="a-list__right">{fmt(o.total)} <Pill tone={orderTone(o.status)}>{ORDER_STATUS[o.status]}</Pill></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Dernières demandes de devis</h2>
          {stats.recentQuotes.length === 0 ? (
            <p className="muted">Aucune demande pour le moment.</p>
          ) : (
            <ul className="a-list">
              {stats.recentQuotes.map((x) => (
                <li key={x.id}>
                  <span><strong dir="ltr">{x.ref}</strong> · {x.business.companyName}<br /><small className="muted">{formatDate(x.createdAt, 'fr')}</small></span>
                  <Pill tone={quoteTone(x.status)}>{QUOTE_STATUS[x.status]}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
