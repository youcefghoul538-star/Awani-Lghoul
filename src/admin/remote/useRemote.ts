import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * In-memory cache (stale-while-revalidate): going back to a page shows the last data instantly and refreshes it
 * in the background. It lives only in memory (never written to disk) and is wiped at sign-out.
 */
const cache = new Map<string, unknown>()
export function clearRemoteCache(): void {
  cache.clear()
}

/** Loads async data; `reload()` refetches. `pollMs` keeps a list fresh (e.g. new orders). Keeps stale rows on error. */
export function useRemote<T>(load: () => Promise<T>, pollMs = 0, key: unknown = null) {
  const cacheKey = `${load.toString()}|${String(key)}`
  const [data, setData] = useState<T | null>(() => (cache.has(cacheKey) ? (cache.get(cacheKey) as T) : null))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(() => !cache.has(cacheKey))
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  const alive = useRef(true)

  const reload = useCallback(async () => {
    try {
      const next = await loadRef.current()
      if (!alive.current) return
      cache.set(cacheKey, next)
      setData(next)
      setError('')
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [cacheKey])

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
