import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { timerVariants, tr } from '../lib/motion'
import { useTimer } from '../hooks/useTimer'
import { useSettingsStore } from '../store/useSettingsStore'
import { plannedWordLimit, useTestStore } from '../store/useTestStore'

/**
 * The timer above the prompt — §5.2 and §6.
 *
 * Structure worth knowing:
 *
 * • The digits carry `aria-hidden` and are painted imperatively by `useTimer` via
 *   `textContent`. They are a fast-updating visual instrument — a polite live region here
 *   would queue an announcement every frame and make the page unusable with a screen
 *   reader.
 * • A separate visually-hidden `role="status"` region carries the accessible value and is
 *   written at a *coarse* cadence (10-second marks, the final three seconds, completion).
 * • Every mode counts up as elapsed time. The two modes with a word target — `words`, and
 *   `custom` with one of the user's passages loaded — additionally show a completed /
 *   target readout, which is the meaningful countdown there: a time countdown is undefined
 *   in a mode with no time bound.
 * • The block keeps its height when idle (only opacity and a 8px transform animate), so
 *   nothing shifts when Focus Mode begins.
 */

export interface TimerProps {
  reduceMotion: boolean
  /**
   * A smaller face and tighter sub-line, for a window under 460px tall.
   *
   * The digits are the tallest single element in the stack, so they are where the last of the
   * height comes from when the window is dragged down to its floor. The block still keeps its
   * height while idle — only opacity and an 8px transform animate — so nothing shifts when
   * Focus Mode begins.
   */
  compact?: boolean
}

export function Timer({ reduceMotion, compact = false }: TimerProps) {
  const status = useTestStore((s) => s.status)
  const startTime = useTestStore((s) => s.startTime)
  const endTime = useTestStore((s) => s.endTime)
  const currentWordIndex = useTestStore((s) => s.currentWordIndex)

  const mode = useSettingsStore((s) => s.mode)
  const timeLimit = useSettingsStore((s) => s.timeLimit)
  const wordLimit = useSettingsStore((s) => s.wordLimit)
  const seed = useTestStore((s) => s.seed)

  const limitMs = mode === 'time' ? timeLimit * 1000 : null
  /** The word target for the modes that have one; null when the run is open-ended. */
  const wordTarget =
    mode === 'words' ? wordLimit : mode === 'custom' ? plannedWordLimit(seed) : null

  const onExpire = useCallback(() => {
    useTestStore.getState().finish(performance.now())
  }, [])

  const { digitsRef, announcerRef } = useTimer({
    status,
    startTime,
    endTime,
    limitMs,
    onExpire,
    reduceMotion,
  })

  const focused = status !== 'idle'

  return (
    <motion.div
      initial={false}
      animate={focused ? 'focused' : 'idle'}
      variants={timerVariants}
      transition={tr(reduceMotion, 'enter')}
      className="pointer-events-none flex flex-col items-center gap-1"
    >
      <span
        ref={digitsRef}
        aria-hidden="true"
        className={`min-w-[5ch] text-center font-extralight leading-none tracking-[0.06em] ${
          compact ? 'text-[30px]' : 'text-[42px]'
        }`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--accent-bright)',
          textShadow: '0 0 26px var(--accent-glow)',
        }}
      >
        0:00
      </span>

      {wordTarget !== null && (
        <span
          aria-hidden="true"
          className="text-[11px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.min(currentWordIndex, wordTarget)} / {wordTarget} words
        </span>
      )}

      {/* The accessible equivalent of the digits. Written coarsely, never per frame. */}
      <span
        ref={announcerRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    </motion.div>
  )
}
