import { useCallback, useEffect, useRef, useState } from 'react'
import {
  desktopState,
  isDesktop,
  setFullscreen as requestFullscreen,
  subscribeDesktopState,
  type DesktopState,
} from '../lib/desktop'
import { useSettingsStore } from '../store/useSettingsStore'

/**
 * The live state of the OS window: whether it is maximized, and whether it is fullscreen.
 *
 * `ready` is the part that matters. There is a window between the first paint and the main
 * process's reply in which the app does not yet know the state, and acting on the default
 * (`false`, `false`) in that window is how an app un-maximizes itself on launch: it would
 * conclude "the setting says maximized but the window is not" and "correct" one of them.
 * Consumers that write anything back wait for `ready`.
 */
export interface DesktopWindowState extends DesktopState {
  isDesktop: boolean
  ready: boolean
}

export function useDesktopWindow(): DesktopWindowState {
  const [state, setState] = useState<DesktopState>(() => desktopState())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let received = false
    const off = subscribeDesktopState((next) => {
      received = true
      setState(next)
      setReady(true)
      // A second delivery (the event, then the initial read, or the other way round) would
      // otherwise be a redundant render; the values are compared so it is not.
      if (!received) setReady(true)
    })
    return off
  }, [])

  return { ...state, isDesktop, ready }
}

/**
 * Keeps `settings.fullscreen` and the actual window in agreement.
 *
 * The store is the *choice* — it is what survives a restart, and what the settings switch
 * shows. The window is the *truth*, and the OS can change it without asking (a platform-level
 * F11, a window manager deciding to leave fullscreen). So the two are reconciled rather than
 * one being derived from the other:
 *
 * • Once the real state is known, the saved choice is applied. This is the launch restore.
 * • Afterwards the window leads: any change the app did not request is written back into the
 *   store, so the switch never lies about the state it is describing.
 *
 * `intent` is what keeps those from fighting. While a request is in flight the window may
 * still report the old value, and "correcting" the store to match it would undo the click
 * that is still being applied — the classic two-way binding loop, one effect either side.
 */
export function useFullscreenSync(): {
  fullscreen: boolean
  canFullscreen: boolean
  setFullscreen: (on: boolean) => void
  toggleFullscreen: () => void
} {
  const stored = useSettingsStore((s) => s.fullscreen)
  const update = useSettingsStore((s) => s.update)
  const { fullscreen, ready } = useDesktopWindow()

  /** The value the app last asked the window for; null when the app is not mid-request. */
  const intent = useRef<boolean | null>(null)
  const restored = useRef(false)

  // Launch restore: one shot, once the window has told us what it is actually doing.
  useEffect(() => {
    if (!isDesktop || !ready || restored.current) return
    restored.current = true
    if (stored !== fullscreen) {
      intent.current = stored
      requestFullscreen(stored)
    }
  }, [ready, stored, fullscreen])

  // Follow the window, except while a request of ours is still landing.
  useEffect(() => {
    if (!isDesktop || !ready) return
    if (intent.current !== null) {
      if (fullscreen === intent.current) intent.current = null
      return
    }
    if (fullscreen !== stored) update('fullscreen', fullscreen)
  }, [ready, fullscreen, stored, update])

  const setFullscreen = useCallback(
    (on: boolean) => {
      intent.current = on
      // Written first so the switch moves on the click rather than a round trip later; the
      // effect above holds it there until the window agrees.
      update('fullscreen', on)
      requestFullscreen(on)
    },
    [update],
  )

  const toggleFullscreen = useCallback(() => {
    setFullscreen(!useSettingsStore.getState().fullscreen)
  }, [setFullscreen])

  return { fullscreen, canFullscreen: isDesktop, setFullscreen, toggleFullscreen }
}
