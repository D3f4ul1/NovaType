import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Palette, Plus, Repeat, Settings2 } from 'lucide-react'
import { Logo } from './Logo'
import { MotionButton } from './MotionButton'
import { NumberField, Segmented } from './controls'
import { ToolbarPick } from './ToolbarPick'
import { WindowControls } from './WindowControls'
import {
  MAX_TIME_SECONDS,
  MAX_WORDS,
  MIN_TIME_SECONDS,
  MIN_WORDS,
  TIME_PRESETS,
  WORD_PRESETS,
} from '../lib/constants'
import { EASE_OUT, topBarVariants, tr } from '../lib/motion'
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../lib/difficulty'
import { themeLabel, THEME_ORDER } from '../lib/themes'
import { customWordCount } from '../lib/generateWords'
import { resolvedSource } from '../lib/sources'
import { isDesktop, toggleMaximize } from '../lib/desktop'
import { useDesktopWindow } from '../hooks/useDesktopWindow'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTestStore } from '../store/useTestStore'
import type { Difficulty, FactCategory, PromptSource, TestMode, TimeUnit } from '../types'
import { FACT_CATEGORY_LABELS, FACT_CATEGORY_ORDER } from '../lib/facts'

/**
 * The window's title bar and the app bar, as one strip.
 *
 * There is no native frame — `frame: false` in `electron/main.cjs` — so this 46px row *is* the
 * window: the mark, the difficulty and mode controls, the theme and settings buttons, then the
 * minimize / maximize / close buttons, with the empty stretch between them given over to
 * `app-region: drag` so the window can still be moved by it. The document title ("NovaType —
 * Typing Speed Test") is deliberately not drawn anywhere: it stays as the OS-level title for
 * the taskbar and Alt-Tab, where it belongs.
 *
 * Interaction rules that the geometry depends on:
 *
 * • Mode stays out of the collapse rules. It is the one control that is always four visible
 *   options, in both widths, because it is the control people reach for most.
 * • The pill groups (difficulty, duration) fold into dropdowns below 900px — see
 *   `ToolbarPick`. Above that they are pills, exactly as before.
 * • Every group is `no-drag`. A control inside a drag region swallows its own clicks, and the
 *   symptom — buttons that highlight but do not respond — is maddening to diagnose.
 * • In Focus Mode the bar fades and slides up as it always did. The window buttons fade back
 *   the moment the pointer comes within 80px of the top edge, because otherwise a test would
 *   be the one moment the app could not be closed. Only those three come back: the rest of the
 *   bar is at zero opacity, and an invisible button that still takes clicks is a trap.
 *
 * The `my text` mode puts the user's own passages one click away. That is the whole reason it
 * is a mode rather than a setting: it is the one text source people want to switch to
 * mid-session, and having to open a panel to reach it made it look like it did not exist.
 */

const MODES: { id: TestMode; label: string }[] = [
  { id: 'time', label: 'time' },
  { id: 'words', label: 'words' },
  { id: 'endless', label: 'endless' },
  { id: 'custom', label: 'my text' },
]

const TIME_UNITS: { id: TimeUnit; label: string }[] = [
  { id: 'sec', label: 'sec' },
  { id: 'min', label: 'min' },
]

/** How close to the top edge the pointer has to come for the window buttons to return. */
const PEEK_ZONE_PX = 80

/** Folded widths. Constants because a chip that resized with its label would make the fold a
 *  moving target; the expanded width is measured instead (see `ToolbarPick`). */
const DIFFICULTY_CHIP_WIDTH = 92
const DURATION_CHIP_WIDTH = 78

export interface TopBarProps {
  focused: boolean
  reduceMotion: boolean
  /** Below 900px the pill groups fold into dropdown chips. */
  narrow: boolean
  onOpenSettings: () => void
  /** Tells the app that a dialog owns the keyboard, so typing there cannot start a test. */
  onOverlayChange: (open: boolean) => void
}

/**
 * Sets `inert` on a group of controls imperatively.
 *
 * `inert` is the right primitive — it removes a subtree from the tab order *and* the
 * accessibility tree, which `aria-hidden` alone cannot — but React 18 does not take it as a
 * prop, so it is applied through a ref. `pointer-events` is set alongside it for the same
 * reason the attribute is set at all: while the bar is invisible, a stray click on where a
 * button used to be must not land on it.
 */
