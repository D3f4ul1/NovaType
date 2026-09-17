/**
 * WebAudio keypress sounds — synthesised at runtime, no asset files.
 *
 * Autoplay policy: an AudioContext created before a user gesture starts `suspended`,
 * so creation is triggered by a gesture and `resume()` is awaited there. Failures are
 * silent rather than thrown — a missing click is never worth an error.
 *
 * **Why warming exists.** Constructing an AudioContext is not cheap: measured in this
 * app's own browser, the first `new AudioContext()` costs ~175ms. Paying that inside the
 * keystroke that starts a test stalls the one animation the whole interface is built
 * around. `warmAudioAfterPaint` moves it off that path, and the context is assigned
 * before `resume()` is awaited so a suspended context is never built twice.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
/** Set once we know audio cannot work, so we stop retrying. */
let unavailable = false
let volume = 0.5

type AudioCtor = typeof AudioContext

function resolveCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  // `AudioContext` is a global binding, not a property of `Window`, so it has to be
  // probed by identifier; only the old WebKit alias lives on `window`.
  if (typeof AudioContext !== 'undefined') return AudioContext
  const w = window as Window & { webkitAudioContext?: AudioCtor }
  return w.webkitAudioContext ?? null
}

/** A live context only if it is actually running right now. */
function running(): AudioContext | null {
  return ctx && ctx.state === 'running' && !unavailable ? ctx : null
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v))
  if (master) master.gain.value = volume
}

/**
 * Builds the audio graph once, and assigns it *before* anything is awaited.
 *
 * The ordering matters: Chrome leaves `resume()` pending until the page has a user
 * gesture, so a context created while the page is idle stays suspended with its promise
 * unresolved. Assigning `ctx` afterwards would leave the singleton null, and the next
 * call would build a second AudioContext — another 175ms — while the first one lingered.
 */
function createContext(): AudioContext | null {
  if (ctx) return ctx

  const Ctor = resolveCtor()
  if (!Ctor) {
    unavailable = true
    return null
  }

  try {
    const created = new Ctor()
    const gain = created.createGain()
    gain.gain.value = volume
    gain.connect(created.destination)

    // Some browsers re-suspend after tab switches or device changes.
    created.addEventListener('statechange', () => {
      if (created.state === 'suspended') {
        void created.resume().catch(() => {
          /* still no activation — the next gesture will call `ensureAudio` again */
        })
      }
    })

    ctx = created
    master = gain
    return created
  } catch {
    unavailable = true
    return null
  }
}

/**
 * Creates and resumes the context. Safe to call from every gesture — it is a no-op
 * once the context is running.
 */
export async function ensureAudio(): Promise<AudioContext | null> {
  if (unavailable) return null

  const context = createContext()
  if (!context) return null

  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      // Not fatal: without user activation the context simply stays silent, and the
      // `statechange` listener resumes it as soon as a gesture arrives.
      return context
    }
  }
  return context
}

/**
 * Builds the audio graph after the current frame has painted.
 *
 * Called from the first interaction only. Deferring by a frame — `rAF` to reach the
 * frame that paints the interaction's result, then a task to land after that paint — is
 * what keeps the ~175ms construction off both the keystroke's commit and the first
 * frames of the Focus Mode transition. Transform and opacity animations run on the
 * compositor, so once the transition has been handed over, a busy main thread no longer
 * shows in it.
 */
export function warmAudioAfterPaint(): void {
  if (unavailable) return
  if (typeof requestAnimationFrame !== 'function') {
    void ensureAudio()
    return
  }
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      void ensureAudio()
    }, 0)
  })
}

/** Short, bright click. Pitch jitters slightly so fast typing does not sound robotic. */
export function playKeySound(): void {
  const c = running()
  if (!c || !master) return

  const t = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()

  const base = 1450 + Math.random() * 550
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(base, t)
  osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.035)

  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)

  osc.connect(gain)
  gain.connect(master)
  osc.start(t)
  osc.stop(t + 0.07)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

/** Lower, duller thud for mistakes. */
export function playErrorSound(): void {
  const c = running()
  if (!c || !master) return

  const t = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()

  osc.type = 'square'
  osc.frequency.setValueAtTime(190, t)
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.09)

  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)

  osc.connect(gain)
  gain.connect(master)
  osc.start(t)
  osc.stop(t + 0.12)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}
