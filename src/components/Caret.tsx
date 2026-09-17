import { motion } from 'framer-motion'
import type { Transition } from 'framer-motion'
import type { CaretStyle } from '../types'
import { TRANSITIONS } from '../lib/motion'

/**
 * The caret — brief §5.4.
 *
 * It is a single element parked inside the scrolling container, positioned from a
 * measurement of the active character rather than re-rendered per character.
 *
 * The axis split is the whole design, and it took a correction to get right:
 *
 * • `x` springs (critically damped, no bounce, per §5.4) so horizontal movement between
 *   characters is smooth rather than a jump.
 * • `y` is **instant**, not tweened. The caret sits inside the scrolling container beside
 *   the text, so the container's own scroll transform already carries it up with the line
 *   it belongs to. Tweening `y` as well used to cancel that motion exactly, which held the
 *   caret still in the viewport while the character it marks slid a full line away — for
 *   the duration of every wrap the caret floated over the wrong text, and when the line
 *   was also entering or leaving the viewport's fade it simply looked gone. Setting `y`
 *   immediately and letting the transform do the animating keeps the caret pinned to its
 *   own character for every frame of the scroll.
 */

export interface CaretProps {
  x: number
  y: number
  /** Width of the character under the caret, used by the block and underline styles. */
  charWidth: number
  lineBox: number
  caretStyle: CaretStyle
  visible: boolean
  blink: boolean
  smooth: boolean
  reduceMotion: boolean
  glowIntensity: number
}

export function Caret({
  x,
  y,
  charWidth,
  lineBox,
  caretStyle,
  visible,
  blink,
  smooth,
  reduceMotion,
  glowIntensity,
}: CaretProps) {
  if (!visible) return null

  const still: Transition = { duration: 0 }

  const transition: Transition = reduceMotion
    ? still
    : {
        x: smooth ? TRANSITIONS.caret : still,
        y: still,
      }

  // The glow scales with the intensity setting *and* with `--glow-strength`, which is the
  // variable the Effects switch zeroes. Multiplying by it in `calc` means "glows off" reaches
  // the caret the same way it reaches every other shadow in the app, instead of the caret
  // needing to be told separately — and it stays exact at every intensity in between.
  const glow = Math.round(8 * glowIntensity)
  const glowShadow = `0 0 calc(${glow}px * var(--glow-strength)) var(--accent-glow)`
  const blockWidth = Math.max(charWidth, lineBox * 0.34)

  let inner: React.CSSProperties
  if (caretStyle === 'block') {
    inner = {
      width: blockWidth,
      height: lineBox * 0.78,
      marginTop: lineBox * 0.11,
      borderRadius: 2,
      background: 'color-mix(in srgb, var(--caret) 34%, transparent)',
      border: '1px solid color-mix(in srgb, var(--caret) 55%, transparent)',
    }
  } else if (caretStyle === 'underline') {
    inner = {
      width: blockWidth,
      height: 2,
      marginTop: lineBox - 5,
      borderRadius: 2,
      background: 'var(--caret)',
      boxShadow: glowShadow,
    }
  } else {
    inner = {
      width: 2,
      height: lineBox * 0.74,
      marginTop: lineBox * 0.13,
      borderRadius: 1,
      background: 'var(--caret)',
      boxShadow: glowShadow,
    }
  }

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-10"
      style={{ height: lineBox, willChange: 'transform' }}
      initial={false}
      animate={{ x, y, opacity: visible ? 1 : 0 }}
      transition={transition}
    >
      <div className={blink ? 'animate-caret-blink' : undefined} style={inner} />
    </motion.div>
  )
}
