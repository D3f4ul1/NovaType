import type { MonoFontKey, ThemeColors, ThemeName } from '../types'

/**
 * Every theme stays inside one cohesive blue/cyan hue family — the brief forbids
 * exceeding a single accent hue family in the default theme, and the presets keep
 * that discipline so the app always reads as "blue".
 */

export const DEEP_BLUE: ThemeColors = {
  bgBase: '#070B14',
  bgSurface: '#0D1424',
  bgElevated: '#121B2E',
  accent: '#3B82F6',
  accentBright: '#60A5FA',
  accentGlow: 'rgba(59, 130, 246, 0.45)',
  textUntyped: '#4B5563',
  textCorrect: '#FFFFFF',
  textIncorrect: '#EF4444',
  textMuted: '#64748B',
  caret: '#60A5FA',
  border: 'rgba(96, 165, 250, 0.15)',
}

export const THEMES: Record<Exclude<ThemeName, 'custom'>, {
  label: string
  colors: ThemeColors
}> = {
  'deep-blue': { label: 'Deep Blue', colors: DEEP_BLUE },
  midnight: {
    label: 'Midnight',
    colors: {
      bgBase: '#05060F',
      bgSurface: '#0A0C1C',
      bgElevated: '#111527',
      accent: '#4F46E5',
      accentBright: '#818CF8',
      accentGlow: 'rgba(99, 102, 241, 0.45)',
      textUntyped: '#3F4664',
      textCorrect: '#F5F6FF',
      textIncorrect: '#F87171',
      textMuted: '#5A6285',
      caret: '#818CF8',
      border: 'rgba(129, 140, 248, 0.16)',
    },
  },
  ocean: {
    label: 'Ocean',
    colors: {
      bgBase: '#04101A',
      bgSurface: '#07202F',
      bgElevated: '#0C2A3D',
      accent: '#0891B2',
      accentBright: '#22D3EE',
      accentGlow: 'rgba(34, 211, 238, 0.4)',
      textUntyped: '#3E5A6B',
      textCorrect: '#ECFDFF',
      textIncorrect: '#FB7185',
      textMuted: '#5C7C8E',
      caret: '#22D3EE',
      border: 'rgba(34, 211, 238, 0.16)',
    },
  },
  cyber: {
    label: 'Cyber',
    colors: {
      bgBase: '#03060E',
      bgSurface: '#061224',
      bgElevated: '#0A1B33',
      accent: '#0EA5E9',
      accentBright: '#38BDF8',
      accentGlow: 'rgba(56, 189, 248, 0.5)',
      textUntyped: '#39566B',
      textCorrect: '#F0F9FF',
      textIncorrect: '#FF4D6D',
      textMuted: '#57768C',
      caret: '#38BDF8',
      border: 'rgba(56, 189, 248, 0.2)',
    },
  },
  ice: {
    label: 'Ice',
    colors: {
      bgBase: '#060A12',
      bgSurface: '#0B1220',
      bgElevated: '#101A2C',
      accent: '#7DD3FC',
      accentBright: '#BAE6FD',
      accentGlow: 'rgba(186, 230, 253, 0.4)',
      textUntyped: '#475569',
      textCorrect: '#FFFFFF',
      textIncorrect: '#FCA5A5',
      textMuted: '#7A8AA3',
      caret: '#BAE6FD',
      border: 'rgba(186, 230, 253, 0.18)',
    },
  },
  nord: {
    label: 'Nord',
    colors: {
      bgBase: '#0B0F17',
      bgSurface: '#121826',
      bgElevated: '#1A2233',
      accent: '#5E81AC',
      accentBright: '#81A1C1',
      accentGlow: 'rgba(129, 161, 193, 0.35)',
      textUntyped: '#4C566A',
      textCorrect: '#ECEFF4',
      textIncorrect: '#BF616A',
      textMuted: '#7B88A1',
      caret: '#88C0D0',
      border: 'rgba(136, 192, 208, 0.16)',
    },
  },
  aurora: {
    label: 'Aurora',
    colors: {
      bgBase: '#040E10',
      bgSurface: '#08201F',
      bgElevated: '#0C2B2A',
      accent: '#2DD4BF',
      accentBright: '#5EEAD4',
      accentGlow: 'rgba(45, 212, 191, 0.4)',
      textUntyped: '#3C5D5C',
      textCorrect: '#ECFEFB',
      textIncorrect: '#FB7185',
      textMuted: '#5C8180',
      caret: '#5EEAD4',
      border: 'rgba(94, 234, 212, 0.16)',
    },
  },
  nebula: {
    label: 'Nebula',
    colors: {
      bgBase: '#0A0616',
      bgSurface: '#150F2B',
      bgElevated: '#1D1440',
      accent: '#8B5CF6',
      accentBright: '#C4B5FD',
      accentGlow: 'rgba(139, 92, 246, 0.45)',
      textUntyped: '#514773',
      textCorrect: '#F6F3FF',
      textIncorrect: '#FB7185',
      textMuted: '#7C6FA6',
      caret: '#C4B5FD',
      border: 'rgba(196, 181, 253, 0.18)',
    },
  },
  abyss: {
    label: 'Abyss',
    colors: {
      bgBase: '#01030A',
      bgSurface: '#060B18',
      bgElevated: '#0B1324',
      accent: '#2563EB',
      accentBright: '#7DD3FC',
      accentGlow: 'rgba(37, 99, 235, 0.5)',
      textUntyped: '#2F3A50',
      textCorrect: '#EAF2FF',
      textIncorrect: '#EF4444',
      textMuted: '#4A5772',
      caret: '#38BDF8',
      border: 'rgba(56, 189, 248, 0.14)',
    },
  },
  matrix: {
    label: 'Matrix',
    colors: {
      bgBase: '#020603',
      bgSurface: '#04120A',
      bgElevated: '#071C10',
      accent: '#22C55E',
      accentBright: '#86EFAC',
      accentGlow: 'rgba(34, 197, 94, 0.42)',
      textUntyped: '#2F5138',
      textCorrect: '#E9FFEF',
      textIncorrect: '#F87171',
      textMuted: '#4E7A5C',
      caret: '#86EFAC',
      border: 'rgba(134, 239, 172, 0.16)',
    },
  },
  ember: {
    label: 'Ember',
    colors: {
      bgBase: '#0C0705',
      bgSurface: '#1A0F0A',
      bgElevated: '#251610',
      accent: '#F97316',
      accentBright: '#FDBA74',
      accentGlow: 'rgba(249, 115, 22, 0.4)',
      textUntyped: '#5A4436',
      textCorrect: '#FFF7ED',
      textIncorrect: '#EF4444',
      textMuted: '#8A6A55',
      caret: '#FDBA74',
      border: 'rgba(253, 186, 116, 0.16)',
    },
  },
  rose: {
    label: 'Rose',
    colors: {
      bgBase: '#0F0710',
      bgSurface: '#1C0F1C',
      bgElevated: '#28152A',
      accent: '#EC4899',
      accentBright: '#F9A8D4',
      accentGlow: 'rgba(236, 72, 153, 0.42)',
      textUntyped: '#5A3C50',
      textCorrect: '#FFF1F8',
      textIncorrect: '#F87171',
      textMuted: '#8A5F7C',
      caret: '#F9A8D4',
      border: 'rgba(249, 168, 212, 0.18)',
    },
  },
  /*
   * The two monochrome presets.
   *
   * Every other preset stays inside one hue family, and the app is built around a coloured
   * accent: it is what the glows, the caret, the active pill and the focus ring are all made
   * of. Mono and Paper have none. Their accent is the *foreground*, so the whole interface
   * resolves to black and white — which is both a look people ask for and, incidentally, the
   * cheapest thing the compositor can be asked to draw: no coloured glow to blend, no hue to
   * mix, and (with the glow setting down) no shadow passes at all.
   *
   * Paper is a light theme, and it is the reason the surface tints are derived from the base
   * colour rather than written as white-alpha (see `colorsToCssVars`). Every panel, button and
   * field in the app is a translucent *veil* over the background, and a veil that is always
   * white is invisible on white — the interface would flatten into a borderless smear.
   */
  mono: {
    label: 'Mono',
    colors: {
      bgBase: '#000000',
      bgSurface: '#0A0A0A',
      bgElevated: '#161616',
      accent: '#E5E5E5',
      accentBright: '#FFFFFF',
      accentGlow: 'rgba(255, 255, 255, 0.22)',
      textUntyped: '#575757',
      textCorrect: '#FFFFFF',
      textIncorrect: '#EF4444',
      textMuted: '#8F8F8F',
      caret: '#FFFFFF',
      border: 'rgba(255, 255, 255, 0.16)',
    },
  },
  paper: {
    label: 'Paper',
    colors: {
      bgBase: '#FFFFFF',
      bgSurface: '#F4F4F5',
      bgElevated: '#E8E8EA',
      accent: '#3F3F46',
      accentBright: '#18181B',
      accentGlow: 'rgba(24, 24, 27, 0.16)',
      textUntyped: '#A1A1AA',
      textCorrect: '#09090B',
      textIncorrect: '#DC2626',
      textMuted: '#71717A',
      caret: '#09090B',
      border: 'rgba(0, 0, 0, 0.14)',
    },
  },
}

