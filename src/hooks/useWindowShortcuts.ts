import { useEffect, useRef } from 'react'
import { isEditableTarget } from '../lib/dom'
import { isDesktop, setFullscreen } from '../lib/desktop'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTestStore } from '../store/useTestStore'

/**
 * The window-chrome keys: F11, and Escape's claim on fullscreen.
 *
 * Its own listener rather than three more branches in the typing engine, because it is about
 * the window and not about the test. Ordering is the one thing that matters: this hook is
 * called *before* `useTypingEngine` in `App`, so its listener is registered first and runs
 * first for the same key. That is what lets Escape mean "leave fullscreen" when the test is
 * idle, while remaining "end the test" mid-run — the engine's handler never sees the key in
 * the first case, and is left alone in the second.
 *
 * Escape has to be resolved in a keydown at all because the app is frameless and this
 * fullscreen is the *window's*, not the page's: there is no document fullscreen mode to exit,
 * so `document.fullscreenElement` is always null and nothing else would take the app out.
 *
 * The state is read imperatively, from the store, rather than subscribed. The store is written
 * the instant the user asks for a change, so a second Escape arriving before the window has
 * confirmed the first still reads what the user last chose rather than the state being torn
 * down — and a handler that never re-binds cannot see a stale closure.
 */

export interface WindowShortcutOptions {
  /**
   * False while a panel or dialog owns the keyboard. F11 still works — the brief asks for it
   * "from anywhere in the app" — but Escape is left to whatever is open, so this cannot exit
   * fullscreen out from under a settings panel that was closing on the same keypress.
   */
  enabled: boolean
}

export function useWindowShortcuts({ enabled }: WindowShortcutOptions): void {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!isDesktop) return

    const onKeyDown = (event: KeyboardEvent) => {
      // A focused text field keeps its own keyboard: F11 in an input is nothing, and Escape
      // in one is the user's business.
      if (isEditableTarget(event.target)) return

      if (event.key === 'F11') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setFullscreen(!useSettingsStore.getState().fullscreen)
        return
      }

      if (event.key !== 'Escape' || !enabledRef.current) return

      // Mid-test, Escape belongs to the engine: it ends the run, and leaving fullscreen at the
      // same time would snatch the window out from under the results screen.
      if (useTestStore.getState().status === 'running') return
      if (!useSettingsStore.getState().fullscreen) return

      event.preventDefault()
      // The engine is registered on the same node and the same phase, and would otherwise
      // treat this same Escape as "restart the test" — one keypress, two actions.
      event.stopImmediatePropagation()
      setFullscreen(false)
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])
}
