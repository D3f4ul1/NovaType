import { motion } from 'framer-motion'
import { Copy, Minus, Square, X } from 'lucide-react'
import { closeWindow, minimizeWindow, toggleMaximize } from '../lib/desktop'
import { useDesktopWindow } from '../hooks/useDesktopWindow'

/**
 * The window buttons, drawn in the app because there is no native title bar left.
 *
 * They are the only chrome the app owns that is not about typing, so they get the platform's
 * own conventions rather than a designer's: flush to the top-right corner, square, full bar
 * height, a quiet accent wash on hover, and a red close. Everything is read from the active
 * theme's variables, so a preset change recolours them with the rest of the window.
 *
 * The icons follow the same convention — a bare square to maximize, two offset squares to
 * restore — which is why the restore glyph is `Copy` and not something named for windows.
 * Lucide has no "restore", and the shape is what people recognise.
 *
 * The maximize button and the bar's drag region go through the same debounced
 * `toggleMaximise`, because a double-clicked caption can be reported twice (see `lib/desktop`).
 */
export interface WindowControlsProps {
  reduceMotion: boolean
}

export function WindowControls({ reduceMotion }: WindowControlsProps) {
  const { maximized } = useDesktopWindow()

  return (
    <div className="app-no-drag flex h-full items-stretch" data-bar-group="controls">
      <button
        type="button"
        className="win-btn"
        data-window-control="minimize"
        aria-label="Minimize"
        title="Minimize"
        onClick={minimizeWindow}
      >
        <Minus size={15} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="win-btn"
        data-window-control="maximize"
        data-maximized={maximized}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        onClick={toggleMaximize}
      >
        {/* Keyed on the state so the swap crossfades rather than snapping; a 120ms fade is
            enough to read as a change without lagging behind a fast double-click. */}
        <motion.span
          key={maximized ? 'restore' : 'maximize'}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }}
          className="flex"
          aria-hidden="true"
        >
          {maximized ? <Copy size={14} /> : <Square size={13} />}
        </motion.span>
      </button>

      <button
        type="button"
        className="win-btn win-btn-close"
        data-window-control="close"
        aria-label="Close"
        title="Close"
        onClick={closeWindow}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
