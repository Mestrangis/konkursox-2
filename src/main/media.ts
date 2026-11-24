// Biblioteca de audio: carpeta con subcarpetas musica/ y efectos/, servida por el protocolo konk-media://
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app, protocol } from 'electron'
import { imagesDir } from './banks'
import { peopleDir } from './library'
import { serveFile, serveMedia } from './multimedia'
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
    const src = join(bundledAudioDir(), sub)
    if (!existsSync(src)) continue
    for (const f of readdirSync(src)) {
      if (!AUDIO_EXT.has(extname(f).toLowerCase())) continue
      // primera vez: todo; después, solo los sonidos propios de la app (kx-*) que falten, sin pisar nada
      if (fresh || (f.startsWith('kx-') && !existsSync(join(target, f)))) copyFileSync(join(src, f), join(target, f))
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
  // los efectos incluyen la subcarpeta "alternativas" (otras versiones para elegir en Ajustes)
  const alt = listAudio(join(dir, 'efectos', 'alternativas')).map((f) => `alternativas/${f}`)
  return { dir, music: listAudio(join(dir, 'musica')), sfx: [...listAudio(join(dir, 'efectos')), ...alt] }
}

export function setAudioDir(dir: string): void {
  dispatch({ type: 'setAudio', patch: { dir } })
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (req) => {
    const url = new URL(req.url)
    // multimedia: con Range, para poder saltar en los vídeos
    if (url.host === 'multimedia') return serveMedia(req, decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    const roots: Record<string, string> = { audio: audioDir(), imagenes: imagesDir(), personas: peopleDir() }
    if (!roots[url.host]) return new Response('forbidden', { status: 403 })
    // con Range: sin esto el navegador no puede saltar y la barra vuelve a 0:00
    return serveFile(req, roots[url.host], decodeURIComponent(url.pathname).replace(/^\/+/, ''))
  })
}

/** Copia archivos de audio (arrastrados al panel) a musica\ o efectos\. Devuelve los nombres añadidos. */
export function importAudio(paths: string[], kind: 'musica' | 'efectos'): string[] {
  const dir = join(ensureDir(), kind)
  const added: string[] = []
  for (const p of paths) {
    const ext = extname(p).toLowerCase()
    if (!AUDIO_EXT.has(ext)) continue
    const base = basename(p, ext)
    let name = `${base}${ext}`
    for (let i = 2; existsSync(join(dir, name)); i++) name = `${base} (${i})${ext}`
    copyFileSync(p, join(dir, name))
    added.push(name)
  }
  return added
}
