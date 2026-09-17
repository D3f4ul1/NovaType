import { useEffect } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { EASE_OUT } from '../lib/motion'

/**
 * Counts from 0 up to `value` — §9 asks for ~800ms with an ease-out curve.
 *
 * Driven by a Framer MotionValue rather than React state, so the whole animation runs
 * without a single re-render.
 */

export interface AnimatedNumberProps {
  value: number
  decimals?: number
  reduceMotion: boolean
  /** Overrides the default 800ms. */
  duration?: number
  className?: string
  style?: React.CSSProperties
}

export function AnimatedNumber({
  value,
  decimals = 0,
  reduceMotion,
  duration = 0.8,
  className,
  style,
}: AnimatedNumberProps) {
  const count = useMotionValue(reduceMotion ? value : 0)
  const text = useTransform(count, (latest) =>
    Number.isFinite(latest) ? latest.toFixed(decimals) : '0',
  )

  useEffect(() => {
    if (reduceMotion) {
      count.set(value)
      return
    }
    count.set(0)
    const controls = animate(count, value, { duration, ease: EASE_OUT })
    return () => controls.stop()
  }, [value, duration, reduceMotion, count])

  return (
    <motion.span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {text}
    </motion.span>
  )
}
