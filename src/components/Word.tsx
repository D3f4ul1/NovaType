import { memo } from 'react'
import { Char } from './Char'

/**
 * A word in the stream: one span containing a `Char` per target character, closed by the
 * separator slot.
 *
 * The separator lives *inside* the word rather than as a text node between words, which is
 * what makes the gap a real position the engine can talk about — and what lets a mistake
 * made on that position be painted in place instead of being invisible.
 *
 * Memoised on primitives (`text`, `typed`, `isActive`, `isErrorWord`, `softErrorAt`) plus a
 * ref callback whose identity is stable per word index, so an unrelated keystroke cannot
 * re-render it.
 */

export interface WordProps {
  index: number
  text: string
  /** What the user typed for this word; undefined until the cursor reaches it. */
  typed: string | undefined
  isActive: boolean
  /** A completed word left with uncorrected errors. */
  isErrorWord: boolean
  /** Position in this word of the last refused key, or null if it was somewhere else. */
  softErrorAt: number | null
  registerRef: (el: HTMLSpanElement | null) => void
}

export const Word = memo(function Word({
  index,
  text,
  typed,
  isActive,
  isErrorWord,
  softErrorAt,
  registerRef,
}: WordProps) {
  // `isActive` is intentionally unused for rendering: the caret is one measured element
  // rather than something each character has to know about. It stays in the props because
  // it is part of the memo contract for the active word.
  void isActive

  const typedLength = typed?.length ?? 0

  const children = []

  for (let i = 0; i < text.length; i++) {
    children.push(
      <Char
        key={i}
        target={text[i]}
        typed={i < typedLength ? typed?.[i] : undefined}
        softError={softErrorAt === i}
      />,
    )
  }

  // The closing separator. There is no "overflow" case to render after it: the engine
  // refuses a character at the slot (or closes the word with it), so a word's typed slice
  // can no longer grow past its own letters.
  children.push(
    <Char key="slot" target=" " typed={undefined} isSpaceSlot softError={softErrorAt === text.length} />,
  )

  return (
    <span
      ref={registerRef}
      data-word={index}
      className={`tword${isErrorWord ? ' char-error-word' : ''}`}
    >
      {children}
    </span>
  )
})
