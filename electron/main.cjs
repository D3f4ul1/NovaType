/**
 * Electron main process — the desktop shell around the web build.
 *
 * The renderer is the ordinary Vite bundle in `dist/`, loaded over `file://`. Nothing in the
 * app needs a Node API, so the window runs fully sandboxed with context isolation on and no
 * integration, and the default menu is removed: half of its Edit items are paste, and paste
 * is deliberately refused everywhere except the two fields that exist to accept it.
 *
 * The window has **no native frame**. The app draws its own title bar minus the title bar:
 * one 46px strip across the top holds the wordmark, the difficulty and mode controls and the
 * theme and settings buttons, with the minimize / maximize / close buttons at its right end.
 * The OS chrome is therefore gone entirely, and the three window commands have to travel the
 * other way over IPC (`preload.cjs` → the handlers at the bottom of this file). That is the
 * trade: one more seam to maintain, in exchange for a bar that can fade out in Focus Mode.
 *
 * Three things are worth keeping if this is ever rewritten:
 *
 * • The bundle must be built with a *relative* base (`base: './'` in `vite.config.ts`).
 *   Vite's default `/assets/...` is absolute, which resolves to the filesystem root under
 *   `file://` — the app then boots to a blank window with four 404s in a console nobody is
 *   looking at.
 * • `ready-to-show` before `show()`, with a dark `backgroundColor` set at construction. A
 *   BrowserWindow paints white until the first frame arrives, and a typing app that flashes
 *   white on launch is a worse first impression than a slightly later one.
 */

const { app, BrowserWindow, Menu, ipcMain, shell, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/** Absolute paths only: a relative one would be resolved against Electron's cwd. */
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html')
const PRELOAD = path.join(__dirname, 'preload.cjs')

/** Set to run the headless self-check instead of opening a window for a human. */
const SMOKE_PATH = process.env.NOVATYPE_SMOKE || ''

/**
 * A dev server to load instead of `dist/`, so the desktop shell can be pointed at HMR while
 * iterating on the UI. Unset — which is the case for every packaged run — means the bundle.
 */
const DEV_SERVER = process.env.NOVATYPE_DEV_SERVER || ''

const smokeNotes = []

/**
 * Window geometry persistence.
 *
 * The window's size and position are saved to a JSON file in the app's userData directory
 * on close, and restored on the next launch. This is what makes the app feel like it
 * "remembers" where you left it, rather than always opening to a fixed 1280×840.
 *
 * Validation rules:
 * • The saved bounds must intersect at least one display (covers disconnected monitors).
 * • Width and height must meet the minimum floors.
 * • Fullscreen is never restored — closing in fullscreen should restart windowed.
 * • Maximised state IS restored — it's a deliberate layout choice, not an accident.
 */
const BOUNDS_PATH = path.join(app.getPath('userData'), 'window-bounds.json')

function loadWindowBounds() {
  try {
    const data = JSON.parse(fs.readFileSync(BOUNDS_PATH, 'utf8'))
    // Must be a plain object with the four geometry keys.
    if (!data || typeof data !== 'object') return null
    const { x, y, width, height, maximized } = data
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null
    if (width < MIN_WIDTH || height < MIN_HEIGHT) return null

    // Check that the saved position intersects a display. The centre point of the window
    // must fall inside at least one screen — this catches the case where a second monitor
    // was disconnected while the app was open on it.
    const centreX = x + width / 2
    const centreY = y + height / 2
    const displays = screen.getAllDisplays()
    const onScreen = displays.some((d) => {
      const { x: dx, y: dy, width: dw, height: dh } = d.bounds
      return centreX >= dx && centreX <= dx + dw && centreY >= dy && centreY <= dy + dh
    })
    if (!onScreen) return null

    return { x, y, width, height, maximized: Boolean(maximized) }
  } catch {
    return null
  }
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed()) return
  // If the window is maximised, save the *restored* geometry so the user gets their
  // preferred window size back, not the maximised one. The maximised flag is stored
  // separately so it can be reapplied on the next launch.
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
  const data = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized(),
  }
  try {
    fs.mkdirSync(path.dirname(BOUNDS_PATH), { recursive: true })
    fs.writeFileSync(BOUNDS_PATH, JSON.stringify(data))
  } catch {
    // Non-fatal: the app will open at defaults next time.
  }
}

