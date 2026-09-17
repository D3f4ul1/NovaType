import { useId } from 'react'

/**
 * The NovaType mark: a quill in the brand gradient, the arcs of a signal coming off its tip,
 * and a wave under the nib.
 *
 * The gradient is deliberately *fixed* rather than themed. Every colour in the app is a CSS
 * variable so a preset can recolour the whole interface, but a logo that changed with the
 * theme would be a different logo in each one — and this one also has to survive being
 * flattened into a favicon, where none of the app's variables exist.
 *
 * Two details worth keeping if this is ever redrawn:
 *
 * • The gradient is in `userSpaceOnUse`, not the default object-bounding-box units. Under
 *   bounding-box units every element gets its own mapping of the full ramp, so the vane and
 *   the much shorter shaft came out as two different rainbows meeting at the base.
 * • The vane is asymmetric on purpose — a wider bulge on the lower-right side, a tighter one
 *   on the upper-left. Symmetry turns it into a leaf; the lopsidedness is what reads as a
 *   feather.
 *
 * Gradient ids are per-instance via `useId`, so rendering the mark twice on one page cannot
 * have the second one reference the first one's gradients.
 */

export interface LogoProps {
  /** Rendered size in px, square. */
  size?: number
  /** Accessible name. Omit for a decorative mark that sits beside the wordmark. */
  title?: string
}

export function Logo({ size = 22, title }: LogoProps) {
  const uid = useId().replace(/[:]/g, '')
  const quill = `quill-${uid}`
  const spark = `spark-${uid}`
  const wave = `wave-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ filter: 'drop-shadow(0 0 8px var(--accent-glow))' }}
    >
      <defs>
        {/* One ramp across the whole mark: the nib's violet at the bottom-left, through
            blue and teal, to the vane's pale green at the tip. */}
        <linearGradient
          id={quill}
          gradientUnits="userSpaceOnUse"
          x1="4"
          y1="31"
          x2="24"
          y2="6"
        >
          <stop offset="0" stopColor="#7A6BE0" />
          <stop offset="0.3" stopColor="#5A8BF2" />
          <stop offset="0.55" stopColor="#55C4C8" />
          <stop offset="0.78" stopColor="#93DDA6" />
          <stop offset="1" stopColor="#D3EFAE" />
        </linearGradient>
        {/* The signal arcs are the green end of the same ramp. */}
        <linearGradient id={spark} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CDEFA6" />
          <stop offset="1" stopColor="#6FD3AC" />
        </linearGradient>
        {/* The wave fades in from the left so it reads as a stroke rather than a bar. */}
        <linearGradient id={wave} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0" stopColor="#5B8DEF" stopOpacity="0" />
          <stop offset="0.3" stopColor="#5B8DEF" />
          <stop offset="1" stopColor="#7FD4E8" />
        </linearGradient>
      </defs>

      {/* The bare shaft, running past the vane to the nib. It starts *inside* the vane so
          its round cap is buried in the fill rather than bulging out of the base. */}
      <path
        d="M10.6 24.1C9.3 25.8 7.3 28.1 5.6 30.3"
        stroke={`url(#${quill})`}
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      {/* The vane: a point at the tip, a blunt ~2px base for the shaft to emerge from, and
          a wider bulge on the lower-right side than on the upper-left. */}
      <path
        d="M23 8C21.74 16.83 16.94 22.83 9.46 26.69L7.74 25.31C10.8 17.92 15.6 11.92 23 8Z"
        fill={`url(#${quill})`}
      />

      {/* The split down the middle of the vane, catching the light. */}
      <path
        d="M23 8 8.5 26"
        stroke="rgba(255,255,255,0.42)"
        strokeWidth="0.7"
        strokeLinecap="round"
      />

      {/* Signal arcs, curving around the tip from the top-right corner. */}
      <g stroke={`url(#${spark})`} strokeWidth="1.6" strokeLinecap="round">
        <path d="M31 4.6A3 3 0 0 1 28 1.6" />
        <path d="M31 6.6A5 5 0 0 1 26 1.6" />
        <path d="M31 8.6A7 7 0 0 1 24 1.6" />
      </g>

      {/* The wave beneath the nib. */}
      <path
        d="M9 30.4C12.6 31.7 16.4 31.2 19.6 29.5C21.8 28.3 24.3 27.4 27.4 25.8"
        stroke={`url(#${wave})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