export const THEME_ORDER: ThemeName[] = [
  'deep-blue',
  'abyss',
  'midnight',
  'nebula',
  'ocean',
  'cyber',
  'ice',
  'aurora',
  'nord',
  'matrix',
  'ember',
  'rose',
  'mono',
  'paper',
  'custom',
]

export function themeLabel(name: ThemeName): string {
  return name === 'custom' ? 'Custom' : THEMES[name].label
}

/**
 * Font stacks offered in the typography section. All three monospace families are
 * bundled through fontsource (see `main.tsx`), so every option renders as itself; the
 * tail of each stack is a defensive fallback for the case where a face fails to load.
 */
export const MONO_FONTS: Record<MonoFontKey, { label: string; stack: string }> = {
  jetbrains: {
    label: 'JetBrains Mono',
    stack:
      "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, 'Fira Code', 'SF Mono', Menlo, Consolas, monospace",
  },
  roboto: {
    label: 'Roboto Mono',
    stack:
      "'Roboto Mono', ui-monospace, 'JetBrains Mono Variable', 'SF Mono', Menlo, Consolas, monospace",
  },
  fira: {
    label: 'Fira Code',
    stack:
      "'Fira Code', ui-monospace, 'JetBrains Mono Variable', 'Roboto Mono', Menlo, Consolas, monospace",
  },
  system: {
    label: 'System Mono',
    stack:
      "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Segoe UI Mono', Menlo, Consolas, monospace",
  },
}