/**
 * Resize floors, in content pixels.
 *
 * `minWidth: 760` is the width below which the unified bar's groups would begin to overlap:
 * the mark, the difficulty control, the four-mode switch, the theme button, the settings
 * button and three 44px window buttons in one line. Rather than letting it squeeze until
 * something gives, the bar's inner layout collapses two of those groups to dropdowns under
 * 900px (see `TopBar`), which is what buys the last 140px.
 *
 * `minHeight: 260` is the height at which the app is still a usable typing test: the bar,
 * the mode's options row, a one-line prompt and a one-stat HUD. The layout sheds the hint
 * bar, then typing lines, then the accuracy readout as it shrinks (see `lib/layout.ts`), so
 * there is no height at which anything clips or scrolls.
 */
const MIN_WIDTH = 760
const MIN_HEIGHT = 260

function createWindow() {
  const saved = loadWindowBounds()
  const win = new BrowserWindow({
    width: saved ? saved.width : 1280,
    height: saved ? saved.height : 840,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    // No OS frame: the app draws the bar. This is also what makes the bar's two-way
    // relationship with Focus Mode possible — it can fade out mid-test, and the window
    // buttons can peek back when the mouse approaches the top edge.
    frame: false,
    backgroundColor: '#070b14',
    title: 'NovaType',
    autoHideMenuBar: true,
    // The same .ico that is stamped into the exe, so the taskbar button and the file icon
    // are the one mark. Generated by `scripts/make-icon.cjs`.
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => {
    if (saved && saved.maximized) win.maximize()
    win.show()
  })

  // Save geometry on close so the next launch opens where this one left off.
  win.on('close', () => saveWindowBounds(win))

  /* ── Window state, pushed to the renderer ──────────────────────────
     The app's own chrome is the only chrome, so the buttons in it have to stay truthful
     when the window is resized by something other than those buttons: Windows snapping
     (Win + Left/Right), Win + Up, a taskbar un-maximize, or a double-clicked caption.
     Rather than let the renderer guess, every state change is pushed as one event, and
     `window:get-state` covers the first paint. */
  const readState = () => ({
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  })

  const pushState = (label) => {
    if (win.isDestroyed()) return
    const state = readState()
    if (SMOKE_PATH) smokeNotes.push(`state ${label} -> max=${state.maximized} fs=${state.fullscreen}`)
    win.webContents.send('window:state', state)
  }

  /**
   * Coalesced push.
   *
   * Two things need this. First, `resize` fires dozens of times a second while an edge is
   * being dragged; without coalescing that is dozens of IPC messages, each one waking the
   * whole chrome. Second, and less obviously, it gives the platform a moment to settle: the
   * fullscreen *events* are not reliable on Windows — measured, `enter-full-screen` arrives in
   * under 40ms while `leave-full-screen` may report the window as still fullscreen, or not
   * arrive at all — so the resize that always accompanies the transition is the dependable
   * trigger, fired once the flag has already flipped.
   */
  let pushQueued = false
  const schedulePush = (label) => {
    if (pushQueued) return
    pushQueued = true
    setTimeout(() => {
      pushQueued = false
      pushState(label)
    }, 60)
  }

  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'resize']) {
    win.on(event, () => schedulePush(event))
  }

  // External links open in the system browser rather than navigating the app window away
  // from itself, where there is no address bar to get back from.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (SMOKE_PATH) {
    win.webContents.on('did-fail-load', (_e, code, description, url) => {
      smokeNotes.push(`did-fail-load ${code} ${description} ${url}`)
    })
    // A renderer that dies mid-probe destroys the WebContents, and every later
    // `executeJavaScript` then fails with "Object has been destroyed" — which names the
    // symptom, not the cause. This names the cause.
    win.webContents.on('render-process-gone', (_e, details) => {
      smokeNotes.push(`render-process-gone reason=${details.reason} exit=${details.exitCode}`)
    })
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) smokeNotes.push(`console: ${message}`)
    })
    // The watchdog guards the *load*, and is disarmed the moment the page is up. Leaving it
    // armed would abort a probe that is working correctly but taking a while — the checks
    // deliberately wait on the window's own events, and several of those are slow.
    const loadWatchdog = setTimeout(() => failSmoke('timed out before did-finish-load'), 30000)
    win.webContents.once('did-finish-load', () => {
      clearTimeout(loadWatchdog)
      void runSmoke(win)
    })
  }

  if (DEV_SERVER) win.loadURL(DEV_SERVER)
  else win.loadFile(DIST_INDEX)

  return win
}

