import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A small typed wrapper over localStorage.
 *
 * Reads and writes are wrapped in try/catch: localStorage throws in some privacy
 * modes and when the quota is exceeded, and a settings write must never break typing.
 */

function readValue<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [stored, setStored] = useState<T>(() => readValue(key, initialValue))
  const keyRef = useRef(key)
  keyRef.current = key

  const write = useCallback((value: T | ((prev: T) => T)) => {
    setStored((prev) => {
      const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value
      try {
        window.localStorage.setItem(keyRef.current, JSON.stringify(next))
      } catch {
        /* quota or private mode — keep the in-memory value */
      }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(keyRef.current)
    } catch {
      /* ignore */
    }
    setStored(initialValue)
  }, [initialValue])

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== keyRef.current) return
      setStored(event.newValue === null ? initialValue : (JSON.parse(event.newValue) as T))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [initialValue])

  return [stored, write, clear]
}
