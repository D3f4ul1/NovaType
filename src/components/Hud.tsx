import { useLiveStats } from '../hooks/useStats'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTestStore } from '../store/useTestStore'

/**
 * Optional live WPM / accuracy row — §5.5. Dimmed until the test is running.
 *
 * The row always occupies its space even when the setting is off, so toggling it cannot
 * nudge the prompt. The numbers are `aria-hidden`: they update four times a second, which
 * is another thing that should never be a live region. The Results screen announces the
 * final figures once instead.
 */
export interface HudProps {
  /**
   * Drops the accuracy readout, keeping WPM.
   *
   * The third and last thing the layout gives up as the window gets short (see
   * `lib/layout.ts`): below 320px of window there is a bar, an options row, one line of prompt
   * and room for exactly one stat, and speed is the one people watch while typing.
   */
  compact?: boolean
}

export function Hud({ compact = false }: HudProps) {
  const enabled = useSettingsStore((s) => s.liveWpm)
  const status = useTestStore((s) => s.status)
  const stats = useLiveStats(enabled)

  const running = status === 'running'
  const visible = enabled ? (running ? 1 : 0.35) : 0

  return (
    <div
      data-testid="hud"
      aria-hidden="true"
      className="flex h-6 items-center justify-center gap-7 text-[11px] uppercase tracking-[0.18em]"
      style={{ opacity: visible, transition: 'opacity 220ms ease-out' }}
    >
      <span style={{ color: 'var(--text-muted)' }}>
        wpm{' '}
        <span
          className="ml-1 text-sm"
          style={{ color: 'var(--accent-bright)', fontVariantNumeric: 'tabular-nums' }}
        >
          {stats ? Math.round(stats.wpm) : 0}
        </span>
      </span>
      {!compact && (
        <span style={{ color: 'var(--text-muted)' }}>
          acc{' '}
          <span
            className="ml-1 text-sm"
            style={{ color: 'var(--accent-bright)', fontVariantNumeric: 'tabular-nums' }}
          >
            {stats ? Math.round(stats.accuracy) : 100}
          </span>
        </span>
      )}
    </div>
  )
}
