// Biblioteca: Documentos\KONKURSOX\preguntas\<tipo>\*.json (imágenes en preguntas\imagenes\).
// Primer arranque: importa legacy/ y los ejemplos, y reparte los bancos antiguos (mezclados) por tipo.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { app, net } from 'electron'
import { bankRef, LIB_TYPES, newBankFile, newQuestionId, parseRef, splitBank, toFileBank, type LibBankInfo, type LibType } from '../shared/library'
import { convertLegacy, isPlayable, parseBank, slugify, type Bank, type QuestionType } from '../shared/questions'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
const LEGACY_MARKER = '.legacy-importado'
const EXAMPLES_MARKER = '.ejemplos-v3'
const LIBRARY_MARKER = '.biblioteca-v4'
const LADDER_MARKER = '.escalera-ejemplo'
const TRIVIA_MARKER_V1 = '.trivia-opentdb-v1'
const TRIVIA_MARKER = '.trivia-opentdb-v2'
const TRIVIA_DIFS = ['facil', 'media', 'dificil'] as const

export const banksDir = (): string => join(app.getPath('documents'), 'KONKURSOX', 'preguntas')
export const imagesDir = (): string => join(banksDir(), 'imagenes')
const typeDir = (t: LibType) => join(banksDir(), t)

const legacyDir = () => (app.isPackaged ? join(process.resourcesPath, 'legacy') : join(app.getAppPath(), 'legacy', '_data'))
const examplesDir = () => (app.isPackaged ? join(process.resourcesPath, 'ejemplos') : join(app.getAppPath(), 'resources', 'ejemplos'))
const triviaDir = () => (app.isPackaged ? join(process.resourcesPath, 'trivia') : join(app.getAppPath(), 'resources', 'trivia'))

/**
 * Packs de Open Trivia DB (traducidos y guardados como archivos): un banco por categoría en test\ y sino\,
 * en el grupo «Trivia». Si ya existe un banco con el mismo nombre de archivo no se toca (por si lo has editado).
 *
 * v1 traía un banco por categoría y dificultad (opentdb-<cat>-<dif>.json). Al pasar a v2 se juntan los tres
 * que tengas instalados en uno, conservando TU versión de cada pregunta (usadas, ediciones, las que añadiste)
 * y sin recuperar las que borraste. Los archivos viejos se guardan en preguntas\_antiguos\trivia-v1\.
 */
function ensureTrivia(): void {
  const root = banksDir()
  if (existsSync(join(root, TRIVIA_MARKER))) return
  const hadV1 = existsSync(join(root, TRIVIA_MARKER_V1))
  const backup = join(root, '_antiguos', 'trivia-v1')
  const moved = new Map<string, string>() // ref viejo -> ref nuevo
  let n = 0
  for (const t of ['test', 'sino'] as const) {
    const from = join(triviaDir(), t)
    for (const f of jsonFiles(from)) {
      const to = join(typeDir(t), f)
      if (existsSync(to)) continue
      const base = basename(f, '.json')
      const olds = TRIVIA_DIFS.map((d) => `${base}-${d}.json`).filter((o) => existsSync(join(typeDir(t), o)))
      // si tenías el pack y borraste esos bancos, no vuelven
      if (hadV1 && !olds.length) continue
      if (!olds.length) {
        copyFileSync(join(from, f), to)
        n++
        continue
      }
      const pack = parseBank(JSON.parse(readFileSync(join(from, f), 'utf8').replace(/^﻿/, '')), base, true)
      const merged: Bank = { ...pack, preguntas: [] }
      const ids = new Set<string>()
      for (const o of olds) {
        const old = parseBank(JSON.parse(readFileSync(join(typeDir(t), o), 'utf8').replace(/^﻿/, '')), o, true)
        const dif = o.slice(base.length + 1, -5) as (typeof TRIVIA_DIFS)[number]
        for (const q of old.preguntas) {
          const copy = { ...q, dificultad: q.dificultad ?? dif }
          if (ids.has(copy.id)) copy.id = newQuestionId(merged, 'm')
          ids.add(copy.id)
          merged.preguntas.push(copy)
        }
        moved.set(`${t}/${o}`, `${t}/${f}`)
      }
      writeJson(to, toFileBank(merged))
      mkdirSync(join(backup, t), { recursive: true })
      for (const o of olds) renameSync(join(typeDir(t), o), join(backup, t, o))
      n++
    }
  }
  // las partidas mezcladas apuntan a la pregunta original para marcarla usada: pasa el banco al nuevo
  if (moved.size)
    for (const t of ['test', 'sino', 'escalera'] as const)
      for (const f of jsonFiles(typeDir(t))) {
        const path = join(typeDir(t), f)
        try {
          const raw = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
          if (!raw?.mezcla || !Array.isArray(raw.preguntas)) continue
          let changed = false
          for (const q of raw.preguntas)
            if (q?.origen?.ref && moved.has(q.origen.ref)) {
              q.origen.ref = moved.get(q.origen.ref)
              changed = true
            }
          if (changed) writeJson(path, raw)
        } catch {
          /* un banco roto no para el resto */
        }
      }
  writeFileSync(join(root, TRIVIA_MARKER), `Packs de Open Trivia DB (uno por categoría) el ${new Date().toISOString()} (${n} bancos)\n`, 'utf8')
}

const listImages = (): string[] => (existsSync(imagesDir()) ? readdirSync(imagesDir()).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())) : [])
const jsonFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json') && statSync(join(dir, f)).isFile()) : [])

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
  // carpeta de la versión vieja que ya no se usa
  try {
    rmSync(join(dirname(root), 'escaletas'), { recursive: true, force: true })
  } catch {
    /* no pasa nada */
  }
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
  try {
    ensureTrivia()
  } catch (err) {
    console.error('[biblioteca] trivia', err)
  }
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
          ...(b.grupo ? { grupo: b.grupo } : {}),
          ...(b.mezcla ? { mezcla: true } : {}),
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

const MIME_EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' }

function freeImageName(base: string, ext: string): string {
  mkdirSync(imagesDir(), { recursive: true })
  const b = slugify(base).slice(0, 60) || 'imagen'
  let file = `${b}${ext}`
  for (let i = 2; existsSync(join(imagesDir(), file)); i++) file = `${b}-${i}${ext}`
  return file
}

/** Imagen pegada del portapapeles (bytes) o descargada: se guarda en preguntas\imagenes. */
export function importImageData(data: Uint8Array, mime: string, name = 'pegada'): string {
  const ext = MIME_EXT[mime.toLowerCase()]
  if (!ext) throw new Error('Formato de imagen no admitido (' + mime + ')')
  if (data.byteLength > 25 * 1024 * 1024) throw new Error('La imagen pesa demasiado (más de 25 MB)')
  const file = freeImageName(name, ext)
  writeFileSync(join(imagesDir(), file), data)
  return file
}

/** Imagen arrastrada o pegada desde una página web (dirección http/https o data:). */
export async function importImageUrl(url: string, name?: string): Promise<string> {
  if (url.startsWith('data:')) {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(url)
    if (!m) throw new Error('Imagen no válida')
    return importImageData(Buffer.from(m[2], 'base64'), m[1], name)
  }
  if (!/^https?:\/\//i.test(url)) throw new Error('Dirección no válida')
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KONKURSOX' } })
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`)
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  const buf = new Uint8Array(await res.arrayBuffer())
  const fromUrl = basename(new URL(url).pathname).replace(/\.[a-z0-9]+$/i, '')
  return importImageData(buf, mime || 'image/' + (extname(new URL(url).pathname).slice(1) || 'png'), name ?? (fromUrl || 'web'))
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
