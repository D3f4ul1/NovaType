import { useEffect, useRef } from 'react'
import { IDLE_AUDIO_WARM_MS, MAX_EXTRA_CHARS, TAB_ENTER_WINDOW_MS } from '../lib/constants'
import { isEditableTarget } from '../lib/dom'
import { isStrictDifficulty } from '../lib/difficulty'
import { playErrorSound, playKeySound, setVolume, warmAudioAfterPaint } from '../lib/sound'
import { useSettingsStore } from '../store/useSettingsStore'
import { typedFor, useTestStore } from '../store/useTestStore'

/**
 * Keyboard input — brief §7.
 *
 * A single capture-phase `keydown` listener on `window` handles everything. Settings
 * are read imperatively via `getState()` so the listener is attached exactly once and
 * never needs re-binding when a setting changes.
 */

export interface UseTypingEngineOptions {
  /** Open the settings slide-over (bound to Ctrl/Cmd + ,). */
  onOpenSettings: () => void
  /** False while the settings panel is open, so typing there never starts a test. */
  enabled: boolean
  /**
   * Fired when a paste, drop or Ctrl/Cmd + V is refused. The text is never inserted — it
   * would be a way to "type" a prompt without typing — but silently swallowing the key
   * reads as a broken app, so the UI says what happened.
   */
  onBlockedPaste: () => void
}

function bodyHasFocus(): boolean {
  const el = document.activeElement
  return el === null || el === document.body || el === document.documentElement
}

/** A single printable character, with no command modifier held. */
function isPrintable(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key.length !== 1) return false
  return event.key !== '\u001b'
}

