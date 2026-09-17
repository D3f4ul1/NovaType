import type { FactCategory, LanguageCode, PromptSource, Word } from '../types'
import {
  FACTS,
  FACT_CATEGORY_ORDER,
  factText,
  noteFactsUsed,
  orderByFreshness,
  recentFactIds,
} from './facts'
import { affixSymbol, symbolToken } from './difficulty'
import { LANGUAGES } from './wordList'

/**
 * Infinite text engine.
 *
 * The stream is a pull-based generator rather than a fixed slice of text: the caller asks
 * for the next *n* words and the stream produces them, so the prompt has no end to reach.
 * All four sources are wired through the same interface:
 *
 *  • `random`  — decorated common words, exactly as the brief specifies, drawn from a
 *                shuffle bag so no word repeats until the pool has been through once.
 *  • `facts`   — whole sentences from a corpus, tokenised on whitespace and fed in passes
 *                that interleave topics and lead with material the typist has not seen
 *                lately, so neither the sentence nor the subject repeats.
 *  • `mixed`   — alternating blocks of the two, which is what keeps a long test from
 *                feeling monotonous.
 *  • `passage` — orthogonal to the three above: when the user's own text is in play it is
 *                served word for word instead, and `finiteLength` reports how many words it
 *                holds so the test store can end the test when it runs out.
 *
 * The stream is fully determined by its seed, so "Restart" reproduces the identical text.
 */

export interface GenerateOptions {
  punctuation: boolean
  numbers: boolean
  /** Swap some word slots for operators and symbol clusters (the `hard`/`expert` mix). */
  symbols: boolean
  /** Longest word the shuffle bag may draw, or `null` for the whole corpus. */
  maxWordLength: number | null
  language: LanguageCode
  source: PromptSource
  /** Categories drawn on when the source includes facts. Empty means "all of them". */
  categories: FactCategory[]
  /**
   * The user's own passage, when the active mode asks for one. Served verbatim: nothing is
   * decorated, capitalised or reordered, because the typist pasted this text and expects
   * to type back exactly what they pasted.
   */
  passage: string | null
}

export interface WordStream {
  /** Produces the next `count` words, continuing the stream. */
  next: (count: number) => Word[]
  /**
   * How many words this stream holds in total, or `null` if it is genuinely endless. A
   * finite stream repeats once drained, so `next` keeps its contract either way; the
   * caller decides what a bounded run means (an end-of-test, in this app).
   */
  finiteLength: number | null
}

/** Words generated from one source before a `mixed` stream may switch. */
const MIXED_BLOCK = 40

/**
 * How often a slot is filled by a symbol token instead of a word, and how often a word
 * picks up a mark. Both are per-token and only apply when the difficulty asks for symbols.
 *
 * Tuned so that a line of the prompt always contains something from the rest of the
 * keyboard — at roughly one token in ten plus one word in eight, a screenful of text holds
 * four or five of them, which is dense enough to be the thing you are practising and rare
 * enough that the prompt still reads as language.
 */
const SYMBOL_TOKEN_CHANCE = 0.11
const SYMBOL_AFFIX_CHANCE = 0.13

/** Below this many words, an `easy` filter would be doing more harm than good. */
const MIN_FILTERED_POOL = 24

/**
 * The freshness memory is snapshotted per seed the first time that seed is used, so a seed
 * always produces the same text *including* which facts it opens with.
 *
 * Without this, "Restart — same text" would quietly break for fact sources: the whole
 * point of the freshness pass is that it changes as facts are consumed, so replaying a
 * seed a minute later would reorder the passage. Binding the memory to the seed keeps both
 * properties — deterministic replays and fresh material on every genuinely new test.
 */
const freshnessBySeed = new Map<number, readonly string[]>()
const FRESHNESS_SEED_LIMIT = 24

function freshnessForSeed(seed: number): readonly string[] {
  const existing = freshnessBySeed.get(seed)
  if (existing) return existing
  const snapshot = [...recentFactIds()]
  freshnessBySeed.set(seed, snapshot)
  if (freshnessBySeed.size > FRESHNESS_SEED_LIMIT) {
    const oldest = freshnessBySeed.keys().next().value
    if (oldest !== undefined) freshnessBySeed.delete(oldest)
  }
  return snapshot
}

/** mulberry32 — small, fast, well-distributed. Lets "Next Test" reshuffle deterministically. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

function randomNumber(rng: () => number): string {
  const r = rng()
  if (r < 0.34) return String(Math.floor(rng() * 100))
  if (r < 0.68) return String(Math.floor(rng() * 1000))
  if (r < 0.86) return String(Math.floor(rng() * 10000))
  if (r < 0.94) return (Math.floor(rng() * 1000) / 10).toFixed(1)
  return `${Math.floor(rng() * 100)}%`
}

/** Sentence-terminating suffixes trigger capitalisation of the following word. */
const SENTENCE_END = new Set(['.', '?', '!'])

