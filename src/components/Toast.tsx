import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface ToastItem {
  id: number
  message: string
  to?: string
  actionLabel?: string
}
interface Ctx {
  show: (message: string, opts?: { to?: string; actionLabel?: string }) => void
}

const ToastCtx = createContext<Ctx>({ show: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const show = useCallback<Ctx['show']>((message, opts) => {
    const id = ++seq.current
    setItems((p) => [...p.slice(-2), { id, message, ...opts }])
    window.setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 3200)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.to && (
              <Link to={t.to} className="toast__action">
                {t.actionLabel}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