export const MONO_FONT_ORDER: MonoFontKey[] = ['jetbrains', 'roboto', 'fira', 'system']

/**
 * Whether a background colour is light, by Rec. 709 relative luminance.
 *
 * Used to decide which way the interface's translucent tints should lean. The app has no
 * separate "light mode": a theme *is* its colours, and this is the one place that reads them
 * back to work out which end of the scale they sit at. That is what makes the light presets
 * work without a second code path — and it also means a custom theme with a pale background
 * gets readable panels instead of invisible ones.
 */
export function isLightBackground(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5
}

/** CSS custom properties written to :root for a set of colours. */
export function colorsToCssVars(c: ThemeColors): Record<string, string> {
  // The veil tints lean *away* from the background: white over a dark theme, black over a
  // light one. Three steps, because the app uses three: a quiet fill for buttons and chips, a
  // slightly firmer one for fields, and a track for the sliders.
  const ink = isLightBackground(c.bgBase) ? '0 0 0' : '255 255 255'
  return {
    '--bg-base': c.bgBase,
    '--bg-surface': c.bgSurface,
    '--bg-elevated': c.bgElevated,
    '--accent': c.accent,
    '--accent-bright': c.accentBright,
    '--accent-glow': c.accentGlow,
    '--text-untyped': c.textUntyped,
    '--text-correct': c.textCorrect,
    '--text-incorrect': c.textIncorrect,
    '--text-muted': c.textMuted,
    '--caret': c.caret,
    '--border': c.border,
    '--error-word-underline': withAlpha(c.textIncorrect, 0.4),
    '--surface-veil': `rgb(${ink} / 0.03)`,
    '--surface-veil-strong': `rgb(${ink} / 0.05)`,
    '--track-veil': `rgb(${ink} / 0.09)`,
  }
}

/**
 * Mixes a hex colour toward transparency. Custom colours come from `<input
 * type="color">`, so they arrive as #rrggbb.
 */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Normalises any CSS colour string to #rrggbb for the colour inputs. */
export function toHex(color: string): string {
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed)
  if (rgba) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
    return `#${hex(rgba[1])}${hex(rgba[2])}${hex(rgba[3])}`
  }
  return '#000000'
}
