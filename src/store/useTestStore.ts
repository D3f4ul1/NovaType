import { create } from 'zustand'
import type { KeystrokeLog, SoftError, TestResult, TestStatus, Word } from '../types'
import {
  createWordStream,
  customWordCount,
  randomSeed,
  type GenerateOptions,
  type WordStream,
} from '../lib/generateWords'
import { noteSourcePlayed, passageFor, resolvedSource } from '../lib/sources'
import { difficultyPreset } from '../lib/difficulty'
import { computeResult } from '../lib/stats'
import { APPEND_CHUNK, BUFFER_TARGET, MIN_AHEAD } from '../lib/constants'
import { useSettingsStore } from './useSettingsStore'

/**
 * Ephemeral test state. Never persisted.
 *
 * Shape notes:
 *
 * • The brief's `input: string` is stored as `typed: string[]` — one entry per word.
 *   It is semantically equivalent, but it lets a single word subscribe to its own
 *   slice, which is what keeps a keystroke from re-rendering the word list (§2.2).
 *
 * • `currentCharIndex` is derived (`typed[currentWordIndex].length`) and never stored.
 *
 * • `currentWordIndex` doubles as the count of words completed: it is incremented when
 *   a word is advanced past and decremented when the user backspaces into the previous
 *   word, so the two are always equal. Keeping one number removes a whole class of
 *   drift bugs.
 *
 * • "Error word" is derived, not stored: a completed word is in error whenever
 *   `typed[i] !== words[i].text`. No bookkeeping to keep in sync.
 *
 * • The separator between two words is *not* stored. It is the position one past the end
 *   of a word's `typed` slice, which is why nothing here has to know about it: a word is
 *   finished exactly when `typed[i].length >= words[i].text.length`.
 */

/**
 * Kept outside the store: a generator is a function, and functions do not belong in
 * serialisable state. There is exactly one live test at a time.
 *
 * The passage is resolved *per seed* rather than read straight from settings, so a test
 * always knows which of the user's texts it is playing even while the rotation is moving
 * on to the next one.
 */
function generatorOptions(seed: number): GenerateOptions {
  const s = useSettingsStore.getState()
  const difficulty = difficultyPreset(s.difficulty)
  return {
    punctuation: difficulty.punctuation,
    numbers: difficulty.numbers,
    symbols: difficulty.symbols,
    maxWordLength: difficulty.maxWordLength,
    language: s.language,
    source: s.promptSource,
    categories: s.factCategories,
    passage: s.mode === 'custom' ? passageFor(seed, s) : null,
  }
}

const INITIAL_SEED = randomSeed()
let stream: WordStream = createWordStream(INITIAL_SEED, generatorOptions(INITIAL_SEED))

export interface TestStore {
  status: TestStatus
  words: Word[]
  /** What the user typed for each word index. Sparse; missing entries read as ''. */
  typed: string[]
  currentWordIndex: number
  keystrokes: KeystrokeLog[]
  errorCount: number
  startTime: number | null
  endTime: number | null
  result: TestResult | null
  seed: number
  /** The last refused key, marked in the prompt until the next accepted one. */
  softError: SoftError | null

  /** First word index still rendered — the pruning window's left edge. */
  windowStart: number
  /** Height in px of the spacer standing in for pruned words. */
  spacerHeight: number
  /** Monotonic id for generated words. */
  nextWordId: number

  resetTest: (seed?: number) => void
  ensureBuffer: () => void
  beginTest: (now: number) => void
  setTypedForWord: (index: number, value: string) => void
  setSoftError: (error: SoftError | null) => void
  appendKeystroke: (entry: KeystrokeLog) => void
  /** Advances past the current word. Returns true when that ended the test. */
  advanceWord: (now?: number) => boolean
  /** Ends a `words` or `custom` test the moment its final word is typed in full. */
  finishIfFinalWordComplete: (now: number) => void
  retreatWord: () => void
  pruneTo: (windowStart: number, spacerHeight: number) => void
  finish: (now: number) => void
}

/**
 * How many words this test will run for, or `null` if it has no fixed length.
 *
 * Two things can bound a test, and they compose:
 *
 *  • `words` mode has a word count the user picked.
 *  • `custom` mode plays one of the user's passages, which has exactly as many words as
 *    they pasted — so finishing it *is* finishing the test.
 *
 * Both are read from the seed rather than from live state because the passage a test plays
 * is a property of that test: a rotation that moved on mid-run must not change what the
 * current run is counting towards.
 */
export function plannedWordLimit(seed: number): number | null {
  const settings = useSettingsStore.getState()
  if (settings.mode === 'custom') {
    const passage = passageFor(seed, settings)
    const words = passage ? customWordCount(passage) : 0
    return words > 0 ? words : null
  }
  return settings.mode === 'words' ? settings.wordLimit : null
}

/** How many words to seed the buffer with: a bounded test asks for exactly its length. */
function initialWordCount(seed: number): number {
  return plannedWordLimit(seed) ?? BUFFER_TARGET
}

function freshWords(seed: number): Word[] {
  stream = createWordStream(seed, generatorOptions(seed))
  return stream.next(initialWordCount(seed))
}