/**
 * Reads what the renderer actually rendered and writes it to `SMOKE_PATH`.
 *
 * "The .exe starts" is not the same claim as "the .exe shows the app": a packaged build can
 * open a window and still be loading nothing, which is exactly what an absolute asset path
 * under `file://` looks like from the outside. The title, the mounted prompt, a computed
 * style and the count of rendered character spans are the difference between the two.
 */
async function runSmoke(win) {
  try {
    const probe = await win.webContents.executeJavaScript(`(() => {
      const word = document.querySelector('.tword')
      const styles = getComputedStyle(document.body)
      return {
        title: document.title,
        url: location.href,
        words: [...document.querySelectorAll('.tword')].slice(0, 8).map((w) => w.textContent.trim()).join(' '),
        wordsRendered: document.querySelectorAll('.tword').length,
        charsRendered: document.querySelectorAll('.tchar').length,
        buttons: document.querySelectorAll('button').length,
        bodyBackground: styles.backgroundColor,
        promptFont: word ? getComputedStyle(word).fontFamily : null,
        scripts: [...document.scripts].map((s) => s.src.split('/').pop()),
      }
    })()`)

    // Read before the probe: a window that dies mid-run takes its own accessors with it, and
    // the size floor is not what is under test at that point.
    const minimumSize = win.getMinimumSize()
    const chrome = await probeChrome(win, probe.words)

    fs.writeFileSync(
      SMOKE_PATH,
      JSON.stringify(
        {
          ok: probe.charsRendered > 0 && probe.wordsRendered > 0 && chrome.bar.present,
          electron: process.versions.electron,
          minimumSize,
          probe,
          chrome,
          notes: smokeNotes,
        },
        null,
        2,
      ),
    )
    app.exit(0)
  } catch (error) {
    failSmoke(`probe threw: ${error && error.message}`)
  }
}

/**
 * Verifies the window chrome from the inside, by driving it.
 *
 * "There is a frameless window with a bar in it" is not something a screenshot proves —
 * a bar can be present and still swallow clicks, a drag region can be missing, a maximize
 * button can be drawn and never wired up, and a 260px window can look fine while quietly
 * overflowing. So each of those is exercised and *read back*: the geometry at the resize
 * floors, the computed `-webkit-app-region` values, the overlap check between the bar's
 * groups, and the button label after the window is actually maximized and restored by the
 * main process.
 */
/**
 * Runs the chrome checks, and always reports what it got.
 *
 * The steps are independent, so a failure in one must not erase the answers from the others —
 * including the case where the window itself goes away part-way through, which otherwise
 * surfaces as one opaque error and an empty result file.
 */
async function probeChrome(win, words) {
  const out = { notes: [] }
  try {
    await probeSteps(win, words, out)
  } catch (error) {
    out.fatal = String((error && error.message) || error)
  }
  return out
}

