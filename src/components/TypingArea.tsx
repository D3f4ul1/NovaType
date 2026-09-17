import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
import { Caret } from './Caret'
import { Word } from './Word'
import { MAX_WORDS_BEHIND, WORDS_KEPT_BEHIND } from '../lib/constants'
import { isStrictDifficulty } from '../lib/difficulty'
import { EASE_OUT, LINE_SCROLL_SECONDS, tr } from '../lib/motion'
import { MONO_FONTS } from '../lib/themes'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTestStore } from '../store/useTestStore'

/**
 * The prompt viewport — brief §5.3.
 *
 * Geometry
 * ────────
 * `lineBox` is rounded to a whole pixel (`round(fontSize × lineHeight)`) and that exact
 * value is used for the container's line-height, the characters' height *and* the
 * viewport's height (3 × lineBox). Because every one of those is the same integer, line
 * positions are exact multiples and the viewport can never change height mid-test.
 *
 * A one-line spacer sits above the text, so the active line is the second visible line
 * from the very first keystroke (not just after the first wrap) — and, because every
 * measurement is taken from a character's own `offsetTop`, the scroll anchor is expressed as
 * a *difference*: it always lands the active line `above` rows down from the top, whatever the
 * spacer and whatever the pruning have done to the block's origin.
 *
 * Two layers, one transform
 * ─────────────────────────
 * The mask that dissolves the outer lines lives on the *text* element, and the caret is
 * rendered in a sibling layer that is not masked at all. That split is the fix for a real
 * defect: with the caret inside the masked subtree it inherited the fade, so the moments
 * it was on a dissolving line — every wrap, for the length of the scroll tween — it dimmed
 * to 24% or lower and read as having vanished.
 *
 * Both layers are moved by the **same `MotionValue`**, so they cannot drift: the caret
 * stays welded to its own character for every frame of the scroll without either layer
 * having to compensate for the other.
 *
 * The caret's line is measured from the *caret's own character*, not from its word's first
 * line: a word long enough to wrap would otherwise leave the caret a line below the line
 * the viewport was centring on.
 *
 * Pruning without a jump
 * ──────────────────────
 * To keep the DOM bounded in an endless test, words behind the cursor are unmounted — but
 * only at a word that starts a line (`offsetLeft === 0`), and the removed block is replaced
 * by a spacer whose height is that word's *measured* `offsetTop` from just before the
 * prune. The word therefore lands back at exactly the offset it had, and every word below
 * it keeps its position too: pruning is geometrically invisible and nothing downstream
 * needs compensating. Measuring rather than computing also makes the invariant immune to
 * whatever the inline layout does with half-leading.
 */

export interface TypingAreaProps {
  reduceMotion: boolean
  /**
   * How many lines of prompt the window shows: 3 normally, 2 in a short window, 1 at the
   * floor. Comes from `lib/layout.ts` so the height, the scroll anchor and the mask all move
   * together — they are three views of one number, and deriving it in three places is how a
   * one-line window ends up with a three-line mask over it.
   */
  visibleLines: number
}

