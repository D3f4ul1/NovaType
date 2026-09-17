import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { EASE_OUT } from '../lib/motion'
import { Segmented, type SegmentedOption } from './controls'

/**
 * A row of preset pills that folds into a single dropdown chip when the window is narrow.
 *
 * The bar has to hold the mark, this control, the four-mode switch, the theme button, the
 * settings button and three window buttons on one 46px line, and below roughly 900px that stops
 * fitting. Rather than let one of them squeeze, the two groups that are *pickers* — difficulty,
 * and the duration presets — fold into the same shape: a chip showing the current value, a
 * chevron, and the full list on click. The mode switch, the theme button, the settings button
 * and the window buttons never collapse, because each of them is a single control already.
 *
 * The list is rendered into `document.body` through a portal, and that is not a stylistic
 * choice. It was in place, inside the group, and it arrived cut off: the options row is a
 * horizontal scroll container (`overflow-x: auto`), and CSS resolves a scroll container's other
 * axis to `auto` as well — so `overflow-y: hidden` there silently clipped every dropdown that
 * opened inside it to a few pixels of its own bottom edge. A floating panel cannot live inside
 * anything that scrolls, clips or transforms.
 *
 * Portalling costs one thing that has to be handled deliberately: the "click outside to close"
 * test can no longer be "is this inside my own subtree", because the menu is no longer in it —
 * a click on a menu item would register as a click outside and close the menu before the click
 * landed on the item. Both nodes are registered as inside.
 *
 * Two details are load-bearing:
 *
 * • The expanded width is *measured*, not assumed. Folding animates the container's width, and
 *   the only honest target for "unfolded" is what this group actually is at the current font
 *   and zoom. So an invisible copy of the row sits in the same box at all times purely to be
 *   measured — which means the width is known even if the app has been narrow since launch and
 *   has never rendered the expanded row, the one case where a guessed constant would visibly
 *   jump when the window grew.
 * • The measurement copy carries its own `layoutId` group. Framer's shared-layout animation is
 *   keyed by that id, and two mounted rows sharing one would animate the *hidden* copy's pill
 *   towards the visible one's position — a floating pill crossing the bar on every resize.
 * • Both shapes are **not** wrapped in `AnimatePresence`. They were, and the exit was the
 *   problem: the outgoing pills carry a shared-layout pill of their own, and with one on each
 *   side of the swap Framer held the outgoing tree on screen for about a second waiting for the
 *   layout to settle — leaving the bar with a hole where the picker should be for that whole
 *   time, and a click landing in the hole did nothing. Swapping by key with an entrance fade
 *   mounts the new shape in the same commit as the width change, so the fold is one animation
 *   rather than two that have to be sequenced.
 *
 * The collapsed width is a constant instead, because the chip is a fixed-size control by
 * design: a chip that resized with its label would make the fold itself a moving target.
 */
export interface ToolbarPickProps {
  /** Id for the pill group's shared-layout animation. */
  groupId: string
  value: string
  options: SegmentedOption[]
  onChange: (id: string) => void
  /** Accessible name for the whole control, in both its shapes. */
  label: string
  reduceMotion: boolean
  collapsed: boolean
  /** Width the chip occupies when folded. */
  collapsedWidth: number
  size?: 'xs' | 'sm' | 'md'
  /** Marks the control's own box, so its geometry can be checked against its neighbours'. */
  barGroup?: string
}

/** Floor for the floating list, used to keep it inside the window. */
const MENU_MIN_WIDTH = 148
const MENU_GAP = 6

interface Anchor {
  left: number
  top: number
  width: number
}

