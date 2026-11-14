import { useCallback, useEffect, useRef, useState } from 'react'

/** Loads async data; `reload()` refetches. `pollMs` keeps a list fresh (e.g. new orders). Keeps stale rows on error. */
export function useRemote<T>(load: () => Promise<T>, pollMs = 0, key: unknown = null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  const alive = useRef(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadRef.current()
      if (!alive.current) return
      setData(next)
      setError('')
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void reload()
    const id = pollMs > 0 ? window.setInterval(() => void reload(), pollMs) : 0
    return () => {
      alive.current = false
      if (id) window.clearInterval(id)
    }
  }, [reload, pollMs, key])

  return { data, error, loading, reload }
}
