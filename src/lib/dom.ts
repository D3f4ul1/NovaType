/**
 * Small DOM predicates shared by the keyboard handlers.
 *
 * These live outside the engine because two independent listeners need them — the typing
 * engine and the window-chrome shortcuts — and a second, subtly different copy of "is the
 * user typing into a field" is exactly how a shortcut ends up hijacking a textarea.
 */

/** True when the event target is something the user types into. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}
