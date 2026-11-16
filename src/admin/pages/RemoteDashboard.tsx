import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { NOT_ENOUGH_DATA, round2 } from '../../domain'
import { dayKey, inPeriod, lastDayKeys, type Period } from '../../domain/time'
import { formatDate } from '../../lib/format'
import { requireSupabase } from '../../lib/supabase'
import { adminUrl } from '../base'
import { fetchAdminCategories, fetchAdminOrders, fetchAdminProducts, fetchAdminQuotes, fetchExpenses, fetchSaleMovements, fetchSettings, fetchTraders, grossProfitOf } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, ORDER_STATUS, orderTone, Pill, QUOTE_STATUS, quoteTone } from '../ui'

type Range = '7' | '30' | 'all'

/** Launch goals shown as rings. Change the targets here. */
const GOALS = { photos: 30, live: 30, traders: 30, activeTraders: 10, revenue: 1_000_000 } // revenue: premiers 100 millions de centimes = 1 000 000 DA

interface Task { id: string; text: string; done: boolean }
const TASKS_KEY = 'awani_admin_tasks_v1'
const SEED_TASKS: Task[] = [
  { id: 's1', text: 'Photographier les produits essentiels', done: false },
  { id: 's2', text: 'Ajouter les photos dans Produits & stock', done: false },
  { id: 's3', text: 'Appeler les 10 premiers commerçants (rang A)', done: false },
  { id: 's4', text: 'Imprimer les cartes de fidélité (7 cases)', done: false },
  { id: 's5', text: 'Acheter le nom de domaine .com et le relier à Vercel', done: false },
]
function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY)
    if (raw) {
      const v = JSON.parse(raw) as unknown
      if (Array.isArray(v)) return v.filter((t): t is Task => !!t && typeof (t as Task).id === 'string' && typeof (t as Task).text === 'string').map((t) => ({ id: t.id, text: t.text, done: t.done === true }))
    }
  } catch { /* storage unavailable: fall back to the starter list */ }
  return SEED_TASKS
}
function saveTasks(t: Task[]) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(t)) } catch { /* private mode: tasks stay in memory only */ }
}

