import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EffectsSettings, Settings, ThemeColors, ThemeName, UserSource } from '../types'
import { DEEP_BLUE, THEMES } from '../lib/themes'
import { FACT_CATEGORY_ORDER } from '../lib/facts'
import { newSourceId, suggestSourceName } from '../lib/sources'
import { migrateLegacyKeys, STORAGE_KEYS } from '../lib/storage'

/**
 * Persisted settings. Every change applies instantly and survives a reload.
 *
 * The store holds *only* settings. Test state lives in `useTestStore` and is never
 * persisted — a keystroke must never touch localStorage, which would be a synchronous
 * write on the hot path.
 *
 * The one thing here that is not really a *setting* is the passage library. It lives in
 * this store because it is persisted user data and there is nowhere better for it, but it
 * is treated as content: "Reset everything" deliberately leaves it alone.
 */

export const DEFAULT_SETTINGS: Settings = {
  theme: 'deep-blue',
  colors: { ...DEEP_BLUE },

  backgroundStyle: 'orbs',
  glowIntensity: 1,

  // Everything on by default: the app's whole character is in these five, and a typing test
  // that looks plain on first launch is a worse first impression than one that looks like
  // itself. Anyone whose machine struggles has one switch — Performance → Lite — and four
  // individual ones after it.
  performance: 'full',
  effects: {
    animatedBackground: true,
    noiseTexture: true,
    glassBlur: true,
    glowEffects: true,
    characterAnimations: true,
  },
  // Windowed on first run. Fullscreen is one key away (F11) and one switch away in Settings →
  // Display, but an app that opens by taking over the whole screen before you have asked it to
  // is a worse default than one you have to enlarge.
  fullscreen: false,

  monoFont: 'jetbrains',
  fontSize: 28,
  lineHeight: 1.7,
  letterSpacing: 0.02,

  // Underline is the default: it reads clearly at every font size, sits below the glyphs
  // rather than on top of them, and does not flicker across a character's own stroke.
  caretStyle: 'underline',
  smoothCaret: true,
  blinkCaret: true,
  // On by default. The synthesised click is the app's main confirmation that a key landed,
  // and the audio graph is now built on an idle thread, so there is no longer a reason to
  // hide it behind a setting most people never open.
  soundOnKeypress: true,
  volume: 0.5,
  errorSound: true,
  liveWpm: true,
  stopOnError: 'off',
  forgiveSpaces: true,
  difficulty: 'normal',
  reduceMotion: 'auto',

  mode: 'time',
  timeLimit: 30,
  customTimeUnit: 'sec',
  wordLimit: 25,
  language: 'english',

  // Facts by default, alternating with random words: a stream of common words gets dull
  // long before a paragraph of real prose does, and the brief's word corpus stays one
  // toggle away.
  promptSource: 'mixed',
  factCategories: [...FACT_CATEGORY_ORDER],
  sources: [],
  activeSourceId: null,
  rotateSources: true,

  // The target letter stays put and turns red. Seeing your own keystroke replace the prompt
  // is useful for diagnosing a typo and actively harmful for typing speed: the word you are
  // reading changes shape under the cursor on every miss.
  errorDisplay: 'target',
}

export interface SettingsStore extends Settings {
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /**
   * One effect switch, by key.
   *
   * A dedicated action rather than `update('effects', { ...effects, [key]: value })` at the
   * call site, and the difference is not stylistic. Composing the object from the value in
   * scope means the write is based on the `effects` object from the render that drew the
   * button — so two switches clicked within one render cycle both start from the same stale
   * copy, and the second click silently discards the first. Flicking three switches in quick
   * succession (which is exactly what a `lite`-and-back excursion looks like) would leave only
   * the last one standing. Reading `state` inside `set` is what makes each write build on the
   * previous one instead of racing it.
   */
  setEffect: <K extends keyof EffectsSettings>(key: K, value: EffectsSettings[K]) => void
  /** Several effect switches at once, for the same reason. */
  setEffects: (patch: Partial<EffectsSettings>) => void
  /** Editing any colour switches the active preset to `custom`. */
  setColor: (key: keyof ThemeColors, value: string) => void
  applyTheme: (name: Exclude<ThemeName, 'custom'>) => void
  /** Restores the colours of the *currently selected* preset. */
  resetTheme: () => void
  /** Resets every setting, keeping the saved passages. */
  resetAll: () => void

  /** Adds a passage and makes it the active one. Returns its id. */
  addSource: (text: string, name?: string) => string
  updateSource: (id: string, patch: Partial<Omit<UserSource, 'id'>>) => void
  removeSource: (id: string) => void
}