export function ToolbarPick({
  groupId,
  value,
  options,
  onChange,
  label,
  reduceMotion,
  collapsed,
  collapsedWidth,
  size = 'xs',
  barGroup,
}: ToolbarPickProps) {
  const active = options.find((option) => option.id === value) ?? options[0]

  const rootRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const measureWrapRef = useRef<HTMLDivElement>(null)
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [open, setOpen] = useState(false)

  /** Where the list should sit, derived from the chip's own box and clamped to the window. */
  const anchorFor = (): Anchor | null => {
    const chip = chipRef.current
    if (!chip) return null
    const rect = chip.getBoundingClientRect()
    const width = Math.max(MENU_MIN_WIDTH, Math.round(rect.width))
    const maxLeft = Math.max(8, window.innerWidth - width - 8)
    return { left: Math.min(Math.max(8, rect.left), maxLeft), top: rect.bottom + MENU_GAP, width }
  }

  // Measure the row whenever it could have changed size: first paint, a font swap, a zoom
  // change. The element stays mounted whether or not the pills are showing.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const measure = () => setExpandedWidth(el.offsetWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The measurement copy holds real buttons; `inert` keeps it out of the tab order and the
  // accessibility tree. Set imperatively because React 18 does not take `inert` as a prop.
  useEffect(() => {
    const el = measureWrapRef.current
    if (el) (el as HTMLElement & { inert: boolean }).inert = true
  }, [])

  // Folded away — the list is not on screen any more, so it must not be open either.
  useEffect(() => {
    if (!collapsed) setOpen(false)
  }, [collapsed])

  // A floating list has to follow its chip or get out of the way: the window can be resized,
  // and the options row itself can scroll sideways at cramped widths, either of which would
  // leave the menu pointing at empty space.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const next = anchorFor()
      if (next) setAnchor(next)
      else setOpen(false)
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  // A dropdown that only closes by clicking its own chip is a trap: any click anywhere else
  // has to dismiss it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      // Both nodes count as inside — the chip, and the list itself, which is elsewhere in the
      // document now that it is portalled.
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape belongs to the list while it is open. Capture phase and stopped, so the app's
      // own Escape binding — end or restart the test — cannot fire behind it.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const toggle = () => {
    setOpen((wasOpen) => {
      if (wasOpen) return false
      const next = anchorFor()
      if (!next) return false
      setAnchor(next)
      return true
    })
  }

  const swap = reduceMotion
    ? { duration: 0 }
    : { duration: 0.14, ease: EASE_OUT as [number, number, number, number] }
  const widthTween = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: EASE_OUT as [number, number, number, number] }

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center" data-bar-group={barGroup}>
      {/*
        The measurer. Absolutely positioned and invisible, so it contributes nothing to the
        layout; it exists so `expandedWidth` is a real number rather than an estimate.
      */}
      <div
        ref={measureWrapRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 w-max"
      >
        <div ref={measureRef}>
          <Segmented
            groupId={`${groupId}-measure`}
            size={size}
            value={value}
            options={options}
            onChange={() => {}}
            label={`${label} (measurement)`}
            reduceMotion
          />
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ width: collapsed ? collapsedWidth : (expandedWidth ?? 'auto') }}
        transition={widthTween}
        className="overflow-hidden"
      >
        <motion.div
          // The key is the switch: a different shape is a different tree, so React mounts the
          // new one in the same commit the width change starts in.
          key={collapsed ? 'chip' : 'pills'}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={swap}
        >
          {collapsed ? (
            <div className="flex items-center" style={{ width: collapsedWidth }}>
              <button
                ref={chipRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`${label}: ${active?.label ?? '—'}`}
                title={`${label}: ${active?.label ?? '—'}`}
                data-pick-chip={groupId}
                onClick={toggle}
                className="app-no-drag flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors"
                style={{
                  borderColor: open
                    ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                    : 'var(--border)',
                  background: open
                    ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                    : 'var(--surface-veil)',
                  color: 'var(--text-correct)',
                }}
              >
                <SlidersHorizontal size={12} aria-hidden="true" style={{ color: 'var(--accent-bright)' }} />
                <span className="truncate">{active?.label ?? '—'}</span>
                <motion.span
                  aria-hidden="true"
                  className="flex"
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={swap}
                >
                  <ChevronDown size={12} />
                </motion.span>
              </button>
            </div>
          ) : (
            <div className="w-max">
              <Segmented
                groupId={groupId}
                size={size}
                value={value}
                options={options}
                onChange={onChange}
                label={label}
                reduceMotion={reduceMotion}
              />
            </div>
          )}
        </motion.div>
      </motion.div>

      {/*
        The list. Outside the width-animated box so it is never clipped by it, and outside the
        document's own layout entirely so it is not clipped by the row that owns the chip.
      */}
      {open &&
        anchor &&
        createPortal(
          <motion.div
            ref={menuRef}
            role="listbox"
            aria-label={label}
            data-pick-menu={groupId}
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: EASE_OUT }}
            className="panel app-no-drag fixed z-[60] flex flex-col gap-0.5 p-1.5"
            style={{
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
              transformOrigin: 'top left',
            }}
          >
            {options.map((option) => {
              const isActive = option.id === value
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  title={option.title}
                  onClick={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors"
                  style={{
                    background: isActive
                      ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                      : 'transparent',
                    color: isActive ? 'var(--text-correct)' : 'var(--text-muted)',
                  }}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: 'var(--accent-bright)',
                        boxShadow: '0 0 8px var(--accent-glow)',
                      }}
                    />
                  )}
                </button>
              )
            })}
          </motion.div>,
          document.body,
        )}
    </div>
  )
}
