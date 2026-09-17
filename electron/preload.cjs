/**
 * Preload — the only bridge between the sandboxed renderer and the OS window.
 *
 * The window is created without a native frame (`frame: false` in `main.cjs`), so minimize,
 * maximize and close no longer exist anywhere the user can reach them: they have to be drawn
 * in the app and sent across. This file is that seam, and it is deliberately the *whole*
 * seam — six calls, one event, no `fs`, no `path`, no module access.
 *
 * Two rules it must keep:
 *
 * • Context isolation stays on. Nothing is written onto the page's `window` except the one
 *   frozen object below, and nothing in the app can reach Electron's internals from it.
 *   A renderer that could call `ipcRenderer.send` with an arbitrary channel would be able to
 *   reach every handler in the main process, which is precisely what this narrow surface
 *   prevents.
 * • The main process is the source of truth for the window's state. The renderer asks for it
 *   and subscribes to it; it never assumes a toggle worked, because the OS can change the
 *   state without the app's involvement (Win + Arrow snapping, a taskbar un-maximize).
 *
 * `sandbox: true` still allows this file to require `electron`: sandboxed preloads get a
 * polyfilled `require` that resolves the `electron` module and a handful of node builtins,
 * which is all this needs.
 */

const { contextBridge, ipcRenderer } = require('electron')

/** Every channel the main process listens on, in one place, so the two halves can be read
 *  side by side and cannot drift into a typo that fails silently at runtime. */
const CHANNELS = {
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
  getState: 'window:get-state',
  setFullscreen: 'window:set-fullscreen',
  state: 'window:state',
}

contextBridge.exposeInMainWorld('novaType', {
  /** Lets the renderer tell "running under Electron" from "running in a browser tab". */
  isDesktop: true,
  platform: process.platform,

  minimize: () => ipcRenderer.send(CHANNELS.minimize),
  toggleMaximize: () => ipcRenderer.send(CHANNELS.toggleMaximize),
  close: () => ipcRenderer.send(CHANNELS.close),

  /** Current `{ maximized, fullscreen }`, for the first paint of the controls. */
  getState: () => ipcRenderer.invoke(CHANNELS.getState),
  /** Requested state, resolving to what the window actually reports afterwards. */
  setFullscreen: (on) => ipcRenderer.invoke(CHANNELS.setFullscreen, Boolean(on)),

  /**
   * Subscribes to window-state changes. Returns its own unsubscribe function — a listener
   * the renderer forgets to remove is a leak that survives unmount and, worse, calls into
   * a dead React tree.
   */
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on(CHANNELS.state, listener)
    return () => ipcRenderer.removeListener(CHANNELS.state, listener)
  },
})
