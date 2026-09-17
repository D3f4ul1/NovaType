import { createContext, useContext, useEffect, useLayoutEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { resolveReduceMotion } from '../lib/motion'
import { colorsToCssVars, isLightBackground, MONO_FONTS } from '../lib/themes'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useSettingsStore } from '../store/useSettingsStore'

/**
 * Writes the active theme onto the document root as CSS custom properties.
 *
 * This is the reason recolouring is free: the whole tree is styled through `var(...)`,
 * so changing a colour is one `style.setProperty` on `<html>` and zero React re-renders.
 * A `useLayoutEffect` keeps it before paint, so there is no flash of the old theme.
 *
 * The component also resolves the tri-state reduce-motion preference ('auto' follows the
 * OS) and publishes it through context, so exactly one media-query listener exists in
 * the app rather than one per consumer.
 */

const ReduceMotionContext = createContext(false)

export function useReduceMotion(): boolean {
  return useContext(ReduceMotionContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colors = useSettingsStore((s) => s.colors)
  const glowIntensity = useSettingsStore((s) => s.glowIntensity)
  const monoFont = useSettingsStore((s) => s.monoFont)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const lineHeight = useSettingsStore((s) => s.lineHeight)
  const letterSpacing = useSettingsStore((s) => s.letterSpacing)
  const reduceMotionPref = useSettingsStore((s) => s.reduceMotion)
  const errorDisplay = useSettingsStore((s) => s.errorDisplay)
  const performance = useSettingsStore((s) => s.performance)
  const effects = useSettingsStore((s) => s.effects)
  const systemPrefers = usePrefersReducedMotion()

  const reduceMotion = resolveReduceMotion(reduceMotionPref, systemPrefers)
  const lineBox = Math.max(1, Math.round(fontSize * lineHeight))

  /**
   * The effects that are actually on, after the `lite` profile has had its say.
   *
   * `lite` is a veto rather than a setter. It leaves the five switches exactly as the user
   * left them — so turning the profile back to `full` restores their own arrangement rather
   * than a default — and simply overrides them while it is on. That is also why the switches
   * are shown disabled under `lite`: they are the user's settings, not the app's state.
   */
  const live = useMemo(
    () =>
      performance === 'lite'
        ? {
            animatedBackground: false,
            noiseTexture: false,
            glassBlur: false,
            glowEffects: false,
            characterAnimations: false,
          }
        : effects,
    [performance, effects],
  )

  useLayoutEffect(() => {
    const root = document.documentElement
    const vars: Record<string, string> = {
      ...colorsToCssVars(colors),
      // Zero when the glows are off, which is what makes one property able to switch every
      // shadow in the app at once: they are all written as `calc(… * var(--glow-strength))`.
      '--glow-strength': live.glowEffects ? String(glowIntensity) : '0',
      '--font-mono': MONO_FONTS[monoFont].stack,
      '--type-size': `${fontSize}px`,
      '--type-line-height': String(lineHeight),
      '--type-letter-spacing': `${letterSpacing}em`,
      '--line-box': `${lineBox}px`,
    }
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value)
    }
    // Lets the browser paint native controls — scrollbars, form widgets, the caret in a text
    // field — to match. A light theme with dark scrollbars is the sort of detail that makes an
    // interface feel assembled rather than designed, so this follows the background.
    root.style.colorScheme = isLightBackground(colors.bgBase) ? 'light' : 'dark'
    // Whether a mistyped character shows the target letter (default) or the pressed one.
    // An attribute rather than a prop: the choice lives in `.char-glyph` rules, so it
    // costs the character components nothing and applies to all ~1,000 of them at once.
    root.dataset.errorDisplay = errorDisplay
    // The effect switches. Attributes on `<html>` rather than props, for the same reason as
    // the two above: the rules they drive are about element *kinds* (`.panel`, `.animate-char-
    // in`), and threading a boolean down to every one of them would touch hundreds of
    // components to change five CSS declarations.
    root.dataset.glass = live.glassBlur ? 'on' : 'off'
    root.dataset.charAnim = live.characterAnimations ? 'on' : 'off'
    root.dataset.effects = performance
    // Read by a handful of rules that only make sense on a pale background — chiefly the
    // cancellation of the text glows, which were chosen against black.
    root.dataset.themeLight = String(isLightBackground(colors.bgBase))
  }, [
    colors,
    glowIntensity,
    live,
    performance,
    monoFont,
    fontSize,
    lineHeight,
    letterSpacing,
    lineBox,
    errorDisplay,
  ])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion)
  }, [reduceMotion])

  return <ReduceMotionContext.Provider value={reduceMotion}>{children}</ReduceMotionContext.Provider>
}
