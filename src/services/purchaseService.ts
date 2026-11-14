import { db, transaction } from '../data/db'
import { isPositiveInt, landedPurchase } from '../domain'
import { makeRef, uid } from '../lib/ids'
import type { InventoryMovement, Purchase } from '../types'
import { ServiceError, nowIso } from './common'
import { commitMovements } from './inventoryService'

export type PurchaseDraft = Omit<Purchase, 'id' | 'ref' | 'status' | 'createdAt' | 'receivedAt'> & { id?: string }

function validate(p: PurchaseDraft): void {
  if (!db.suppliers.get(p.supplierId)) throw new ServiceError('VALIDATION', 'Fournisseur obligatoire.', { fields: { supplierId: 'required' } })
  if (!p.items.length) throw new ServiceError('VALIDATION', 'Aucune ligne.')
  for (const it of p.items) {
    if (!db.products.get(it.productId)) throw new ServiceError('NOT_FOUND', `Produit introuvable : ${it.productId}`)
    if (!isPositiveInt(it.qty)) throw new ServiceError('VALIDATION', 'Quantité invalide.')
    if (!(it.unitCost >= 0) || !Number.isFinite(it.unitCost)) throw new ServiceError('VALIDATION', 'Coût unitaire invalide.')
  }
  for (const c of p.additionalCosts) if (!(c.amount >= 0) || !Number.isFinite(c.amount)) throw new ServiceError('VALIDATION', 'Frais invalide.')
}

export function savePurchaseDraft(draft: PurchaseDraft): Purchase {
  validate(draft)
  return transaction(() => {
    const existing = draft.id ? db.purchases.get(draft.id) : undefined
    if (existing && existing.status !== 'draft') throw new ServiceError('ALREADY_PROCESSED', 'Achat déjà reçu ou annulé : non modifiable.')
    const ref = existing?.ref ?? makeRef('ACH', db.purchases.all().map((x) => x.ref))
    const p: Purchase = { ...draft, id: existing?.id ?? uid('pur'), ref, status: 'draft', createdAt: existing?.createdAt ?? nowIso() }
    db.purchases.upsert(p)
    return p
  })
}

/** Receive a purchase: landed-cost allocation → purchase_received movements. Idempotent (status + keys). */
export function receivePurchase(id: string): Purchase {
  return transaction(() => {
    const p = db.purchases.get(id)
    if (!p) throw new ServiceError('NOT_FOUND', 'Achat introuvable.')
    if (p.status !== 'draft') throw new ServiceError('ALREADY_PROCESSED', 'Achat déjà traité.')
    validate(p)
    const at = nowIso()
    const moves: InventoryMovement[] = landedPurchase(p).map((l) => ({
      id: uid('mv'),
      productId: l.productId,
      type: 'purchase_received',
      qtyDelta: l.qty,
      totalCostCentimes: l.totalCentimes,
      refType: 'purchase',
      refId: p.id,
      refLine: l.index,
      idempotencyKey: `purchase:${p.id}:${l.index}`,
      createdAt: at,
    }))
    commitMovements(moves)
    const next: Purchase = { ...p, status: 'received', receivedAt: at }
    db.purchases.upsert(next)
    return next
  })
}

export function cancelPurchaseDraft(id: string): Purchase {
  const p = db.purchases.get(id)
  if (!p) throw new ServiceError('NOT_FOUND', 'Achat introuvable.')
  if (p.status !== 'draft') throw new ServiceError('ALREADY_PROCESSED', 'Seul un brouillon peut être annulé (un achat reçu se corrige par un retour fournisseur).')
  const next: Purchase = { ...p, status: 'cancelled' }
  db.purchases.upsert(next)
  return next
}