function Frozen({ inert, className, children }: {
  inert: boolean
  className: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) (el as HTMLElement & { inert: boolean }).inert = inert
  }, [inert])
  return (
    <div ref={ref} className={className} style={{ pointerEvents: inert ? 'none' : 'auto' }}>
      {children}
    </div>
  )
}

export function TopBar({
  focused,
  reduceMotion,
  narrow,
  onOpenSettings,
  onOverlayChange,
}: TopBarProps) {
  const mode = useSettingsStore((s) => s.mode)
  const timeLimit = useSettingsStore((s) => s.timeLimit)
  const wordLimit = useSettingsStore((s) => s.wordLimit)
  const customTimeUnit = useSettingsStore((s) => s.customTimeUnit)
  const promptSource = useSettingsStore((s) => s.promptSource)
  const factCategories = useSettingsStore((s) => s.factCategories)
  const sources = useSettingsStore((s) => s.sources)
  const activeSourceId = useSettingsStore((s) => s.activeSourceId)
  const rotateSources = useSettingsStore((s) => s.rotateSources)
  const addSource = useSettingsStore((s) => s.addSource)
  const difficulty = useSettingsStore((s) => s.difficulty)
  const theme = useSettingsStore((s) => s.theme)
  const update = useSettingsStore((s) => s.update)

  // The passage a `my text` run is actually playing. Read from the test's seed, because
  // that is what decides it — showing `activeSourceId` while the rotation is on would label
  // the chip with a passage that is not the one on screen.
  const seed = useTestStore((s) => s.seed)
  const playing = resolvedSource(seed, { sources, activeSourceId, rotateSources })

  const { fullscreen } = useDesktopWindow()

  const barRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftName, setDraftName] = useState('')
  const [peek, setPeek] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const closeDialog = useCallback(() => {
    setAdding(false)
    setDraft('')
    setDraftName('')
    onOverlayChange(false)
  }, [onOverlayChange])

  const openDialog = () => {
    setAdding(true)
    onOverlayChange(true)
    // Focus once the dialog has mounted, so paste works the moment it opens.
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  /**
   * The window buttons come back when the pointer approaches the top edge.
   *
   * The listener is only attached mid-test, and only when the buttons are actually hidden
   * (they do not exist in fullscreen at all — there is no OS chrome to minimize to, and the
   * brief asks for them to be dropped there), so an idle app is not chasing the mouse.
   */
  useEffect(() => {
    if (!focused || fullscreen) {
      setPeek(false)
      return
    }
    const onMove = (event: MouseEvent) => setPeek(event.clientY <= PEEK_ZONE_PX)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [focused, fullscreen])

  const controlsVisible = !fullscreen && (!focused || peek)

  // A persisted "minutes" unit from a session where the limit was not a whole number of
  // minutes would leave the field showing one figure and the test running another. Snap
  // once on mount so the two can never disagree.
  useEffect(() => {
    if (customTimeUnit === 'min' && timeLimit % 60 !== 0) {
      update('timeLimit', Math.max(60, Math.round(timeLimit / 60) * 60))
    }
  }, [customTimeUnit, timeLimit, update])

  // Starting a test hides the bar, so a dialog left open behind it would be invisible but
  // still holding the keyboard.
  useEffect(() => {
    if (!focused) return
    closeDialog()
  }, [focused, closeDialog])

  // Escape belongs to the dialog while it is open. The listener is registered on the
  // capture phase and stops propagation, so the app's own Escape binding — end the test,
  // or reset it — cannot fire behind the dialog's back.
  useEffect(() => {
    if (!adding) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeDialog()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [adding, closeDialog])

  const cycleTheme = () => {
    const presets = THEME_ORDER.filter((t): t is Exclude<typeof t, 'custom'> => t !== 'custom')
    const active = theme === 'custom' ? 'deep-blue' : theme
    const next = presets[(presets.indexOf(active) + 1) % presets.length]
    useSettingsStore.getState().applyTheme(next)
  }

  const setUnit = (unit: TimeUnit) => {
    update('customTimeUnit', unit)
    // Switching unit re-expresses the same duration in the new unit. Minutes are whole, so
    // a duration that is not a whole number of minutes rounds to the nearest one — and
    // because the field immediately shows the rounded figure, nothing changes silently.
    if (unit === 'min') {
      const minutes = Math.max(1, Math.round(timeLimit / 60))
      update('timeLimit', Math.min(MAX_TIME_SECONDS, minutes * 60))
    }
  }

  const saveDraft = () => {
    if (draft.trim().length === 0) {
      closeDialog()
      return
    }
    addSource(draft, draftName)
    closeDialog()
  }

  const optionsFade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }

  const controlsFade = reduceMotion ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }

  return (
    <motion.div
      ref={barRef}
      initial={false}
      animate={focused ? 'focused' : 'idle'}
      variants={topBarVariants}
      transition={tr(reduceMotion, 'focusChrome')}
      className="relative z-20 shrink-0"
    >
      {/* ── The strip: window chrome and app bar in one line ── */}
      <div
        data-testid="nova-bar"
        data-bar-row
        className="relative flex h-[46px] items-stretch gap-1.5 px-1.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Frozen inert={focused} className="flex min-w-0 items-center gap-2">
          <span className="flex items-center gap-2 pl-1" data-bar-group="mark">
            <Logo size={20} />
            <span
              // Shown from `xl` up, and folded away below it. The strip now carries four
              // groups plus three window buttons, and the wordmark is the one of those that
              // costs width without carrying a control.
              className="hidden whitespace-nowrap text-[15px] font-semibold tracking-tight xl:inline"
              style={{ color: 'var(--text-correct)', textShadow: '0 0 18px var(--accent-glow)' }}
            >
              Nova<span style={{ color: 'var(--accent-bright)' }}>Type</span>
            </span>
          </span>

          <span
            aria-hidden="true"
            className="hidden h-5 w-px md:block"
            style={{ background: 'var(--border)' }}
          />

          {/* ── Difficulty ──────────────────────────────────────
              In the bar rather than three sections into a panel: which characters are in
              the prompt is the setting people reach for most often, and the rungs are
              what make `hard` something you can switch on mid-session. Each option
              carries its own tooltip, because the names alone do not say what changes. */}
          <ToolbarPick
            groupId="difficulty-bar"
            barGroup="difficulty"
            collapsed={narrow}
            collapsedWidth={DIFFICULTY_CHIP_WIDTH}
            value={difficulty}
            options={DIFFICULTY_ORDER.map((id) => ({
              id,
              label: id,
              title: DIFFICULTIES[id].blurb,
            }))}
            onChange={(id) => update('difficulty', id as Difficulty)}
            label="Difficulty"
            reduceMotion={reduceMotion}
          />

          <span
            aria-hidden="true"
            className="h-5 w-px"
            style={{ background: 'var(--border)' }}
          />

          {/* Never folded: four modes and no options that can be hidden. */}
          <div data-bar-group="mode">
            <Segmented
              groupId="mode"
              size="md"
              value={mode}
              options={MODES}
              onChange={(id) => update('mode', id as TestMode)}
              label="Test mode"
              reduceMotion={reduceMotion}
            />
          </div>
        </Frozen>

        {/*
          The drag region. Empty by design: `app-region: drag` turns it into the window's
          caption, so the window can be moved and (double-clicked) maximized from the one
          stretch of the bar that has no control in it.
        */}
        <div
          data-testid="drag-region"
          className="app-drag h-full min-w-0 flex-1"
          onDoubleClick={toggleMaximize}
          title="Double-click to maximize"
        />

        <Frozen inert={focused} className="flex items-center gap-2" >
          <span data-bar-group="actions" className="flex items-center gap-2">
            <MotionButton
              label="Cycle theme preset"
              title={`Theme: ${themeLabel(theme)} — click for the next preset`}
              onClick={cycleTheme}
              reduceMotion={reduceMotion}
              className="min-w-[96px] justify-center"
            >
              <Palette size={15} aria-hidden="true" />
              <span className="min-w-0 truncate">{themeLabel(theme)}</span>
            </MotionButton>

            <MotionButton label="Open settings" onClick={onOpenSettings} reduceMotion={reduceMotion}>
              <Settings2 size={15} aria-hidden="true" />
              {/* The label is the first thing to go at narrow widths, because it is the one
                  thing here that is not a control: the gear keeps its place, its tooltip and
                  its aria-label, and the bar keeps a draggable stretch beside it. Measured at
                  760px, hiding it is the difference between an 80px drag region and the whole
                  row overflowing into itself. */}
              <span className="hidden xl:inline">settings</span>
            </MotionButton>
          </span>
        </Frozen>

        {/* The window buttons. Not drawn at all in fullscreen — there is no OS chrome left to
            minimize to — and faded back in by the peek rule while a test runs. Neither are
            they drawn in a plain browser, where the dev server runs the same bundle: three
            buttons that cannot do anything are a trap, not a layout.

            The two conditions are different, and both matter: this one is whether the window
            can be controlled at all. */}
        {isDesktop && !fullscreen && (
          <motion.div
            initial={false}
            animate={{ opacity: controlsVisible ? 1 : 0, x: controlsVisible ? 0 : 10 }}
            transition={controlsFade}
            style={{ pointerEvents: controlsVisible ? 'auto' : 'none' }}
            className="flex items-stretch"
            aria-hidden={!controlsVisible}
          >
            <WindowControls reduceMotion={reduceMotion} />
          </motion.div>
        )}
      </div>

      {/* ── Row two: the active mode's options, in a reserved slot ── */}
      <div
        data-options-row
        className="relative flex h-12 items-center justify-center overflow-x-auto overflow-y-hidden px-2.5"
      >
        <Frozen inert={focused} className="flex items-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={reduceMotion ? false : { opacity: 0, y: -6, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(6px)' }}
              transition={optionsFade}
              className="no-scrollbar flex items-center gap-2.5 whitespace-nowrap"
            >
              {mode === 'time' && (
                <>
                  <ToolbarPick
                    groupId="time-limit"
                    barGroup="duration"
                    collapsed={narrow}
                    collapsedWidth={DURATION_CHIP_WIDTH}
                    value={
                      TIME_PRESETS.some((p) => p.seconds === timeLimit) ? String(timeLimit) : 'custom'
                    }
                    options={[
                      ...TIME_PRESETS.map((preset) => ({
                        id: String(preset.seconds),
                        label: preset.label,
                      })),
                      { id: 'custom', label: 'custom' },
                    ]}
                    onChange={(id) => {
                      if (id !== 'custom') update('timeLimit', Number(id))
                    }}
                    label="Test duration"
                    reduceMotion={reduceMotion}
                  />
                  <OptionsDivider />
                  <NumberField
                    value={customTimeUnit === 'min' ? Math.max(1, Math.round(timeLimit / 60)) : timeLimit}
                    min={customTimeUnit === 'min' ? 1 : MIN_TIME_SECONDS}
                    max={customTimeUnit === 'min' ? Math.round(MAX_TIME_SECONDS / 60) : MAX_TIME_SECONDS}
                    onChange={(value) =>
                      update(
                        'timeLimit',
                        customTimeUnit === 'min' ? value * 60 : value,
                      )
                    }
                    label="Custom duration"
                    suffix={customTimeUnit}
                  />
                  <Segmented
                    groupId="time-unit"
                    value={customTimeUnit}
                    options={TIME_UNITS}
                    onChange={(id) => setUnit(id as TimeUnit)}
                    label="Custom duration unit"
                    reduceMotion={reduceMotion}
                  />
                  <OptionsDivider />
                  <PromptSourcePill
                    source={promptSource}
                    categories={factCategories}
                    onOpenSettings={onOpenSettings}
                  />
                </>
              )}

              {mode === 'words' && (
                <>
                  <ToolbarPick
                    groupId="word-limit"
                    barGroup="word-count"
                    collapsed={narrow}
                    collapsedWidth={DURATION_CHIP_WIDTH}
                    value={WORD_PRESETS.includes(wordLimit) ? String(wordLimit) : 'custom'}
                    options={[
                      ...WORD_PRESETS.map((count) => ({ id: String(count), label: String(count) })),
                      { id: 'custom', label: 'custom' },
                    ]}
                    onChange={(id) => {
                      if (id !== 'custom') update('wordLimit', Number(id))
                    }}
                    label="Word count"
                    reduceMotion={reduceMotion}
                  />
                  <OptionsDivider />
                  <NumberField
                    value={wordLimit}
                    min={MIN_WORDS}
                    max={MAX_WORDS}
                    onChange={(value) => update('wordLimit', value)}
                    label="Custom word count"
                    suffix="words"
                  />
                  <OptionsDivider />
                  <PromptSourcePill
                    source={promptSource}
                    categories={factCategories}
                    onOpenSettings={onOpenSettings}
                  />
                </>
              )}

              {mode === 'endless' && (
                <>
                  <span
                    className="text-[11px] tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    No limit — press{' '}
                    <kbd style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-bright)' }}>
                      Esc
                    </kbd>{' '}
                    when you want to stop
                  </span>
                  <OptionsDivider />
                  <PromptSourcePill
                    source={promptSource}
                    categories={factCategories}
                    onOpenSettings={onOpenSettings}
                  />
                </>
              )}

              {mode === 'custom' && (
                <SourcePicker
                  sources={sources}
                  playingId={playing?.id ?? null}
                  rotate={rotateSources}
                  reduceMotion={reduceMotion}
                  onPick={(id) => {
                    update('activeSourceId', id)
                    // Choosing a passage by hand is a request to play *that* one, so the
                    // rotation steps aside until it is asked for again.
                    update('rotateSources', false)
                  }}
                  onToggleRotate={() => update('rotateSources', !rotateSources)}
                  onAdd={openDialog}
                  onOpenSettings={onOpenSettings}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </Frozen>
      </div>

      {/* ── The paste dialog ──────────────────────────────────────
          A modal rather than a popover: this is the one place in the app where pasting is
          allowed, because here the text *is* the input, and a dialog makes that boundary
          obvious. The engine is suspended while it is open. */}
      <AnimatePresence>
        {adding && (
          <>
            <motion.div
              key="paste-backdrop"
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(2, 5, 12, 0.62)', backdropFilter: 'blur(3px)' }}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
              onClick={closeDialog}
              aria-hidden="true"
            />
            <motion.div
              key="paste-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Add text to type"
              className="panel fixed left-1/2 top-1/2 z-50 w-[min(92vw,540px)] p-5"
              initial={reduceMotion ? false : { opacity: 0, x: '-50%', y: '-48%', scale: 0.97 }}
              animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
              exit={{ opacity: 0, x: '-50%', y: '-48%', scale: 0.97 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <h2
                className="mb-1 text-[13px] font-medium"
                style={{ color: 'var(--text-correct)' }}
              >
                Paste your own text
              </h2>
              <p className="mb-3 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                Pasting is disabled everywhere else — here it is the point. The run ends when
                you reach the end of what you paste.
              </p>

              <input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="name (optional)"
                aria-label="Name for this text"
                spellCheck={false}
                className="mb-2 w-full rounded-xl border px-3 py-2 text-[12px] outline-none"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-veil-strong)',
                  color: 'var(--text-correct)',
                }}
              />

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={7}
                spellCheck={false}
                autoComplete="off"
                placeholder="Paste or type the passage you want to practise…"
                aria-label="Text to type"
                className="thin-scroll mb-3 w-full resize-y rounded-xl border p-3 text-[12px] leading-relaxed outline-none"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface-veil-strong)',
                  color: 'var(--text-correct)',
                  fontFamily: 'var(--font-mono)',
                }}
              />

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {customWordCount(draft)} words
                </span>
                <span className="flex items-center gap-2">
                  <MotionButton label="Cancel" onClick={closeDialog} reduceMotion={reduceMotion}>
                    cancel
                  </MotionButton>
                  <MotionButton
                    label="Save this text and switch to it"
                    onClick={saveDraft}
                    variant="primary"
                    disabled={draft.trim().length === 0}
                    reduceMotion={reduceMotion}
                  >
                    <Plus size={13} aria-hidden="true" />
                    <span>add &amp; type it</span>
                  </MotionButton>
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function OptionsDivider() {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-px shrink-0"
      style={{ background: 'var(--border)' }}
    />
  )
}

