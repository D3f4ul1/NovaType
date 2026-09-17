import type { Transition, Variants } from 'framer-motion'
import type { ReduceMotionPref } from '../types'

/**
 * All animation timing lives here — brief §11.
 *
 * Split of responsibilities, deliberate:
 *  • Framer Motion drives every structural transition (screens, focus mode, line
 *    scroll, caret, results, buttons).
 *  • Per-character keystroke feedback uses CSS keyframes declared in
 *    tailwind.config.js. With a full 200-word buffer on screen there can be
 *    >1000 characters mounted; wrapping each in a `motion.span` would cost far
 *    more than the 4ms/keystroke budget the brief sets in §13. The keyframes are
 *    the same durations and easings as their Framer counterparts.
 */

/** The brief's signature curve. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

/**
 * Line-scroll duration in seconds — §5.3's 250ms. Kept as a number as well as a transition
 * because the viewport scales it with the distance scrolled, and the two must not drift.
 */
export const LINE_SCROLL_SECONDS = 0.25

export const TRANSITIONS = {
  /** Top bar out / in — 300ms ease-out (§5.2). */
  focusChrome: { duration: 0.3, ease: EASE_OUT } as Transition,
  /** Prompt glide — 300ms ease-out (§5.2). */
  promptGlide: { duration: 0.3, ease: EASE_OUT } as Transition,
  /** Line scroll — 250ms cubic-bezier(0.22, 1, 0.36, 1) (§5.3). */
  lineScroll: { duration: LINE_SCROLL_SECONDS, ease: EASE_OUT } as Transition,
  /** Caret follow — ~120ms spring, critically damped so it never bounces (§5.4). */
  caret: { type: 'spring', stiffness: 900, damping: 60, mass: 0.4 } as Transition,
  /** Page enter. */
  enter: { duration: 0.45, ease: EASE_OUT } as Transition,
  /** Results cards. */
  card: { duration: 0.5, ease: EASE_OUT } as Transition,
  /** Animated counters — §9 asks for ~800ms. */
  counter: { duration: 0.8, ease: EASE_OUT } as Transition,
  /** Chart draw-in. */
  chart: { duration: 1.1, ease: EASE_OUT } as Transition,
  /** Small UI responses. */
  quick: { duration: 0.18, ease: EASE_OUT } as Transition,
} as const

export type TransitionKey = keyof typeof TRANSITIONS

/** Resolves a transition, collapsing it to instant when motion is reduced. */
export function tr(reduce: boolean, key: TransitionKey): Transition {
  return reduce ? { duration: 0 } : TRANSITIONS[key]
}

export const staggerCard: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

/** 60ms apart, per §9. */
export const resultsList: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

/** Focus Mode chrome: fades out and slides up 12px (§5.2). */
export const topBarVariants: Variants = {
  idle: { opacity: 1, y: 0 },
  focused: { opacity: 0, y: -12 },
}

export const promptBlockVariants: Variants = {
  idle: { y: 0 },
  focused: { y: -40 },
}

export const timerVariants: Variants = {
  idle: { opacity: 0, y: 8 },
  focused: { opacity: 1, y: 0 },
}

/**
 * Resolves the tri-state reduce-motion preference against the OS setting.
 * 'auto' follows `prefers-reduced-motion`; 'on'/'off' are explicit overrides.
 */
export function resolveReduceMotion(pref: ReduceMotionPref, systemPrefers: boolean): boolean {
  if (pref === 'on') return true
  if (pref === 'off') return false
  return systemPrefers
}