interface Decorated {
  text: string
  endsSentence: boolean
}

function decorate(core: string, rng: () => number, opts: GenerateOptions): Decorated {
  if (!opts.punctuation) return { text: core, endsSentence: false }

  // Occasionally wrap the word, per §3's punctuation rules.
  const wrapRoll = rng()
  let prefix = ''
  let suffix = ''
  if (wrapRoll < 0.055) {
    prefix = '"'
    suffix = '"'
  } else if (wrapRoll < 0.095) {
    prefix = '('
    suffix = ')'
  }

  const endRoll = rng()
  let punctuation = ''
  if (endRoll < 0.1) punctuation = '.'
  else if (endRoll < 0.15) punctuation = ','
  else if (endRoll < 0.17) punctuation = '?'
  else if (endRoll < 0.19) punctuation = '!'
  else if (endRoll < 0.21) punctuation = ';'
  else if (endRoll < 0.22) punctuation = ':'

  // Quoted words keep their punctuation inside the quotes.
  if (prefix === '"' && punctuation !== '') {
    return { text: `${prefix}${core}${punctuation}${suffix}`, endsSentence: SENTENCE_END.has(punctuation) }
  }
  if (prefix !== '' && punctuation !== '') {
    return { text: `${prefix}${core}${suffix}${punctuation}`, endsSentence: SENTENCE_END.has(punctuation) }
  }
  return {
    text: `${prefix}${core}${suffix}${punctuation}`,
    endsSentence: SENTENCE_END.has(punctuation),
  }
}

function capitalize(word: string): string {
  const i = word.search(/[a-z]/)
  if (i === -1) return word
  return word.slice(0, i) + word[i].toUpperCase() + word.slice(i + 1)
}