async function probeSteps(win, words, out) {
  const evaluate = (expression) => win.webContents.executeJavaScript(expression)
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * Samples until the app agrees with the window, reporting how long that took.
   *
   * The two halves of the window's state live on opposite sides of a process boundary: the OS
   * changes it, and the app is told. What is being measured is the *lag* — `ms` is the number of
   * milliseconds the app was wrong for — and whether it ever caught up at all.
   */
  const settle = async (sample, done, budgetMs) => {
    const start = Date.now()
    const timeline = []
    for (;;) {
      const state = await sample()
      const elapsed = Date.now() - start
      timeline.push({ ms: elapsed, ...state })
      if (done(state)) return { ok: true, ms: elapsed, samples: timeline.length, final: state }
      if (elapsed > budgetMs) {
        return { ok: false, ms: elapsed, samples: timeline.length, final: state, timeline }
      }
      await wait(100)
    }
  }

  /** Reads the bar: its height, its drag/no-drag regions and whether its groups collide. */
  const readBar = `(() => {
    const bar = document.querySelector('[data-testid=nova-bar]')
    if (!bar) return { present: false }
    const groups = [...bar.querySelectorAll('[data-bar-group]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { name: el.dataset.barGroup, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
    })
    // Any two groups whose horizontal spans intersect are overlapping controls.
    const overlaps = []
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].right > groups[j].left + 0.5 && groups[j].right > groups[i].left + 0.5) {
          overlaps.push(groups[i].name + '&' + groups[j].name)
        }
      }
    }
    const drag = bar.querySelector('[data-testid=drag-region]')
    // The controls are siblings of the drag region, not inside it, so what matters is that
    // they carry the opt-out class for the day the drag area grows. The region value itself
    // is deliberately not asserted here: Chromium reports the initial value as 'none'.
    const controls = [...bar.querySelectorAll('[data-window-control]')].map((el) => ({
      action: el.dataset.windowControl,
      label: el.getAttribute('aria-label'),
      noDrag: el.parentElement ? el.parentElement.classList.contains('app-no-drag') : false,
    }))
    return {
      present: true,
      height: Math.round(bar.getBoundingClientRect().height),
      groups,
      overlaps,
      // The strip is itself a bar row, so this counts across the document rather than inside
      // the bar: querySelectorAll searches descendants and would never see the attribute on
      // the element it was called on.
      rowCount: document.querySelectorAll('[data-bar-row]').length,
      fits: bar.scrollWidth <= bar.clientWidth + 1,
      dragRegion: drag ? { width: Math.round(drag.getBoundingClientRect().width), region: getComputedStyle(drag).webkitAppRegion } : null,
      controls,
    }
  })()`

  /** Reads the vertical layout at the current window size. */
  const readLayout = `(() => {
    const doc = document.documentElement
    const viewport = document.querySelector('[data-testid=typing-viewport]')
    const lines = viewport ? Math.round(viewport.getBoundingClientRect().height / parseFloat(getComputedStyle(doc).getPropertyValue('--line-box'))) : null
    const hud = document.querySelector('[data-testid=hud]')
    return {
      size: [window.innerWidth, window.innerHeight],
      overflowY: doc.scrollHeight - doc.clientHeight,
      overflowX: doc.scrollWidth - doc.clientWidth,
      hintBar: !!document.querySelector('[data-testid=hint-bar]'),
      visibleLines: lines,
      hudText: hud ? hud.textContent.replace(/\\s+/g, ' ').trim() : null,
    }
  })()`

  /**
   * Runs one named check, recording a failure rather than aborting the run.
   *
   * A probe that stops at its first problem hides everything after it, which is exactly the
   * wrong shape for this: the parts are independent, and knowing that eight of nine passed and
   * which one did not is worth far more than knowing that one of them threw.
   */
  const step = async (name, body) => {
    try {
      out[name] = await body()
    } catch (error) {
      out[name] = { failed: String((error && error.message) || error) }
    }
  }

  const controlCount = `document.querySelectorAll('[data-window-control]').length`
  const status = () => evaluate(`document.querySelector('[data-testid=app]').dataset.status`)
  const sample = async () => ({ controls: await evaluate(controlCount), os: win.isFullScreen() })
  const key = (k) => evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))
    return true
  })()`)

  /**
   * Resizes the window and confirms it took.
   *
   * `setContentSize` is a request, and Windows can override it a moment later — leaving
   * fullscreen, for instance, restores the pre-fullscreen geometry over the top of it. A
   * layout read taken then describes a window nobody asked for, which is worse than a failed
   * check: it is a passing check of the wrong width. So the size is asserted, not assumed.
   */
  const resize = async (width, height) => {
    // Un-maximize first: a maximized window ignores a size request and keeps its own, while
    // still reporting the requested one back from `getContentSize`. Asking the *renderer* is
    // the only answer that describes what the layout was actually computed against.
    if (win.isMaximized()) {
      win.unmaximize()
      await wait(400)
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      win.setContentSize(width, height)
      await wait(450)
      const size = await evaluate('[window.innerWidth, window.innerHeight]')
      if (size[0] === width && size[1] === height) return { ok: true, size }
    }
    return { ok: false, size: await evaluate('[window.innerWidth, window.innerHeight]') }
  }

  // 1. The bar as it opens: one strip, no collisions, a real drag region. 2. Maximize and
  //    restore, driven from the main process, reading the button's own label back.
  await step('bar', () => evaluate(readBar))
  await step('layoutWide', async () => ({ ...(await evaluate(readLayout)), bar: await evaluate(readBar) }))
  await step('maximize', async () => {
    const label = () => evaluate(`(() => {
      const el = document.querySelector('[data-window-control=maximize]')
      return el ? el.getAttribute('aria-label') : null
    })()`)
    const before = await label()
    win.maximize()
    await wait(500)
    const maximized = { state: win.isMaximized(), label: await label() }
    win.unmaximize()
    await wait(500)
    return { before, maximized, restored: { state: win.isMaximized(), label: await label() } }
  })

  // 3. Fullscreen, entered *from the main process* so the renderer is told about it the way it
  //    is told about any change it did not make. Timed, because how long the app takes to
  //    agree with the window is the whole question.
  await step('fullscreen', async () => {
    win.setFullScreen(true)
    const entered = await settle(sample, (s) => s.os && s.controls === 0, 4000)
    const bar = await evaluate(readBar)
    win.setFullScreen(false)
    const left = await settle(sample, (s) => !s.os && s.controls > 0, 4000)
    return { entered: { ok: entered.ok, ms: entered.ms }, bar: { rows: bar.rowCount, controls: bar.controls.length }, left: { ok: left.ok, ms: left.ms } }
  })

  // 4. The narrow floor, where the bar's pickers fold into dropdowns.
  await step('layoutNarrow', async () => {
    const resizeResult = await resize(760, 700)
    return { resized: resizeResult.ok, resizedSize: resizeResult.size, ...(await evaluate(readLayout)), bar: await evaluate(readBar) }
  })

  // 5. The short floor and the steps above it: nothing clipped, nothing scrolling.
  for (const height of [420, 320, 260]) {
    await step(`layoutH${height}`, async () => {
      const resizeResult = await resize(760, height)
      return { resized: resizeResult.ok, ...(await evaluate(readLayout)), bar: await evaluate(readBar) }
    })
  }

  await step('restore', async () => {
    await resize(1280, 840)
  })

  // 6. Focus Mode and the peek. A synthetic keydown is enough to start a test — the engine
  //    listens on window and does not care where the event came from — which is the only way
  //    to reach the focus state without a human at the keyboard.
  const strip = `(() => {
    const bar = document.querySelector('[data-testid=nova-bar]')
    const wrap = bar.parentElement
    const controls = document.querySelector('[data-testid=nova-bar] > div:last-child')
    const mark = bar.querySelector('[data-bar-group=mark]')
    return {
      chromeOpacity: Number(getComputedStyle(wrap).opacity.slice(0, 4)),
      controlsOpacity: controls ? Number(getComputedStyle(controls).opacity.slice(0, 4)) : null,
      controlsPointer: controls ? getComputedStyle(controls).pointerEvents : null,
      toolbarInert: mark && mark.parentElement ? mark.parentElement.inert === true : null,
    }
  })()`

  await step('focusMode', async () => {
    await key('a')
    await wait(500)
    return { status: await status(), ...(await evaluate(strip)) }
  })

  await step('peek', async () => {
    const move = (y) => evaluate(`(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: ${y}, clientX: 640, bubbles: true }))
      return true
    })()`)
    await move(12)
    // Sampled until it settles rather than after a fixed wait. The peek is a Framer Motion
    // tween driven by `requestAnimationFrame`, and a fixed 400 ms assumption produced 0.01 one
    // run and 1.0 the next — which says something about the harness, not the app. What is
    // being asked is whether the controls *reach* their end states, and how long that took.
    const nearTop = await settle(
      () => evaluate(strip),
      (state) => state.controlsOpacity === 1,
      1500,
    )
    await move(400)
    const away = await settle(
      () => evaluate(strip),
      (state) => state.controlsOpacity === 0,
      1500,
    )
    return { nearTop, away }
  })

  // 7. The keyboard: F11 in, F11's Escape out, and Escape mid-run which must *not* leave.
  await step('keyboard', async () => {
    await key('Escape')
    await wait(300)
    await key('Escape')
    await wait(300)
    const idle = await status()

    await key('F11')
    await wait(1200)
    const entered = { os: win.isFullScreen(), controls: await evaluate(controlCount) }

    await key('Escape')
    await wait(1200)
    const left = { os: win.isFullScreen(), controls: await evaluate(controlCount) }

    win.setFullScreen(true)
    await settle(sample, (s) => s.os && s.controls === 0, 4000)
    await key('a')
    await wait(400)
    const running = { os: win.isFullScreen(), status: await status() }
    await key('Escape')
    await wait(900)
    const ended = { os: win.isFullScreen(), status: await status() }
    win.setFullScreen(false)
    await wait(600)
    return { idle, entered, left, running, ended }
  })

  // 8. The folded picker: it has to open, list the same options the pills offer, take a
  //    choice, and close again. A dropdown that cannot be dismissed, or that is clipped by
  //    the box its pills animate inside, looks identical to a working one until it is used.
  await step('dropdown', async () => {
    // Back to idle first: the bar is deliberately `inert` for the whole of a test — including
    // the results screen — and an inert button does not accept a click, programmatic or not.
    await key('Escape')
    await wait(200)
    await key('Escape')
    await wait(400)

    await resize(760, 700)
    await wait(400)

    /** Everything the check needs to say about the folded picker, in one read. */
    const readPicker = `(() => {
      const chip = document.querySelector('[data-pick-chip=difficulty-bar]')
      const list = document.querySelector('[role=listbox]')
      const group = document.querySelector('[data-bar-group=difficulty]')
      return {
        width: window.innerWidth,
        status: document.querySelector('[data-testid=app]').dataset.status,
        chipPresent: !!chip,
        chipsInBar: document.querySelectorAll('[data-pick-chip]').length,
        pillsPresent: !!document.querySelector('[data-bar-group=difficulty] [aria-pressed]'),
        groupWidth: group ? Math.round(group.getBoundingClientRect().width) : null,
        chipLabel: chip ? chip.textContent.trim() : null,
        expanded: chip ? chip.getAttribute('aria-expanded') : null,
        listOpen: !!list,
        options: list ? [...list.querySelectorAll('[role=option]')].map((el) => el.textContent.trim()) : null,
        selected: list ? (list.querySelector('[aria-selected=true]') || {}).textContent : null,
      }
    })()`

    const before = await evaluate(readPicker)

    await evaluate(`(() => {
      const chip = document.querySelector('[data-pick-chip=difficulty-bar]')
      if (chip) chip.click()
      return true
    })()`)
    await wait(400)
    const opened = await evaluate(readPicker)

    // Choosing one has to take effect and put the list away.
    await evaluate(`(() => {
      const list = document.querySelector('[role=listbox]')
      if (!list) return false
      const hard = [...list.querySelectorAll('[role=option]')].find((el) => el.textContent.trim() === 'hard')
      if (hard) hard.click()
      return true
    })()`)
    await wait(500)
    const chosen = await evaluate(readPicker)

    // And Escape has to put it away too, without ending or restarting the test behind it.
    await evaluate(`(() => {
      const chip = document.querySelector('[data-pick-chip=difficulty-bar]')
      if (chip) chip.click()
      return true
    })()`)
    await wait(300)
    await key('Escape')
    await wait(300)
    const dismissed = await evaluate(readPicker)

    // Put the level back, so the check can be run twice and the app is left as it was found.
    await evaluate(`(() => {
      const chip = document.querySelector('[data-pick-chip=difficulty-bar]')
      if (chip) chip.click()
      return true
    })()`)
    await wait(300)
    await evaluate(`(() => {
      const list = document.querySelector('[role=listbox]')
      if (!list) return false
      const normal = [...list.querySelectorAll('[role=option]')].find((el) => el.textContent.trim() === 'normal')
      if (normal) normal.click()
      return true
    })()`)
    await wait(400)
    const restored = await evaluate(readPicker)

    return { before, opened, chosen, dismissed, restored }
  })

  // 9. Double-clicking the drag region maximizes, once — through the app's own handler, so a
  //    platform that also reports the gesture natively would show up as a second toggle that
  //    cancelled this one out.
  await step('doubleClick', async () => {
    const dbl = `(() => {
      const drag = document.querySelector('[data-testid=drag-region]')
      if (!drag) return false
      drag.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      return true
    })()`
    await evaluate(dbl)
    await wait(700)
    const maximized = win.isMaximized()
    await wait(400)
    await evaluate(dbl)
    await wait(700)
    return { maximized, restored: win.isMaximized() }
  })

  // 10. The performance switches, driven through their own controls rather than by writing
  //     storage: what is being checked is that the app can reach them, and that flipping one
  //     changes what the compositor is asked to do.
  await step('performance', async () => {
    /**
     * What the compositor is being asked for.
     *
     * `backdrop-filter` is read off the bar rather than a panel because the bar is always on
     * screen — it is the one filter pass the app pays for continuously, over the animated
     * backdrop. `layers` counts the backdrop's own children, which is the direct measure of
     * whether the switch removed the layers or merely dimmed them.
     */
    const readEffects = `(() => {
      const root = document.documentElement
      const bar = document.querySelector('[data-testid=nova-bar]')
      const backdrop = document.querySelector('[data-testid=backdrop]')
      const switches = {}
      for (const el of document.querySelectorAll('[data-testid^=effect-]')) {
        switches[el.dataset.testid.replace('effect-', '')] = el.getAttribute('aria-checked') === 'true'
      }
      return {
        profile: root.dataset.effects,
        glass: root.dataset.glass,
        charAnim: root.dataset.charAnim,
        glow: getComputedStyle(root).getPropertyValue('--glow-strength').trim(),
        // The theme the app is wearing, so a restore can be checked rather than assumed.
        bg: getComputedStyle(root).getPropertyValue('--bg-base').trim(),
        accent: getComputedStyle(root).getPropertyValue('--accent').trim(),
        barBackdrop: bar ? getComputedStyle(bar).backdropFilter : null,
        // Every element on screen that would cost a filter pass. The bar itself carries no
        // backdrop-filter — its glass lives on the floating pieces inside it — so counting
        // the whole document is the only honest way to ask whether the switch did anything.
        // Measured with the settings panel open, which is where most of them live.
        filters: [...document.querySelectorAll('*')].filter(
          (el) => getComputedStyle(el).backdropFilter !== 'none',
        ).length,
        layers: backdrop ? backdrop.children.length : null,
        switches,
        disabledSwitches: [...document.querySelectorAll('[data-testid^=effect-]')].filter((el) => el.disabled).length,
      }
    })()`

    const clickText = (text) => evaluate(`(() => {
      const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})
      if (!el) return false
      el.click()
      return true
    })()`)

    const openSettings = () =>
      evaluate(`(() => {
        const el = [...document.querySelectorAll('button')].find((b) => /open settings/i.test(b.getAttribute('aria-label') || b.title || ''))
        if (!el) return false
        el.click()
        return true
      })()`)

    const opened = await openSettings()
    await wait(600)


    // What the app was wearing before the probe starts turning things off, so it can be handed
    // back the way it was found: the active theme preset and the active background style, both
    // of which a "plain look" click changes.
    const activePreset = await evaluate(`(() => {
      const el = [...document.querySelectorAll('aside[role=dialog] [aria-pressed=true]')].find((b) => /^[A-Z][a-z]+$/.test(b.textContent.trim()))
      return el ? el.textContent.trim() : null
    })()`)
    const bgGroup = `document.querySelector('aside[role=dialog] [role=group][aria-label="Background style"]')`
    const activeBackground = await evaluate(`(() => {
      const group = ${bgGroup}
      if (!group) return null
      const el = [...group.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') === 'true')
      return el ? el.textContent.trim() : null
    })()`)

    const before = await evaluate(readEffects)

    await clickText('lite')
    await wait(500)
    const lite = await evaluate(readEffects)

    await evaluate(`(() => { const el = document.querySelector('[data-plain-look=white]'); if (!el) return false; el.click(); return true })()`)
    await wait(500)
    const white = { ...(await evaluate(readEffects)), ...(await evaluate(`(() => ({
      theme: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
      scheme: document.documentElement.style.colorScheme,
      veil: getComputedStyle(document.documentElement).getPropertyValue('--surface-veil').trim(),
    }))()`)) }

    await evaluate(`(() => { const el = document.querySelector('[data-plain-look=black]'); if (!el) return false; el.click(); return true })()`)
    await wait(500)
    const black = await evaluate(`(() => ({
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
      scheme: document.documentElement.style.colorScheme,
    }))()`)

    // Put it back: profile first (the switches are disabled under `lite`), then whichever
    // switches were off before, then the preset, then close the panel.
    await clickText('full')
    await wait(400)
    const restore = `(() => {
      const want = ${JSON.stringify(before.switches)}
      const changed = []
      for (const el of document.querySelectorAll('[data-testid^=effect-]')) {
        const key = el.dataset.testid.replace('effect-', '')
        if (want[key] !== undefined && (el.getAttribute('aria-checked') === 'true') !== want[key]) {
          el.click()
          changed.push(key)
        }
      }
      return changed
    })()`
    const restored = await evaluate(restore)
    await wait(400)
    if (activePreset) await clickText(activePreset)
    await wait(400)
    if (activeBackground) {
      await evaluate(`(() => {
        const group = ${bgGroup}
        if (!group) return false
        const el = [...group.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(activeBackground)})
        if (!el) return false
        el.click()
        return true
      })()`)
      await wait(400)
    }
    // Read the restored state while the panel is still open — the switches only exist on
    // screen there, and the point of the check is that the app was handed back exactly as it
    // was found, switch by switch.
    const after = await evaluate(readEffects)
    await evaluate(`(() => {
      const el = document.querySelector('aside[role=dialog] button[aria-label=\"Close settings\"]')
      if (el) el.click()
      return true
    })()`)
    await wait(600)
    const closed = await evaluate(readEffects)

    return {
      opened,
      activePreset,
      activeBackground,
      before,
      lite,
      white,
      black,
      restored,
      after,
      closed,
      // The assertions worth reading at a glance.
      // What the profile removes, in the terms the compositor sees: every filter pass on
      // screen (19 of them with the panel open) gone to zero, the character animations
      // cancelled and the glow variable zeroed. The backdrop's layer count is reported
      // separately rather than asserted here, because it only differs when the animated
      // backdrop switch is on — which is a setting, not something `lite` decides.
      liteRemovedWork:
        before.filters > 0 &&
        lite.filters === 0 &&
        lite.glass === 'off' &&
        lite.charAnim === 'off' &&
        lite.glow === '0',
      liteFrozeSwitches: lite.disabledSwitches === 5,
      liteKeptThemStored: JSON.stringify(lite.switches) === JSON.stringify(before.switches),
      whiteIsBlackAndWhite: white.scheme === 'light' && white.theme === '#FFFFFF',
      blackIsBlackAndWhite: black.scheme === 'dark' && black.bg === '#000000',
      backToStart:
        after.profile === before.profile &&
        JSON.stringify(after.switches) === JSON.stringify(before.switches) &&
        after.bg === before.bg &&
        after.layers === before.layers,
      // With the panel shut, `lite` leaves the bar and the prompt untouched; the difference
      // shows up as the backdrop's own layers coming back.
      closedLayers: closed.layers,
      backdropRestored: after.layers === before.layers,
      themeRestored: after.bg === before.bg && after.accent === before.accent,
    }
  })

  // 11. The typing engine is untouched: it still types, still grades, still resets.
  await step('typing', async () => {
    await key('Escape')
    await wait(300)
    await key('Escape')
    await wait(300)
    // The word has to be read *now*, not from the probe's first read: every reset reseeds the
    // prompt, and the characters on screen are the ones that can be typed.
    const firstWord = await evaluate(
      `[...document.querySelectorAll('.tword')[0].querySelectorAll('.tchar')].map((el) => el.textContent).join('').slice(0, 3)`,
    )
    for (const character of firstWord) await key(character)
    await wait(300)
    const typed = {
      word: firstWord,
      status: await status(),
      correctChars: await evaluate(
        `document.querySelectorAll('[data-testid=typing-viewport] .char-correct').length`,
      ),
    }
    await key('Escape')
    await wait(400)
    return { typed, afterReset: await status() }
  })
}

function failSmoke(reason) {
  try {
    fs.writeFileSync(SMOKE_PATH, JSON.stringify({ ok: false, reason, notes: smokeNotes }, null, 2))
  } catch {
    /* nothing left to do — the exit code carries the failure */
  }
  app.exit(1)
}

/* ══════════════════════════════════════════════════════════════
   Window IPC

   Handled in the main process because the window is not the renderer's to touch; the
   renderer asks, the main process acts, and the resulting state comes back as an event.
   Every handler resolves its own window from the sender rather than closing over one, so
   these stay correct if a second window is ever opened.
   ══════════════════════════════════════════════════════════════ */

const windowFor = (event) => BrowserWindow.fromWebContents(event.sender)

ipcMain.on('window:minimize', (event) => windowFor(event)?.minimize())
ipcMain.on('window:toggle-maximize', (event) => {
  const win = windowFor(event)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (event) => windowFor(event)?.close())

ipcMain.handle('window:get-state', (event) => {
  const win = windowFor(event)
  return { maximized: win ? win.isMaximized() : false, fullscreen: win ? win.isFullScreen() : false }
})

ipcMain.handle('window:set-fullscreen', (event, on) => {
  const win = windowFor(event)
  if (!win) return false
  const wanted = Boolean(on)
  if (win.isFullScreen() !== wanted) win.setFullScreen(wanted)
  return win.isFullScreen()
})

// No menu at all. Its Edit items are paste, and paste is refused by the app on purpose; a
// menu that offers something the app will not do is worse than no menu. It also means there
// is no menu bar to show a frameless window that has nowhere to put one.
Menu.setApplicationMenu(null)

// Save bounds on any quit path — covers app.quit() which skips the window close event.
app.on('before-quit', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) saveWindowBounds(win)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // macOS convention keeps the process alive with no windows; the other two platforms do not.
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// A second launch focuses the window that is already open rather than starting a rival copy,
// which would be a second process racing the same settings in localStorage.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
}