/**
 * The passage picker for `my text` mode.
 *
 * Every saved passage is one click, the rotation is a single toggle beside them, and the
 * active one is highlighted from the *resolved* source rather than from the stored choice —
 * while the rotation is running those are different things, and it is the resolved one the
 * typist is about to type.
 */
function SourcePicker({
  sources,
  playingId,
  rotate,
  reduceMotion,
  onPick,
  onToggleRotate,
  onAdd,
  onOpenSettings,
}: {
  sources: { id: string; name: string; text: string }[]
  playingId: string | null
  rotate: boolean
  reduceMotion: boolean
  onPick: (id: string) => void
  onToggleRotate: () => void
  onAdd: () => void
  onOpenSettings: () => void
}) {
  return (
    <>
      {sources.length === 0 && (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          No saved text yet —{' '}
          <button
            type="button"
            onClick={onOpenSettings}
            className="underline decoration-dotted underline-offset-2"
            style={{ color: 'var(--accent-bright)' }}
          >
            add some in settings
          </button>
        </span>
      )}

      {sources.map((source) => {
        const active = source.id === playingId
        return (
          <button
            key={source.id}
            type="button"
            aria-pressed={active}
            title={`${customWordCount(source.text)} words`}
            onClick={() => onPick(source.id)}
            className="max-w-[160px] shrink-0 truncate rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors"
            style={{
              borderColor: active
                ? 'color-mix(in srgb, var(--accent) 55%, transparent)'
                : 'var(--border)',
              background: active
                ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
                : 'var(--surface-veil)',
              color: active ? 'var(--text-correct)' : 'var(--text-muted)',
            }}
          >
            {source.name}
          </button>
        )
      })}

      {sources.length > 1 && (
        <button
          type="button"
          aria-pressed={rotate}
          title={
            rotate
              ? 'Rotating through your texts — one per test. Click to pin the highlighted one.'
              : 'Always playing the highlighted text. Click to rotate through them again.'
          }
          onClick={onToggleRotate}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors"
          style={{
            borderColor: rotate
              ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
              : 'var(--border)',
            background: rotate
              ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
              : 'var(--surface-veil)',
            color: rotate ? 'var(--text-correct)' : 'var(--text-muted)',
          }}
        >
          <Repeat size={12} aria-hidden="true" />
          <span>rotate</span>
        </button>
      )}

      <OptionsDivider />

      <MotionButton label="Add another text to type" onClick={onAdd} reduceMotion={reduceMotion}>
        <Plus size={13} aria-hidden="true" />
        <span>add</span>
      </MotionButton>
    </>
  )
}

