/**
 * The layout's vertical ladder.
 *
 * The window can now be dragged down to 260px, which is roughly a third of the height the
 * app was originally laid out for. Rather than let that be a clipping accident, the collapse
 * is specified in one place and applied in order as the height falls: the hint bar goes
 * first, then the typing viewport loses lines, then the HUD loses everything but WPM, and the
 * gaps and the timer shrink so the whole stack still fits without a scrollbar at the floor.
 *
 * The thresholds are deliberately a single ordered list rather than a set of independent
 * media queries: three independent breakpoints would eventually cross each other and produce
 * a window that is, say, two lines tall with the hint bar still drawn.
 */

/** Below this width the bar's pill groups collapse to dropdown chips. */
export const NARROW_WIDTH = 900

/** The unified bar itself. The one piece of chrome that is never given up. */
export const BAR_HEIGHT = 46

export interface Layout {
  /** Lines of prompt on screen — the 3-line window, then 2, then 1. */
  visibleLines: number
  /** The bottom hint bar, the first thing to go. */
  showHintBar: boolean
  /** Accuracy is dropped from the HUD. */
  compactHud: boolean
  /** The timer's digits and the vertical gaps shrink. */
  compact: boolean
}

/**
 * Resolves the layout for a window height.
 *
 * 460 is where the full stack — bar, options row, hint bar, three full lines of prompt, the
 * timer and the whole HUD — has room to breathe. The two typing thresholds are the ones the
 * brief fixes: 3 lines at 420 and up, 2 lines at 300, one below.
 */
export function layoutFor(height: number): Layout {
  return {
    visibleLines: height >= 420 ? 3 : height >= 300 ? 2 : 1,
    showHintBar: height >= 460,
    compact: height < 460,
    compactHud: height < 320,
  }
}