export function useTypingEngine({
  onOpenSettings,
  enabled,
  onBlockedPaste,
}: UseTypingEngineOptions): void {
  const onOpenSettingsRef = useRef(onOpenSettings)
  onOpenSettingsRef.current = onOpenSettings
  const onBlockedPasteRef = useRef(onBlockedPaste)
  onBlockedPasteRef.current = onBlockedPaste
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Keep the master gain in step with the volume slider.
  const volume = useSettingsStore((s) => s.volume)
  useEffect(() => {
    setVolume(volume)
  }, [volume])

  /**
   * Builds the audio graph once, off the critical path.
   *
   * Constructing an `AudioContext` costs ~170ms on the first call, and there is no way to
   * pay that on the main thread without blocking something. So it is paid where nothing is
   * competing for the thread: a moment after mount, when the entrance animation has
   * finished and the only thing still moving is the background, which the compositor owns.
   *
   * The gesture listeners are the fallback for someone who starts typing within that
   * moment — earlier than the timer. They are `once`, so the cost is only ever scheduled
   * once, and nothing is built at all when both sound options are off.
   */
  useEffect(() => {
    const wanted = () => {
      const settings = useSettingsStore.getState()
      return settings.soundOnKeypress || settings.errorSound
    }
    const warm = () => {
      if (wanted()) warmAudioAfterPaint()
    }

    const idleWarm = window.setTimeout(warm, IDLE_AUDIO_WARM_MS)
    const events = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const
    for (const type of events) window.addEventListener(type, warm, { capture: true, once: true })

    return () => {
      window.clearTimeout(idleWarm)
      for (const type of events) window.removeEventListener(type, warm, { capture: true })
    }
  }, [])

  useEffect(() => {
    let tabPressedAt = 0

    /**
     * Records a key that landed on the wrong *kind* of slot, which is a soft error.
     *
     * A wrong letter is marked in hard red, on the letter it was typed in place of. A key
     * typed where the *separator* was expected is marked in soft red on the slot itself —
     * the wrong kind of key, at the one position in the line that is not a character of the
     * prompt. That is the only place soft red ever appears.
     *
     * Nothing here is reachable unless the typist asked for blocking, because every caller
     * is either `stopOnError` or separator forgiveness switched off; the default run never
     * refuses a key at all. A refused key is still logged, for the same reason as every
     * other: an error you can see on screen has to be an error in the numbers.
     */
    const refuse = (
      state: ReturnType<typeof useTestStore.getState>,
      wordIndex: number,
      position: number,
      char: string,
      expected: string,
      elapsed: number,
      settings: ReturnType<typeof useSettingsStore.getState>,
    ) => {
      state.setSoftError({ word: wordIndex, position })
      state.appendKeystroke({ t: elapsed, correct: false, char, expected })
      if (settings.errorSound) playErrorSound()
    }

    const handleChar = (char: string, now: number) => {
      const settings = useSettingsStore.getState()
      const store = useTestStore.getState()
      if (store.status === 'finished') return
      if (store.status === 'idle') store.beginTest(now)

      let state = useTestStore.getState()
      if (state.startTime == null) return
      const elapsed = now - state.startTime

      let index = state.currentWordIndex
      let word = state.words[index]
      if (!word) return
      let current = typedFor(state, index)

      /* ── The separator is a slot, not a skip ─────────────────────────

         Every word ends in one separator position, and pressing space *on* that position
         confirms the word and moves on.

         Pressing it earlier — the cursor still standing on a letter — abandons the word
         where it stands rather than holding the cursor hostage. Refusing the key read as
         the app having stopped accepting input, which is the worst thing a typing test can
         do: the whole point is that your next key always lands somewhere. So the space is
         logged as an incorrect keystroke and the cursor moves on, and the word left behind
         keeps its place in the numbers — its untyped tail counts as missed characters and
         the word itself is struck through, so "shown as wrong" and "counted as wrong"
         stay the same thing.

         Leading spaces are ignored outright: a stray space at the start of a word has no
         character under the cursor to mark and nothing to abandon. */
      if (char === ' ') {
        if (current.length === 0) return

        // stopOnError: 'word' holds the cursor until the word is clean — which includes a
        // word that is merely unfinished. Checked first, because that is the one setting
        // whose entire purpose is to refuse exactly this key. Logged through `refuse` like
        // every other refusal: the slot is marked, and the slot was never typed, so nothing
        // else has counted this key.
        if (settings.stopOnError === 'word' && current !== word.text) {
          refuse(state, index, word.text.length, ' ', ' ', elapsed, settings)
          return
        }

        if (current.length < word.text.length) {
          state.appendKeystroke({
            t: elapsed,
            correct: false,
            char: ' ',
            expected: word.text[current.length] ?? '',
          })
          if (settings.errorSound) playErrorSound()
          state.advanceWord(now)
          return
        }

        state.appendKeystroke({ t: elapsed, correct: true, char: ' ', expected: ' ' })
        state.advanceWord(now)
        return
      }

      /* ── stopOnError: 'letter' blocks while the last character is wrong ── */
      const position = current.length
      if (settings.stopOnError === 'letter' && position > 0) {
        const lastPosition = position - 1
        const lastExpected = word.text[lastPosition] ?? ''
        const lastTyped = current[lastPosition]
        const stillWrong = lastPosition >= word.text.length || lastTyped !== lastExpected
        if (stillWrong) {
          state.setSoftError({ word: index, position: lastPosition })
          if (settings.errorSound) playErrorSound()
          return
        }
      }

      /* ── The separator slot ────────────────────────────────────
         The cursor has finished the word's letters and is standing on its separator.

         With space forgiveness on, the missing separator is supplied for you: the word is
         closed and the character is graded against the next one, so a skipped space costs a
         mistake but not your place in the line. The separator itself is not logged — the
         character that displaced it is, which is the mistake the typist actually made.

         With it off, the slot has to be filled: the character is marked in soft red on the
         slot and nothing moves, which is the stricter reading of these prompts. Either way
         the character never piles up in the gap between two words, which is what made the
         prompt look like it was swallowing input. */
      if (position >= word.text.length) {
        if (!settings.forgiveSpaces) {
          refuse(state, index, word.text.length, char, ' ', elapsed, settings)
          return
        }
        if (settings.stopOnError === 'word' && current !== word.text) {
          state.setSoftError({ word: index, position: word.text.length })
          if (settings.errorSound) playErrorSound()
          return
        }
        if (state.advanceWord(now)) return
        state = useTestStore.getState()
        index = state.currentWordIndex
        word = state.words[index]
        if (!word) return
        current = typedFor(state, index)
      }

      const at = current.length
      const isExtra = at >= word.text.length
      if (isExtra && at >= word.text.length + MAX_EXTRA_CHARS) return

      const expected = word.text[at] ?? ''
      const correct = !isExtra && char === expected

      state.setTypedForWord(index, current + char)
      state.appendKeystroke({ t: elapsed, correct, char, expected })
      // A `words` test is over as soon as its final word has been typed in full.
      state.finishIfFinalWordComplete(now)

      if (!correct) {
        if (settings.errorSound) playErrorSound()
      } else if (settings.soundOnKeypress) {
        playKeySound()
      }
    }

    const handleBackspace = (event: KeyboardEvent) => {
      event.preventDefault()
      const settings = useSettingsStore.getState()

      // The strict levels disable backspace entirely — mistakes are permanent.
      if (isStrictDifficulty(settings.difficulty)) return

      const state = useTestStore.getState()
      if (state.status === 'finished') return

      const index = state.currentWordIndex
      const current = typedFor(state, index)
      const wholeWord = event.ctrlKey || event.metaKey

      if (current.length > 0) {
        state.setTypedForWord(index, wholeWord ? '' : current.slice(0, -1))
        return
      }

      // Nothing left in this word — step back into the previous one.
      if (index > 0) {
        state.retreatWord()
        if (wholeWord) state.setTypedForWord(index - 1, '')
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const modified = event.ctrlKey || event.metaKey

      /* ── Global shortcuts, available even inside the settings panel ── */
      if (modified && event.key === ',') {
        event.preventDefault()
        onOpenSettingsRef.current()
        return
      }

      // Ctrl/Cmd + V is refused before it can reach the paste path, and the refusal is
      // announced. Fields the user is meant to edit (the custom limit inputs) still paste.
      if (modified && (event.key === 'v' || event.key === 'V') && !isEditableTarget(event.target)) {
        event.preventDefault()
        onBlockedPasteRef.current()
        return
      }

      // While the settings panel is open it owns the keyboard. Returning here also keeps
      // Escape from resetting the test behind the panel's back.
      if (!enabledRef.current) return

      if (event.key === 'Escape') {
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        const state = useTestStore.getState()
        if (state.status === 'running') state.finish(performance.now())
        else state.resetTest()
        return
      }

      // Never swallow Tab — it still has to move focus through the UI.
      if (event.key === 'Tab') {
        tabPressedAt = performance.now()
        return
      }

      if (event.key === 'Enter') {
        if (
          tabPressedAt > 0 &&
          performance.now() - tabPressedAt <= TAB_ENTER_WINDOW_MS &&
          bodyHasFocus()
        ) {
          event.preventDefault()
          tabPressedAt = 0
          useTestStore.getState().resetTest()
        }
        return
      }

      // Modifier-only keys, CapsLock, F-keys, arrows and so on all fall through here.
      if (!isPrintable(event) && event.key !== 'Backspace') return
      if (isEditableTarget(event.target)) return

      if (event.key === 'Backspace') {
        handleBackspace(event)
        return
      }

      event.preventDefault()

      handleChar(event.key, performance.now())
    }

    /* ── Paste, drop and right-click paste are refused outright (§7) ── */
    const block = (event: Event) => event.preventDefault()

    const blockPaste = (event: Event) => {
      // Settings fields are ordinary inputs; refusing to paste into a number box would be
      // gratuitous. Everywhere else, pasting is the one shortcut around typing, so it is
      // blocked and reported.
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      onBlockedPasteRef.current()
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('paste', blockPaste, true)
    window.addEventListener('drop', blockPaste, true)
    window.addEventListener('contextmenu', block)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('paste', blockPaste, true)
      window.removeEventListener('drop', blockPaste, true)
      window.removeEventListener('contextmenu', block)
    }
  }, [])
}
