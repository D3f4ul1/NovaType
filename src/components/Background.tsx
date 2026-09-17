import { useSettingsStore } from '../store/useSettingsStore'

/**
 * The backdrop — §4.1.
 *
 * Layered, back to front: base colour, an optional gradient/mesh, two slowly drifting
 * blurred orbs, a soft radial glow centred behind the prompt, and a ~3% noise overlay.
 * Everything is `position: fixed`, `pointer-events: none` and `aria-hidden`, and animates
 * with `transform`/`opacity` only, so it can never cause a layout shift or steal a click.
 *
 * This is also the most expensive thing in the app, which is why it is the first place the
 * Effects switches reach. Three of its layers cost real work on every frame:
 *
 * • The orbs are two ~60vmax layers under a 120–130px gaussian blur, animating forever. A
 *   blur that large is a full-screen filter pass, and because the layers never stop moving the
 *   compositor never gets to idle — the background alone will hold a laptop's GPU busy.
 * • The noise texture is a repeating image across the whole viewport with
 *   `mix-blend-mode: soft-light`, which forces the browser to read back and blend the pixels
 *   underneath it every time anything behind it changes.
 * • The radial glow is a third large blurred layer on top of the other two.
 *
 * With `animatedBackground` off the backdrop is the base colour and nothing else; with it on,
 * the noise and the glow each have their own switch. Measured on the synthetic typist, the
 * difference between everything on and everything off is the bulk of the app's idle GPU work.
 */

export interface BackgroundProps {
  reduceMotion: boolean
}

export function Background({ reduceMotion }: BackgroundProps) {
  const style = useSettingsStore((s) => s.backgroundStyle)
  const glowIntensity = useSettingsStore((s) => s.glowIntensity)
  const performance = useSettingsStore((s) => s.performance)
  const effects = useSettingsStore((s) => s.effects)

  const animated = performance === 'lite' ? false : effects.animatedBackground
  const noise = performance === 'lite' ? false : effects.noiseTexture

  const showOrbs = animated && (style === 'orbs' || style === 'mesh')
  const showGlow = animated && style !== 'solid'
  // Without the animated layers the washes are still worth drawing — they are a single static
  // gradient, which is free — but they are the thing "no background" has to remove too.
  const showWash = animated && (style === 'gradient' || style === 'mesh')
  const drift = reduceMotion || !animated ? '' : ' animate-orb-a'
  const driftAlt = reduceMotion || !animated ? '' : ' animate-orb-b'

  return (
    <div
      aria-hidden="true"
      data-testid="backdrop"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      {/* Base. Always drawn: this is the one layer that is never optional. */}
      <div className="absolute inset-0" style={{ background: 'var(--bg-base)' }} />

      {/* Gradient / mesh washes */}
      {showWash && style === 'gradient' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 55%, color-mix(in srgb, var(--accent-bright) 9%, transparent) 100%)',
          }}
        />
      )}

      {showWash && style === 'mesh' && (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(45% 40% at 18% 22%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(40% 45% at 82% 30%, color-mix(in srgb, var(--accent-bright) 18%, transparent) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(50% 40% at 55% 88%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 72%)',
            }}
          />
        </>
      )}

      {/* Drifting orbs */}
      {showOrbs && (
        <>
          <div
            className={`absolute -left-[15%] -top-[20%] h-[62vmax] w-[62vmax] rounded-full blur-[120px]${drift}`}
            style={{
              background:
                'radial-gradient(circle at 50% 50%, var(--accent-glow) 0%, transparent 68%)',
              opacity: 0.55 * Math.max(glowIntensity, 0.15),
              willChange: 'transform',
            }}
          />
          <div
            className={`absolute -bottom-[25%] -right-[10%] h-[55vmax] w-[55vmax] rounded-full blur-[130px]${driftAlt}`}
            style={{
              background:
                'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent-bright) 45%, transparent) 0%, transparent 70%)',
              opacity: 0.4 * Math.max(glowIntensity, 0.15),
              willChange: 'transform',
            }}
          />
        </>
      )}

      {/* Soft radial glow behind the prompt */}
      {showGlow && (
        <div
          className="absolute left-1/2 top-1/2 h-[42vmax] w-[76vmax] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
          style={{
            background: 'radial-gradient(closest-side, var(--accent-glow) 0%, transparent 100%)',
            opacity: 0.32 * Math.max(glowIntensity, 0.1),
          }}
        />
      )}

      {/* Noise */}
      {noise && <div className="noise absolute inset-0 opacity-[0.03] mix-blend-soft-light" />}
    </div>
  )
}
