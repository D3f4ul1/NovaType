import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Background } from './components/Background'
import { Hud } from './components/Hud'
import { Results } from './components/Results'
import { SettingsPanel } from './components/SettingsPanel'
import { Timer } from './components/Timer'
import { TopBar } from './components/TopBar'
import { TypingArea } from './components/TypingArea'
import { useReduceMotion } from './components/ThemeProvider'
import { useFullscreenSync } from './hooks/useDesktopWindow'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useScrollEdgeFade } from './hooks/useScrollEdgeFade'
import { useTypingEngine } from './hooks/useTypingEngine'
import { useViewport } from './hooks/useViewport'
import { useWindowShortcuts } from './hooks/useWindowShortcuts'
import { formatSeconds } from './lib/constants'
import { layoutFor, NARROW_WIDTH } from './lib/layout'
import { customWordCount } from './lib/generateWords'
import { resolvedSource } from './lib/sources'
import { promptBlockVariants, tr } from './lib/motion'
import { STORAGE_KEYS } from './lib/storage'
import { useSettingsStore } from './store/useSettingsStore'
import { useTestStore } from './store/useTestStore'
import type { TestResult } from './types'

/** How long the dimmed prompt stays on screen before the results screen takes over. */
const RESULTS_HANDOFF_MS = 460

