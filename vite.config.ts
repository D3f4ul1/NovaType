import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /*
    Relative asset paths, because the same bundle is served two ways: by `npm run dev` from
    the server root, and by the desktop shell from `file://`. Vite's default `/assets/...`
    is absolute, which under `file://` resolves to the filesystem root and leaves the window
    blank with a handful of 404s that nothing on screen explains.
  */
  base: './',
  server: {
    port: 5273,
    strictPort: false,
  },
})
