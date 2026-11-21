import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: { externalizeDeps: true }
  },
  preload: {
    build: { externalizeDeps: true }
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    build: {
      rolldownOptions: {
        input: {
          plato: resolve(import.meta.dirname, 'src/renderer/plato.html'),
          panel: resolve(import.meta.dirname, 'src/renderer/panel.html')
        }
      }
    }
  }
})
