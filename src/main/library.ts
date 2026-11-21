// Escaletas guardadas (Documentos\KONKURSOX\escaletas\) y fotos de las personas del grupo (Documentos\KONKURSOX\personas\).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import { slugify } from '../shared/questions'
import { normalizeSegment, type Segment } from '../shared/show'

const root = () => join(app.getPath('documents'), 'KONKURSOX')
export const showsDir = (): string => join(root(), 'escaletas')
export const peopleDir = (): string => join(root(), 'personas')

export interface SavedShow {
  file: string
  title: string
  count: number
}

export function listShows(): SavedShow[] {
  const dir = showsDir()
  mkdirSync(dir, { recursive: true })
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json') && statSync(join(dir, f)).isFile())
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .map((file) => {
      try {
        const j = JSON.parse(readFileSync(join(dir, file), 'utf8'))
        return { file, title: String(j.title ?? basename(file, '.json')), count: Array.isArray(j.segments) ? j.segments.length : 0 }
      } catch {
        return { file, title: file, count: 0 }
      }
    })
}

export function saveShow(title: string, segments: Segment[]): string {
  const dir = showsDir()
  mkdirSync(dir, { recursive: true })
  const file = `${slugify(title || 'escaleta')}.json`
  writeFileSync(join(dir, file), JSON.stringify({ formato: 'konkursox-escaleta', version: 1, title, segments }, null, 2) + '\n', 'utf8')
  return file
}

export function loadShow(file: string): { title: string; segments: Segment[] } {
  const j = JSON.parse(readFileSync(join(showsDir(), basename(file)), 'utf8'))
  return { title: String(j.title ?? ''), segments: Array.isArray(j.segments) ? j.segments.map(normalizeSegment) : [] }
}

export function deleteShow(file: string): void {
  const p = join(showsDir(), basename(file))
  if (existsSync(p)) unlinkSync(p)
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])

/** Copia una foto a la carpeta de personas y devuelve el nombre de archivo. */
export function importPhoto(path: string, name: string): string {
  const ext = extname(path).toLowerCase()
  if (!IMAGE_EXT.has(ext)) throw new Error('Formato de imagen no admitido')
  const dir = peopleDir()
  mkdirSync(dir, { recursive: true })
  let file = `${slugify(name || 'persona')}${ext}`
  for (let i = 2; existsSync(join(dir, file)); i++) file = `${slugify(name || 'persona')}-${i}${ext}`
  copyFileSync(path, join(dir, file))
  return file
}
