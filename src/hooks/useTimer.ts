import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { TestStatus } from '../types'
import { formatDuration } from '../lib/stats'

/**
 * The clock — brief §6.
 *
 * `performance.now()` deltas only. There is no `setInterval` anywhere in this file;
 * the rAF loop re-derives elapsed time from the start timestamp on every frame, so
 * a dropped frame or a throttled background tab cannot accumulate drift.
 *
 * The visible digits are written with `textContent` rather than React state. A 60Hz
 * `setState` would re-render the tree sixty times a second for a purely visual value.
 *
 * Accessibility (deliberate deviation from §13, which asks for `aria-live` on the
 * timer): a polite live region whose text changes every frame floods a screen reader
 * with queued announcements and makes the page unusable. So the fast-updating digits
 * are `aria-hidden`, and this hook writes a *coarse* accessible value into a separate
 * visually-hidden live region — only at 10-second marks, in the final three seconds of
 * a `time` test, and once on completion.
 */

export interface UseTimerArgs {
  status: TestStatus
  startTime: number | null
  endTime: number | null
  /** Wall-clock limit in ms when the mode has one, else null. Used only for announcements. */
  limitMs: number | null
  /** Called once when a `time` test reaches its limit. */
  onExpire: () => void
  /** Suppresses the per-second pulse animation. */
  reduceMotion: boolean
}

export interface UseTimerResult {
  digitsRef: RefObject<HTMLSpanElement>
  announcerRef: RefObject<HTMLSpanElement>
}

export function useTimer({
  status,
  startTime,
  endTime,
  limitMs,
  onExpire,
  reduceMotion,
}: UseTimerArgs): UseTimerResult {
  const digitsRef = useRef<HTMLSpanElement>(null)
  const announcerRef = useRef<HTMLSpanElement>(null)
  const lastPaintRef = useRef<string>('')
  const lastSecondRef = useRef(-1)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const paint = useCallback(
    (
      elapsedMs: number,
      opts: { pulse: boolean; announceComplete: boolean; force?: boolean },
    ) => {
      const digits = digitsRef.current
      const text = formatDuration(elapsedMs)
      const totalSeconds = Math.floor(elapsedMs / 1000)

      if (digits && digits.textContent !== text) {
        digits.textContent = text
      }

      // `force` lets completion announce even though the integer second may not have
      // changed (a 30s test expires on the same second it finishes on).
      const secondChanged = totalSeconds !== lastSecondRef.current
      if (!secondChanged && !opts.force) return

      // ── Per-second pulse, via the Web Animations API.
      // Restarting a CSS animation needs a forced reflow read; this does not.
      if (opts.pulse && !reduceMotion && digits) {
        digits.animate(
          [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }],
          { duration: 420, easing: 'ease-out' },
        )
      }

      // ── Coarse-cadence accessible value.
      const announcer = announcerRef.current
      if (announcer) {
        let message = ''
        if (opts.announceComplete) {
          message = `Test complete. Time ${text}.`
        } else if (limitMs != null && limitMs > 0) {
          const remaining = Math.max(0, Math.round(limitMs / 1000) - totalSeconds)
          if (remaining <= 3) message = `${remaining} seconds left.`
          else if (totalSeconds > 0 && totalSeconds % 10 === 0) message = `Elapsed ${text}.`
        } else if (totalSeconds > 0 && totalSeconds % 10 === 0) {
          message = `Elapsed ${text}.`
        }
        if (message !== '' && message !== lastPaintRef.current) {
          announcer.textContent = message
          lastPaintRef.current = message
        }
      }

      lastSecondRef.current = totalSeconds
    },
    [limitMs, reduceMotion],
  )

  // Reset the per-test bookkeeping whenever a new test starts.
  useEffect(() => {
    lastSecondRef.current = -1
    lastPaintRef.current = ''
    expiredRef.current = false
  }, [startTime])

  // Idle and finished states are painted once, with no pulse. Only completion is
  // announced — the initial idle paint must stay silent.
  useEffect(() => {
    if (status === 'running') return
    const elapsed = startTime != null && endTime != null ? endTime - startTime : 0
    paint(elapsed, { pulse: false, announceComplete: status === 'finished', force: true })
  }, [status, startTime, endTime, paint])

  // The live loop.
  useEffect(() => {
    if (status !== 'running' || startTime == null) return

    let raf = 0
    let stopped = false

    const loop = () => {
      if (stopped) return
      const elapsed = Math.max(0, performance.now() - startTime)

      if (limitMs != null && elapsed >= limitMs && !expiredRef.current) {
        expiredRef.current = true
        paint(limitMs, { pulse: false, announceComplete: true })
        onExpireRef.current()
        return
      }

      paint(elapsed, { pulse: true, announceComplete: false })
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [status, startTime, limitMs, paint])

  return { digitsRef, announcerRef }
}
