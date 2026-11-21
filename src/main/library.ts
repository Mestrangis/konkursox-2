// Fotos de las personas del grupo (Documentos\KONKURSOX\personas\).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { app } from 'electron'
import { slugify } from '../shared/questions'

export const peopleDir = (): string => join(app.getPath('documents'), 'KONKURSOX', 'personas')

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
