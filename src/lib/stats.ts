import type { CharCounts, KeystrokeLog, PerSecondPoint, TestResult } from '../types'

/**
 * Statistics engine — brief §8. Every formula here is pure; nothing reads the DOM.
 *
 * Two deliberate interpretations, both noted in the UI where relevant:
 *
 * 1. The WPM-over-time series is *cumulative* (characters so far ÷ elapsed so far),
 *    which is what makes a readable curve rather than a spiky sawtooth.
 *    "Consistency" is therefore computed from the separate *instantaneous*
 *    characters-per-second series — running it on the cumulative curve would soak up
 *    all the variance and report ~100% for everyone.
 *
 * 2. WPM counts the correct characters in the in-progress word as well as completed
 *    words, so a `time`-mode test that ends mid-word is not penalised for the
 *    characters the user did type correctly. "Missed" characters are only counted
 *    for words that were actually completed.
 */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export interface ComputeArgs {
  keystrokes: KeystrokeLog[]
  /** Target words, indexed from 0. */
  targets: string[]
  /** What the user typed for each word, indexed identically. */
  typed: string[]
  /** How many words the user advanced past. */
  wordsCompleted: number
  elapsedMs: number
}

export function computeResult({
  keystrokes,
  targets,
  typed,
  wordsCompleted,
  elapsedMs,
}: ComputeArgs): TestResult {
  const minutes = elapsedMs / 60000
  const seconds = elapsedMs / 1000

  const chars: CharCounts = { correct: 0, incorrect: 0, extra: 0, missed: 0 }
  let typedCharsTotal = 0
  /** Words the cursor got past. See the WPS note below for why this is not "flawless words". */
  let completedWords = 0

  const lastIndex = Math.min(Math.max(wordsCompleted, 0), Math.max(typed.length - 1, 0))
  for (let w = 0; w <= lastIndex; w++) {
    const target = targets[w] ?? ''
    const entry = typed[w] ?? ''
    const isActiveWord = w === wordsCompleted

    const compared = Math.min(entry.length, target.length)
    for (let i = 0; i < compared; i++) {
      if (entry[i] === target[i]) chars.correct++
      else chars.incorrect++
    }
    if (entry.length > target.length) chars.extra += entry.length - target.length
    if (!isActiveWord && entry.length < target.length) chars.missed += target.length - entry.length

    typedCharsTotal += entry.length
    // A word counts once the cursor is past it and something was typed into it. Counting
    // only flawless words made WPS report 0 for an entire run at 60+ raw WPM in which
    // every word contained a slip — the stat punished the same mistake twice, since the
    // typo had already cost accuracy and WPM. Words per second means words per second.
    if (!isActiveWord && entry.length > 0) completedWords++
  }

  const totalKeystrokes = keystrokes.length
  let correctKeystrokes = 0
  for (const k of keystrokes) if (k.correct) correctKeystrokes++
  const errors = totalKeystrokes - correctKeystrokes
  const accuracy = totalKeystrokes > 0 ? (correctKeystrokes / totalKeystrokes) * 100 : 100

  const wpm = minutes > 0 ? chars.correct / 5 / minutes : 0
  const rawWpm = minutes > 0 ? typedCharsTotal / 5 / minutes : 0
  const wps = seconds > 0 ? completedWords / seconds : 0

  /* ── Bucket keystrokes into one-second slots ───────────────── */
  const secCount = Math.max(1, Math.ceil(elapsedMs / 1000))
  const typedInSecond = new Array<number>(secCount).fill(0)
  const correctInSecond = new Array<number>(secCount).fill(0)
  const errorsInSecond = new Array<number>(secCount).fill(0)

  for (const k of keystrokes) {
    const bucket = Math.min(secCount - 1, Math.max(0, Math.floor(k.t / 1000)))
    if (!k.correct) errorsInSecond[bucket]++
    if (k.char === ' ') continue // word separators are not characters
    typedInSecond[bucket]++
    if (k.correct) correctInSecond[bucket]++
  }

  const series: PerSecondPoint[] = []
  const instantaneous: number[] = []
  let cumCorrect = 0
  let cumTyped = 0

  for (let s = 0; s < secCount; s++) {
    cumCorrect += correctInSecond[s]
    cumTyped += typedInSecond[s]
    const elapsedSec = s + 1
    // Rounded to 2dp: the raw division yields values like 11.999999999999998, and the
    // series is charted and copied out, so float noise should not travel with it.
    series.push({
      second: elapsedSec,
      wpm: round2(cumCorrect / 5 / (elapsedSec / 60)),
      rawWpm: round2(cumTyped / 5 / (elapsedSec / 60)),
      errors: errorsInSecond[s],
    })
    // chars in this second → WPM for that second
    instantaneous.push(typedInSecond[s] * 12)
  }

  /* ── Top missed characters ─────────────────────────────────── */
  const missCounts = new Map<string, number>()
  for (const k of keystrokes) {
    if (k.correct) continue
    const key = k.expected || k.char
    if (!key || key === ' ') continue
    missCounts.set(key, (missCounts.get(key) ?? 0) + 1)
  }
  const missedChars = Array.from(missCounts.entries())
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count || a.char.localeCompare(b.char))
    .slice(0, 5)

  return {
    wpm: round1(wpm),
    rawWpm: round1(rawWpm),
    // Two decimals: a single decimal collapses any short test's words-per-second to 0.0.
    wps: round2(wps),
    accuracy: round1(accuracy),
    consistency: round1(consistencyFrom(instantaneous)),
    chars,
    errors,
    elapsedMs,
    wordsCompleted,
    series,
    missedChars,
  }
}

