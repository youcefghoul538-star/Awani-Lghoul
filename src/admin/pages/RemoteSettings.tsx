import { useState, type FormEvent } from 'react'
import { Field } from '../../components/Form'
import { useToast } from '../../components/Toast'
import { loadCatalog } from '../../state/catalog'
import { requireSupabase } from '../../lib/supabase'
import type { Settings } from '../../types'
import {
  fetchAdminBundles,
  fetchAdminCategories,
  fetchAdminOrders,
  fetchAdminProducts,
  fetchAdminQuotes,
  fetchExpenses,
  fetchPurchases,
  fetchSettings,
  fetchSuppliers,
  fetchTraders,
  saveSettings,
} from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { NumInput, PageHead } from '../ui'

/** Public contact details and shop options, stored in Supabase (`settings`): what you save here is what the storefront shows. */
export default function RemoteSettings() {
  const settings = useRemote(() => fetchSettings(requireSupabase()))
  return (
    <>
      <PageHead title="Paramètres du site" subtitle="Enregistrés dans Supabase — affichés sur la boutique (en-tête, contact, pied de page)." />
      {settings.error && <div className="alert alert--bad" role="alert">{settings.error}</div>}
      {settings.data ? <SettingsForm key={JSON.stringify(settings.data)} initial={settings.data} onSaved={() => settings.reload()} /> : !settings.error && <p className="muted">Chargement…</p>}
      <BackupCard />
    </>
  )
}

function SettingsForm({ initial, onSaved }: { initial: Settings; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [s, setS] = useState<Settings>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await saveSettings(requireSupabase(), s)
      toast.show('Paramètres enregistrés')
      void loadCatalog()
      await onSaved()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>Entreprise</h2>
      <div className="row2">
        <Field label="Nom de l'entreprise" required>{(a) => <input id={a.id} value={s.businessName} onChange={(e) => set('businessName', e.target.value)} />}</Field>
        <Field label="Slogan">{(a) => <input id={a.id} value={s.tagline} onChange={(e) => set('tagline', e.target.value)} />}</Field>
      </div>
      <div className="row2">
        <Field label="Téléphone">{(a) => <input id={a.id} dir="ltr" value={s.phone} onChange={(e) => set('phone', e.target.value)} />}</Field>
        <Field label="WhatsApp" hint="Format international, ex. +213…">{(a) => <input id={a.id} dir="ltr" value={s.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />}</Field>
      </div>
      <div className="row2">
        <Field label="E-mail">{(a) => <input id={a.id} dir="ltr" type="email" value={s.email} onChange={(e) => set('email', e.target.value)} />}</Field>
        <Field label="Horaires">{(a) => <input id={a.id} value={s.hours} onChange={(e) => set('hours', e.target.value)} />}</Field>
      </div>
      <Field label="Adresse">{(a) => <input id={a.id} value={s.address} onChange={(e) => set('address', e.target.value)} />}</Field>

      <h2>Bandeau promotionnel</h2>
      <Field label="Texte (français)">{(a) => <input id={a.id} value={s.promoText.fr} onChange={(e) => set('promoText', { ...s.promoText, fr: e.target.value })} />}</Field>
      <div className="row2">
        <Field label="Texte (arabe)">{(a) => <input id={a.id} dir="rtl" value={s.promoText.ar ?? ''} onChange={(e) => set('promoText', { ...s.promoText, ar: e.target.value })} />}</Field>
        <Field label="Texte (anglais)">{(a) => <input id={a.id} value={s.promoText.en ?? ''} onChange={(e) => set('promoText', { ...s.promoText, en: e.target.value })} />}</Field>
      </div>

      <h2>Boutique</h2>
      <div className="row2">
        <Field label="Seuil de stock faible" hint="En dessous, « Stock limité » s'affiche.">
          {(a) => <NumInput id={a.id} value={s.lowStockThreshold} onChange={(n) => set('lowStockThreshold', n ?? 0)} />}
        </Field>
      </div>
      <p className="muted small">Réservé aux rôles owner/admin.</p>
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      <div className="a-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

/** Manual backup: downloads the business data as JSON (wholesale prices are intentionally excluded). */
function BackupCard() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      const c = requireSupabase()
      const parts = await Promise.allSettled([
        fetchAdminCategories(c), fetchAdminProducts(c), fetchAdminBundles(c), fetchAdminOrders(c), fetchAdminQuotes(c), fetchTraders(c), fetchSuppliers(c), fetchPurchases(c), fetchExpenses(c), fetchSettings(c),
      ])
      const names = ['categories', 'products', 'bundles', 'orders', 'quotes', 'traders', 'suppliers', 'purchases', 'expenses', 'settings']
      const payload: Record<string, unknown> = { exportedAt: new Date().toISOString() }
      const missing: string[] = []
      parts.forEach((p, i) => {
        if (p.status === 'fulfilled') payload[names[i]] = p.value
        else missing.push(names[i])
      })
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `sauvegarde-boutique-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.show(missing.length ? `Sauvegarde téléchargée (non inclus : ${missing.join(', ')})` : 'Sauvegarde téléchargée')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card">
      <h2>Sauvegarde</h2>
      <p className="muted">Télécharge une copie JSON des produits, packs, commandes, devis, commerçants et achats. Les prix de gros ne sont pas inclus. Faites-la régulièrement (le plan Supabase gratuit ne garantit pas de sauvegardes automatiques).</p>
      <div className="a-actions a-actions--start">
        <button type="button" className="btn btn--ghost" onClick={() => void run()} disabled={busy}>{busy ? 'Préparation…' : 'Télécharger une sauvegarde (JSON)'}</button>
      </div>
    </section>
  )
}
