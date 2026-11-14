import { useMemo, useState } from 'react'
import { useToast } from '../../components/Toast'
import { normalizeText } from '../../lib/search'
import { requireSupabase } from '../../lib/supabase'
import { fetchAdminProducts, fetchWholesalePrices, saveWholesalePrice, type AdminProduct } from '../remote/repo'
import { useRemote } from '../remote/useRemote'
import { fmt, NumInput, PageHead, useDebounced } from '../ui'

/** PRIVATE wholesale prices in Supabase (owner/admin only through RLS). Never shown on the storefront. */
export default function RemoteWholesalePricing() {
  const products = useRemote(() => fetchAdminProducts(requireSupabase()))
  const prices = useRemote(() => fetchWholesalePrices(requireSupabase()))
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const list = useMemo(() => {
    const tokens = normalizeText(dq).split(/\s+/).filter(Boolean)
    return (products.data ?? []).filter((p) => !tokens.length || tokens.every((t) => normalizeText(`${p.name.fr} ${p.sku}`).includes(t)))
  }, [products.data, dq])
  const err = products.error || prices.error

  return (
    <>
      <PageHead title="Prix de gros (privé)" subtitle="Confidentiel : jamais affiché sur la boutique. Réservé aux rôles owner/admin. Jamais calculé à partir du prix de détail." />
      {err && <div className="alert alert--bad" role="alert">{err}</div>}
      <div className="a-toolbar">
        <input type="search" placeholder="Rechercher (nom, SKU)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
      </div>
      <div className="a-tablewrap">
        <table className="a-table">
          <thead><tr><th>Produit</th><th>SKU</th><th>Prix détail</th><th>Prix de gros (DA)</th><th>Qté min.</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <Row key={`${p.id}:${prices.data?.get(p.id)?.price ?? ''}:${prices.data?.get(p.id)?.minQty ?? ''}`} p={p} current={prices.data?.get(p.id)} onSaved={() => prices.reload()} />
            ))}
            {!products.loading && list.length === 0 && <tr><td colSpan={6} className="muted a-empty">Aucun produit.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Row({ p, current, onSaved }: { p: AdminProduct; current?: { price: number; minQty?: number }; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [price, setPrice] = useState<number | undefined>(current?.price)
  const [minQty, setMinQty] = useState<number | undefined>(current?.minQty)
  const [busy, setBusy] = useState(false)
  const dirty = price !== current?.price || minQty !== current?.minQty
  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      await saveWholesalePrice(requireSupabase(), p.id, price, minQty)
      toast.show('Prix de gros enregistré')
      await onSaved()
    } catch (e) {
      toast.show(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <tr>
      <td><strong>{p.name.fr}</strong></td>
      <td><code>{p.sku}</code></td>
      <td>{fmt(p.salePrice ?? p.price)}</td>
      <td><NumInput value={price} onChange={setPrice} width={110} /></td>
      <td><NumInput value={minQty} onChange={setMinQty} width={70} /></td>
      <td className="a-rowactions"><button type="button" className="btn btn--primary btn--sm" disabled={!dirty || busy} onClick={() => void save()}>{busy ? '…' : 'Enregistrer'}</button></td>
    </tr>
  )
}
