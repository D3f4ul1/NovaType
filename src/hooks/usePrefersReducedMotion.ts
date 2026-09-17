import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function systemPrefers(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

/**
 * Tracks the OS "reduce motion" setting live, so the app follows it without a reload
 * when the user changes it. This is the `auto` leg of the reduce-motion preference;
 * `resolveReduceMotion` in lib/motion.ts combines it with the explicit on/off override.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(systemPrefers)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefers(event.matches)
    mql.addEventListener('change', onChange)
    setPrefers(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return prefers
}
