/**
 * The desktop bridge, and the app's view of it.
 *
 * `preload.cjs` exposes one frozen object on `window.novaType` when the app runs inside the
 * desktop shell. It is absent in a browser tab, where `npm run dev` puts the same bundle —
 * which is the case every component here has to survive, because the dev server is where the
 * UI is actually iterated on. So this module is the single place that knows the difference:
 * everything else imports plain functions and never touches `window.novaType` directly.
 *
 * The module also caches the window's state. The state arrives asynchronously (an `invoke`
 * and an event stream), but two paths need to read it *synchronously*: the Escape handler,
 * which has to decide inside a keydown whether the key means "leave fullscreen" or "restart
 * the test", and the peek logic. A promise cannot answer that in time, so the last state the
 * OS reported is kept here as a plain value.
 */

export interface DesktopState {
  maximized: boolean
  fullscreen: boolean
}

interface NovaTypeBridge {
  isDesktop: true
  platform: string
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  getState: () => Promise<DesktopState>
  setFullscreen: (on: boolean) => Promise<boolean>
  onStateChange: (callback: (state: DesktopState) => void) => () => void
}

declare global {
  interface Window {
    novaType?: NovaTypeBridge
  }
}

const bridge: NovaTypeBridge | undefined = typeof window === 'undefined' ? undefined : window.novaType

/** True when the bundle is running inside the Electron shell rather than a browser tab. */
export const isDesktop = Boolean(bridge)

/** `'win32'`, `'darwin'`, `'linux'`; empty in a browser. */
export const desktopPlatform = bridge?.platform ?? ''

let state: DesktopState = { maximized: false, fullscreen: false }

/** Timestamp of the last maximize toggle, for the debounce below. */
let lastMaximizeToggle = 0

/** Everything currently subscribed through `subscribeDesktopState`. */
const listeners = new Set<(state: DesktopState) => void>()

/**
 * The fullscreen state the app has asked for but not yet seen confirmed, or null.
 *
 * It exists to settle a race with the initial `getState()` read: that reply is requested at
 * mount and lands a macrotask later, so on an app launching into fullscreen it can arrive
 * *after* the request and publish the pre-request answer, flickering the chrome back in for a
 * frame. While a request is outstanding, the read is not allowed to contradict it.
 */
let pendingFullscreen: boolean | null = null

/**
 * Stores the state and tells everything subscribed — but only when it actually changed.
 *
 * The window reports a resize on every frame of a drag, and each report carries the same two
 * booleans. Notifying on those would re-render the chrome dozens of times a second to draw the
 * same thing, so equality is checked here, once, rather than in each consumer.
 *
 * `force` exists for the one delivery that has to happen regardless: a new subscriber's first,
 * which carries the default state when the window genuinely is neither maximized nor
 * fullscreen. Without it, that subscriber would never be told anything and would sit at
 * "not ready" forever.
 */
function publish(next: DesktopState, force = false): void {
  const changed = next.maximized !== state.maximized || next.fullscreen !== state.fullscreen
  state = next
  if (!changed && !force) return
  for (const listener of listeners) listener(next)
}

/** Last state the OS reported. Synchronous, and only ever written from a real event. */
export function desktopState(): DesktopState {
  return state
}

export function minimizeWindow(): void {
  bridge?.minimize()
}

/**
 * Toggles maximize, debounced against the double-clicked caption.
 *
 * Double-clicking a drag region to maximize can be reported twice on some platforms — once
 * natively by the window manager and once as a DOM event, since the region is both a caption
 * and an element with a `dblclick` handler. Two toggles inside one gesture cancel out, and the
 * symptom is a double-click that appears to do nothing at all.
 *
 * The guard lives here, at the only place the toggle is issued, so the button and the drag
 * region cannot end up with different rules about it. A quarter of a second is far longer than
 * the gap between two reports of one gesture and far shorter than two deliberate clicks.
 */
export function toggleMaximize(): void {
  const now = performance.now()
  if (now - lastMaximizeToggle < 250) return
  lastMaximizeToggle = now
  bridge?.toggleMaximize()
}

export function closeWindow(): void {
  bridge?.close()
}

/**
 * Asks for a fullscreen state, and publishes it immediately.
 *
 * The optimism is not cosmetic. On Windows the `enter-full-screen` event arrives only once the
 * platform has finished the transition — measured at well over a second for a frameless window
 * — so an app that waited for it would sit there describing itself as fullscreen while still
 * drawing a window button that does nothing. The request is therefore treated as the state,
 * and the window's own report is left to confirm it.
 */
export function setFullscreen(on: boolean): void {
  pendingFullscreen = on
  publish({ ...state, fullscreen: on })
  void bridge?.setFullscreen(on).then((actual) => {
    // The handler reports what the window did with the request, so a refused or adjusted
    // request cannot leave the app insisting on a state it never reached.
    if (pendingFullscreen === actual) pendingFullscreen = null
    if (typeof actual === 'boolean') publish({ ...state, fullscreen: actual })
  })
}

/**
 * Subscribes to window-state changes, delivering the current state once up front.
 *
 * The initial `getState()` matters: a window that starts maximized (or is restored into
 * fullscreen) must be drawn correctly on its first frame, not after the first event.
 */
export function subscribeDesktopState(callback: (state: DesktopState) => void): () => void {
  listeners.add(callback)
  if (!bridge) return () => listeners.delete(callback)

  const off = bridge.onStateChange((next) => {
    if (pendingFullscreen !== null && next.fullscreen === pendingFullscreen) pendingFullscreen = null
    publish(next)
  })
  void bridge.getState().then((next) => {
    publish(pendingFullscreen === null ? next : { ...next, fullscreen: pendingFullscreen }, true)
  })

  return () => {
    listeners.delete(callback)
    off()
  }
}
