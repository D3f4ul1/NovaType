import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2, X } from 'lucide-react'
import { MotionButton } from './MotionButton'
import { NumberField, Segmented, Slider } from './controls'
import { MAX_TIME_SECONDS, MAX_WORDS, MIN_TIME_SECONDS, MIN_WORDS } from '../lib/constants'
import { EASE_OUT } from '../lib/motion'
import { MONO_FONTS, MONO_FONT_ORDER, THEMES, THEME_ORDER, toHex } from '../lib/themes'
import { FACT_CATEGORY_LABELS, FACT_CATEGORY_ORDER } from '../lib/facts'
import { DIFFICULTY_ORDER, difficultyPreset } from '../lib/difficulty'
import { customWordCount } from '../lib/generateWords'
import { selectedSource } from '../lib/sources'
import { ensureAudio } from '../lib/sound'
import { useSettingsStore } from '../store/useSettingsStore'
import type {
  BackgroundStyle,
  CaretStyle,
  Difficulty,
  ErrorDisplay,
  EffectsSettings,
  FactCategory,
  MonoFontKey,
  PerformanceProfile,
  PromptSource,
  ReduceMotionPref,
  StopOnError,
  TestMode,
  ThemeColors,
  ThemeName,
  TimeUnit,
  UserSource,
} from '../types'

/**
 * Settings slide-over — §10.
 *
 * Every control writes straight into the persisted store, which is what makes changes
 * apply instantly *and* survive a reload with no save button. Colours are written to CSS
 * variables by `ThemeProvider`, so recolouring is instant and free of re-renders.
 *
 * Two layout rules earn their keep here:
 *
 * • Rows pair a label with a compact control. When the control is wide — the background
 *   style group, the font families — the row *stacks* instead of squeezing the label,
 *   which is what previously left "Background style" wrapped and overlapping its own
 *   options.
 * • Anything the panel can change about the text itself lives in one "Prompt" section, so
 *   the connection between the source, the categories and the difficulty ladder is explicit
 *   rather than scattered across three groups.
 */

export interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  reduceMotion: boolean
  /** Live fullscreen state of the OS window, not the stored preference. */
  fullscreen: boolean
  /** False in a browser, where there is no window to take over. */
  canFullscreen: boolean
  onFullscreenChange: (on: boolean) => void
}

const BACKGROUND_OPTIONS: { id: BackgroundStyle; label: string }[] = [
  { id: 'solid', label: 'solid' },
  { id: 'gradient', label: 'gradient' },
  { id: 'orbs', label: 'glow orbs' },
  { id: 'mesh', label: 'mesh' },
]

const PROMPT_SOURCES: { id: PromptSource; label: string }[] = [
  { id: 'random', label: 'random' },
  { id: 'facts', label: 'facts' },
  { id: 'mixed', label: 'mixed' },
]

const PERFORMANCE_OPTIONS: { id: PerformanceProfile; label: string }[] = [
  { id: 'full', label: 'full' },
  { id: 'lite', label: 'lite' },
]

/**
 * The five effect switches, in the order they cost.
 *
 * Ordered by how much each one buys back rather than by category: the animated backdrop is a
 * pair of full-screen blurred layers that never stop compositing, the noise layer forces a
 * blend of everything beneath it, and the glows and per-character animations are a shadow or
 * a keyframe per character per keystroke. Someone hunting for performance should find the
 * biggest lever first, which is why this is a list with a reason on each line and not a grid
 * of five unlabelled switches.
 */
const EFFECT_FIELDS: { key: keyof EffectsSettings; label: string; hint: string }[] = [
  {
    key: 'animatedBackground',
    label: 'Animated backdrop',
    hint: 'Drifting orbs, washes and the glow behind the prompt — the heaviest layer',
  },
  { key: 'noiseTexture', label: 'Noise grain', hint: 'Full-screen texture blended over everything' },
  { key: 'glassBlur', label: 'Glass blur', hint: 'Blurs the background behind panels and buttons' },
  { key: 'glowEffects', label: 'Glows', hint: 'Every shadow and halo around text and controls' },
  {
    key: 'characterAnimations',
    label: 'Character animation',
    hint: 'A keyframe per character on every keystroke',
  },
]

