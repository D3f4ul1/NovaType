import type { Difficulty } from '../types'

/**
 * The difficulty ladder, and the symbol vocabulary that `hard` and `expert` draw on.
 *
 * One control, four rungs, each one visibly harder than the one below it within a few
 * words. It used to be a two-way switch buried in Settings that did a single thing — hide
 * the caret, disable backspace — which is an odd thing to call difficulty: it made the test
 * *less forgiving* without making the text any harder to type. There was no rung between
 * "plain words" and "no second chances", and nothing that put the rest of the keyboard in
 * front of you.
 *
 * The rungs are cumulative, and the generator reads them as a preset rather than the app
 * reading four independent flags: that is what lets `hard` mean something specific — the
 * punctuation, number and symbol mix together — instead of being a name for whatever
 * combination of toggles happened to be on.
 */

export interface DifficultyPreset {
  id: Difficulty
  label: string
  /** One line, shown as the tooltip in the typing bar and the hint in Settings. */
  blurb: string
  /**
   * Longest word the random source may draw, or `null` for the whole corpus. Restricting
   * the *length* is what makes `easy` easy: the corpus is common English either way, so
   * without it, `easy` and `normal` would be the same test wearing different names.
   */
  maxWordLength: number | null
  punctuation: boolean
  numbers: boolean
  symbols: boolean
}

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'expert']

export const DIFFICULTIES: Record<Difficulty, DifficultyPreset> = {
  easy: {
    id: 'easy',
    label: 'easy',
    blurb: 'Short words, letters only — the common-four-letters feel of a warm-up.',
    maxWordLength: 4,
    punctuation: false,
    numbers: false,
    symbols: false,
  },
  normal: {
    id: 'normal',
    label: 'normal',
    blurb: 'The whole common-English corpus, letters only.',
    maxWordLength: null,
    punctuation: false,
    numbers: false,
    symbols: false,
  },
  hard: {
    id: 'hard',
    label: 'hard',
    blurb:
      'Punctuation, numbers and symbols mixed into every line — £ $ % & / { } + * # @ and the rest of the keyboard.',
    maxWordLength: null,
    punctuation: true,
    numbers: true,
    symbols: true,
  },
  expert: {
    id: 'expert',
    label: 'expert',
    blurb:
      'Everything hard adds, plus the caret hidden and backspace disabled: a mistake stays on screen.',
    maxWordLength: null,
    punctuation: true,
    numbers: true,
    symbols: true,
  },
}

/** The preset for a level. Falls back to `normal` so an unknown value can never crash a test. */
export function difficultyPreset(id: Difficulty): DifficultyPreset {
  return DIFFICULTIES[id] ?? DIFFICULTIES.normal
}

/**
 * True for the levels that take the training wheels off: the caret is hidden and backspace
 * is disabled. Read through here rather than comparing against `'expert'` at each site, so
 * a fifth rung cannot arrive and quietly forget the handicap.
 */
export function isStrictDifficulty(id: Difficulty): boolean {
  return id === 'expert'
}

/* ══════════════════════════════════════════════════════════════
   Symbols
   ══════════════════════════════════════════════════════════════ */

/**
 * The symbol keys, restricted to what a US or UK layout can actually produce.
 *
 * `£` is in because the machine this was built on reports one; `€ ¥ ¿ ¡ § ±` are out
 * because they need an AltGr combination or a layout that may not be installed, and a
 * character you cannot type is not a difficult test, it is a stuck one. Everything here is
 * a shifted or unshifted key on the top row, or one of the bracket, quote and operator keys.
 */
const SYMBOLS = [
  '!', '"', '£', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+', '[', '{', ']', '}',
  ';', ':', "'", '@', '#', '~', ',', '<', '.', '>', '/', '?', '\\', '|',
]

/** Two-key operators, which is the shape most symbol mistakes take in real code. */
const OPERATORS = [
  '+=', '-=', '==', '!=', '<=', '>=', '&&', '||', '**', '->', '<-', '++', '--', '//', '::',
  '=>', '$1', '1%',
]

/** Marks that read as real text when attached to a word: a tag, a handle, a price, a var. */
const AFFIXES = ['#', '@', '$', '£', '%', '&', '*', '+', '=', '-', '~', '/', '^', '<', '>', '|', '?']

/** Brackets, paired with their closers so a token can never be left hanging open. */
const BRACKETS: [string, string][] = [
  ['[', ']'],
  ['{', '}'],
  ['(', ')'],
  ['<', '>'],
]

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

function digits(rng: () => number, count: number): string {
  let out = ''
  for (let i = 0; i < count; i++) out += Math.floor(rng() * 10)
  return out
}

/**
 * A token made of symbols rather than letters.
 *
 * Five shapes, because a single shape repeated is a pattern the typist learns rather than a
 * test of anything: an operator (`<=`), a symbol cluster (`#*&`), an amount (`£12.50`,
 * `$640`), a percentage (`42%`), and a bracketed key (`[retry]`). `word` comes from the
 * same shuffle bag the letters do, so a bracketed token is never a word the typist has just
 * typed.
 */
export function symbolToken(rng: () => number, word: string): string {
  const roll = rng()

  if (roll < 0.3) return pick(rng, OPERATORS)

  if (roll < 0.52) {
    const length = 2 + Math.floor(rng() * 3)
    let out = ''
    for (let i = 0; i < length; i++) out += pick(rng, SYMBOLS)
    return out
  }

  if (roll < 0.7) {
    const currency = rng() < 0.5 ? '£' : '$'
    const whole = rng() < 0.4 ? digits(rng, 2) : digits(rng, 1)
    const cents = rng() < 0.6 ? `.${digits(rng, 2)}` : ''
    return `${currency}${whole}${cents}`
  }

  if (roll < 0.85) return `${digits(rng, 1 + Math.floor(rng() * 3))}%`

  const [open, close] = pick(rng, BRACKETS)
  return `${open}${word}${close}`
}

/** Attaches a mark to a word — `#draft`, `cost:`, `total*` — the way real text does. */
export function affixSymbol(rng: () => number, text: string): string {
  const mark = pick(rng, AFFIXES)
  return rng() < 0.6 ? `${mark}${text}` : `${text}${mark}`
}

/** Levels whose text carries symbols, used by the UI to say what the level does. */
export function hasSymbols(id: Difficulty): boolean {
  return difficultyPreset(id).symbols
}
