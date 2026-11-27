// Biblioteca por tipo de juego: cada tipo tiene su carpeta (preguntas\<tipo>\) con sus bancos.
// Aquí la lógica pura: migración de los bancos mezclados, formato de archivo e importación de texto del rosco.
import { ROSCO_ALPHABET, slugify, type Bank, type Question, type QuestionType } from './questions'
import type { QuizGameId } from './scene'

/** Tipos de la biblioteca (la escalera tiene sus propios bancos de preguntas tipo test). */
export type LibType = QuizGameId | 'rosco'
export const LIB_TYPES: { id: LibType; label: string }[] = [
  { id: 'test', label: 'Tipo test' },
  { id: 'sino', label: 'Sí o no' },
  { id: 'escalera', label: 'Escalera' },
  { id: 'estimacion', label: 'Estimación' },
  { id: 'quien', label: '¿Quién lo dijo?' },
  { id: 'rosco', label: 'Rosco' }
]

/** Tipo de pregunta que guarda cada carpeta. */
export const QTYPE_OF: Record<LibType, QuestionType> = {
  test: 'test',
  sino: 'sino',
  escalera: 'test',
  estimacion: 'estimacion',
  quien: 'quien',
  rosco: 'rosco'
}

export interface LibBankInfo {
  ref: string
  tipo: LibType
  file: string
  nombre: string
  count: number
  used: number
  /** grupo en la navegación (p. ej. "Open Trivia DB") */
  grupo?: string
  /** banco generado por "Partida mezclada" */
  mezcla?: boolean
  /** rosco: letras con definición y respuesta */
  letters?: number
}

export const bankRef = (tipo: LibType, file: string): string => `${tipo}/${file}`
export function parseRef(ref: string): { tipo: LibType; file: string } | null {
  const m = /^(test|sino|escalera|estimacion|quien|rosco)\/([^/\\]+\.json)$/.exec(ref)
  return m ? { tipo: m[1] as LibType, file: m[2] } : null
}

export interface SplitBank {
  tipo: LibType
  file: string
  bank: Bank
}

/**
 * Migración: un banco antiguo con preguntas de varios tipos se parte en un banco por tipo.
 * Un rosco con varias definiciones por letra se parte en varios roscos (uno por "vuelta").
 * `used` son las claves antiguas "archivo::id" de preguntas usadas: pasan a marcarse en la pregunta.
 */
export function splitBank(bank: Bank, file: string, used: Record<string, unknown> = {}, today = new Date().toISOString().slice(0, 10)): SplitBank[] {
  const base = file.replace(/\.json$/i, '')
  const mark = (q: Question): Question => (used[`${file}::${q.id}`] && !q.usada ? { ...q, usada: today } : q)
  const out: SplitBank[] = []
  for (const tipo of ['test', 'sino', 'estimacion', 'quien'] as const) {
    const preguntas = bank.preguntas.filter((q) => q.tipo === tipo).map(mark)
    if (preguntas.length) out.push({ tipo, file: `${base}.json`, bank: { ...bank, preguntas } })
  }
  const rosco = bank.preguntas.filter((q) => q.tipo === 'rosco').map(mark)
  if (rosco.length) {
    const rounds: Question[][] = []
    for (const q of rosco) {
      const i = rounds.findIndex((r) => !r.some((x) => x.letra === q.letra))
      if (i >= 0) rounds[i].push(q)
      else rounds.push([q])
    }
    rounds.forEach((preguntas, i) => {
      const n = rounds.length > 1 ? i + 1 : 0
      out.push({
        tipo: 'rosco',
        file: n ? `${base}-${n}.json` : `${base}.json`,
        bank: { ...bank, nombre: n ? `${bank.nombre} ${n}` : bank.nombre, preguntas: sortRosco(preguntas) }
      })
    })
  }
  return out
}

export const sortRosco = (qs: Question[]): Question[] => [...qs].sort((a, b) => ROSCO_ALPHABET.indexOf(a.letra ?? '') - ROSCO_ALPHABET.indexOf(b.letra ?? ''))

