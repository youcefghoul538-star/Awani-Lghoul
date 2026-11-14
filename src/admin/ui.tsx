import { ServiceError } from '../services/common'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StorageFullError } from '../data/store'
import { formatDZD } from '../lib/format'
import type { OrderStatus, QuoteStatus } from '../types'
import { useToast } from '../components/Toast'

export const fmt = (n: number) => formatDZD(n, 'fr')

export const ORDER_STATUS: Record<OrderStatus, string> = {
  new: 'Nouvelle',
  confirmed: 'Confirmée',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}
export const QUOTE_STATUS: Record<QuoteStatus, string> = {
  new: 'Nouvelle',
  contacted: 'Contactée',
  quoted: 'Devis envoyé',
  won: 'Gagnée',
  lost: 'Perdue',
}

export function Pill({ tone, children }: { tone: 'neutral' | 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>
}

export const orderTone = (s: OrderStatus) => (s === 'new' ? 'info' : s === 'cancelled' ? 'bad' : s === 'delivered' ? 'ok' : 'warn')
export const quoteTone = (s: QuoteStatus) => (s === 'new' ? 'info' : s === 'lost' ? 'bad' : s === 'won' ? 'ok' : 'warn')

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="a-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="a-head__actions">{actions}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal__box modal__box--wide' : 'modal__box'} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Supprimer',
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div>{message}</div>
      <div className="a-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="btn btn--danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** Runs a write and turns a full-storage error into a readable toast. */
export function useSafeWrite() {
  const toast = useToast()
  return (fn: () => void, okMessage?: string): boolean => {
    try {
      fn()
      if (okMessage) toast.show(okMessage)
      return true
    } catch (e) {
      toast.show(e instanceof ServiceError ? e.message : e instanceof StorageFullError ? "Stockage de l'appareil plein : réduisez la taille des images ou supprimez des données." : String(e))
      return false
    }
  }
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

export function NumInput({
  value,
  onChange,
  placeholder,
  id,
  invalid,
  width,
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  placeholder?: string
  id?: string
  invalid?: boolean
  width?: number
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  return (
    <input
      id={id}
      inputMode="numeric"
      value={draft}
      placeholder={placeholder}
      aria-invalid={invalid}
      style={width ? { width } : undefined}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        setDraft(raw)
        onChange(raw === '' ? undefined : parseInt(raw, 10))
      }}
    />
  )
}
