// Biblioteca de audio: carpeta con subcarpetas musica/ y efectos/, servida por el protocolo konk-media://
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, net, protocol } from 'electron'
import { dispatch, getState } from './store'
import type { AudioLibrary } from '../shared/types'

export const MEDIA_SCHEME = 'konk-media'
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus', '.webm'])

/** Debe llamarse antes de app.ready */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

export function audioDir(): string {
  return getState().audio.dir ?? join(app.getPath('documents'), 'KONKURSOX', 'audio')
}

/** Audio de ejemplo incluido con la app (resources/audio en el repo). */
function bundledAudioDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'audio') : join(app.getAppPath(), 'resources', 'audio')
}

function ensureDir(): string {
  const dir = audioDir()
  for (const sub of ['musica', 'efectos']) {
    const target = join(dir, sub)
    const fresh = !existsSync(target)
    mkdirSync(target, { recursive: true })
    // Primera vez: copia los sonidos incluidos para tener algo con lo que probar.
    const src = join(bundledAudioDir(), sub)
    if (fresh && existsSync(src)) {
      for (const f of readdirSync(src)) if (AUDIO_EXT.has(extname(f).toLowerCase())) copyFileSync(join(src, f), join(target, f))
    }
  }
  return dir
}

function listAudio(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile())
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

export function audioLibrary(): AudioLibrary {
  const dir = ensureDir()
  return { dir, music: listAudio(join(dir, 'musica')), sfx: listAudio(join(dir, 'efectos')) }
}

export function setAudioDir(dir: string): void {
  dispatch({ type: 'setAudio', patch: { dir } })
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (req) => {
    const url = new URL(req.url)
    const root = resolve(audioDir())
    const target = resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    const rel = relative(root, target)
    if (url.host !== 'audio' || rel.startsWith('..') || rel.includes(':') || target === root || !target.startsWith(root + sep)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}
