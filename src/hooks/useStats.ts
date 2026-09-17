import { useEffect, useState } from 'react'
import { liveStats, type LiveStats } from '../lib/stats'
import { useTestStore } from '../store/useTestStore'

/**
 * Live figures for the optional HUD.
 *
 * Two deliberate choices keep this off the hot path:
 *
 * 1. Keystrokes are read *non-reactively* through `getState()` inside the tick, rather
 *    than subscribed to. The HUD therefore does not re-render once per keystroke.
 * 2. The `setInterval` below is a repaint throttle, not a clock. Elapsed time is always
 *    derived from `performance.now()` deltas, so throttling cannot introduce drift —
 *    which is the thing §6 actually forbids `setInterval` for.
 */
export function useLiveStats(enabled: boolean): LiveStats | null {
  const status = useTestStore((s) => s.status)
  const startTime = useTestStore((s) => s.startTime)
  const endTime = useTestStore((s) => s.endTime)
  const [stats, setStats] = useState<LiveStats | null>(null)

  useEffect(() => {
    if (!enabled || status !== 'running') {
      setStats(null)
      return
    }

    const tick = () => {
      const state = useTestStore.getState()
      if (state.startTime == null) return
      const now = state.endTime ?? performance.now()
      setStats(liveStats(state.keystrokes, Math.max(0, now - state.startTime)))
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [enabled, status, startTime, endTime])

  return stats
}