const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'bgBase', label: 'Background' },
  { key: 'bgSurface', label: 'Surface' },
  { key: 'accent', label: 'Accent' },
  { key: 'caret', label: 'Caret' },
  { key: 'textUntyped', label: 'Untyped text' },
  { key: 'textCorrect', label: 'Correct text' },
  { key: 'textIncorrect', label: 'Incorrect text' },
]

export function SettingsPanel({
  open,
  onClose,
  reduceMotion,
  fullscreen,
  canFullscreen,
  onFullscreenChange,
}: SettingsPanelProps) {
  const settings = useSettingsStore()
  const closeRef = useRef<HTMLButtonElement>(null)
  const { update, setColor, applyTheme, resetTheme, resetAll, setEffect, setEffects } = settings

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const slide = reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: EASE_OUT as [number, number, number, number] }
  const fade = reduceMotion ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' as const }

  const presetOrder = THEME_ORDER.filter(
    (name): name is Exclude<ThemeName, 'custom'> => name !== 'custom',
  )

  // `lite` overrides the five switches rather than resetting them, so their stored values are
  // the *user's*, not the profile's — which is why they stay on screen (disabled) instead of
  // being hidden while it is active. Turning the profile back to `full` gives them back exactly
  // as they were.
  const lite = settings.performance === 'lite'

  /**
   * One click to the cheapest the app can look: a monochrome theme, a flat background and no
   * glows at all.
   *
   * It is an action rather than a mode — nothing new is persisted, and every part of it is
   * visible on its own control somewhere in this panel, so the result can be adjusted or undone
   * one switch at a time. `lite` is deliberately *not* engaged: that also cancels the character
   * animations, which is a bigger change to the typing itself than "stop drawing navy".
   */
  const applyPlainLook = (light: boolean) => {
    applyTheme(light ? 'paper' : 'mono')
    update('backgroundStyle', 'solid')
    setEffects({ animatedBackground: false, noiseTexture: false, glowEffects: false })
  }

  const toggleCategory = (category: FactCategory) => {
    const next = settings.factCategories.includes(category)
      ? settings.factCategories.filter((c) => c !== category)
      : // Kept in the canonical order so the summary line never reshuffles.
        FACT_CATEGORY_ORDER.filter(
          (c) => c === category || settings.factCategories.includes(c),
        )
    update('factCategories', next)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40"
            // Derived from the theme's own background rather than a fixed near-black, so the
            // light presets dim toward their own colour instead of a navy wash.
            style={{
              background: 'color-mix(in srgb, var(--bg-base) 68%, transparent)',
              backdropFilter: 'blur(3px)',
            }}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l shadow-2xl"
            style={{
              borderColor: 'var(--border)',
              background: 'color-mix(in srgb, var(--bg-surface) 90%, transparent)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '-30px 0 80px -40px var(--accent-glow)',
            }}
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={slide}
          >
            <header
              className="flex shrink-0 items-center justify-between border-b px-5 py-4"
              style={{ borderColor: 'var(--border)' }}
            >
              <h2
                className="text-[13px] font-medium uppercase tracking-[0.22em]"
                style={{ color: 'var(--text-correct)' }}
              >
                Settings
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="rounded-lg border p-1.5 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </header>

            <div className="thin-scroll flex-1 overflow-y-auto px-5 py-5">
              {/* ── Display ──────────────────────────────────────
                  First, because it is the only section that is about the *window* rather than
                  about the text. Fullscreen is a property of the frameless window that only
                  the app can set, so it is also the one switch here that has to be told the
                  truth by the OS rather than reading it back out of a variable. */}
              <Section title="Display">
                <Row
                  label="Fullscreen"
                  hint={
                    canFullscreen
                      ? 'F11 toggles it anywhere in the app; Esc leaves it while the test is idle'
                      : 'Available in the desktop app'
                  }
                >
                  <Toggle
                    label="Fullscreen"
                    testId="fullscreen-toggle"
                    checked={fullscreen}
                    disabled={!canFullscreen}
                    onChange={onFullscreenChange}
                    reduceMotion={reduceMotion}
                  />
                </Row>
              </Section>

              {/* ── Performance ────────────────────────────────────────────
                  Second, because it is the other section about the machine rather than about
                  the text. Everything the app draws beyond plain colour lives here. */}
              <Section title="Performance">
                <Row
                  label="Effects"
                  stack
                  hint="'Lite' switches all five below off at once, without forgetting them"
                >
                  <Segmented
                    groupId="perf"
                    value={settings.performance}
                    options={PERFORMANCE_OPTIONS}
                    onChange={(value) => update('performance', value as PerformanceProfile)}
                    label="Effects profile"
                    reduceMotion={reduceMotion}
                  />
                </Row>

                {EFFECT_FIELDS.map((field) => (
                  <Row key={field.key} label={field.label} hint={field.hint}>
                    <Toggle
                      label={field.label}
                      testId={`effect-${field.key}`}
                      checked={settings.effects[field.key]}
                      disabled={lite}
                      onChange={(value) => setEffect(field.key, value as boolean)}
                      reduceMotion={reduceMotion}
                    />
                  </Row>
                ))}

                <Row
                  label="Plain look"
                  stack
                  hint="Black or white, flat background, no glows — the cheapest this can draw"
                >
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { light: false, label: 'Black', swatch: '#000000', edge: '#3F3F3F' },
                      { light: true, label: 'White', swatch: '#FFFFFF', edge: '#D4D4D8' },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        data-plain-look={option.label.toLowerCase()}
                        onClick={() => applyPlainLook(option.light)}
                        className="btn app-no-drag justify-start gap-2 !px-2.5 !py-1.5 text-[11px]"
                        title={`Monochrome ${option.label.toLowerCase()} theme, flat background, no glows`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{
                            background: option.swatch,
                            border: `1px solid ${option.edge}`,
                          }}
                        />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Row>
              </Section>

              {/* ── Theme ──────────────────────────────────────── */}
              <Section title="Theme">
                <div className="grid grid-cols-3 gap-2">
                  {presetOrder.map((name) => {
                    const preset = THEMES[name]
                    const isActive = settings.theme === name
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => applyTheme(name)}
                        className="flex flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
                        style={presetStyle(isActive)}
                      >
                        <span className="flex gap-1" aria-hidden="true">
                          <span
                            className="h-3.5 w-3.5 rounded-full"
                            style={{ background: preset.colors.accent }}
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full"
                            style={{ background: preset.colors.bgBase, border: '1px solid var(--border)' }}
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full"
                            style={{ background: preset.colors.textIncorrect }}
                          />
                        </span>
                        <span
                          className="text-[11px]"
                          style={{ color: isActive ? 'var(--text-correct)' : 'var(--text-muted)' }}
                        >
                          {preset.label}
                        </span>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    aria-pressed={settings.theme === 'custom'}
                    onClick={() => update('theme', 'custom')}
                    className="flex flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
                    style={presetStyle(settings.theme === 'custom')}
                  >
                    <span className="flex gap-1" aria-hidden="true">
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ background: settings.colors.accent }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ background: settings.colors.bgBase, border: '1px solid var(--border)' }}
                      />
                    </span>
                    <span
                      className="text-[11px]"
                      style={{
                        color: settings.theme === 'custom' ? 'var(--text-correct)' : 'var(--text-muted)',
                      }}
                    >
                      Custom
                    </span>
                  </button>
                </div>

                <div
                  className="mt-1 flex flex-col gap-2.5 rounded-xl border p-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {COLOR_FIELDS.map((field) => (
                    <label key={field.key} className="flex items-center justify-between gap-3">
                      <span className="text-[12px]" style={{ color: 'var(--text-correct)' }}>
                        {field.label}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className="text-[10px]"
                          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                        >
                          {toHex(settings.colors[field.key])}
                        </span>
                        <input
                          type="color"
                          aria-label={`${field.label} colour`}
                          value={toHex(settings.colors[field.key])}
                          onChange={(event) => setColor(field.key, event.target.value)}
                          className="h-6 w-8 rounded-lg"
                        />
                      </span>
                    </label>
                  ))}
                </div>

                <Row label="Background style" stack>
                  <Segmented
                    groupId="bg"
                    value={settings.backgroundStyle}
                    options={BACKGROUND_OPTIONS}
                    onChange={(value) => update('backgroundStyle', value as BackgroundStyle)}
                    label="Background style"
                    reduceMotion={reduceMotion}
                    className="flex-wrap"
                  />
                </Row>

                <Row label="Glow intensity" stack>
                  <Slider
                    label="Glow intensity"
                    value={settings.glowIntensity}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(value) => update('glowIntensity', value)}
                    format={(value) => `${Math.round(value * 100)}%`}
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <MotionButton
                  label="Reset theme to the default colours of the current preset"
                  onClick={resetTheme}
                  reduceMotion={reduceMotion}
                  className="w-full"
                >
                  Reset theme colours
                </MotionButton>
              </Section>

              {/* ── Typography ─────────────────────────────────── */}
              <Section title="Typography">
                <Row label="Font family" stack>
                  <Segmented
                    groupId="font"
                    value={settings.monoFont}
                    options={MONO_FONT_ORDER.map((key) => ({
                      id: key,
                      label: MONO_FONTS[key].label.split(' ')[0],
                    }))}
                    onChange={(value) => update('monoFont', value as MonoFontKey)}
                    label="Font family"
                    reduceMotion={reduceMotion}
                    className="flex-wrap"
                  />
                </Row>

                <Row label="Font size" stack>
                  <Slider
                    label="Font size in pixels"
                    value={settings.fontSize}
                    min={16}
                    max={48}
                    step={1}
                    onChange={(value) => update('fontSize', value)}
                    format={(value) => `${value}px`}
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <Row label="Line height" stack>
                  <Slider
                    label="Line height"
                    value={settings.lineHeight}
                    min={1.2}
                    max={2}
                    step={0.05}
                    onChange={(value) => update('lineHeight', value)}
                    format={(value) => value.toFixed(2)}
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <Row label="Letter spacing" stack>
                  <Slider
                    label="Letter spacing in em"
                    value={settings.letterSpacing}
                    min={-0.02}
                    max={0.1}
                    step={0.005}
                    onChange={(value) => update('letterSpacing', value)}
                    format={(value) => `${value.toFixed(3)}em`}
                    reduceMotion={reduceMotion}
                  />
                </Row>
              </Section>

              {/* ── Prompt ─────────────────────────────────────── */}
              <Section title="Prompt">
                <Row label="Text source" stack>
                  <Segmented
                    groupId="prompt-source"
                    value={settings.promptSource}
                    options={PROMPT_SOURCES}
                    onChange={(value) => update('promptSource', value as PromptSource)}
                    label="Text source"
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {settings.promptSource === 'random' &&
                    'Real words from the common-English corpus, drawn without repeats. Difficulty decides whether punctuation, numbers and symbols are mixed in.'}
                  {settings.promptSource === 'facts' &&
                    'Whole sentences from the fact library, so the text reads like prose.'}
                  {settings.promptSource === 'mixed' &&
                    'Alternating passages — fact sentences for a while, then random words — so a long run never goes stale.'}
                </p>

                {(settings.promptSource === 'facts' || settings.promptSource === 'mixed') && (
                  <Row label="Fact topics" hint="At least one stays selected" stack>
                    <div className="flex flex-wrap gap-1.5">
                      {FACT_CATEGORY_ORDER.map((category) => {
                        const active = settings.factCategories.includes(category)
                        const lastOne = active && settings.factCategories.length === 1
                        return (
                          <button
                            key={category}
                            type="button"
                            aria-pressed={active}
                            disabled={lastOne}
                            title={lastOne ? 'Keep at least one topic selected' : undefined}
                            onClick={() => toggleCategory(category)}
                            className="rounded-lg border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed"
                            style={{
                              borderColor: active
                                ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                                : 'var(--border)',
                              background: active
                                ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                                : 'var(--surface-veil)',
                              color: active ? 'var(--text-correct)' : 'var(--text-muted)',
                              opacity: lastOne ? 0.7 : 1,
                            }}
                          >
                            {FACT_CATEGORY_LABELS[category]}
                          </button>
                        )
                      })}
                    </div>
                  </Row>
                )}

                {/*
                  Punctuation and numbers used to be two toggles here, next to a
                  two-way difficulty switch that could not touch them. Three controls
                  over one thing, none of which agreed with the others; they are now the
                  `hard` rung of the difficulty ladder, which is also one click away in
                  the typing bar rather than buried in a panel.
                */}
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Punctuation, numbers and symbols belong to{' '}
                  <span style={{ color: 'var(--accent-bright)' }}>Difficulty</span> now: choose{' '}
                  <span style={{ color: 'var(--text-correct)' }}>hard</span> or{' '}
                  <span style={{ color: 'var(--text-correct)' }}>expert</span> to put the whole
                  keyboard in the prompt. Facts always keep their own punctuation.
                </p>
              </Section>

              {/* ── Your text ──────────────────────────────────── */}
              <Section title="Your text">
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Saved passages, used by the{' '}
                  <span style={{ color: 'var(--accent-bright)' }}>my text</span> mode — reachable
                  from the typing bar. A run ends when you reach the end of the passage.
                </p>

                <SourcesEditor reduceMotion={reduceMotion} />
              </Section>

              {/* ── Test ───────────────────────────────────────── */}
              <Section title="Test">
                <Row label="Mode" stack>
                  <Segmented
                    groupId="settings-mode"
                    value={settings.mode}
                    options={[
                      { id: 'time', label: 'time' },
                      { id: 'words', label: 'words' },
                      { id: 'endless', label: 'endless' },
                      { id: 'custom', label: 'my text' },
                    ]}
                    onChange={(value) => update('mode', value as TestMode)}
                    label="Test mode"
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <Row label="Duration" hint="Any value, in seconds or minutes">
                  <span className="flex items-center gap-2">
                    <NumberField
                      value={
                        settings.customTimeUnit === 'min'
                          ? Math.max(1, Math.round(settings.timeLimit / 60))
                          : settings.timeLimit
                      }
                      min={settings.customTimeUnit === 'min' ? 1 : MIN_TIME_SECONDS}
                      max={
                        settings.customTimeUnit === 'min'
                          ? Math.round(MAX_TIME_SECONDS / 60)
                          : MAX_TIME_SECONDS
                      }
                      onChange={(value) =>
                        update('timeLimit', settings.customTimeUnit === 'min' ? value * 60 : value)
                      }
                      label="Test duration"
                      width={46}
                    />
                    <Segmented
                      groupId="settings-time-unit"
                      value={settings.customTimeUnit}
                      options={[
                        { id: 'sec', label: 'sec' },
                        { id: 'min', label: 'min' },
                      ]}
                      onChange={(value) => update('customTimeUnit', value as TimeUnit)}
                      label="Duration unit"
                      reduceMotion={reduceMotion}
                    />
                  </span>
                </Row>

                <Row label="Word count" hint="Any value, up to 500">
                  <NumberField
                    value={settings.wordLimit}
                    min={MIN_WORDS}
                    max={MAX_WORDS}
                    onChange={(value) => update('wordLimit', value)}
                    label="Word count"
                    suffix="words"
                    width={46}
                  />
                </Row>

                <Row label="Stop on error">
                  <Segmented
                    groupId="stoperr"
                    value={settings.stopOnError}
                    options={[
                      { id: 'off', label: 'off' },
                      { id: 'letter', label: 'letter' },
                      { id: 'word', label: 'word' },
                    ]}
                    onChange={(value) => update('stopOnError', value as StopOnError)}
                    label="Stop on error"
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <Row
                  label="Space forgiveness"
                  hint="A character typed on the separator slot closes the word and lands on the next. Off: the slot has to be filled, and a character typed there is marked in light red. A space before the end of a word always abandons the word."
                >
                  <Toggle
                    label="Space forgiveness"
                    checked={settings.forgiveSpaces}
                    onChange={(value) => update('forgiveSpaces', value)}
                    reduceMotion={reduceMotion}
                  />
                </Row>

                <Row label="Difficulty" hint={difficultyPreset(settings.difficulty).blurb}>
                  <Segmented
                    groupId="difficulty"
                    value={settings.difficulty}
                    options={DIFFICULTY_ORDER.map((id) => ({ id, label: id }))}
                    onChange={(value) => update('difficulty', value as Difficulty)}
                    label="Difficulty"
                    reduceMotion={reduceMotion}
                  />
                </Row>
              </Section>

              {/* ── Caret ──────────────────────────────────────── */}
              <Section title="Caret">
                <Row label="Caret style">
                  <Segmented
                    groupId="caret"
                    value={settings.caretStyle}
                    options={[
                      { id: 'line', label: 'line' },
                      { id: 'block', label: 'block' },
                      { id: 'underline', label: 'under' },
                    ]}
                    onChange={(value) => update('caretStyle', value as CaretStyle)}
                    label="Caret style"
                    reduceMotion={reduceMotion}
                  />
                </Row>
                <Row label="Smooth caret" hint="Springs between characters">
                  <Toggle
                    label="Smooth caret"
                    checked={settings.smoothCaret}
                    onChange={(value) => update('smoothCaret', value)}
                    reduceMotion={reduceMotion}
                  />
                </Row>
                <Row label="Blink caret" hint="Only while idle">
                  <Toggle
                    label="Blink caret"
                    checked={settings.blinkCaret}
                    onChange={(value) => update('blinkCaret', value)}
                    reduceMotion={reduceMotion}
                  />
                </Row>
              </Section>

              {/* ── Sound ──────────────────────────────────────── */}
              <Section title="Sound">
                <Row label="Keypress sound" hint="Synthesised, no audio files">
                  <Toggle
                    label="Keypress sound"
                    checked={settings.soundOnKeypress}
                    // Switching sound on is the ideal moment to build the audio graph: it
                    // is a genuine gesture, and nothing is being timed — unlike the first
                    // keystroke of a test, which must not pay for it.
                    onChange={(value) => {
                      update('soundOnKeypress', value)
                      if (value) void ensureAudio()
                    }}
                    reduceMotion={reduceMotion}
                  />
                </Row>
                {settings.soundOnKeypress && (
                  <Row label="Volume" stack>
                    <Slider
                      label="Volume"
                      value={settings.volume}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) => update('volume', value)}
                      format={(value) => `${Math.round(value * 100)}%`}
                      reduceMotion={reduceMotion}
                    />
                  </Row>
                )}
                <Row label="Error sound">
                  <Toggle
                    label="Error sound"
                    checked={settings.errorSound}
                    onChange={(value) => {
                      update('errorSound', value)
                      if (value) void ensureAudio()
                    }}
                    reduceMotion={reduceMotion}
                  />
                </Row>
              </Section>

              {/* ── Behaviour ──────────────────────────────────── */}
              <Section title="Behaviour">
                <Row label="Live WPM" hint="Show the live stat row">
                  <Toggle
                    label="Live WPM display"
                    checked={settings.liveWpm}
                    onChange={(value) => update('liveWpm', value)}
                    reduceMotion={reduceMotion}
                  />
                </Row>
                <Row
                  label="Wrong letters"
                  hint="The prompt letter in red keeps the text from changing under your cursor"
                  stack
                >
                  <Segmented
                    groupId="error-display"
                    value={settings.errorDisplay}
                    options={[
                      { id: 'target', label: 'the letter' },
                      { id: 'typed', label: 'my keypress' },
                    ]}
                    onChange={(value) => update('errorDisplay', value as ErrorDisplay)}
                    label="Wrong letters"
                    reduceMotion={reduceMotion}
                  />
                </Row>
                <Row label="Reduce motion" stack hint="'Auto' follows your system setting">
                  <Segmented
                    groupId="motion"
                    value={settings.reduceMotion}
                    options={[
                      { id: 'auto', label: 'auto' },
                      { id: 'on', label: 'on' },
                      { id: 'off', label: 'off' },
                    ]}
                    onChange={(value) => update('reduceMotion', value as ReduceMotionPref)}
                    label="Reduce motion"
                    reduceMotion={reduceMotion}
                  />
                </Row>
              </Section>
            </div>

            <footer className="shrink-0 border-t px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              <MotionButton
                label="Reset all settings to their defaults"
                onClick={resetAll}
                reduceMotion={reduceMotion}
                className="w-full"
              >
                Reset everything
              </MotionButton>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * The passage library — the texts the `my text` mode plays.
 *
 * Pasting is refused everywhere else in the app, because it is the one shortcut around
 * typing. These fields are the exception: here the text is *input*, not a way to skip the
 * test, so Ctrl/Cmd + V and the context menu both work normally.
 *
 * Edits are committed on blur and on unmount rather than per keystroke. The store is
 * persisted on every change, so a textarea wired straight to it would mean a synchronous
 * localStorage write of the entire library for every character typed into a passage —
 * which is exactly the pattern the test state is kept out of storage to avoid.
 */
