import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { buildCsp } from './src/main/security'

/**
 * Gebündelte Seiten werden über file:// geladen, wo der CSP-Header aus dem Main-Prozess
 * nicht greift. Deshalb wird die Produktions-CSP im Build als <meta>-Tag eingefügt.
 */
function cspMetaPlugin(): Plugin {
  return {
    name: 'nexora-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() }, injectTo: 'head-prepend' }
    ]
  }
}

const shared = { '@shared': resolve(import.meta.dirname, 'src/shared') }

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias: shared },
    plugins: [react(), tailwindcss(), cspMetaPlugin()],
    build: { rollupOptions: { input: resolve(import.meta.dirname, 'src/renderer/index.html') } }
  }
})
