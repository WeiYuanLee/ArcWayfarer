import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const mobile = mode === 'mobile'
  return {
    root: mobile ? resolve(__dirname, 'mobile') : undefined,
    plugins: [react()],
    base: mobile ? '/mobile/' : './',
    build: mobile ? { outDir: resolve(__dirname, 'mobile-dist'), emptyOutDir: true } : undefined,
    server: { port: 5173 },
  }
})
