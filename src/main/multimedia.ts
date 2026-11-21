// Biblioteca multimedia: Documentos\KONKURSOX\multimedia\ (subcarpetas = carpetas del panel) + vídeos de YouTube.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { app, net } from 'electron'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv'])
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska'
}

export const mediaDir = (): string => join(app.getPath('documents'), 'KONKURSOX', 'multimedia')
const ytFile = () => join(mediaDir(), 'youtube.json')

export interface LibMediaItem {
  id: string
  folder: string
  kind: 'image' | 'video' | 'youtube'
  title: string
  /** imagen/vídeo: ruta relativa dentro de multimedia\; YouTube: id del vídeo */
  src: string
  thumb?: string
  embeddable?: boolean
}

export interface MediaLibrary {
  dir: string
  folders: string[]
  items: LibMediaItem[]
}

interface YtEntry {
  id: string
  folder: string
  videoId: string
  title: string
  url: string
  embeddable: boolean
}

function readYt(): YtEntry[] {
  try {
    return existsSync(ytFile()) ? (JSON.parse(readFileSync(ytFile(), 'utf8')) as YtEntry[]) : []
  } catch {
    return []
  }
}
const writeYt = (list: YtEntry[]) => writeFileSync(ytFile(), JSON.stringify(list, null, 2) + '\n', 'utf8')

const safeFolder = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim()

export function mediaLibrary(): MediaLibrary {
  const root = mediaDir()
  mkdirSync(root, { recursive: true })
  const folders = ['', ...readdirSync(root).filter((f) => !f.startsWith('_') && statSync(join(root, f)).isDirectory())]
  const items: LibMediaItem[] = []
  for (const folder of folders) {
    const dir = join(root, folder)
    for (const f of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
      const ext = extname(f).toLowerCase()
      const kind = IMAGE_EXT.has(ext) ? 'image' : VIDEO_EXT.has(ext) ? 'video' : null
      if (!kind || !statSync(join(dir, f)).isFile()) continue
      const rel = folder ? `${folder}/${f}` : f
      items.push({ id: `f:${rel}`, folder, kind, title: basename(f, ext), src: rel })
    }
  }
  for (const y of readYt())
    items.push({ id: `y:${y.id}`, folder: folders.includes(y.folder) ? y.folder : '', kind: 'youtube', title: y.title, src: y.videoId, thumb: `https://i.ytimg.com/vi/${y.videoId}/hqdefault.jpg`, embeddable: y.embeddable })
  return { dir: root, folders, items }
}

export function createFolder(name: string): string {
  const n = safeFolder(name)
  if (!n) throw new Error('Nombre de carpeta no válido')
  mkdirSync(join(mediaDir(), n), { recursive: true })
  return n
}

/** Copia imágenes y vídeos a una carpeta. Devuelve cuántos se han añadido. */
export function importMedia(paths: string[], folder: string): number {
  const dir = join(mediaDir(), safeFolder(folder))
  mkdirSync(dir, { recursive: true })
  let n = 0
  for (const p of paths) {
    const ext = extname(p).toLowerCase()
    if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) continue
    const base = basename(p, ext)
    let name = `${base}${ext}`
    for (let i = 2; existsSync(join(dir, name)); i++) name = `${base} (${i})${ext}`
    copyFileSync(p, join(dir, name))
    n++
  }
  return n
}

/** Borrar: los archivos van a multimedia\_papelera\ (no se pierden). */
export function deleteMedia(id: string): void {
  if (id.startsWith('y:')) return writeYt(readYt().filter((y) => y.id !== id.slice(2)))
  const rel = id.slice(2)
  const src = resolve(mediaDir(), rel)
  if (!src.startsWith(resolve(mediaDir()) + sep) || !existsSync(src)) return
  const bin = join(mediaDir(), '_papelera')
  mkdirSync(bin, { recursive: true })
  let dest = join(bin, basename(src))
  for (let i = 2; existsSync(dest); i++) dest = join(bin, `${i}-${basename(src)}`)
  renameSync(src, dest)
}

/** Id del vídeo en cualquier enlace de YouTube (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string): string | null {
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url.trim())
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null
}

/** Añade un vídeo de YouTube: título por oEmbed y aviso si no permite incrustarse. */
export async function addYoutube(url: string, folder: string): Promise<{ title: string; embeddable: boolean }> {
  const videoId = youtubeId(url)
  if (!videoId) throw new Error('No parece un enlace de YouTube')
  let title = `YouTube ${videoId}`
  let embeddable = true
  try {
    const res = await net.fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`)
    if (res.ok) title = String(((await res.json()) as { title?: string }).title ?? title)
    // 401: el propietario no deja incrustarlo
    else if (res.status === 401 || res.status === 403) embeddable = false
    else if (res.status === 404) throw new Error('Ese vídeo no existe o es privado')
  } catch (err) {
    if ((err as Error).message.includes('privado')) throw err
  }
  const list = readYt()
  list.push({ id: Math.random().toString(36).slice(2, 10), folder: safeFolder(folder), videoId, title, url, embeddable })
  writeYt(list)
  return { title, embeddable }
}

/** Sirve un archivo de multimedia\ con soporte de Range (para poder saltar en los vídeos). */
export function serveMedia(req: Request, relPath: string): Response {
  const root = resolve(mediaDir())
  const target = resolve(root, relPath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.includes(':') || !target.startsWith(root + sep) || !existsSync(target)) return new Response('no encontrado', { status: 404 })
  const size = statSync(target).size
  const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
  const range = req.headers.get('range')
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1
    if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    const stream = Readable.toWeb(createReadStream(target, { start, end })) as unknown as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' }
    })
  }
  const stream = Readable.toWeb(createReadStream(target)) as unknown as ReadableStream
  return new Response(stream, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
}
