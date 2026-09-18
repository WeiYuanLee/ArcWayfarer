import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const mobile = mode === 'mobile'
  const devApiOrigin = process.env.VITE_API_BASE_URL
  const localDevApi = mode === 'development' && devApiOrigin && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(devApiOrigin)
  return {
    root: mobile ? resolve(__dirname, 'mobile') : undefined,
    plugins: [
      react(),
      {
        name: 'local-dev-api-csp',
        transformIndexHtml(html: string) {
          if (!localDevApi) return html
          return html
            .replaceAll('http://127.0.0.1:8787', devApiOrigin)
            .replaceAll('ws://127.0.0.1:8787', devApiOrigin.replace(/^http/, 'ws'))
        },
      },
    ],
    base: mobile ? '/mobile/' : './',
    optimizeDeps: {
      // MapLibre resolves its module worker relative to the package entry.
      // Pre-bundling moves that entry into .vite/deps without its worker file.
      exclude: ['maplibre-gl'],
    },
    build: mobile ? { outDir: resolve(__dirname, 'mobile-dist'), emptyOutDir: true } : undefined,
    server: { port: 5173 },
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'mobile-dist/**'],
    },
  }
})
