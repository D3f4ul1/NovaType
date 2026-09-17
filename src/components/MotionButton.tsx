import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * The app's button — §4.4 and §11: glassy surface, blue glow on hover, `y: -1px` on
 * hover, `scale(0.97)` on press. The transform pair is dropped entirely (not merely
 * zero-duration) when motion is reduced, so nothing moves at all.
 */

export interface MotionButtonProps {
  children: ReactNode
  onClick?: () => void
  label: string
  busy?: boolean
  variant?: 'default' | 'primary'
  className?: string
  disabled?: boolean
  reduceMotion: boolean
  title?: string
}

export function MotionButton({
  children,
  onClick,
  label,
  variant = 'default',
  className = '',
  disabled = false,
  reduceMotion,
  title,
}: MotionButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`btn${variant === 'primary' ? ' btn-primary' : ''} ${className}`}
      whileHover={reduceMotion || disabled ? undefined : { y: -1 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.button>
  )
}