/**
 * 100 − (stdDev ÷ mean) × 100, clamped to 0–100. Idle seconds are included as zero,
 * so pausing mid-test genuinely costs consistency.
 */
export function consistencyFrom(values: number[]): number {
  if (values.length < 2) return 100
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean <= 0) return 0
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const stdDev = Math.sqrt(variance)
  return clamp(100 - (stdDev / mean) * 100, 0, 100)
}

export interface LiveStats {
  wpm: number
  rawWpm: number
  accuracy: number
  seconds: number
}

/** Cheap live figures for the optional HUD — no per-second bucketing. */
export function liveStats(keystrokes: KeystrokeLog[], elapsedMs: number): LiveStats {
  const minutes = elapsedMs / 60000
  let correct = 0
  let typedChars = 0
  let correctKs = 0

  for (const k of keystrokes) {
    if (k.correct) correctKs++
    if (k.char === ' ') continue
    typedChars++
    if (k.correct) correct++
  }

  return {
    wpm: minutes > 0 ? round1(correct / 5 / minutes) : 0,
    rawWpm: minutes > 0 ? round1(typedChars / 5 / minutes) : 0,
    accuracy: keystrokes.length > 0 ? round1((correctKs / keystrokes.length) * 100) : 100,
    seconds: elapsedMs / 1000,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Formats milliseconds as `M:SS`. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** The shareable summary produced by "Copy Results". */
export function formatResultSummary(result: TestResult): string {
  const lines = [
    'NovaType — typing test',
    '',
    `${result.wpm} WPM   ·   ${result.accuracy}% accuracy   ·   ${result.consistency}% consistency`,
    '',
    `Raw WPM      ${result.rawWpm}`,
    `WPS          ${result.wps}`,
    `Time         ${formatDuration(result.elapsedMs)}`,
    `Characters   ${result.chars.correct} correct / ${result.chars.incorrect} incorrect / ${result.chars.extra} extra / ${result.chars.missed} missed`,
    `Errors       ${result.errors}`,
  ]
  if (result.missedChars.length > 0) {
    lines.push(
      `Most missed  ${result.missedChars.map((m) => `${m.char}×${m.count}`).join(', ')}`,
    )
  }
  return lines.join('\n')
}
