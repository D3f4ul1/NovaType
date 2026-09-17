import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { PerSecondPoint } from '../types'
import { tr } from '../lib/motion'

/**
 * WPM over time — §9.
 *
 * Hand-rolled SVG rather than a charting dependency: it needs exactly two lines, error
 * dots, and a stroke-dashoffset reveal, and Framer Motion drives `pathLength` natively.
 *
 * The chart measures its container and draws in real pixel coordinates instead of
 * stretching a viewBox with `preserveAspectRatio="none"`, which would distort both the
 * stroke weights and the error dots.
 */

const HEIGHT = 232
const PAD = { top: 18, right: 12, bottom: 26, left: 38 }

export interface StatsChartProps {
  series: PerSecondPoint[]
  reduceMotion: boolean
}

interface Point {
  x: number
  y: number
}

/** Cubic through the points with horizontal tangents — smooth without overshooting. */
function buildPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = (b.x - a.x) / 3
    d += ` C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}

export function StatsChart({ series, reduceMotion }: StatsChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0
      if (measured > 0) setWidth(measured)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const maxValue = Math.max(
      10,
      ...series.map((p) => Math.max(p.wpm, p.rawWpm)),
    )
    const top = maxValue * 1.12
    const stepX = series.length > 1 ? innerW / (series.length - 1) : 0

    const toPoint = (value: number, index: number): Point => ({
      x: PAD.left + index * stepX,
      y: PAD.top + innerH - (value / top) * innerH,
    })

    const wpmPoints = series.map((p, i) => toPoint(p.wpm, i))
    const rawPoints = series.map((p, i) => toPoint(p.rawWpm, i))
    const baseline = PAD.top + innerH

    const wpmPath = buildPath(wpmPoints)
    const rawPath = buildPath(rawPoints)
    const areaPath =
      wpmPoints.length > 1
        ? `${wpmPath} L ${wpmPoints[wpmPoints.length - 1].x} ${baseline} L ${wpmPoints[0].x} ${baseline} Z`
        : ''

    const errorDots = series
      .map((p, i) => ({ point: toPoint(0, i), errors: p.errors, second: p.second }))
      .filter((d) => d.errors > 0)

    const ticks = [0, 0.5, 1].map((fraction) => ({
      y: PAD.top + innerH - fraction * innerH,
      label: Math.round(top * fraction),
    }))

    const lastSecond = series.length > 0 ? series[series.length - 1].second : 0

    return { wpmPath, rawPath, areaPath, errorDots, ticks, baseline, lastSecond, maxValue }
  }, [series, width])

  const strokeIn = tr(reduceMotion, 'chart')

  return (
    <div ref={wrapRef} className="w-full">
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${Math.max(width, 1)} ${HEIGHT}`}
        role="img"
        aria-label={`Words per minute over time. Peak ${Math.round(geometry.maxValue)} words per minute across ${geometry.lastSecond} seconds.`}
      >
        <defs>
          <linearGradient id="wpm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {geometry.ticks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={PAD.left}
              x2={Math.max(width - PAD.right, PAD.left + 1)}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Area under the primary line */}
        {geometry.areaPath && (
          <motion.path
            d={geometry.areaPath}
            fill="url(#wpm-area)"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: reduceMotion ? 0 : 0.35 }}
          />
        )}

        {/* Raw WPM, faint */}
        {geometry.rawPath && (
          <motion.path
            d={geometry.rawPath}
            fill="none"
            stroke="var(--accent-bright)"
            strokeWidth="1.25"
            strokeOpacity="0.3"
            strokeDasharray="4 5"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={strokeIn}
          />
        )}

        {/* WPM, primary — stroke-dashoffset reveal via pathLength */}
        {geometry.wpmPath && (
          <motion.path
            d={geometry.wpmPath}
            fill="none"
            stroke="var(--accent-bright)"
            strokeWidth="2.25"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 8px var(--accent-glow))' }}
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={strokeIn}
          />
        )}

        {/* Errors, as small red dots on the axis */}
        {geometry.errorDots.map((dot, i) => (
          <motion.circle
            key={`${dot.second}-${i}`}
            cx={dot.point.x}
            cy={geometry.baseline}
            r={3}
            fill="var(--text-incorrect)"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.25,
              delay: reduceMotion ? 0 : Math.min(1.4, 0.45 + i * 0.03),
            }}
          />
        ))}

        {/* X axis */}
        <line
          x1={PAD.left}
          x2={Math.max(width - PAD.right, PAD.left + 1)}
          y1={geometry.baseline}
          y2={geometry.baseline}
          stroke="var(--border)"
          strokeWidth="1"
        />
        <text
          x={PAD.left}
          y={HEIGHT - 8}
          fontSize="10"
          fill="var(--text-muted)"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          0s
        </text>
        <text
          x={Math.max(width - PAD.right, PAD.left + 1)}
          y={HEIGHT - 8}
          textAnchor="end"
          fontSize="10"
          fill="var(--text-muted)"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {geometry.lastSecond}s
        </text>
      </svg>

      <div
        className="mt-2 flex flex-wrap items-center gap-5 text-[11px] uppercase tracking-[0.16em]"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[3px] w-5 rounded-full"
            style={{ background: 'var(--accent-bright)' }}
          />
          wpm
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[3px] w-5 rounded-full"
            style={{ background: 'var(--accent-bright)', opacity: 0.35 }}
          />
          raw
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: 'var(--text-incorrect)' }}
          />
          errors
        </span>
      </div>
    </div>
  )
}
