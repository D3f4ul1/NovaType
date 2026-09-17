/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        accent: 'var(--accent)',
        'accent-bright': 'var(--accent-bright)',
        untyped: 'var(--text-untyped)',
        correct: 'var(--text-correct)',
        incorrect: 'var(--text-incorrect)',
        muted: 'var(--text-muted)',
        caret: 'var(--caret)',
        edge: 'var(--border)',
      },
      fontFamily: {
        mono: 'var(--font-mono)',
        ui: 'var(--font-ui)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      keyframes: {
        'orb-drift-a': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(6%, -8%, 0) scale(1.12)' },
        },
        'orb-drift-b': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1.08)' },
          '50%': { transform: 'translate3d(-7%, 6%, 0) scale(0.96)' },
        },
        'caret-blink': {
          '0%, 45%': { opacity: '1' },
          '55%, 100%': { opacity: '0.15' },
        },
        'char-in': {
          from: { opacity: '0.45' },
          to: { opacity: '1' },
        },
        'char-error': {
          '0%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px)' },
          '75%': { transform: 'translateX(2px)' },
          '100%': { transform: 'translateX(0)' },
        },
        'timer-pulse': {
          '0%': { opacity: '1' },
          '40%': { opacity: '0.62' },
          '100%': { opacity: '1' },
        },
        'word-settle': {
          '0%': { transform: 'translateY(0)' },
          '45%': { transform: 'translateY(-1px)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'orb-a': 'orb-drift-a 26s ease-in-out infinite',
        'orb-b': 'orb-drift-b 32s ease-in-out infinite',
        'caret-blink': 'caret-blink 1s steps(1, end) infinite',
        'char-in': 'char-in 120ms ease-out both',
        'char-error': 'char-error 160ms ease-out both',
        'timer-pulse': 'timer-pulse 420ms ease-out both',
        'word-settle': 'word-settle 180ms ease-out both',
      },
    },
  },
  plugins: [],
}
