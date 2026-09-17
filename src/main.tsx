import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * Fonts are self-hosted through npm rather than loaded from a CDN, so the app has no
 * runtime network dependency and renders identically offline. Each family still declares
 * a full local fallback stack in `lib/themes.ts`.
 *
 * The UI face is Inter. All three monospace families offered in Settings are bundled, so
 * every option is a real face rather than a silent fallback to the system mono.
 */
// The `.css` suffix is explicit so TypeScript resolves these through Vite's ambient CSS
// module declaration rather than trying (and failing) to type a bare CSS-only package.
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource/roboto-mono/400.css'
import '@fontsource/fira-code/400.css'

import './styles/globals.css'
import App from './App'
import { ThemeProvider } from './components/ThemeProvider'
import { useSettingsStore } from './store/useSettingsStore'
import { useTestStore } from './store/useTestStore'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container #root was not found in index.html')
}

// Dev-only inspection handle. `import()`-ing the stores from the console returns a
// module instance that HMR may have already replaced, so the verification harness needs
// a stable reference to the live stores. Stripped from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __novatype: { test: useTestStore, settings: useSettingsStore } })
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
