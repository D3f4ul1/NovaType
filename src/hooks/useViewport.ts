import { useEffect, useState } from 'react'

/**
 * The window's inner size, in CSS pixels, kept current on resize.
 *
 * The height drives the layout's collapse ladder (`lib/layout.ts`) and the number of lines in
 * the typing viewport; the width decides whether the bar's pill groups stay expanded or
 * collapse to dropdowns. Both are read from the window rather than from a container element,
 * because the thing that shrinks is the *window* — a container query would only see the change
 * one frame later, after the window has already re-laid out around it.
 */

export interface Viewport {
  width: number
  height: number
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 840 : window.innerHeight,
  }))

  useEffect(() => {
    const measure = () =>
      setViewport((previous) => {
        const next = { width: window.innerWidth, height: window.innerHeight }
        // Identity is preserved when nothing changed, so a resize event that does not move
        // the numbers (a scrollbar appearing, a zoom nudge) cannot re-render the app.
        return previous.width === next.width && previous.height === next.height ? previous : next
      })

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return viewport
}
