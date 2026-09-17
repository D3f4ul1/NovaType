import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, RotateCcw, Settings2, SkipForward } from 'lucide-react'
import { AnimatedNumber } from './AnimatedNumber'
import { MotionButton } from './MotionButton'
import { StatsChart } from './StatsChart'
import { resultsList, staggerCard, tr } from '../lib/motion'
import { formatDuration, formatResultSummary } from '../lib/stats'
import { useTestStore } from '../store/useTestStore'

/**
 * Results — §9. Celebratory but restrained: counters count up, cards stagger in 60ms
 * apart, and the chart draws itself.
 *
 * Accessibility: when the screen mounts it takes focus on its heading (which is a
 * landmark rather than a live region), so the outcome is announced once, naturally,
 * instead of through a region that fires constantly during the test.
 */

export interface ResultsProps {
  reduceMotion: boolean
  onOpenSettings: () => void
}

export function Results({ reduceMotion, onOpenSettings }: ResultsProps) {
  const result = useTestStore((s) => s.result)
  const seed = useTestStore((s) => s.seed)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  /** New text, new seed. */
  const nextTest = useCallback(() => {
    useTestStore.getState().resetTest()
  }, [])

  /** The identical text again — useful for practising a passage you just fumbled. */
  const restartSame = useCallback(() => {
    useTestStore.getState().resetTest(seed)
  }, [seed])

  // Shift + Enter is the documented shortcut for "next test" from results (§12).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        nextTest()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [nextTest])

  const copyResults = useCallback(async () => {
    if (!result) return
    const text = formatResultSummary(result)

    const legacyCopy = (): boolean => {
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '-1000px'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
      } catch {
        return false
      }
    }

    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      } else {
        ok = legacyCopy()
      }
    } catch {
      // Non-secure origins and some embedded contexts refuse the async clipboard API.
      ok = legacyCopy()
    }

    setCopied(ok)
    window.setTimeout(() => setCopied(false), 2000)
  }, [result])

  if (!result) return null

  const { chars } = result

  return (
    <motion.div
      variants={resultsList}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-4xl"
    >
      <motion.h2
        ref={headingRef}
        tabIndex={-1}
        variants={staggerCard}
        transition={tr(reduceMotion, 'card')}
        className="mb-5 text-[11px] uppercase tracking-[0.28em] outline-none"
        style={{ color: 'var(--text-muted)' }}
      >
        Test complete
      </motion.h2>

      {/* ── Hero: WPM and accuracy ─────────────────────────────── */}
      <motion.div
        variants={staggerCard}
        transition={tr(reduceMotion, 'card')}
        className="panel relative mb-4 overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 top-1/2 h-56 w-72 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(closest-side, var(--accent-glow), transparent)' }}
        />
        {/*
          The divider is drawn explicitly rather than with `divide-x`: that utility only sets
          a border *width* on the children, so the colour came from Tailwind's preflight
          default (`#e5e7eb`) — a bright grey line straight through the two headline figures,
          which is exactly what made the card look sliced. The gradient also lets it dissolve
          at both ends instead of stopping dead.
        */}
        <div className="relative grid grid-cols-2">
          <div
            aria-hidden="true"
            className="absolute inset-y-6 left-1/2 w-px -translate-x-1/2"
            style={{
              background:
                'linear-gradient(to bottom, transparent, var(--border) 22%, var(--border) 78%, transparent)',
            }}
          />
          <div className="px-7 py-8">
            <div
              className="mb-1 text-[11px] uppercase tracking-[0.28em]"
              style={{ color: 'var(--text-muted)' }}
            >
              wpm
            </div>
            <AnimatedNumber
              value={result.wpm}
              reduceMotion={reduceMotion}
              className="text-6xl font-light leading-none sm:text-7xl"
              style={{
                color: 'var(--text-correct)',
                textShadow: '0 0 34px var(--accent-glow)',
              }}
            />
          </div>
          <div className="px-7 py-8">
            <div
              className="mb-1 text-[11px] uppercase tracking-[0.28em]"
              style={{ color: 'var(--text-muted)' }}
            >
              accuracy
            </div>
            <div className="flex items-baseline gap-1">
              <AnimatedNumber
                value={result.accuracy}
                reduceMotion={reduceMotion}
                className="text-6xl font-light leading-none sm:text-7xl"
                style={{ color: 'var(--accent-bright)' }}
              />
              <span className="text-2xl font-light" style={{ color: 'var(--text-muted)' }}>
                %
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Secondary stats ────────────────────────────────────── */}
      <motion.div
        variants={staggerCard}
        transition={tr(reduceMotion, 'card')}
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <StatCard label="Raw WPM" value={String(result.rawWpm)} />
        <StatCard label="Consistency" value={`${result.consistency}%`} />
        <StatCard label="WPS" value={String(result.wps)} />
        <StatCard label="Time" value={formatDuration(result.elapsedMs)} />
        <StatCard label="Errors" value={String(result.errors)} tone="error" />
      </motion.div>

      <motion.div
        variants={staggerCard}
        transition={tr(reduceMotion, 'card')}
        className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]"
      >
        {/* ── Chart ───────────────────────────────────────────── */}
        <div className="panel px-5 py-4">
          <div
            className="mb-3 text-[11px] uppercase tracking-[0.24em]"
            style={{ color: 'var(--text-muted)' }}
          >
            wpm over time
          </div>
          <StatsChart series={result.series} reduceMotion={reduceMotion} />
        </div>

        {/* ── Characters + most-missed ────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="panel px-5 py-4">
            <div
              className="mb-3 text-[11px] uppercase tracking-[0.24em]"
              style={{ color: 'var(--text-muted)' }}
            >
              characters
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <CharStat label="correct" value={chars.correct} color="#4ade80" />
              <CharStat label="incorrect" value={chars.incorrect} color="var(--text-incorrect)" />
              <CharStat label="extra" value={chars.extra} color="#fbbf24" />
              <CharStat label="missed" value={chars.missed} color="var(--text-muted)" />
            </div>
          </div>

          <div className="panel flex-1 px-5 py-4">
            <div
              className="mb-3 text-[11px] uppercase tracking-[0.24em]"
              style={{ color: 'var(--text-muted)' }}
            >
              most missed
            </div>
            {result.missedChars.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nothing missed. Clean run.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {result.missedChars.map((missed) => (
                  <li
                    key={missed.char}
                    className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-veil)' }}
                  >
                    <kbd
                      className="rounded border px-1.5 py-0.5 text-xs"
                      style={{
                        borderColor: 'var(--border)',
                        color: 'var(--text-correct)',
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--bg-elevated)',
                      }}
                    >
                      {missed.char}
                    </kbd>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-incorrect)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {missed.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Actions ────────────────────────────────────────────── */}
      <motion.div
        variants={staggerCard}
        transition={tr(reduceMotion, 'card')}
        className="flex flex-wrap items-center gap-2.5"
      >
        <MotionButton
          label="Restart the same text"
          variant="primary"
          onClick={restartSame}
          reduceMotion={reduceMotion}
          title="Restart — same text (Tab then Enter)"
          className="px-5 py-2.5"
        >
          <RotateCcw size={15} aria-hidden="true" />
          Restart
        </MotionButton>

        <MotionButton
          label="Next test with new text"
          onClick={nextTest}
          reduceMotion={reduceMotion}
          title="Next test — new text (Shift + Enter)"
          className="px-5 py-2.5"
        >
          <SkipForward size={15} aria-hidden="true" />
          Next Test
        </MotionButton>

        <MotionButton
          label="Copy results to clipboard"
          onClick={() => void copyResults()}
          reduceMotion={reduceMotion}
          className="px-5 py-2.5"
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy Results'}
        </MotionButton>

        <MotionButton
          label="Back to settings"
          onClick={onOpenSettings}
          reduceMotion={reduceMotion}
          className="px-5 py-2.5"
        >
          <Settings2 size={15} aria-hidden="true" />
          Settings
        </MotionButton>

        <span
          className="ml-auto text-[11px] tracking-wide"
          style={{ color: 'var(--text-muted)' }}
          aria-hidden="true"
        >
          shift + enter for a new test
        </span>
      </motion.div>
    </motion.div>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'error'
}) {
  return (
    <div className="panel px-4 py-3">
      <div
        className="mb-1 text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-light"
        style={{
          color: tone === 'error' && Number(value) > 0 ? 'var(--text-incorrect)' : 'var(--text-correct)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function CharStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className="text-[11px] uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <span
        className="text-lg"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  )
}
