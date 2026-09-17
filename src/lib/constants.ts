/**
 * Shared numeric constants for the input and buffer behaviour, kept in one place so
 * the engine, the store and the renderer cannot drift apart.
 */

/** Characters typed past the end of a word are recorded and rendered, capped here (§7). */
export const MAX_EXTRA_CHARS = 5

/** How many words are kept generated ahead of the cursor (§3). */
export const BUFFER_TARGET = 200

/** How many words are appended when the buffer runs low. */
export const APPEND_CHUNK = 100

/** Top the buffer up once fewer than this many words remain ahead. */
export const MIN_AHEAD = 120

/** Prune rendered words once this many sit behind the cursor (§13). */
export const MAX_WORDS_BEHIND = 60

/** How many words to keep behind the cursor after a prune. */
export const WORDS_KEPT_BEHIND = 20

/** Window in which Enter after Tab restarts the test. */
export const TAB_ENTER_WINDOW_MS = 1500

/**
 * How long after mount the WebAudio graph is built.
 *
 * Constructing an `AudioContext` costs ~170ms on the first call (measured in this app's
 * browser), so it is deliberately paid once, on an idle thread: late enough that the
 * entrance animation has finished, early enough that it is almost always done before the
 * typist's first keystroke. See `warmAudioAfterPaint` and the audio effect in
 * `useTypingEngine`.
 */
export const IDLE_AUDIO_WARM_MS = 800

/**
 * Duration presets for `time` mode.
 *
 * Labels switch to minutes from one minute up, and the seconds-only entries keep the
 * short tests one tap away. Anything else the user wants is typed into the custom field,
 * which is why the limit itself is a plain number of seconds throughout the app.
 */
export interface TimePreset {
  seconds: number
  label: string
}

export const TIME_PRESETS: TimePreset[] = [
  { seconds: 15, label: '15s' },
  { seconds: 30, label: '30s' },
  { seconds: 60, label: '1 min' },
  { seconds: 120, label: '2 min' },
  { seconds: 300, label: '5 min' },
  { seconds: 900, label: '15 min' },
]

/** Word-count presets for `words` mode; any other count goes in the custom field. */
export const WORD_PRESETS: number[] = [10, 25, 50, 100]

/** Bounds for the custom fields, so a typo cannot produce an absurd test. */
export const MIN_TIME_SECONDS = 5
export const MAX_TIME_SECONDS = 3600
export const MIN_WORDS = 1
export const MAX_WORDS = 500

/**
 * Human phrasing for a duration, used where a value has to read naturally rather than as
 * digits — the timer, tooltips and the idle hint.
 */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const minutes = Math.floor(s / 60)
  const rest = s % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}s`
}
