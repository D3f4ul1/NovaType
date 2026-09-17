import type { UserSource } from '../types'
import { createRng } from './generateWords'
import { migrateLegacyKeys, STORAGE_KEYS } from './storage'

/**
 * The user's own text library, and the rotation that walks through it.
 *
 * Why rotation lives here and not in the settings store: the passage a test plays is
 * decided *per test*, and a test is identified by its seed. Deriving the choice from the
 * seed keeps three properties that would otherwise fight each other —
 *
 *  • a new test gets a different passage, without anything having to be written down,
 *  • replaying a seed ("restart, same text") reproduces the same passage, and
 *  • reading the current choice from the UI is a pure function call, so no store write
 *    happens mid-render and nothing can loop back into the effect that rebuilds the
 *    prompt.
 *
 * The memory of what has already been played is the one thing that has to persist, and it
 * is a plain LRU list — the same shape the fact library uses, for the same reason: once
 * every source has been round once, the least recently used comes back rather than the
 * rotation restarting on the same passage twice.
 */

const PLAYED_KEY = STORAGE_KEYS.playedSources

// See `facts.ts`: the rotation's memory of what has been played also predates the rename.
migrateLegacyKeys()

/** Generous enough to express "everything except the unseen few". */
const PLAYED_LIMIT = 100

function readPlayed(): string[] {
  try {
    const raw = window.localStorage.getItem(PLAYED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

let played: string[] = typeof window === 'undefined' ? [] : readPlayed()
let flushTimer: number | undefined

/**
 * Records a passage as played. The in-memory list changes immediately; the storage write is
 * deferred, because this can be reached from inside a keystroke (a restart rebuilds the
 * prompt) and a synchronous write there would land on the hot path.
 */
export function noteSourcePlayed(id: string): void {
  const at = played.indexOf(id)
  if (at !== -1) played.splice(at, 1)
  played.push(id)
  if (played.length > PLAYED_LIMIT) played = played.slice(-PLAYED_LIMIT)

  if (typeof window === 'undefined') return
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(PLAYED_KEY, JSON.stringify(played))
    } catch {
      // Storage disabled or full: rotation degrades to per-session, which is fine.
    }
  }, 900)
}

/** A new id for a passage the user just added. */
export function newSourceId(): string {
  return `src-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** A first name for a passage, so a freshly pasted text is never an empty chip. */
export function suggestSourceName(text: string, existing: readonly UserSource[]): string {
  const firstWords = text.trim().split(/\s+/).slice(0, 3).join(' ')
  const base = firstWords.length > 0 ? firstWords.slice(0, 28) : 'my text'
  if (!existing.some((s) => s.name === base)) return base
  for (let n = 2; n < 50; n++) {
    const candidate = `${base} ${n}`
    if (!existing.some((s) => s.name === candidate)) return candidate
  }
  return base
}

/** The passage a non-rotating `custom` mode plays. */
export function selectedSource(
  sources: readonly UserSource[],
  activeSourceId: string | null,
): UserSource | null {
  if (sources.length === 0) return null
  const found = activeSourceId === null ? undefined : sources.find((s) => s.id === activeSourceId)
  return found ?? sources[0]
}

/**
 * The passage a rotating `custom` mode plays for a given seed.
 *
 * Memoised per seed. That makes the answer a stable property of the test rather than of
 * *when* you ask: the typing bar and the prompt builder both call this and must never
 * disagree.
 *
 * Note what this does **not** do: mark the passage as played. That happens when a test
 * actually starts (see `beginTest`), for the same reason a fact is marked when it reaches
 * the typist — a prompt that was built and then thrown away, which happens on every mount
 * while React double-invokes effects in development, must not consume a passage from the
 * rotation.
 */
const chosenBySeed = new Map<string, string | null>()
const CHOICE_SEED_LIMIT = 32

export function rotatingSourceId(seed: number, sources: readonly UserSource[]): string | null {
  if (sources.length === 0) return null

  const key = `${seed}:${sources.map((s) => s.id).join(',')}`
  const memo = chosenBySeed.get(key)
  if (memo !== undefined) return memo

  const ids = sources.map((s) => s.id)
  const rng = createRng(seed)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = ids[i]
    ids[i] = ids[j]
    ids[j] = tmp
  }

  const snapshot = [...played]
  const fresh = ids.filter((id) => !snapshot.includes(id))
  const seen = ids
    .filter((id) => snapshot.includes(id))
    .sort((a, b) => snapshot.indexOf(a) - snapshot.indexOf(b))

  const choice = (fresh[0] ?? seen[0] ?? ids[0]) ?? null
  chosenBySeed.set(key, choice)
  if (chosenBySeed.size > CHOICE_SEED_LIMIT) {
    const oldest = chosenBySeed.keys().next().value
    if (oldest !== undefined) chosenBySeed.delete(oldest)
  }
  return choice
}

/** The settings fields this module needs; a structural type so callers pass what they have. */
export interface SourceContext {
  sources: UserSource[]
  activeSourceId: string | null
  rotateSources: boolean
}

/**
 * Which passage a test is playing: the rotation's choice, or the pinned one.
 *
 * One entry point so the prompt builder and the UI cannot drift — the typing bar labels the
 * chip from this, and the word stream is built from this, and they must agree even while
 * the rotation is still running.
 */
export function resolvedSource(seed: number, settings: SourceContext): UserSource | null {
  if (!settings.rotateSources) return selectedSource(settings.sources, settings.activeSourceId)
  const id = rotatingSourceId(seed, settings.sources)
  return id === null ? null : (settings.sources.find((s) => s.id === id) ?? null)
}

/** The passage itself, or null when there is nothing usable to type. */
export function passageFor(seed: number, settings: SourceContext): string | null {
  const source = resolvedSource(seed, settings)
  return source && source.text.trim().length > 0 ? source.text : null
}