const initialWords = stream.next(initialWordCount(INITIAL_SEED))

export const useTestStore = create<TestStore>()((set, get) => ({
  status: 'idle',
  words: initialWords,
  typed: [''],
  currentWordIndex: 0,
  keystrokes: [],
  errorCount: 0,
  startTime: null,
  endTime: null,
  result: null,
  seed: INITIAL_SEED,
  softError: null,
  windowStart: 0,
  spacerHeight: 0,
  nextWordId: initialWords.length,

  resetTest: (seed) => {
    const chosen = seed ?? randomSeed()
    const words = freshWords(chosen)
    set({
      status: 'idle',
      words,
      typed: [''],
      currentWordIndex: 0,
      keystrokes: [],
      errorCount: 0,
      startTime: null,
      endTime: null,
      result: null,
      seed: chosen,
      softError: null,
      windowStart: 0,
      spacerHeight: 0,
      nextWordId: words.length,
    })
  },

  ensureBuffer: () => {
    // A user's passage is already whole in the buffer; growing it would append text the
    // user never wrote, past the point the test is going to end anyway. The stream itself
    // is the authority on whether it has an end.
    if (stream.finiteLength !== null) return
    const { words, currentWordIndex, nextWordId } = get()
    if (words.length - currentWordIndex >= MIN_AHEAD) return
    const more = stream.next(APPEND_CHUNK)
    // The stream assigns ids from its own counter, which restarts with each new stream, so
    // the store re-stamps them to keep ids monotonic across the whole test.
    set({
      words: [...words, ...more.map((word, i) => ({ ...word, id: nextWordId + i }))],
      nextWordId: nextWordId + APPEND_CHUNK,
    })
  },

  beginTest: (now) => {
    if (get().status !== 'idle') return
    // The passage is only committed to history now that it is actually being typed, so
    // building a prompt and discarding it — which every mount does while React
    // double-invokes effects in development — cannot cost the user a passage in the
    // rotation. There is at most one of these per test, so the deferred storage write it
    // schedules is nowhere near a keystroke's path.
    const settings = useSettingsStore.getState()
    if (settings.mode === 'custom') {
      const source = resolvedSource(get().seed, settings)
      if (source) noteSourcePlayed(source.id)
    }
    set({ status: 'running', startTime: now })
  },

  setTypedForWord: (index, value) => {
    const typed = get().typed.slice()
    while (typed.length <= index) typed.push('')
    typed[index] = value
    // Typing again is the acknowledgement that clears the last refusal.
    set({ typed, softError: null })
  },

  setSoftError: (error) => set({ softError: error }),

  appendKeystroke: (entry) =>
    set((state) => ({
      keystrokes: [...state.keystrokes, entry],
      errorCount: entry.correct ? state.errorCount : state.errorCount + 1,
    })),

  advanceWord: (now) => {
    const { currentWordIndex, typed } = get()
    const nextIndex = currentWordIndex + 1
    const nextTyped = typed.length <= nextIndex ? [...typed, ''] : typed
    set({ currentWordIndex: nextIndex, typed: nextTyped, softError: null })

    // A bounded test ends the instant the cursor passes its final word. This is the check
    // that was missing: without it the test simply kept generating new words forever.
    const limit = plannedWordLimit(get().seed)
    if (limit !== null && nextIndex >= limit) {
      get().finish(now ?? performance.now())
      return true
    }

    get().ensureBuffer()
    return false
  },

  finishIfFinalWordComplete: (now) => {
    const state = get()
    const limit = plannedWordLimit(state.seed)
    if (limit === null) return
    const { currentWordIndex, words, typed } = state
    if (currentWordIndex !== limit - 1) return
    const target = words[currentWordIndex]?.text
    if (target === undefined) return
    if ((typed[currentWordIndex] ?? '').length >= target.length) get().finish(now)
  },

  retreatWord: () => {
    const { currentWordIndex } = get()
    if (currentWordIndex <= 0) return
    set({ currentWordIndex: currentWordIndex - 1, softError: null })
  },

  pruneTo: (windowStart, spacerHeight) => set({ windowStart, spacerHeight }),

  finish: (now) => {
    const state = get()
    if (state.status === 'finished') return
    const startTime = state.startTime ?? now
    const elapsedMs = Math.max(0, now - startTime)
    const targets = state.words.map((w) => w.text)
    const result = computeResult({
      keystrokes: state.keystrokes,
      targets,
      typed: state.typed,
      wordsCompleted: state.currentWordIndex,
      elapsedMs,
    })
    set({ status: 'finished', endTime: now, result })
  },
}))

/** The typed text for a word index, defaulting to ''. */
export function typedFor(state: Pick<TestStore, 'typed'>, index: number): string {
  return state.typed[index] ?? ''
}

/**
 * Whether a *completed* word was left with an uncorrected error. This is the
 * derived "error word" state — no bookkeeping required.
 */
export function isErrorWord(state: TestStore, index: number): boolean {
  if (index >= state.currentWordIndex) return false
  const target = state.words[index]?.text
  if (target === undefined) return false
  return typedFor(state, index) !== target
}