function SourcesEditor({ reduceMotion }: { reduceMotion: boolean }) {
  const sources = useSettingsStore((s) => s.sources)
  const activeSourceId = useSettingsStore((s) => s.activeSourceId)
  const rotateSources = useSettingsStore((s) => s.rotateSources)
  const update = useSettingsStore((s) => s.update)
  const addSource = useSettingsStore((s) => s.addSource)
  const updateSource = useSettingsStore((s) => s.updateSource)
  const removeSource = useSettingsStore((s) => s.removeSource)

  const [adding, setAdding] = useState(false)
  const active = selectedSource(sources, activeSourceId)

  return (
    <div className="flex flex-col gap-3">
      {sources.length === 0 && (
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Nothing saved yet. Add a passage and the typing bar will offer it in{' '}
          <span style={{ color: 'var(--accent-bright)' }}>my text</span>.
        </p>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source) => {
            const isActive = source.id === (active?.id ?? null)
            return (
              <span
                key={source.id}
                className="flex items-center rounded-lg border"
                style={{
                  borderColor: isActive
                    ? 'color-mix(in srgb, var(--accent) 55%, transparent)'
                    : 'var(--border)',
                  background: isActive
                    ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                    : 'var(--surface-veil)',
                }}
              >
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    update('activeSourceId', source.id)
                    update('rotateSources', false)
                  }}
                  className="max-w-[150px] truncate py-1 pl-2.5 pr-1 text-[11px]"
                  style={{ color: isActive ? 'var(--text-correct)' : 'var(--text-muted)' }}
                >
                  {source.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${source.name}`}
                  title={`Delete ${source.name}`}
                  onClick={() => removeSource(source.id)}
                  className="py-1 pl-1 pr-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {sources.length > 1 && (
        <Row
          label="Rotate passages"
          hint="One per test — a passage comes round again only after you have typed them all"
        >
          <Toggle
            label="Rotate passages"
            checked={rotateSources}
            onChange={(value) => update('rotateSources', value)}
            reduceMotion={reduceMotion}
          />
        </Row>
      )}

      {active && (
        <SourceEditor
          key={active.id}
          source={active}
          onCommit={(patch) => updateSource(active.id, patch)}
        />
      )}

      {adding ? (
        <NewSource
          reduceMotion={reduceMotion}
          onCancel={() => setAdding(false)}
          onAdd={(text, name) => {
            addSource(text, name)
            setAdding(false)
          }}
        />
      ) : (
        <MotionButton
          label="Add a passage"
          onClick={() => setAdding(true)}
          reduceMotion={reduceMotion}
          className="w-full justify-center"
        >
          <Plus size={13} aria-hidden="true" />
          <span>add a passage</span>
        </MotionButton>
      )}
    </div>
  )
}

/** The editable body of one saved passage. Keyed per source, so switching is a remount. */
function SourceEditor({
  source,
  onCommit,
}: {
  source: UserSource
  onCommit: (patch: Partial<Omit<UserSource, 'id'>>) => void
}) {
  const [text, setText] = useState(source.text)
  const [name, setName] = useState(source.name)

  const latest = useRef({ text, name })
  const committed = useRef({ text: source.text, name: source.name })
  const commitRef = useRef(onCommit)

  useEffect(() => {
    latest.current = { text, name }
  }, [text, name])
  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  const commit = () => {
    const patch: Partial<Omit<UserSource, 'id'>> = {}
    if (text !== committed.current.text) patch.text = text.trim()
    if (name !== committed.current.name) patch.name = name.trim() || 'untitled'
    if (patch.text === undefined && patch.name === undefined) return
    committed.current = { text, name }
    onCommit(patch)
  }

  // Unmount commits too, so closing the panel or switching passages never drops the tail of
  // an edit that has not been blurred.
  useEffect(() => {
    return () => {
      const { text: latestText, name: latestName } = latest.current
      const patch: Partial<Omit<UserSource, 'id'>> = {}
      if (latestText !== committed.current.text) patch.text = latestText.trim()
      if (latestName !== committed.current.name) patch.name = latestName.trim() || 'untitled'
      if (patch.text !== undefined || patch.name !== undefined) commitRef.current(patch)
    }
  }, [])

  const words = customWordCount(text)

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        aria-label="Passage name"
        spellCheck={false}
        className="w-full rounded-xl border px-3 py-1.5 text-[12px] outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-veil-strong)',
          color: 'var(--text-correct)',
        }}
      />
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        rows={7}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label="Passage text"
        placeholder="Paste the text you want to type…"
        className="thin-scroll w-full resize-y rounded-xl border p-3 text-[12px] leading-relaxed outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-veil-strong)',
          color: 'var(--text-correct)',
          fontFamily: 'var(--font-mono)',
          minHeight: 128,
        }}
      />
      <span className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        {words > 0
          ? `${words} words · a run in my text mode ends when you reach the end`
          : 'Empty — this passage will not be offered until you add some words.'}
      </span>
    </div>
  )
}

/** A new passage, before it exists in the library. */
function NewSource({
  onAdd,
  onCancel,
  reduceMotion,
}: {
  onAdd: (text: string, name: string) => void
  onCancel: () => void
  reduceMotion: boolean
}) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const ready = text.trim().length > 0

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="name (optional)"
        aria-label="New passage name"
        spellCheck={false}
        className="w-full rounded-xl border px-3 py-1.5 text-[12px] outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-veil-strong)',
          color: 'var(--text-correct)',
        }}
      />
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        aria-label="New passage text"
        placeholder="Paste or type the passage…"
        className="thin-scroll w-full resize-y rounded-xl border p-3 text-[12px] leading-relaxed outline-none"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-veil-strong)',
          color: 'var(--text-correct)',
          fontFamily: 'var(--font-mono)',
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {customWordCount(text)} words
        </span>
        <span className="flex items-center gap-2">
          <MotionButton label="Cancel" onClick={onCancel} reduceMotion={reduceMotion}>
            <span>cancel</span>
          </MotionButton>
          <MotionButton
            label="Save this passage"
            onClick={() => onAdd(text, name)}
            variant="primary"
            disabled={!ready}
            reduceMotion={reduceMotion}
          >
            <Plus size={13} aria-hidden="true" />
            <span>add</span>
          </MotionButton>
        </span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Layout helpers
   ══════════════════════════════════════════════════════════════ */

function presetStyle(active: boolean) {
  return {
    borderColor: active
      ? 'color-mix(in srgb, var(--accent) 60%, transparent)'
      : 'var(--border)',
    background: active
      ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
      : 'var(--surface-veil)',
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3
        className="mb-3 text-[10px] uppercase tracking-[0.26em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/**
 * A label/control pair.
 *
 * `stack` puts the control on its own full-width line beneath the label. Compact controls
 * sit beside their label; wide groups (four background styles, four font families) would
 * otherwise crush the label into a wrapped two-line stub and overlap it.
 */
function Row({
  label,
  hint,
  stack = false,
  children,
}: {
  label: string
  hint?: string
  stack?: boolean
  children: React.ReactNode
}) {
  const labelBlock = (
    <div className="min-w-0">
      <div className="text-[12px]" style={{ color: 'var(--text-correct)' }}>
        {label}
      </div>
      {hint && (
        <div className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )

  if (stack) {
    return (
      <div className="flex flex-col gap-2">
        {labelBlock}
        {children}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4">
      {labelBlock}
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  reduceMotion,
  disabled = false,
  testId,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  reduceMotion: boolean
  disabled?: boolean
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative rounded-full border transition-colors disabled:cursor-not-allowed"
      style={{
        width: 42,
        height: 24,
        opacity: disabled ? 0.4 : 1,
        borderColor: checked
          ? 'color-mix(in srgb, var(--accent) 55%, transparent)'
          : 'var(--border)',
        background: checked
          ? 'color-mix(in srgb, var(--accent) 30%, transparent)'
          : 'var(--surface-veil-strong)',
      }}
    >
      <motion.span
        className="absolute rounded-full"
        style={{
          width: 16,
          height: 16,
          top: 3,
          background: checked ? 'var(--accent-bright)' : 'var(--text-muted)',
          boxShadow: checked ? '0 0 12px var(--accent-glow)' : 'none',
        }}
        initial={false}
        animate={{ left: checked ? 22 : 3 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34 }}
      />
    </button>
  )
}