/**
 * Summary of where the generated prompt comes from, and a shortcut to change it.
 *
 * It is a button rather than a label because the thing it summarises is the one setting
 * people most often want to change mid-session, and a read-only chip tells you what the
 * prompt is without letting you do anything about it.
 */
function PromptSourcePill({
  source,
  categories,
  onOpenSettings,
}: {
  source: PromptSource
  categories: FactCategory[]
  onOpenSettings: () => void
}) {
  const label =
    source === 'random'
      ? 'random words'
      : source === 'facts'
        ? `facts · ${categories.length}/${FACT_CATEGORY_ORDER.length} topics`
        : 'facts + random'

  const title =
    source === 'facts'
      ? `Facts from: ${categories.map((c) => FACT_CATEGORY_LABELS[c]).join(', ') || 'none selected'}`
      : 'Settings → Prompt'

  return (
    <button
      type="button"
      title={title}
      aria-label={`Prompt source: ${label}. Open settings.`}
      onClick={onOpenSettings}
      // Hidden below the `md` breakpoint, where the options row is already tight enough
      // that this would push the duration chips off the edge.
      className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-correct md:flex"
      style={{ background: 'var(--surface-veil)' }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--accent-bright)', boxShadow: '0 0 8px var(--accent-glow)' }}
      />
      prompt: {label}
    </button>
  )
}
