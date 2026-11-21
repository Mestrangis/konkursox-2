// Biblioteca: Documentos\KONKURSOX\preguntas\<tipo>\*.json (imágenes en preguntas\imagenes\).
// Primer arranque: importa legacy/ y los ejemplos, y reparte los bancos antiguos (mezclados) por tipo.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import { bankRef, LIB_TYPES, newBankFile, parseRef, splitBank, toFileBank, type LibBankInfo, type LibType } from '../shared/library'
import { convertLegacy, isPlayable, parseBank, slugify, type Bank, type QuestionType } from '../shared/questions'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
const LEGACY_MARKER = '.legacy-importado'
const EXAMPLES_MARKER = '.ejemplos-v3'
const LIBRARY_MARKER = '.biblioteca-v4'
const LADDER_MARKER = '.escalera-ejemplo'

export const banksDir = (): string => join(app.getPath('documents'), 'KONKURSOX', 'preguntas')
export const imagesDir = (): string => join(banksDir(), 'imagenes')
const typeDir = (t: LibType) => join(banksDir(), t)

const legacyDir = () => (app.isPackaged ? join(process.resourcesPath, 'legacy') : join(app.getAppPath(), 'legacy', '_data'))
const examplesDir = () => (app.isPackaged ? join(process.resourcesPath, 'ejemplos') : join(app.getAppPath(), 'resources', 'ejemplos'))

const listImages = (): string[] => (existsSync(imagesDir()) ? readdirSync(imagesDir()).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())) : [])
const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json') && statSync(join(dir, f)).isFile()) : []