export function TypingArea({ reduceMotion, visibleLines }: TypingAreaProps) {
  const fontSize = useSettingsStore((s) => s.fontSize)
  const lineHeightValue = useSettingsStore((s) => s.lineHeight)
  const letterSpacing = useSettingsStore((s) => s.letterSpacing)
  const monoFont = useSettingsStore((s) => s.monoFont)
  const caretStyle = useSettingsStore((s) => s.caretStyle)
  const smoothCaret = useSettingsStore((s) => s.smoothCaret)
  const blinkCaret = useSettingsStore((s) => s.blinkCaret)
  const difficulty = useSettingsStore((s) => s.difficulty)
  const glowIntensity = useSettingsStore((s) => s.glowIntensity)

  const status = useTestStore((s) => s.status)
  const words = useTestStore((s) => s.words)
  const typed = useTestStore((s) => s.typed)
  const currentWordIndex = useTestStore((s) => s.currentWordIndex)
  const windowStart = useTestStore((s) => s.windowStart)
  const spacerHeight = useTestStore((s) => s.spacerHeight)
  const softError = useTestStore((s) => s.softError)

  const lineBox = Math.max(1, Math.round(fontSize * lineHeightValue))
  const topPad = Math.max(spacerHeight, lineBox)
  const viewportHeight = lineBox * visibleLines

  /**
   * Lines kept *above* the active one.
   *
   * The scroll anchor: the active line is placed `above` rows down from the top of the
   * viewport. With three lines that is one — the active line sits in the middle, as it always
   * has. With two or one there is no middle to sit in, so the active line takes the top row
   * and the line being typed continues below it, which is the only arrangement where the next
   * words are ever visible.
   */
  const above = Math.floor((visibleLines - 1) / 2)

  const textRef = useRef<HTMLDivElement>(null)
  /** Word elements by global word index — the only registry needed. */
  const wordRefs = useRef(new Map<number, HTMLSpanElement>())
  /** One stable ref callback per word index, so `Word`'s memo keeps working. */
  const refCallbacks = useRef(new Map<number, (el: HTMLSpanElement | null) => void>())

  const [scrollLines, setScrollLines] = useState(0)
  /** Lines the scroll moved by last time, used only to scale the tween's duration. */
  const prevScrollLinesRef = useRef(0)
  const [caretX, setCaretX] = useState(0)
  const [caretY, setCaretY] = useState(lineBox)
  const [caretWidth, setCaretWidth] = useState(0)
  const [resizeTick, setResizeTick] = useState(0)

  /**
   * The single scroll transform, shared by the text layer and the caret layer.
   *
   * A `MotionValue` rather than two `animate` props on purpose: two components animating
   * the same number independently would be two animations that merely agree, and any
   * difference in start frame would show up as the caret lagging its own character. One
   * value read by both cannot disagree with itself.
   */
  const scrollY = useMotionValue(0)

  const getRegister = useCallback((index: number) => {
    const map = refCallbacks.current
    let callback = map.get(index)
    if (!callback) {
      callback = (el: HTMLSpanElement | null) => {
        if (el) wordRefs.current.set(index, el)
        else wordRefs.current.delete(index)
      }
      map.set(index, callback)
    }
    return callback
  }, [])

  /** Drops words behind the cursor, anchored on a line start so nothing shifts. */
  const tryPrune = useCallback(() => {
    const state = useTestStore.getState()
    const active = state.currentWordIndex
    const start = state.windowStart
    if (active - start <= MAX_WORDS_BEHIND) return

    const limit = active - WORDS_KEPT_BEHIND

    // Scan *backwards* from the limit for the last word that begins a line.
    // Two reasons this has to be the last one rather than the first:
    //  • The first word of the rendered window is itself a line start, so searching
    //    forward always lands on `start` and the prune bails out forever — which is
    //    exactly how the DOM grows without bound in an endless test.
    //  • Pruning may only stop on a line start. Stopping mid-line would re-wrap the
    //    kept words and shift the layout; stopping on a line start keeps every offset
    //    below it identical.
    let anchorIndex = -1
    for (let i = limit; i > start; i--) {
      const el = wordRefs.current.get(i)
      if (el && el.offsetLeft <= 1) {
        anchorIndex = i
        break
      }
    }
    if (anchorIndex <= start) return

    const anchor = wordRefs.current.get(anchorIndex)
    if (!anchor) return

    const measuredTop = anchor.offsetTop
    for (let i = start; i < anchorIndex; i++) {
      wordRefs.current.delete(i)
      refCallbacks.current.delete(i)
    }
    state.pruneTo(anchorIndex, measuredTop)
  }, [])

  // Measure the caret and the active line, then consider pruning.
  useLayoutEffect(() => {
    const wordEl = wordRefs.current.get(currentWordIndex)
    // Hold the last measurement if the active word is not in the DOM for a frame. Bailing
    // is deliberate: a caret that keeps opacity 1 and its previous position reads as a
    // momentary pause, where resetting to 0/0 reads as the caret jumping to the top.
    if (!wordEl) return

    const entry = typed[currentWordIndex] ?? ''
    const chars = wordEl.querySelectorAll<HTMLElement>('[data-char]')

    let activeLineTop = wordEl.offsetTop

    if (chars.length === 0) {
      setCaretX(wordEl.offsetLeft)
      setCaretY(wordEl.offsetTop)
      setCaretWidth(0)
    } else {
      const position = Math.min(entry.length, chars.length - 1)
      const el = chars[position]
      const atEnd = entry.length >= chars.length
      setCaretX(el.offsetLeft + (atEnd ? el.offsetWidth : 0))
      setCaretY(el.offsetTop)
      setCaretWidth(el.offsetWidth)
      activeLineTop = el.offsetTop
    }

    const line = Math.max(0, Math.round(activeLineTop / lineBox))
    setScrollLines(Math.max(0, line - above))

    tryPrune()
  }, [
    currentWordIndex,
    typed,
    windowStart,
    words,
    lineBox,
    above,
    monoFont,
    fontSize,
    letterSpacing,
    resizeTick,
    softError,
    tryPrune,
  ])

  /**
   * The line scroll: 250ms for a single line, per §5.3, plus 60ms for each additional line
   * so a multi-line jump — a long word wrapping, say — is not squeezed into the one-line
   * duration. A scroll that lags leaves the active line, and the caret that rides it,
   * outside the viewport, which reads as the text vanishing mid-sentence.
   */
  useEffect(() => {
    const distance = Math.abs(scrollLines - prevScrollLinesRef.current)
    const transition = reduceMotion
      ? { duration: 0 }
      : {
          duration: Math.min(0.4, LINE_SCROLL_SECONDS + 0.06 * Math.max(0, distance - 1)),
          ease: EASE_OUT,
        }
    prevScrollLinesRef.current = scrollLines
    const controls = animate(scrollY, -scrollLines * lineBox, transition)
    return () => controls.stop()
  }, [scrollLines, lineBox, reduceMotion, scrollY])

  // Window resizes re-wrap the text, so every measurement has to be redone.
  useEffect(() => {
    const el = textRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setResizeTick((t) => t + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visible = useMemo(() => words.slice(windowStart), [words, windowStart])
  const scrolled = useMemo(() => ({ willChange: 'transform' as const, y: scrollY }), [scrollY])

  /**
   * The edge dissolve, scaled to the number of visible lines.
   *
   * With three lines the active line is the middle one and both outer lines dissolve, so the
   * fade runs in from each edge and is fully gone by the quarter marks. With two lines the
   * active line is the *top* one — the line being read must not be faded at all — so the mask
   * is opaque from the top and dissolves only the incoming line below it. With one line there
   * is no outer line to dissolve and no mask, because a fully faded single line is a blank
   * viewport.
   */
  const maskImage = useMemo(
    () =>
      visibleLines >= 3
        ? 'linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 0.5) 11%, #000 25%, #000 75%, rgb(0 0 0 / 0.5) 89%, transparent 100%)'
        : visibleLines === 2
          ? 'linear-gradient(to bottom, #000 0%, #000 50%, rgb(0 0 0 / 0.5) 75%, transparent 100%)'
          : 'none',
    [visibleLines],
  )

  return (
    <motion.div
      data-testid="typing-viewport"
      className="relative w-full"
      initial={false}
      animate={{ opacity: status === 'finished' ? 0.3 : 1 }}
      transition={tr(reduceMotion, 'quick')}
      style={{ height: viewportHeight }}
    >
      {/* ── Text layer: masked, so the outer lines dissolve ── */}
      <div
        className="prompt-mask h-full overflow-hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <motion.div className="relative" style={scrolled}>
          <div style={{ height: topPad }} aria-hidden="true" />

          <div
            ref={textRef}
            className="typing-text select-none"
            style={{
              fontFamily: MONO_FONTS[monoFont].stack,
              fontSize,
              letterSpacing: `${letterSpacing}em`,
              lineHeight: `${lineBox}px`,
            }}
          >
            {visible.map((word, i) => {
              const index = windowStart + i
              const entry = typed[index]
              const isActive = index === currentWordIndex
              const isErrorWord =
                index < currentWordIndex && entry !== undefined && entry !== word.text

              return (
                <Word
                  key={word.id}
                  index={index}
                  text={word.text}
                  typed={entry}
                  isActive={isActive}
                  isErrorWord={isErrorWord}
                  softErrorAt={softError && softError.word === index ? softError.position : null}
                  registerRef={getRegister(index)}
                />
              )
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Caret layer: the same transform, deliberately *not* masked ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div className="relative h-full" style={scrolled}>
          <Caret
            x={caretX}
            y={caretY}
            charWidth={caretWidth}
            lineBox={lineBox}
            caretStyle={caretStyle}
            visible={!isStrictDifficulty(difficulty)}
            blink={blinkCaret && status !== 'running'}
            smooth={smoothCaret}
            reduceMotion={reduceMotion}
            glowIntensity={glowIntensity}
          />
        </motion.div>
      </div>
    </motion.div>
  )
}