// The persisted store reads localStorage the moment it is created, so the legacy keys have
// to have been moved first — a Blue Type install that relaunches into NovaType keeps its
// theme, its font and its saved passages.
migrateLegacyKeys()

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      update: (key, value) => set({ [key]: value } as Partial<Settings>),

      setEffect: (key, value) =>
        set((state) => ({ effects: { ...state.effects, [key]: value } })),

      setEffects: (patch) => set((state) => ({ effects: { ...state.effects, ...patch } })),

      setColor: (key, value) =>
        set((state) => ({
          colors: { ...state.colors, [key]: value },
          theme: 'custom',
        })),

      applyTheme: (name) => set({ theme: name, colors: { ...THEMES[name].colors } }),

      resetTheme: () => {
        const { theme } = get()
        if (theme === 'custom') {
          set({ colors: { ...DEEP_BLUE }, theme: 'deep-blue' })
        } else {
          set({ colors: { ...THEMES[theme].colors } })
        }
      },

      // `sources`, `activeSourceId` and `rotateSources` are intentionally excluded: they
      // are the user's own text, and no settings button should throw it away.
      resetAll: () =>
        set({
          ...DEFAULT_SETTINGS,
          colors: { ...DEEP_BLUE },
          sources: get().sources,
          activeSourceId: get().activeSourceId,
          rotateSources: get().rotateSources,
        }),

      addSource: (text, name) => {
        const id = newSourceId()
        const trimmed = text.trim()
        set((state) => ({
          sources: [
            ...state.sources,
            { id, name: name?.trim() || suggestSourceName(trimmed, state.sources), text: trimmed },
          ],
          activeSourceId: id,
          // Adding a passage is an explicit "type this one" choice, so it also stops the
          // rotation from quietly playing something else on the next test. The `rotate`
          // chip in the typing bar turns it back on.
          rotateSources: false,
        }))
        return id
      },

      updateSource: (id, patch) =>
        set((state) => ({
          sources: state.sources.map((source) =>
            source.id === id ? { ...source, ...patch } : source,
          ),
        })),

      removeSource: (id) =>
        set((state) => {
          const sources = state.sources.filter((source) => source.id !== id)
          return {
            sources,
            activeSourceId:
              state.activeSourceId === id ? (sources[0]?.id ?? null) : state.activeSourceId,
          }
        }),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 7,
      /**
       * v1 → v2: the underline caret became the default. A stored `line` from v1 was the old
       * default rather than a deliberate choice, so it is migrated rather than left alone.
       *
       * v2 → v3: adds the custom passage and the error-display preference. Both arrive from
       * `DEFAULT_SETTINGS` through the merge below.
       *
       * v4 → v5: difficulty became the single control over the character mix — it owns
       * punctuation, numbers and symbols — and grew `easy` and `hard` rungs. A session that
       * had punctuation or numbers switched on is moved to `hard`, the rung that includes
       * them; nothing that was on is silently turned off.
       *
       * Note what this does to a stored `expert`: it keeps its name and its handicap, and
       * picks up the symbol mix, which is a real change to what that rung produces. It also
       * hides the caret — worth knowing, because "the caret vanishes" and "expert is on"
       * look nothing alike from the outside.
       *
       * v5 → v6: the window has no native frame and the app draws its own bar, so the
       * fullscreen *state* became something the app has to remember and restore on launch.
       * It arrives from `DEFAULT_SETTINGS` (windowed) through the merge below.
       *
       * v6 → v7: the effects became individually switchable, behind a `lite` profile. Both
       * arrive from `DEFAULT_SETTINGS` (everything on) through the merge — and the merge is
       * shallow, so `effects` needs its own guard below or a v6 install would get the new
       * object replaced wholesale by whatever it had stored, which is nothing at all.
       *
       * v3 → v4: one passage becomes a library, and `custom` stops being a prompt source.
       * A stored passage is carried across as the first entry — losing it would silently
       * delete something the user pasted — and a session that was on the `custom` source
       * moves to the `custom` mode, which is where that behaviour now lives.
       */
      migrate: (persisted, version) => {
        // Deliberately a loose record: this is arbitrary JSON written by an older release,
        // and typing it as `Partial<Settings>` would be a claim about data that has not
        // been validated yet.
        const state = { ...((persisted ?? {}) as Record<string, unknown>) }
        if (version < 2) state.caretStyle = 'underline'
        if (version < 4) {
          const legacy = typeof state.customText === 'string' ? state.customText.trim() : ''
          if (legacy.length > 0 && !Array.isArray(state.sources)) {
            state.sources = [{ id: 'legacy-passage', name: 'my text', text: legacy }]
            state.activeSourceId = 'legacy-passage'
          }
          // `custom` used to be a prompt *source*; the behaviour it described — type your
          // own text, and the run ends when the text does — is now a mode of its own.
          if (state.promptSource === 'custom') {
            state.mode = 'custom'
            state.promptSource = 'mixed'
          }
          delete state.customText
          // The underline caret has been asked for as the default more than once; v4 is
          // where that finally sticks for installs that predate it.
          state.caretStyle = 'underline'
        }
        if (version < 5) {
          const hadExtras = state.punctuation === true || state.numbers === true
          if (hadExtras && state.difficulty !== 'expert') state.difficulty = 'hard'
        }
        // Both keys are gone from the schema, so an install that never migrates must not
        // carry them along where they would look like real settings.
        delete state.punctuation
        delete state.numbers
        return state as unknown as Settings
      },
      /**
       * Shallow-merges persisted values over the defaults so a setting added in a
       * later version is picked up rather than left `undefined`.
       */
      merge: (persisted, current) => {
        const saved = { ...((persisted ?? {}) as Record<string, unknown>) }
        // Legacy keys that survived the migration (an install that never ran it) must not
        // ride along in state, where they would look like real settings.
        delete saved.customText
        delete saved.punctuation
        delete saved.numbers
        return {
          ...current,
          ...saved,
          // The two nested objects are the only settings that are not a single value, so the
          // shallow spread above would replace them wholesale — and a stored `colors` from an
          // older release has no `--veil` keys, while a stored `effects` from v6 has no keys
          // at all. Merged key-wise so a new one is picked up rather than left `undefined`.
          colors: { ...current.colors, ...((saved.colors ?? {}) as object) },
          effects: { ...current.effects, ...((saved.effects ?? {}) as object) },
        } as SettingsStore
      },
    },
  ),
)

/** Non-reactive read, for use inside event handlers and imperative code. */
export function getSettings(): Settings {
  return useSettingsStore.getState()
}
