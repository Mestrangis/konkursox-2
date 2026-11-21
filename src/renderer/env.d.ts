/// <reference types="vite/client" />
import type { KonkApi } from '../preload/index'

declare global {
  interface Window {
    konk: KonkApi
  }
}

export {}
