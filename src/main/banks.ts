// Bancos de preguntas: un JSON por banco en Documentos\KONKURSOX\preguntas\ (imágenes en preguntas\imagenes\).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import { convertLegacy, parseBank, slugify, type Bank, type BankInfo, type QuestionType } from '../shared/questions'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
const MARKER = '.legacy-importado'

export function banksDir(): string {
  return join(app.getPath('documents'), 'KONKURSOX', 'preguntas')
}
export const imagesDir = (): string => join(banksDir(), 'imagenes')

/** legacy/_data del repo (en desarrollo) o resources/legacy (instalado). */
function legacyDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'legacy') : join(app.getAppPath(), 'legacy', '_data')
}

function uniqueFile(dir: string, base: string): string {
  let name = `${base}.json`
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${base}-${i}.json`
  return name
}

function writeBank(bank: Bank, base: string): string {
  const dir = banksDir()
  mkdirSync(dir, { recursive: true })
  const file = uniqueFile(dir, slugify(base))
  writeFileSync(join(dir, file), JSON.stringify(bank, null, 2) + '\n', 'utf8')
  return file
}

function listImages(): string[] {
  const dir = imagesDir()
  return existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())) : []
}

/** Copia imágenes de una carpeta a preguntas\imagenes (sin sobrescribir). */
function copyImages(from: string): void {
  if (!existsSync(from)) return
  mkdirSync(imagesDir(), { recursive: true })
  for (const f of readdirSync(from)) {
    if (!IMAGE_EXT.has(extname(f).toLowerCase())) continue
    const to = join(imagesDir(), f)
    if (!existsSync(to)) copyFileSync(join(from, f), to)
  }
}

/** Convierte un JSON del formato antiguo y lo guarda como banco nuevo. */
export function importLegacyFile(path: string, forceType?: QuestionType): string {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const base = basename(path, extname(path))
  const nombre = forceType === 'sino' && /banco_sino/i.test(base) ? 'Sí o No' : base.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  // Si ya está en formato nuevo, se copia tal cual (normalizado).
  const bank = !Array.isArray(raw) ? parseBank(raw, nombre) : convertLegacy(raw, nombre, forceType, listImages())
  if (!bank.preguntas.length) throw new Error('No hay preguntas válidas en el archivo')
  return writeBank(bank, base)
}

/** Primer arranque: importa legacy/_preguntas (test y sino) e imágenes. Solo una vez. */
export function ensureBanks(): void {
  const dir = banksDir()
  mkdirSync(imagesDir(), { recursive: true })
  if (existsSync(join(dir, MARKER))) return
  const legacy = legacyDir()
  copyImages(join(legacy, '_imagenes'))
  const qdir = join(legacy, '_preguntas')
  const imported: string[] = []
  for (const sub of ['test', 'sino'] as const) {
    const p = join(qdir, sub)
    if (!existsSync(p)) continue
    for (const f of readdirSync(p).filter((x) => x.toLowerCase().endsWith('.json')).sort()) {
      try {
        imported.push(importLegacyFile(join(p, f), sub === 'sino' ? 'sino' : undefined))
      } catch (err) {
        console.error('[bancos] no se pudo importar', f, err)
      }
    }
  }
  writeFileSync(join(dir, MARKER), `Importado de ${legacy} el ${new Date().toISOString()}\n${imported.join('\n')}\n`, 'utf8')
}

export function listBanks(): BankInfo[] {
  ensureBanks()
  const dir = banksDir()
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json') && statSync(join(dir, f)).isFile())
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .map((file) => {
      try {
        const bank = parseBank(JSON.parse(readFileSync(join(dir, file), 'utf8')), basename(file, '.json'))
        return { file, nombre: bank.nombre, count: bank.preguntas.length }
      } catch (err) {
        return { file, nombre: file, count: 0, error: String((err as Error).message ?? err) }
      }
    })
}

export function readBank(file: string): Bank {
  const safe = basename(file)
  return parseBank(JSON.parse(readFileSync(join(banksDir(), safe), 'utf8')), basename(safe, '.json'))
}
