/**
 * Shared domain types for NovaType.
 *
 * Note on the architecture: the brief's `TestState.input: string` is stored here as
 * `typed: string[]` (one entry per generated word). It is semantically equivalent but
 * lets selectors subscribe to a single word, which is what keeps a keystroke from
 * re-rendering the whole word list (see the rendering rule in the brief, §2.2).
 * `currentCharIndex` is derived from `typed[currentWordIndex].length` and is never stored.
 */

export type TestStatus = 'idle' | 'running' | 'finished'
/**
 * How a test ends.
 *
 * `time` counts down, `words` counts words, `endless` never ends on its own and `custom`
 * runs to the end of one of the user's own saved passages. The last one is a mode rather
 * than a *source* because it is the only way to express "type this text once, then stop" —
 * a source has no length of its own.
 */
export type TestMode = 'time' | 'words' | 'endless' | 'custom'

export type CaretStyle = 'line' | 'block' | 'underline'
/**
 * How hard the generated text itself is.
 *
 * A ladder rather than a switch: `easy` draws only short words, `normal` is the whole
 * common-English corpus, `hard` mixes punctuation, numbers and symbols through every line,
 * and `expert` is `hard` with the caret hidden and backspace disabled. The presets live in
 * `lib/difficulty.ts`, and they are what the generator reads — the app never assembles the
 * mix from loose flags, so `hard` cannot mean two different things on two screens.
 */
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert'
export type StopOnError = 'off' | 'letter' | 'word'
export type BackgroundStyle = 'solid' | 'gradient' | 'orbs' | 'mesh'
export type ReduceMotionPref = 'auto' | 'on' | 'off'

export type ThemeName =
  | 'deep-blue'
  | 'midnight'
  | 'ocean'
  | 'cyber'
  | 'ice'
  | 'nord'
  | 'aurora'
  | 'nebula'
  | 'abyss'
  | 'matrix'
  | 'ember'
  | 'rose'
  /** Black and white, no hue at all. */
  | 'mono'
  /** White and black, no hue at all — the one light preset. */
  | 'paper'
  | 'custom'

/**
 * How much decoration the app draws.
 *
 * `lite` is the switch for a machine that cannot afford the backdrop: it collapses every
 * optional effect at once — the drifting orbs, the noise layer, the glass blur, the glows and
 * the per-character animations — and leaves flat colours and a plain background. The
 * individual toggles stay available for anyone who wants to trade one of them back.
 *
 * A profile rather than a single "reduce effects" flag because they are not equally
 * expensive: the blur is a filter pass over everything it touches, the orbs are two large
 * blurred layers that never stop compositing, and the glows are shadow passes on text that
 * changes every keystroke.
 */
export type PerformanceProfile = 'full' | 'lite'

export interface EffectsSettings {
  /**
   * The animated background layers — orbs, washes, the radial glow behind the prompt.
   * Turning it off leaves the base colour and nothing else, which is also the single biggest
   * win available on a slow GPU.
   */
  animatedBackground: boolean
  /** The full-screen noise texture, drawn with `mix-blend-mode: soft-light`. */
  noiseTexture: boolean
  /** `backdrop-filter` on panels, buttons and dialogs. */
  glassBlur: boolean
  /** Text shadows, glow rings and halo shadows. */
  glowEffects: boolean
  /** The per-keystroke character animations. */
  characterAnimations: boolean
}

export type MonoFontKey = 'jetbrains' | 'roboto' | 'fira' | 'system'
export type LanguageCode = 'english'

/**
 * Both limits are plain numbers now, in seconds and words respectively: the presets are
 * only suggestions, and the typing bar accepts any value the user types.
 */
export type TimeLimit = number
export type WordLimit = number

/** Unit used by the custom duration field, so "7 min" and "90 sec" are both expressible. */
export type TimeUnit = 'sec' | 'min'

/** Where the generated prompt text comes from, when the mode is not `custom`. */
export type PromptSource = 'random' | 'facts' | 'mixed'

/**
 * One of the user's own saved passages.
 *
 * A library rather than a single text, because the thing people do with their own text is
 * collect it — a paragraph from an article, a poem, a list of terms — and then want a
 * different one each run. `name` is what the chips in the typing bar show.
 */
export interface UserSource {
  id: string
  name: string
  text: string
}

/**
 * What a mistyped position renders.
 *
 * `target` keeps the character you were *meant* to type and turns it red — the mistake is
 * legible as a colour, and the text never changes under your cursor. `typed` shows the key
 * you actually pressed instead, which is how most typing tests work.
 */
export type ErrorDisplay = 'target' | 'typed'

export type FactCategory = 'science' | 'sport' | 'history' | 'tech' | 'nature' | 'general'

/** The full runtime theme, every value of which becomes a CSS variable. */
export interface ThemeColors {
  bgBase: string
  bgSurface: string
  bgElevated: string
  accent: string
  accentBright: string
  accentGlow: string
  textUntyped: string
  textCorrect: string
  textIncorrect: string
  textMuted: string
  caret: string
  border: string
}