export default function App() {
  const reduceMotion = useReduceMotion()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  /* ── The window's size drives the layout ──
     Two things follow from it: the toolbar folds its pickers away below 900px, and the stack
     sheds the hint bar, typing lines and half the HUD as the window gets short. Both are
     resolved here, once, and passed down — the rules are ordered (see `lib/layout.ts`) and
     splitting them across components is how two of them end up disagreeing. */
  const { width, height } = useViewport()
  const layout = layoutFor(height)
  const narrow = width < NARROW_WIDTH

  /* ── The window chrome ── */
  const { fullscreen, canFullscreen, setFullscreen } = useFullscreenSync()

  /* ── An overlay that owns the keyboard ──
     The settings panel and the paste dialog both need input suspended while they are up;
     one flag is enough, and it keeps `useTypingEngine` with a single "is typing allowed"
     input rather than a growing list of panels. */
  const [dialogOpen, setDialogOpen] = useState(false)
  const setOverlay = useCallback((open: boolean) => setDialogOpen(open), [])

  /* ── A transient notice, used when a paste is refused ── */
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const showNotice = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2000)
  }, [])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const onBlockedPaste = useCallback(
    () => showNotice('Pasting is disabled — type it out.'),
    [showNotice],
  )

  const overlaysOpen = settingsOpen || dialogOpen

  /* ── Window keys, registered *before* the engine ──
     Order is the whole mechanism: Escape has to be able to mean "leave fullscreen" when the
     test is idle, and the engine's own Escape binding — registered second, on the same node
     and phase — is what it takes precedence over. Swapping these two lines would silently
     break that, which is why the engine is called below rather than with the other hooks. */
  useWindowShortcuts({ enabled: !overlaysOpen })

  // Input is suspended while a panel or dialog is open, so typing in a field never starts
  // a test.
  useTypingEngine({
    onOpenSettings: openSettings,
    enabled: !overlaysOpen,
    onBlockedPaste,
  })

  const status = useTestStore((s) => s.status)
  const result = useTestStore((s) => s.result)
  const focused = status !== 'idle'

  /* ── Restart whenever a setting that changes the generated text changes ──
     Deliberately narrow: durations and word counts do not alter the text, so editing them
     must not reshuffle the prompt under the user's cursor. */
  const difficulty = useSettingsStore((s) => s.difficulty)
  const language = useSettingsStore((s) => s.language)
  const promptSource = useSettingsStore((s) => s.promptSource)
  const factCategories = useSettingsStore((s) => s.factCategories)
  const mode = useSettingsStore((s) => s.mode)
  const sources = useSettingsStore((s) => s.sources)
  const activeSourceId = useSettingsStore((s) => s.activeSourceId)
  const rotateSources = useSettingsStore((s) => s.rotateSources)

  // Everything that changes what text the *next* test will show belongs in the key, and
  // nothing else does. The passages contribute their lengths rather than their contents:
  // editing a passage must rebuild the prompt, while a keystroke landing in the editor must
  // not rebuild it once per character. The rotation's own cursor is deliberately absent —
  // it advances on a new seed, and a key that changed when it did would reset the test it
  // had just chosen a passage for.
  const sourceShape = sources.map((s) => `${s.id}:${s.text.length}`).join(',')
  const generationKey = `${difficulty}|${language}|${promptSource}|${factCategories.join(',')}|${mode}|${activeSourceId ?? ''}|${rotateSources}|${sourceShape}`

  useEffect(() => {
    // Runs on mount too, which seeds the first test with a random word order.
    useTestStore.getState().resetTest()
  }, [generationKey])

  /* ── Idle footer summary: what the next run will actually be ── */
  const timeLimit = useSettingsStore((s) => s.timeLimit)
  const wordLimit = useSettingsStore((s) => s.wordLimit)
  const seed = useTestStore((s) => s.seed)
  const playing = resolvedSource(seed, { sources, activeSourceId, rotateSources })
  const playingWords = playing ? customWordCount(playing.text) : 0
  const summary =
    mode === 'custom'
      ? playingWords > 0
        ? `${playingWords} words · ${playing?.name ?? 'your text'}`
        : 'add some text to type'
      : mode === 'time'
        ? formatSeconds(timeLimit)
        : mode === 'words'
          ? `${wordLimit} words`
          : 'endless'

  /* ── Hand off to the results screen after the prompt has faded ── */
  const [showResults, setShowResults] = useState(false)
  useEffect(() => {
    if (status !== 'finished') {
      setShowResults(false)
      return
    }
    const id = window.setTimeout(() => setShowResults(true), reduceMotion ? 0 : RESULTS_HANDOFF_MS)
    return () => window.clearTimeout(id)
  }, [status, reduceMotion])

  /* ── Remember the last result for the idle hint ── */
  const [lastResult, setLastResult] = useLocalStorage<TestResult | null>(
    STORAGE_KEYS.lastResult,
    null,
  )
  useEffect(() => {
    if (result) setLastResult(result)
  }, [result, setLastResult])

  const fade = { duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' as const }

  // The results screen scrolls; masking its edges keeps cards from being sliced in half.
  const resultsScroll = useScrollEdgeFade<HTMLDivElement>()

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      // The test's state, as an attribute rather than only as a rendered screen.
      //
      // It is what makes the app checkable from the outside: whether a run is idle, running or
      // over is decided in the store and expressed here, so a smoke test can ask the document
      // instead of inferring it from which components happen to be mounted — an inference that
      // is wrong for the 460ms the results screen takes to cross-fade in.
      data-testid="app"
      data-status={status}
    >
      <Background reduceMotion={reduceMotion} />

      <TopBar
        focused={focused}
        reduceMotion={reduceMotion}
        narrow={narrow}
        onOpenSettings={openSettings}
        onOverlayChange={setOverlay}
      />

      <main className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-5">
        <AnimatePresence mode="wait" initial={false}>
          {showResults ? (
            <motion.div
              key="results"
              ref={resultsScroll.setRef}
              className="thin-scroll max-h-full w-full overflow-y-auto py-2"
              style={{
                maskImage: resultsScroll.maskImage,
                WebkitMaskImage: resultsScroll.maskWebkit,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              <Results reduceMotion={reduceMotion} onOpenSettings={openSettings} />
            </motion.div>
          ) : (
            <motion.div
              key="typing"
              className="w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={fade}
            >
              {/* Focus Mode: the prompt glides up 40px while the chrome disappears (§5.2). */}
              <motion.div
                initial={false}
                animate={focused ? 'focused' : 'idle'}
                variants={promptBlockVariants}
                transition={tr(reduceMotion, 'promptGlide')}
                className="mx-auto flex w-full max-w-3xl flex-col items-center"
              >
                <Timer reduceMotion={reduceMotion} compact={layout.compact} />
                <div className={layout.compact ? 'mt-4 w-full' : 'mt-8 w-full'}>
                  <TypingArea reduceMotion={reduceMotion} visibleLines={layout.visibleLines} />
                </div>
                <div className={layout.compact ? 'mt-3' : 'mt-5'}>
                  <Hud compact={layout.compactHud} />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* The first thing the layout gives up as the window gets short: at 460px there is no
          longer room for the hint bar and three full lines of prompt. */}
      {layout.showHintBar && (
      <motion.footer
        data-testid="hint-bar"
        aria-hidden={focused}
        initial={false}
        animate={{ opacity: focused ? 0 : 1 }}
        transition={tr(reduceMotion, 'focusChrome')}
        className="relative z-10 flex h-14 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 text-[11px]"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>Start typing to begin</span>
        <span style={{ color: 'var(--text-untyped)' }}>·</span>
        <span style={{ color: 'var(--accent-bright)' }}>{summary}</span>
        <span style={{ color: 'var(--text-untyped)' }}>·</span>
        <span>
          <kbd style={{ fontFamily: 'var(--font-mono)' }}>Tab</kbd> +{' '}
          <kbd style={{ fontFamily: 'var(--font-mono)' }}>Enter</kbd> to restart
        </span>
        <span style={{ color: 'var(--text-untyped)' }}>·</span>
        <span>
          <kbd style={{ fontFamily: 'var(--font-mono)' }}>Esc</kbd> ends the test
        </span>
        {lastResult && (
          <>
            <span style={{ color: 'var(--text-untyped)' }}>·</span>
            <span style={{ color: 'var(--accent-bright)' }}>
              last {lastResult.wpm} wpm · {lastResult.accuracy}%
            </span>
          </>
        )}
      </motion.footer>
      )}

      {/* ── Transient notice (a refused paste, and anywhere else that needs one) ── */}
      <AnimatePresence>
        {notice && (
          <motion.div
            key="notice"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: 8, scale: 0.97, x: '-50%' }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="panel fixed bottom-16 left-1/2 z-30 px-4 py-2 text-[12px]"
            style={{ color: 'var(--text-correct)' }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsPanel
        open={settingsOpen}
        onClose={closeSettings}
        reduceMotion={reduceMotion}
        fullscreen={fullscreen}
        canFullscreen={canFullscreen}
        onFullscreenChange={setFullscreen}
      />
    </div>
  )
}