/** Counts from 0 to `target` (ease-out). Respects « réduire les animations ». */
function useCountUp(target: number, ms = 1000): number {
  const [v, setV] = useState(0)
  const last = useRef(0)
  useEffect(() => {
    if (!Number.isFinite(target)) return
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { last.current = target; setV(target); return }
    let raf = 0
    const start = performance.now()
    const from = last.current
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const next = from + (target - from) * (1 - Math.pow(1 - t, 3))
      last.current = next
      setV(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
function Count({ to, format }: { to: number; format?: (n: number) => string }) {
  const v = useCountUp(to)
  return <>{format ? format(Math.round(v)) : Math.round(v)}</>
}
const rise = (i: number) => ({ '--i': i }) as CSSProperties

function Ring({ value, goal, label, hint, to, style }: { value: number; goal: number; label: string; hint: string; to: string; style?: CSSProperties }) {
  const target = goal <= 0 ? 0 : Math.min(100, (value / goal) * 100)
  const pct = useCountUp(target, 1100)
  const R = 34
  const C = 2 * Math.PI * R
  return (
    <Link to={to} className="g-ring g-in" onClick={to.startsWith('#') ? (e) => { e.preventDefault(); document.querySelector(to)?.scrollIntoView({ behavior: 'smooth' }) } : undefined} style={style} aria-label={`${label}: ${value} sur ${goal}`}>
      <svg viewBox="0 0 80 80" width="84" height="84" aria-hidden="true">
        <circle cx="40" cy="40" r={R} className="g-ring__bg" />
        <circle cx="40" cy="40" r={R} className="g-ring__fg" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 40 40)" />
        <text x="40" y="45" textAnchor="middle" className="g-ring__txt">{Math.round(pct)}%</text>
      </svg>
      <strong>{label}</strong>
      <small><Count to={value} /> / {goal}</small>
      <em>{hint}</em>
    </Link>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir'
}

function MyTasks({ tasks, setTasks }: { tasks: Task[]; setTasks: Dispatch<SetStateAction<Task[]>> }) {
  const [text, setText] = useState('')
  const add = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setTasks((cur) => [...cur, { id: `t${Date.now()}`, text: t, done: false }])
    setText('')
  }
  const left = tasks.filter((t) => !t.done).length
  return (
    <section className="card g-card g-in" id="mes-taches" style={rise(8)}>
      <div className="g-card__head">
        <h2>Mes tâches</h2>
        <span className="g-chip">{left} à faire</span>
      </div>
      <ul className="g-tasks">
        {tasks.map((t) => (
          <li key={t.id} className={t.done ? 'is-done' : ''}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
              <span>{t.text}</span>
            </label>
            <button type="button" className="g-x" aria-label={`Supprimer la tâche ${t.text}`} onClick={() => setTasks((cur) => cur.filter((x) => x.id !== t.id))}>×</button>
          </li>
        ))}
        {tasks.length === 0 && <li className="muted">Aucune tâche. Ajoutez la première ci-dessous.</li>}
      </ul>
      <form className="g-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nouvelle tâche…" aria-label="Nouvelle tâche" maxLength={140} />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>Ajouter</button>
      </form>
      <small className="muted">Enregistrées sur cet appareil uniquement.</small>
    </section>
  )
}

/** Overview computed from Supabase (orders, quotes, stock, stock ledger, expenses). Refreshes every minute. */
export default function RemoteDashboard() {
  const orders = useRemote(() => fetchAdminOrders(requireSupabase()), 60000)
  const quotes = useRemote(() => fetchAdminQuotes(requireSupabase()), 60000)
  const products = useRemote(() => fetchAdminProducts(requireSupabase()), 60000)
  const settings = useRemote(() => fetchSettings(requireSupabase()))
  const movements = useRemote(() => fetchSaleMovements(requireSupabase()), 60000)
  const categories = useRemote(() => fetchAdminCategories(requireSupabase()), 120000)
  const traders = useRemote(() => fetchTraders(requireSupabase()), 120000)
  const expenses = useRemote(() => fetchExpenses(requireSupabase()), 60000) // owner/admin only: staff simply see « Données insuffisantes »
  const [range, setRange] = useState<Range>('30')
  const [tasks, setTasks] = useState<Task[]>(loadTasks)
  useEffect(() => saveTasks(tasks), [tasks])
  const doneTasks = tasks.filter((t) => t.done).length
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
    const cats = categories.data ?? []
    const trs = traders.data ?? []
    const today = dayKey(new Date())
    return {
      salesAll: round2(os.filter((o) => o.status === 'delivered').reduce((a, o) => a + o.total, 0)),
      withPhoto: ps.filter((p) => p.image).length,
      liveCount: ps.filter((p) => p.active).length,
      catActive: cats.filter((c) => c.active).length,
      catTotal: cats.length,
      traderCount: trs.length,
      traderActive: trs.filter((t) => t.status === 'active').length,
      followUps: trs.filter((t) => t.status !== 'inactive' && t.followUpDate && t.followUpDate <= today).length,
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
  }, [orders.data, quotes.data, products.data, settings.data, movements.data, expenses.data, categories.data, traders.data, range])

  const max = Math.max(1, ...stats.days.map((d) => Math.max(d.orders, d.quotes)))
  const loading = (orders.loading && !orders.data) || (products.loading && !products.data)

  return (
    <>
      <header className="g-hero g-in" style={rise(0)}>
        <div>
          <p className="g-hero__date">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{greeting()} 👋</h1>
          <p className="muted">Voici où en est le lancement de votre boutique.</p>
        </div>
        <div className="g-hero__actions">
          <Link to={adminUrl('produits')} className="btn btn--primary btn--sm">+ Produit</Link>
          <Link to={adminUrl('commercants')} className="btn btn--ghost btn--sm">Commerçants</Link>
          <Link to={adminUrl('commandes')} className="btn btn--ghost btn--sm">Commandes</Link>
        </div>
      </header>
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      {loading && !err && <p className="muted">Chargement…</p>}

      <section className="g-big" aria-label="Objectifs principaux">
        <div className="g-big__card">
          <Ring style={rise(3)} value={doneTasks} goal={Math.max(1, tasks.length)} label="Objectif : mes tâches" hint={doneTasks >= tasks.length && tasks.length > 0 ? 'Bravo, tout est fait ✅' : 'Cochez vos tâches ci-dessous'} to="#mes-taches" />
        </div>
        <div className="g-big__card g-money g-in" style={rise(2)}>
          <span className="g-money__tag">🎯 Premier objectif</span>
          <strong className="g-money__title">Les premiers 100 millions de centimes</strong>
          <p className="g-money__amount"><b><Count to={Math.min(stats.salesAll, GOALS.revenue)} format={fmt} /></b> <span>sur {fmt(GOALS.revenue)}</span></p>
          <div className="g-bar" role="progressbar" aria-valuemin={0} aria-valuemax={GOALS.revenue} aria-valuenow={Math.min(stats.salesAll, GOALS.revenue)} aria-label="Progression vers 1 000 000 DA de ventes livrées">
            <i style={{ width: `${Math.min(100, (stats.salesAll / GOALS.revenue) * 100)}%` }} className="g-bar__fill" />
          </div>
          <small>{stats.salesAll >= GOALS.revenue ? 'Objectif atteint, félicitations !' : `Encore ${fmt(GOALS.revenue - stats.salesAll)} de ventes livrées · ${((stats.salesAll / GOALS.revenue) * 100).toFixed(1)} %`}</small>
        </div>
      </section>

      <section className="g-goals" aria-label="Objectifs de lancement">
        <Ring style={rise(4)} value={stats.withPhoto} goal={GOALS.photos} label="Produits photographiés" hint="Ajouter des photos" to={adminUrl('produits')} />
        <Ring style={rise(5)} value={stats.liveCount} goal={GOALS.live} label="Produits en ligne" hint="Activer les essentiels" to={adminUrl('produits')} />
        <Ring style={rise(6)} value={stats.catActive} goal={Math.max(1, stats.catTotal)} label="Catégories actives" hint="Après les photos" to={adminUrl('categories')} />
        <Ring style={rise(7)} value={stats.traderCount} goal={GOALS.traders} label="Commerçants ajoutés" hint="Liste de prospects" to={adminUrl('commercants')} />
        <Ring style={rise(8)} value={stats.traderActive} goal={GOALS.activeTraders} label="Commerçants actifs" hint="Premiers clients gros" to={adminUrl('commercants')} />
      </section>

      <div className="a-cols">
        <MyTasks tasks={tasks} setTasks={setTasks} />
        <section className="card g-card g-in" style={rise(9)}>
          <div className="g-card__head"><h2>À traiter maintenant</h2></div>
          <ul className="g-todo">
            <li><Link to={adminUrl('commandes')}><span>Nouvelles demandes de commande</span><b>{stats.newCount}</b></Link></li>
            <li><Link to={adminUrl('devis')}><span>Demandes de devis à traiter</span><b>{stats.newQuotes}</b></Link></li>
            <li><Link to={adminUrl('commercants')}><span>Commerçants à relancer aujourd’hui</span><b>{stats.followUps}</b></Link></li>
            <li><Link to={adminUrl('produits')}><span>Alertes de stock</span><b>{stats.low.length + stats.out.length}</b></Link></li>
          </ul>
          {stats.newCount + stats.newQuotes + stats.followUps + stats.low.length + stats.out.length === 0 && <p className="muted">Tout est à jour pour le moment. ✅</p>}
        </section>
      </div>

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
        <Link to={adminUrl('commandes')} className="kpi g-in" style={rise(10)}>
          <span>Demandes à confirmer</span>
          <strong><Count to={stats.newCount} /></strong>
          <small>{fmt(stats.newValue)} · stock non déduit tant qu’elles ne sont pas confirmées</small>
        </Link>
        <div className="kpi g-in" style={rise(11)}>
          <span>Commandes confirmées / expédiées</span>
          <strong><Count to={stats.openCount} /></strong>
          <small>{fmt(stats.openValue)} · {stats.cancelled} annulée(s)</small>
        </div>
        <div className="kpi g-in" style={rise(12)}>
          <span>Ventes livrées</span>
          <strong><Count to={stats.sales} format={fmt} /></strong>
          <small>{stats.deliveredCount} commande(s) livrée(s)</small>
        </div>
        <div className="kpi g-in" style={rise(13)}>
          <span>Marge brute</span>
          <strong>{stats.gp == null ? NOT_ENOUGH_DATA : <Count to={stats.gp} format={fmt} />}</strong>
          <small>{stats.gp == null ? 'coûts d’achat manquants (réceptionnez vos achats)' : stats.margin == null ? '' : `${stats.margin.toFixed(1)} % des ventes`} · avant charges</small>
        </div>
        <div className="kpi g-in" style={rise(14)}>
          <span>Bénéfice net</span>
          <strong>{stats.net == null ? NOT_ENOUGH_DATA : <Count to={stats.net} format={fmt} />}</strong>
          <small>{stats.net == null ? 'marge brute ou charges manquantes' : 'marge brute − charges saisies'}</small>
        </div>
        <Link to={adminUrl('devis')} className="kpi kpi--ws g-in" style={rise(15)}>
          <span>Demandes de devis</span>
          <strong><Count to={stats.totalQuotes} /></strong>
          <small>{stats.newQuotes} à traiter</small>
        </Link>
        <Link to={adminUrl('produits')} className="kpi g-in" style={rise(16)}>
          <span>Alertes stock</span>
          <strong><Count to={stats.low.length + stats.out.length} /></strong>
          <small>{stats.out.length} rupture(s) · {stats.low.length} faible(s)</small>
        </Link>
      </div>

      <div className="a-cols">
        <section className="card">
          <h2>7 derniers jours</h2>
          {stats.days.every((d) => d.orders + d.quotes === 0) && <p className="muted g-empty">Pas encore d’activité cette semaine. Les barres apparaîtront avec les premières commandes.</p>}
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