export interface Settings {
  /** Theme preset id. Editing any colour switches this to 'custom'. */
  theme: ThemeName

  /* ── Appearance ─────────────────────────────────────────── */
  colors: ThemeColors
  backgroundStyle: BackgroundStyle
  /** 0–1 multiplier applied to every glow in the UI. */
  glowIntensity: number

  /* ── Performance ────────────────────────────────────────── */
  /** `lite` forces every effect below off. */
  performance: PerformanceProfile
  effects: EffectsSettings
  /**
   * Whether the window was last left in fullscreen.
   *
   * Persisted rather than derived: the app is frameless, so fullscreen is a property of the
   * window that only the app itself can set, and a restart is exactly when it has to be
   * restored — the OS has no memory of it to fall back on.
   */
  fullscreen: boolean

  /* ── Typography ─────────────────────────────────────────── */
  monoFont: MonoFontKey
  /** px */
  fontSize: number
  /** unitless multiplier */
  lineHeight: number
  /** em */
  letterSpacing: number

  /* ── Behaviour ──────────────────────────────────────────── */
  caretStyle: CaretStyle
  smoothCaret: boolean
  blinkCaret: boolean
  soundOnKeypress: boolean
  volume: number
  errorSound: boolean
  liveWpm: boolean
  stopOnError: StopOnError
  /**
   * Every word ends in a real separator slot.
   *
   * On: a character typed at that slot closes the word and lands on the next one, as if the
   * space had been pressed — the missed separator is not logged, but the character is
   * still graded against the new word, so the mistake stays visible and counted.
   *
   * Off: the slot has to be filled. A character typed into it is marked as a soft error and
   * the cursor does not move, which is the stricter, more literal reading of the prompt.
   *
   * Either way, a space pressed *before* the end of a word abandons the word: the space is
   * logged as an incorrect keystroke and the cursor moves to the next word, because
   * refusing the key read as the app having stopped accepting input.
   */
  forgiveSpaces: boolean
  /**
   * Owns the character mix outright: punctuation, numbers and symbols are what the level
   * means, so they are no longer separate toggles that could disagree with it.
   */
  difficulty: Difficulty
  reduceMotion: ReduceMotionPref

  /* ── Test configuration ─────────────────────────────────── */
  mode: TestMode
  timeLimit: TimeLimit
  /** Unit the custom duration field is expressed in. */
  customTimeUnit: TimeUnit
  wordLimit: WordLimit
  language: LanguageCode

  /* ── Prompt content ─────────────────────────────────────── */
  promptSource: PromptSource
  /** Categories used when the prompt source includes facts. */
  factCategories: FactCategory[]
  /**
   * The user's own passages. Persisted, so text pasted once is still there tomorrow.
   * The `custom` mode draws its prompt from here.
   */
  sources: UserSource[]
  /**
   * Which saved passage the `custom` mode plays when rotation is off. Null until one has
   * been chosen; the first source is used until then.
   */
  activeSourceId: string | null
  /**
   * Whether the `custom` mode walks through the saved passages, one per test, instead of
   * replaying `activeSourceId`. On by default: the whole point of saving several is not to
   * have to pick between them.
   */
  rotateSources: boolean

  /* ── Feedback ───────────────────────────────────────────── */
  errorDisplay: ErrorDisplay
}

export interface Word {
  /** Stable identity, monotonic across buffer growth. */
  id: number
  text: string
}

/**
 * The position of the last refused key, so the renderer can mark it.
 *
 * Only ever one at a time, and it is cleared by the next keystroke of any kind: it is
 * feedback about the key you just pressed, not a property of the text. `position` counts
 * characters, so `position === words[word].text.length` is the separator slot.
 */
export interface SoftError {
  word: number
  position: number
}

/**
 * A single recorded keystroke. The single source of truth for every statistic.
 *
 * `expected` is a superset of the brief's `{ timestamp, correct, char }`: keeping the
 * character that was *expected* is what makes the "top 5 most-missed characters"
 * breakdown in the Results screen meaningful (it reports the key you fumble, not the
 * key you accidentally pressed).
 */
export interface KeystrokeLog {
  /** Milliseconds since test start. */
  t: number
  correct: boolean
  char: string
  expected: string
}

export interface PerSecondPoint {
  second: number
  wpm: number
  rawWpm: number
  errors: number
}

export interface CharCounts {
  correct: number
  incorrect: number
  extra: number
  missed: number
}

export interface TestResult {
  wpm: number
  rawWpm: number
  wps: number
  accuracy: number
  consistency: number
  chars: CharCounts
  errors: number
  /** Total elapsed milliseconds. */
  elapsedMs: number
  wordsCompleted: number
  series: PerSecondPoint[]
  /** Top missed characters, most-missed first. */
  missedChars: { char: string; count: number }[]
}
