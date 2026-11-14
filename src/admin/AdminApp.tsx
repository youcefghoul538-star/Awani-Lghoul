import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useSettings } from '../state/hooks'
import { adminLogin, adminLogout, useAdminAuth } from './auth'
import { SUPABASE_CONFIGURED } from '../data/config'
import { requireSupabase } from '../lib/supabase'
import { adminUrl } from './base'
import { countNewOrders, countNewQuotes } from './remote/repo'
import RemoteBundles from './pages/RemoteBundles'
import RemoteCustomers from './pages/RemoteCustomers'
import RemoteDashboard from './pages/RemoteDashboard'
import RemotePurchases from './pages/RemotePurchases'
import RemoteCategories from './pages/RemoteCategories'
import RemoteOrders from './pages/RemoteOrders'
import RemoteProducts from './pages/RemoteProducts'
import RemoteQuotes from './pages/RemoteQuotes'
import RemoteWholesalePricing from './pages/RemoteWholesalePricing'
import RemoteSettings from './pages/RemoteSettings'
import RemoteTraders from './pages/RemoteTraders'
import '../styles/admin.css'

function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = useSettings()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const result = await adminLogin(email, pw)
    setErr(result.message ?? '')
    setBusy(false)
  }
  return (
    <div className="a-login">
      <form className="a-login__box" onSubmit={submit}>
        <div className="a-login__logo">
          <BrandLogo name={s.businessName} variant="full" className="brandlogo--login" />
        </div>
        <h1>Espace administrateur</h1>
        <div className="field">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="pw">Mot de passe</label>
          <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={Boolean(err)} required />
          {err && <div className="field__msg field__msg--error" role="alert">{err}</div>}
        </div>
        {!SUPABASE_CONFIGURED && (
          <div className="alert alert--warn" role="status">
            Connexion Supabase non configurée. Vérifiez les variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.
          </div>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={!SUPABASE_CONFIGURED || busy || !email.trim() || !pw}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="muted small a-login__note">
          Accès réservé à l’équipe de la boutique.
        </p>
        <Link to="/" className="link">
          ← Retour à la boutique
        </Link>
      </form>
    </div>
  )
}

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: adminUrl(), label: "Vue d'ensemble", end: true },
  { to: adminUrl('commandes'), label: 'Commandes détail' },
  { to: adminUrl('produits'), label: 'Produits & stock' },
  { to: adminUrl('categories'), label: 'Catégories' },
  { to: adminUrl('devis'), label: 'Demandes de devis (gros)' },
  { to: adminUrl('achats'), label: 'Achats & charges' },
  { to: adminUrl('packs'), label: 'Packs' },
  { to: adminUrl('prix-gros'), label: 'Prix de gros (privé)' },
  { to: adminUrl('clients'), label: 'Clients' },
  { to: adminUrl('commercants'), label: 'Commerçants (gros)' },
  { to: adminUrl('parametres'), label: 'Paramètres' },
]

function Shell() {
  const s = useSettings()
  const [newOrders, setNewOrders] = useState(0)
  const [newQuotes, setNewQuotes] = useState(0)
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    let alive = true
    const tick = () => {
      countNewOrders(requireSupabase()).then((n) => alive && setNewOrders(n)).catch(() => {})
      countNewQuotes(requireSupabase()).then((n) => alive && setNewQuotes(n)).catch(() => {})
    }
    void tick()
    const id = window.setInterval(tick, 30000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
  const badge = (to: string) => (to.endsWith('commandes') ? newOrders : to.endsWith('devis') ? newQuotes : 0)

  return (
    <div className="a-shell">
      <header className="a-top">
        <button type="button" className="btn btn--ghost btn--sm a-top__menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        <strong>{s.businessName} · Admin</strong>
        <Link to="/" className="link a-top__site">
          Voir la boutique
        </Link>
      </header>
      <aside className={open ? 'a-side a-side--open' : 'a-side'}>
        <div className="a-side__brand">
          <BrandLogo name={s.businessName} className="brandlogo--side" />
          <small>Administration</small>
        </div>
        <nav aria-label="Administration">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'a-nav a-nav--on' : 'a-nav')}>
              {n.label}
              {badge(n.to) > 0 && <b className="a-nav__badge">{badge(n.to)}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="a-side__foot">
          <Link to="/" className="a-nav">
            ← Voir la boutique
          </Link>
          <button type="button" className="a-nav a-nav--btn" onClick={adminLogout}>
            Se déconnecter
          </button>
        </div>
      </aside>
      <main className="a-main">
        <Outlet />
      </main>
    </div>
  )
}

export default function AdminApp() {
  const auth = useAdminAuth()
  // the admin must never be indexed by search engines
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    const title = document.title
    document.title = 'Administration'
    return () => {
      meta.remove()
      document.title = title
    }
  }, [])
  if (!auth.ready) return <div className="a-login"><p className="muted">Vérification de la session…</p></div>
  if (!auth.authenticated) return <Login />
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<RemoteDashboard />} />
        <Route path="commandes" element={<RemoteOrders />} />
        <Route path="devis" element={<RemoteQuotes />} />
        <Route path="produits" element={<RemoteProducts />} />
        <Route path="categories" element={<RemoteCategories />} />
        <Route path="stock" element={<Navigate to={adminUrl('produits')} replace />} />
        <Route path="achats" element={<RemotePurchases />} />
        <Route path="packs" element={<RemoteBundles />} />
        <Route path="prix-detail" element={<Navigate to={adminUrl('produits')} replace />} />
        <Route path="prix-gros" element={<RemoteWholesalePricing />} />
        <Route path="clients" element={<RemoteCustomers />} />
        <Route path="commercants" element={<RemoteTraders />} />
        <Route path="parametres" element={<RemoteSettings />} />
        <Route path="*" element={<Navigate to={adminUrl()} replace />} />
      </Route>
    </Routes>
  )
}
