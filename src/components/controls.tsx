import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Shared form controls.
 *
 * These started life inside the settings panel, but the typing bar needs the same
 * vocabulary for its duration and word-count pickers, and two hand-rolled segmented
 * controls that drift apart is exactly the kind of thing that makes an interface feel
 * unconsidered. One implementation, one look, in both places.
 */

/* ══════════════════════════════════════════════════════════════
   Segmented control
   ══════════════════════════════════════════════════════════════ */

export interface SegmentedOption {
  id: string
  label: string
  /** Small muted unit shown after the label, e.g. the `s` in `15s`. */
  suffix?: string
  /** Native tooltip, for options whose meaning is not obvious from the label alone. */
  title?: string
}

export interface SegmentedProps {
  /** Unique per group: Framer animates the active pill between options with it. */
  groupId: string
  value: string
  options: SegmentedOption[]
  onChange: (id: string) => void
  label: string
  reduceMotion: boolean
  /**
   * `xs` exists for controls that sit in the typing bar beside the wordmark, where every
   * pixel of horizontal room is contested by the centred mode switch.
   */
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

export function Segmented({
  groupId,
  value,
  options,
  onChange,
  label,
  reduceMotion,
  size = 'sm',
  className = '',
}: SegmentedProps) {
  const pad =
    size === 'md'
      ? 'px-2.5 py-1.5 text-xs'
      : size === 'xs'
        ? 'px-1.5 py-1 text-[10px]'
        : 'px-2 py-1 text-[11px]'
  const radius = size === 'md' ? 'rounded-lg' : 'rounded-md'

  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-0.5 rounded-xl border p-0.5 ${className}`}
      style={{ borderColor: 'var(--border)', background: 'var(--surface-veil)' }}
    >
      {options.map((option) => {
        const isActive = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isActive}
            title={option.title}
            onClick={() => onChange(option.id)}
            className={`relative ${radius} ${pad} font-medium transition-colors`}
            style={{ color: isActive ? 'var(--text-correct)' : 'var(--text-muted)' }}
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-${groupId}`}
                className={`absolute inset-0 ${radius}`}
                style={{
                  background: 'color-mix(in srgb, var(--accent) 24%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                }}
                transition={
                  reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            )}
            <span className="relative whitespace-nowrap">
              {option.label}
              {option.suffix && <span style={{ color: 'var(--text-muted)' }}>{option.suffix}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Slider
   ══════════════════════════════════════════════════════════════ */

export interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  label: string
  format: (value: number) => string
  reduceMotion: boolean
}

/** Snaps a raw ratio to the nearest step and clamps it into range. */
function snap(raw: number, min: number, max: number, step: number): number {
  const steps = Math.round((raw - min) / step)
  const value = min + steps * step
  const clamped = Math.min(max, Math.max(min, value))
  // Steps like 0.005 accumulate binary float dust; six decimals is plenty for a display.
  return Math.round(clamped * 1e6) / 1e6
}

/**
 * A custom slider rather than `<input type="range">`.
 *
 * The native control cannot be styled consistently across browsers — its track and thumb
 * live in shadow DOM in WebKit and are painted by the platform in Firefox — and the
 * design calls for a specific pill track with a soft glass thumb. Everything the native
 * element gives you for free is therefore implemented here: pointer dragging with capture,
 * full keyboard support, and the complete `role="slider"` ARIA surface.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format,
  reduceMotion,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const ratio = max > min ? (value - min) / (max - min) : 0
  const percent = Math.min(100, Math.max(0, ratio * 100))

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0) return
      const raw = min + ((clientX - rect.left) / rect.width) * (max - min)
      onChange(snap(raw, min, max, step))
    },
    [min, max, step, onChange],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    setFromClientX(event.clientX)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setFromClientX(event.clientX)
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const big = step * 10
    let next: number | null = null
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step
        break
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step
        break
      case 'PageDown':
        next = value - big
        break
      case 'PageUp':
        next = value + big
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
      default:
        return
    }
    event.preventDefault()
    onChange(snap(next, min, max, step))
  }

  // While the pointer is down the thumb has to track the finger exactly; afterwards the
  // short transition is what makes a keyboard nudge and a click-on-track feel smooth.
  const animate = !dragging && !reduceMotion

  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative flex h-9 flex-1 cursor-pointer touch-none select-none items-center rounded-full border px-4 outline-offset-2"
        style={{
          borderColor: dragging
            ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
            : 'var(--border)',
          background: 'var(--surface-veil-strong)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <div
          ref={trackRef}
          className="relative h-[3px] w-full rounded-full"
          style={{ background: 'var(--track-veil)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${percent}%`,
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--accent) 65%, transparent), var(--accent-bright))',
              boxShadow: percent > 0 ? '0 0 12px -2px var(--accent-glow)' : 'none',
              transition: animate ? 'width 120ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            }}
          />
          <div
            className="absolute top-1/2"
            style={{
              left: `${percent}%`,
              width: 22,
              height: 14,
              transform: 'translate(-50%, -50%)',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--bg-elevated) 80%, white 10%)',
              border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
              boxShadow: dragging
                ? '0 0 20px -2px var(--accent-glow)'
                : '0 0 14px -4px var(--accent-glow)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              transition: animate ? 'left 120ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            }}
          >
            {/* The thin highlight through the grip, as in the reference design. */}
            <span
              className="absolute left-[5px] right-[5px] top-1/2 -translate-y-1/2 rounded-full"
              style={{ height: 1, background: 'color-mix(in srgb, var(--accent-bright) 65%, transparent)' }}
            />
          </div>
        </div>
      </div>

      <span
        className="shrink-0 text-right text-[11px]"
        style={{
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          width: 52,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {format(value)}
      </span>
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════
   Number field
   ══════════════════════════════════════════════════════════════ */

export interface NumberFieldProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
  /** Suffix rendered inside the field's trailing edge. */
  suffix?: string
  width?: number
  onFocusChange?: (focused: boolean) => void
}

/**
 * A small numeric input for the custom duration and word-count fields.
 *
 * The field holds its own string so intermediate states stay editable — a half-typed
 * "120" passes through "1" and "12", and forcing those through the clamp would fight the
 * user. Only complete, in-range values are committed; the store clamps the rest.
 */
export function NumberField({
  value,
  min,
  max,
  onChange,
  label,
  suffix,
  width = 74,
  onFocusChange,
}: NumberFieldProps) {
  const [text, setText] = useState(String(value))

  // Adopt external changes (preset clicks, a reset) unless the user is mid-edit.
  const focusedRef = useRef(false)
  useEffect(() => {
    if (!focusedRef.current) setText(String(value))
  }, [value])

  const commit = (raw: string) => {
    setText(raw)
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return
    if (parsed < min || parsed > max) return
    onChange(parsed)
  }

  return (
    <span
      className="flex items-center gap-1 rounded-lg border px-2 py-1"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-veil-strong)' }}
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={text}
        onChange={(event) => commit(event.target.value.replace(/[^\d]/g, ''))}
        onFocus={() => {
          focusedRef.current = true
          onFocusChange?.(true)
        }}
        onBlur={() => {
          focusedRef.current = false
          onFocusChange?.(false)
          if (Number.parseInt(text, 10) !== value) setText(String(value))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        spellCheck={false}
        autoComplete="off"
        className="bg-transparent text-center text-[12px] outline-none"
        style={{ width, color: 'var(--text-correct)', fontFamily: 'var(--font-mono)' }}
      />
      {suffix && (
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {suffix}
        </span>
      )}
    </span>
  )
}