function writeJson(path: string, data: unknown): void {
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

function copyImages(from: string): void {
  if (!existsSync(from)) return
  mkdirSync(imagesDir(), { recursive: true })
  for (const f of readdirSync(from)) {
    if (!IMAGE_EXT.has(extname(f).toLowerCase())) continue
    const to = join(imagesDir(), f)
    if (!existsSync(to)) copyFileSync(join(from, f), to)
  }
}

/** Lee un JSON antiguo o nuevo y lo deja como banco (en la raíz, para que la migración lo reparta). */
function importToRoot(path: string, forceType?: QuestionType): void {
  const raw = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  const base = basename(path, extname(path))
  const nombre = forceType === 'sino' && /banco_sino/i.test(base) ? 'Sí o No' : base.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  const bank = !Array.isArray(raw) ? parseBank(raw, nombre) : convertLegacy(raw, nombre, forceType, listImages())
  if (!bank.preguntas.length) throw new Error('No hay preguntas válidas en el archivo')
  let file = `${slugify(base)}.json`
  for (let i = 2; existsSync(join(banksDir(), file)); i++) file = `${slugify(base)}-${i}.json`
  writeJson(join(banksDir(), file), toFileBank(bank))
}

/** Reparte los bancos de la raíz en las carpetas de cada tipo; los originales van a _antiguos\. */
function migrateRoot(used: Record<string, unknown>): void {
  const root = banksDir()
  const files = jsonFiles(root)
  if (!files.length) return
  const old = join(root, '_antiguos')
  mkdirSync(old, { recursive: true })
  for (const file of files) {
    try {
      const bank = parseBank(JSON.parse(readFileSync(join(root, file), 'utf8').replace(/^﻿/, '')), basename(file, '.json'))
      for (const part of splitBank(bank, file, used)) {
        const dir = typeDir(part.tipo)
        mkdirSync(dir, { recursive: true })
        const target = newBankFile(part.file.replace(/\.json$/, ''), jsonFiles(dir))
        writeJson(join(dir, target), toFileBank(part.bank))
      }
      let dest = join(old, file)
      for (let i = 2; existsSync(dest); i++) dest = join(old, file.replace(/\.json$/, `-${i}.json`))
      renameSync(join(root, file), dest)
    } catch (err) {
      console.error('[biblioteca] no se pudo migrar', file, err)
    }
  }
}

/** Primer arranque y migraciones. `used` = preguntas usadas guardadas en el estado antiguo. */
export function ensureLibrary(used: Record<string, unknown> = {}): void {
  const root = banksDir()
  mkdirSync(imagesDir(), { recursive: true })
  for (const t of LIB_TYPES) mkdirSync(typeDir(t.id), { recursive: true })
  if (!existsSync(join(root, LEGACY_MARKER))) {
    copyImages(join(legacyDir(), '_imagenes'))
    for (const sub of ['test', 'sino'] as const) {
      const p = join(legacyDir(), '_preguntas', sub)
      for (const f of jsonFiles(p).sort()) {
        try {
          importToRoot(join(p, f), sub === 'sino' ? 'sino' : undefined)
        } catch (err) {
          console.error('[biblioteca] legacy', f, err)
        }
      }
    }
    writeFileSync(join(root, LEGACY_MARKER), `Importado el ${new Date().toISOString()}\n`, 'utf8')
  }
  if (!existsSync(join(root, EXAMPLES_MARKER))) {
    for (const f of jsonFiles(examplesDir())) if (!existsSync(join(root, f))) copyFileSync(join(examplesDir(), f), join(root, f))
    writeFileSync(join(root, EXAMPLES_MARKER), `Ejemplos copiados el ${new Date().toISOString()}\n`, 'utf8')
  }
  // siempre: cualquier banco suelto en la raíz se reparte por tipos
  migrateRoot(used)
  ensureLadderExample()
  if (!existsSync(join(root, LIBRARY_MARKER))) writeFileSync(join(root, LIBRARY_MARKER), `Biblioteca por tipos desde ${new Date().toISOString()}\n`, 'utf8')
}

/**
 * Escalera de ejemplo: 15 preguntas de los bancos de Tipo test (en el orden del banco).
 * Solo se crea una vez y si no hay ninguna escalera.
 */
function ensureLadderExample(): void {
  const root = banksDir()
  if (existsSync(join(root, LADDER_MARKER))) return
  const dir = typeDir('escalera')
  if (jsonFiles(dir).length) return void writeFileSync(join(root, LADDER_MARKER), 'ya había escaleras\n', 'utf8')
  const tests = jsonFiles(typeDir('test')).sort((a, b) => (a === 'general.json' ? -1 : b === 'general.json' ? 1 : a.localeCompare(b)))
  const picked: Bank['preguntas'] = []
  for (const file of tests) {
    try {
      const b = parseBank(JSON.parse(readFileSync(join(typeDir('test'), file), 'utf8').replace(/^﻿/, '')), file, true)
      for (const q of b.preguntas) if (picked.length < 15 && isPlayable(q) && q.opciones.length === 4) picked.push({ ...q, id: 'e' + (picked.length + 1), usada: undefined })
    } catch {
      /* banco ilegible: se salta */
    }
    if (picked.length >= 15) break
  }
  if (picked.length) {
    writeJson(join(dir, 'escalera-de-ejemplo.json'), toFileBank({ formato: 'konkursox-banco', version: 1, nombre: 'Escalera de ejemplo', preguntas: picked }))
  }
  writeFileSync(join(root, LADDER_MARKER), `Escalera de ejemplo creada el ${new Date().toISOString()}\n`, 'utf8')
}

function pathOf(ref: string): string {
  const r = parseRef(ref)
  if (!r) throw new Error('Banco no válido: ' + ref)
  return join(typeDir(r.tipo), r.file)
}

export function readBank(ref: string): Bank {
  return parseBank(JSON.parse(readFileSync(pathOf(ref), 'utf8').replace(/^﻿/, '')), basename(ref, '.json'), true)
}

export function listLibrary(): LibBankInfo[] {
  const out: LibBankInfo[] = []
  for (const t of LIB_TYPES) {
    for (const file of jsonFiles(typeDir(t.id)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
      const ref = bankRef(t.id, file)
      try {
        const b = readBank(ref)
        out.push({
          ref,
          tipo: t.id,
          file,
          nombre: b.nombre,
          count: b.preguntas.length,
          used: b.preguntas.filter((q) => q.usada).length,
          letters: t.id === 'rosco' ? new Set(b.preguntas.filter((q) => q.enunciado && q.respuesta).map((q) => q.letra)).size : undefined
        })
      } catch (err) {
        console.error('[biblioteca]', ref, err)
      }
    }
  }
  return out
}

export function saveBank(ref: string, bank: Bank): void {
  writeJson(pathOf(ref), toFileBank(bank))
}

export function createBank(tipo: LibType, nombre: string): string {
  const file = newBankFile(nombre, jsonFiles(typeDir(tipo)))
  writeJson(join(typeDir(tipo), file), toFileBank({ formato: 'konkursox-banco', version: 1, nombre, preguntas: [] }))
  return bankRef(tipo, file)
}

/** Borrar un banco: se mueve a preguntas\_papelera\ (no se pierde). */
export function deleteBank(ref: string): void {
  const src = pathOf(ref)
  const bin = join(banksDir(), '_papelera')
  mkdirSync(bin, { recursive: true })
  const r = parseRef(ref)!
  let dest = join(bin, `${r.tipo}-${r.file}`)
  for (let i = 2; existsSync(dest); i++) dest = join(bin, `${r.tipo}-${i}-${r.file}`)
  renameSync(src, dest)
}

/** Marca preguntas como usadas (fecha de hoy) o sin usar. */
export function markUsed(ref: string, ids: string[], used: boolean): void {
  const bank = readBank(ref)
  const today = new Date().toISOString().slice(0, 10)
  const set = new Set(ids)
  bank.preguntas = bank.preguntas.map((q) => (set.has(q.id) ? { ...q, usada: used ? today : undefined } : q))
  saveBank(ref, bank)
}

/** Copia una imagen a preguntas\imagenes y devuelve su nombre de archivo. */
export function importImage(path: string): string {
  const ext = extname(path).toLowerCase()
  if (!IMAGE_EXT.has(ext)) throw new Error('Formato de imagen no admitido')
  mkdirSync(imagesDir(), { recursive: true })
  const base = slugify(basename(path, ext))
  let file = `${base}${ext}`
  for (let i = 2; existsSync(join(imagesDir(), file)); i++) file = `${base}-${i}${ext}`
  copyFileSync(path, join(imagesDir(), file))
  return file
}