/** Pregunta en formato de archivo (lo que se guarda en el JSON). */
export function toFileQuestion(q: Question): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  if (q.imagen) extra.imagen = q.imagen
  if (q.imagen_modo === 'manual') extra.imagen_modo = 'manual'
  if (q.imagen_sugerida) extra.imagen_sugerida = q.imagen_sugerida
  if (q.imagen_respuesta) extra.imagen_respuesta = q.imagen_respuesta
  if (q.imagen_respuesta_sugerida) extra.imagen_respuesta_sugerida = q.imagen_respuesta_sugerida
  if (q.nota_presentador) extra.nota_presentador = q.nota_presentador
  if (q.dificultad !== undefined) extra.dificultad = q.dificultad
  if (q.etiquetas?.length) extra.etiquetas = q.etiquetas
  if (q.sin_revisar) extra.sin_revisar = true
  if (q.origen) extra.origen = q.origen
  if (q.usada) extra.usada = q.usada
  switch (q.tipo) {
    case 'rosco':
      return { id: q.id, tipo: 'rosco', letra: q.letra, modo: q.modo ?? 'empieza', definicion: q.enunciado, respuesta: q.respuesta ?? '', ...extra }
    case 'estimacion':
      return { id: q.id, tipo: 'estimacion', enunciado: q.enunciado, respuesta: q.valor ?? 0, unidad: q.unidad ?? '', ...(q.fuente ? { fuente: q.fuente } : {}), ...extra }
    case 'quien':
      return {
        id: q.id,
        tipo: 'quien',
        frase: q.enunciado,
        autor: q.autor ?? '',
        ...(q.fuente ? { fuente: q.fuente } : {}),
        ...(q.fecha ? { fecha: q.fecha } : {}),
        ...(q.hora ? { hora: q.hora } : {}),
        opciones: q.opciones,
        ...extra
      }
    default:
      return { id: q.id, tipo: q.tipo, enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta, ...(q.fuente ? { fuente: q.fuente } : {}), ...extra }
  }
}

export function toFileBank(bank: Bank): Record<string, unknown> {
  return {
    formato: 'konkursox-banco',
    version: 1,
    nombre: bank.nombre,
    ...(bank.grupo ? { grupo: bank.grupo } : {}),
    ...(bank.mezcla ? { mezcla: true } : {}),
    ...(bank.licencia ? { licencia: bank.licencia } : {}),
    preguntas: bank.preguntas.map(toFileQuestion)
  }
}

/** Nombre de archivo libre para un banco nuevo. */
export function newBankFile(nombre: string, taken: string[]): string {
  const base = slugify(nombre || 'banco')
  let file = `${base}.json`
  for (let i = 2; taken.includes(file); i++) file = `${base}-${i}.json`
  return file
}

/** Id libre dentro de un banco. */
export function newQuestionId(bank: Bank, prefix = 'p'): string {
  const ids = new Set(bank.preguntas.map((q) => q.id))
  let n = bank.preguntas.length + 1
  while (ids.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/**
 * "Importar desde texto" del rosco. Una línea por letra:
 *   A: Definición = RESPUESTA
 *   Ñ (contiene): Período de doce meses = Año
 * También vale "|" o tabulador en lugar de "=".
 */
export function parseRoscoText(text: string): { letra: string; modo: 'empieza' | 'contiene'; definicion: string; respuesta: string }[] {
  const out: { letra: string; modo: 'empieza' | 'contiene'; definicion: string; respuesta: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^([A-Za-zÑñ])\s*(\(?\s*(contiene|empieza)\s*\)?)?\s*[:.)\-–]\s*(.+?)\s*(?:=|\||\t)\s*(.+)$/i.exec(line)
    if (!m) continue
    out.push({
      letra: m[1].toUpperCase(),
      modo: m[3]?.toLowerCase() === 'contiene' ? 'contiene' : 'empieza',
      definicion: m[4].trim(),
      respuesta: m[5].trim()
    })
  }
  return out
}