/** Splits a fact into the words a typist would see, punctuation included. */
function tokenizeFact(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/**
 * Tokenises a pasted passage. Same rule as a fact — split on whitespace, keep the
 * punctuation attached to the word — but nothing is decorated, capitalised or reordered:
 * the user pasted this text and expects to type back exactly what they pasted.
 */
export function tokenizePassage(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** How many words a passage will produce. Used by the UI to describe a custom test. */
export function customWordCount(text: string): number {
  return tokenizePassage(text).length
}

/** A prompt token, carrying the fact it came from so that fact can be marked as seen. */
interface Token {
  word: string
  factId: string
}

function selectedCategories(categories: FactCategory[]): FactCategory[] {
  const selected =
    categories.length > 0
      ? FACT_CATEGORY_ORDER.filter((c) => categories.includes(c))
      : [...FACT_CATEGORY_ORDER]
  return selected.length > 0 ? selected : ['general']
}

/**
 * Builds one pass over the fact pool, ordered so that no two consecutive facts come from
 * the same topic and anything the typist has not seen lately comes first.
 *
 * Interleaving by category is what stops a run from reading like six nature facts in a
 * row: each round takes one fact from every selected category, in a shuffled category
 * order, with the facts inside a category shuffled too. The freshness pass then parks the
 * recently used facts at the end of the pass, so a new test opens on unseen material.
 */
function buildFactCycle(
  categories: FactCategory[],
  rng: () => number,
  freshness: readonly string[],
): Token[] {
  const selected = selectedCategories(categories)
  const categoryOrder = selected.slice()
  shuffleInPlace(categoryOrder, rng)

  const queues = new Map<FactCategory, string[]>()
  for (const category of selected) {
    const ids = FACTS[category].map((_, index) => `${category}:${index}`)
    shuffleInPlace(ids, rng)
    queues.set(category, ids)
  }

  const interleaved: string[] = []
  let taken = true
  while (taken) {
    taken = false
    for (const category of categoryOrder) {
      const id = queues.get(category)?.pop()
      if (id !== undefined) {
        interleaved.push(id)
        taken = true
      }
    }
  }

  return orderByFreshness(interleaved, freshness).flatMap((id) =>
    tokenizeFact(factText(id)).map((word) => ({ word, factId: id })),
  )
}

/**
 * Creates a word stream from a seed and a set of generation options.
 *
 * All mutable state lives in this closure, so two streams never interfere and replaying a
 * seed reproduces the same text exactly.
 */
export function createWordStream(seed: number, opts: GenerateOptions): WordStream {
  const rng = createRng(seed)
  const language = LANGUAGES[opts.language]
  const corpus = language.words.length > 0 ? language.words : LANGUAGES.english.words
  /*
     `easy` restricts the *length* rather than swapping in a different list: the corpus is
     common English either way, so a shorter-word draw is the difference between a
     warm-up and the standard test. The fallback is deliberate — a filter that left a
     handful of words would repeat them, and repetition is more of a difficulty than
     length ever was.
  */
  const filtered =
    opts.maxWordLength === null
      ? corpus
      : corpus.filter((word) => word.length <= (opts.maxWordLength as number))
  const wordPool = filtered.length >= MIN_FILTERED_POOL ? filtered : corpus
  const freshness = freshnessForSeed(seed)

  let id = 0
  let previous = ''
  let capitalizeNext = true

  /* ── The user's own passage ─────────────────────────────────── */
  const passage = opts.passage ? tokenizePassage(opts.passage) : []
  // An empty passage is not a usable prompt, so the stream falls back to generated words
  // rather than leaving the typist with a blank screen and no explanation.
  const servingPassage = passage.length > 0
  const effectiveSource: PromptSource = opts.source
  let passageIndex = 0

  function nextPassage(count: number): string[] {
    const out: string[] = []
    while (out.length < count) {
      out.push(passage[passageIndex % passage.length])
      passageIndex++
    }
    return out
  }

  /* ── Fact source state ──────────────────────────────────────── */
  let queue: Token[] = []
  let queueIndex = 0
  let currentFactId = ''

  function nextFacts(count: number): string[] {
    const out: string[] = []
    while (out.length < count) {
      if (queueIndex >= queue.length) {
        queue = buildFactCycle(opts.categories, rng, freshness)
        queueIndex = 0
      }
      const token = queue[queueIndex++]
      if (token.factId !== currentFactId) {
        currentFactId = token.factId
        // A fact counts as seen the moment it reaches the typist, not when the pass is
        // built — a short test must not mark the twenty facts it never got to.
        noteFactsUsed([token.factId])
      }
      out.push(token.word)
    }
    return out
  }

  /* ── Random source state ──────────────────────────────────────

     Words are drawn from a shuffle bag rather than sampled independently. Independent
     sampling from a pool of a few hundred words repeats surprisingly often — the birthday
     problem — and a repeated word inside one screen is the single most common way a
     generated prompt reads as stale. Refilling the bag only when it empties means every
     word in the pool is used exactly once before any of them comes back. */
  let bag: string[] = []

  function drawWord(): string {
    if (bag.length === 0) {
      bag = wordPool.slice()
      shuffleInPlace(bag, rng)
    }
    let core = bag.pop() as string
    // The boundary between two bags can still land the same word twice in a row; a single
    // rotation is enough to break it without disturbing the rest of the draw.
    if (core === previous && bag.length > 0) {
      const swap = bag[bag.length - 1]
      bag[bag.length - 1] = core
      core = swap
    }
    return core
  }

  function nextRandom(count: number): string[] {
    const out: string[] = []
    for (let i = 0; i < count; i++) {
      const core = drawWord()
      previous = core

      /*
         Symbols difficulty: a slot is sometimes filled by something that is not a word at
         all — an operator, a cluster, an amount, a bracketed key. It bypasses `decorate`
         entirely, because these tokens carry their own punctuation; the only thing it
         inherits is capitalisation, and only when the token itself ends a sentence.
      */
      if (opts.symbols && rng() < SYMBOL_TOKEN_CHANCE) {
        const token = symbolToken(rng, core)
        capitalizeNext = /[!?]$/.test(token)
        out.push(token)
        continue
      }

      let base = opts.numbers && rng() < 0.12 ? randomNumber(rng) : core
      if (opts.symbols && rng() < SYMBOL_AFFIX_CHANCE) base = affixSymbol(rng, base)

      let decorated = decorate(base, rng, opts)
      if (capitalizeNext) decorated = { ...decorated, text: capitalize(decorated.text) }
      capitalizeNext = opts.punctuation ? decorated.endsSentence : false

      out.push(decorated.text)
    }
    return out
  }

  /* ── Block scheduling (used only by `mixed`) ────────────────── */
  let blockRemaining = 0
  let blockIsFacts = effectiveSource === 'facts'

  return {
    finiteLength: servingPassage ? passage.length : null,
    next(count) {
      const texts: string[] = []
      while (texts.length < count) {
        // A user's passage is served whole, in order — no interleaving, no randomness.
        if (servingPassage) {
          texts.push(...nextPassage(count - texts.length))
          break
        }
        if (blockRemaining === 0) {
          const previousWasFacts = blockIsFacts
          blockRemaining = MIXED_BLOCK
          if (effectiveSource === 'mixed') blockIsFacts = rng() < 0.45
          // A random block always opens a fresh sentence, whatever preceded it.
          if (!blockIsFacts && previousWasFacts) capitalizeNext = true
        }
        const take = Math.min(count - texts.length, blockRemaining)
        if (blockIsFacts) texts.push(...nextFacts(take))
        else texts.push(...nextRandom(take))
        blockRemaining -= take
      }
      return texts.map((text) => ({ id: id++, text }))
    },
  }
}
