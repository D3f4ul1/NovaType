import { useCallback, useEffect, useState } from 'react'

/**
 * Soft edges for a scroll container.
 *
 * A scrollable panel clips its content at a hard boundary, which slices whatever card or
 * line of text happens to straddle it — visible as a bright straight cut across the top of
 * the results screen. Masking the container's own edges dissolves that content instead.
 *
 * The mask is only applied on a side that actually has content beyond it: fading the top
 * when the container is already scrolled to the top would just dim the first heading for
 * no reason. The scroll position decides, so the edges fade in and out as you move.
 *
 * This hands back a *callback* ref rather than a `useRef` object, and that detail matters:
 * the results container is rendered conditionally and remounted per test, so an effect
 * keyed on mount would run once — while the element did not exist yet — and never attach
 * a listener at all.
 */

/** Distance over which the content dissolves, in px. */
const FADE = 40

export interface ScrollEdgeFade<T extends HTMLElement> {
  setRef: (node: T | null) => void
  maskImage: string | undefined
  maskWebkit: string | undefined
}

export function useScrollEdgeFade<T extends HTMLElement>(): ScrollEdgeFade<T> {
  const [el, setEl] = useState<T | null>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })

  const setRef = useCallback((node: T | null) => setEl(node), [])

  useEffect(() => {
    if (!el) {
      setEdges({ top: false, bottom: false })
      return
    }

    const update = () => {
      const atTop = el.scrollTop <= 2
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      const next = { top: !atTop, bottom: !atBottom }
      setEdges((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    // Content height changes as the cards stagger in and the chart measures itself.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [el])

  if (!edges.top && !edges.bottom) {
    return { setRef, maskImage: undefined, maskWebkit: undefined }
  }

  const inner = `calc(100% - ${FADE}px)`
  const innerSoft = `calc(100% - ${Math.round(FADE * 0.45)}px)`
  const stops: string[] = []
  if (edges.top) stops.push(`transparent 0px, rgb(0 0 0 / 0.3) ${Math.round(FADE * 0.45)}px, #000 ${FADE}px`)
  if (edges.bottom) stops.push(`#000 ${inner}, rgb(0 0 0 / 0.3) ${innerSoft}, transparent 100%`)

  const gradient = `linear-gradient(to bottom, ${stops.join(', ')})`
  return { setRef, maskImage: gradient, maskWebkit: gradient }
}
