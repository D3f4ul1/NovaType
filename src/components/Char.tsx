import { memo } from 'react'

/**
 * A single slot in the typing surface — one target character, or the separator at the end
 * of a word.
 *
 * Every slot in the stream is its own span, and its state is *derived* from props rather
 * than stored. All props are primitives, which is what lets `memo` bail out reliably: when
 * a keystroke lands, React walks the word list but only the one word whose `typed` slice
 * actually changed reconciles its children. That is the whole reason the app holds 60fps
 * while typing (§2.2, §13).
 */

export interface CharProps {
  /** The expected character, or null for a character typed past the end of a word. */
  target: string | null
  /** What the user typed here, or undefined if nothing has been typed yet. */
  typed: string | undefined
  /** True for the separator slot that closes a word. */
  isSpaceSlot?: boolean
  /**
   * True when this is the position the last refused key landed on. Soft errors are painted
   * in a lighter red than a wrong letter, because they are a different kind of mistake:
   * the right character, the wrong place — or the right place, the wrong kind of key.
   */
  softError?: boolean
}

/** A space needs a real glyph or the span collapses to zero width. */
function display(glyph: string): string {
  return glyph === ' ' ? '\u00a0' : glyph
}

export const Char = memo(function Char({
  target,
  typed,
  isSpaceSlot = false,
  softError = false,
}: CharProps) {
  /**
   * The separator.
   *
   * It occupies exactly the width of the gap it replaces — a non-breaking space in the same
   * monospaced font, painted transparent so an untouched separator is invisible. It is a
   * real element rather than a text node so that a mistake made *on* it has somewhere to be
   * shown: a character typed where the space belonged tints this box.
   *
   * It is also deliberately not tagged `data-char`, because it is not a character of the
   * prompt: the caret measures itself against `[data-char]` elements, and an untagged slot
   * keeps the end-of-word position meaning "after the last letter", as before.
   */
  if (isSpaceSlot) {
    return (
      <span
        className={`tchar char-space${softError ? ' char-soft-error' : ''}`}
        data-space-slot=""
      >
        {'\u00a0'}
      </span>
    )
  }

  const isTyped = typed !== undefined
  const isCorrect = isTyped && target !== null && typed === target
  const isIncorrect = isTyped && !isCorrect

  const className = [
    'tchar',
    isCorrect ? 'char-correct animate-char-in' : '',
    isIncorrect ? 'char-incorrect animate-char-error' : '',
    !isTyped ? 'char-untyped' : '',
    softError ? 'char-soft-error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /**
   * The glyph, or glyphs.
   *
   * A mistaken position inside a real word renders **both** the character you were meant to
   * type and the key you actually pressed, and a rule on `<html>` decides which one paints.
   * That is what lets the default — target letter, red — keep the prompt's shape stable,
   * while still offering the more conventional "show what I pressed" mode. Doing it in CSS
   * rather than with an extra prop is deliberate: a prop would join the `memo` comparison
   * for every one of the ~1,000 rendered characters.
   *
   * A character typed past the end of a word has no target, so it always shows the key that
   * was pressed — there is nothing else for it to show.
   */
  const inner =
    isIncorrect && target !== null && typed !== undefined
      ? [
          <span key="target" className="char-glyph char-glyph-target">
            {display(target)}
          </span>,
          <span key="typed" className="char-glyph char-glyph-typed">
            {display(typed)}
          </span>,
        ]
      : display(isTyped ? typed : (target ?? ''))

  // No `aria-hidden` here: the prompt text is the content of the page, and hiding it
  // from assistive technology would be worse than exposing a long text run. The
  // fast-updating *timer* is the thing that must stay out of the accessibility tree.
  return (
    <span className={className} data-char="">
      {inner}
    </span>
  )
})
