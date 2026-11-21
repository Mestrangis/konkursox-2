// Formato unificado del banco de preguntas + conversión del formato antiguo (legacy).

/** Tipos de pregunta. Preparado para ampliar (estimación, rosco, quién lo dijo...). */
export type QuestionType = 'test' | 'sino'
export const QUESTION_TYPES: QuestionType[] = ['test', 'sino']

export interface Question {
  id: string
  tipo: QuestionType
  enunciado: string
  opciones: string[]
  /** índice de la opción correcta */
  correcta: number
  /** nombre de archivo dentro de Documentos\KONKURSOX\preguntas\imagenes\ */
  imagen?: string
  /** contexto que solo ve el presentador */
  nota_presentador?: string
  dificultad?: number | string
  fuente?: string
}

export interface Bank {
  formato: 'konkursox-banco'
  version: 1
  nombre: string
  preguntas: Question[]
}

export interface BankInfo {
  file: string
  nombre: string
  count: number
  error?: string
}

/** Clave única de una pregunta entre bancos (para marcar usadas). */
export const questionKey = (bankFile: string, id: string): string => `${bankFile}::${id}`

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'banco'
  )
}

const isSiNo = (ops: string[]) =>
  ops.length === 2 && /^s[ií]$/i.test(ops[0].trim()) && /^no$/i.test(ops[1].trim())

/** Valida/normaliza una pregunta del formato nuevo. Devuelve null si no es utilizable. */
export function normalizeQuestion(raw: unknown, fallbackId: string): Question | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const enunciado = typeof r.enunciado === 'string' ? r.enunciado : typeof r.pregunta === 'string' ? r.pregunta : ''
  const opciones = Array.isArray(r.opciones) ? r.opciones.map((o) => String(o)) : []
  const correcta = Number(r.correcta)
  if (!enunciado.trim() || opciones.length < 2 || !Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) return null
  const tipo: QuestionType = r.tipo === 'sino' || r.tipo === 'test' ? r.tipo : isSiNo(opciones) ? 'sino' : 'test'
  const q: Question = {
    id: r.id !== undefined && r.id !== null && String(r.id).trim() ? String(r.id) : fallbackId,
    tipo,
    enunciado,
    opciones: tipo === 'test' ? opciones.slice(0, 4) : opciones.slice(0, 2),
    correcta
  }
  if (q.correcta >= q.opciones.length) return null
  if (typeof r.imagen === 'string' && r.imagen.trim()) q.imagen = r.imagen.trim()
  if (typeof r.nota_presentador === 'string' && r.nota_presentador.trim()) q.nota_presentador = r.nota_presentador
  if (typeof r.dificultad === 'number' || typeof r.dificultad === 'string') q.dificultad = r.dificultad
  if (typeof r.fuente === 'string' && r.fuente.trim()) q.fuente = r.fuente
  return q
}

/** Lee un banco en formato nuevo (objeto) o un array (antiguo o nuevo sin envoltorio). */
export function parseBank(json: unknown, fallbackName: string): Bank {
  const list = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray((json as Bank).preguntas) ? (json as Bank).preguntas : null
  if (!list) throw new Error('No es un banco de preguntas (falta la lista "preguntas")')
  const nombre = !Array.isArray(json) && typeof (json as Bank).nombre === 'string' ? (json as Bank).nombre : fallbackName
  const seen = new Set<string>()
  const preguntas: Question[] = []
  list.forEach((raw, i) => {
    const q = normalizeQuestion(raw, String(i + 1))
    if (!q) return
    let id = q.id
    while (seen.has(id)) id = `${q.id}-${i + 1}`
    seen.add(id)
    preguntas.push({ ...q, id })
  })
  return { formato: 'konkursox-banco', version: 1, nombre, preguntas }
}

/**
 * Convierte el formato antiguo [{pregunta, opciones[], correcta, id?}] al nuevo.
 * `images` son los nombres de archivo disponibles: si el nombre (sin extensión) aparece en el enunciado, se asocia.
 */
export function convertLegacy(json: unknown, nombre: string, forceType?: QuestionType, images: string[] = []): Bank {
  const bank = parseBank(Array.isArray(json) ? json : [], nombre)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  for (const q of bank.preguntas) {
    if (forceType === 'sino' && q.opciones.length === 2) q.tipo = 'sino'
    if (!q.imagen) {
      const hit = images.find((img) => {
        const base = norm(img.replace(/\.[^.]+$/, '')).trim()
        return base.length > 2 && norm(q.enunciado).includes(base)
      })
      if (hit) q.imagen = hit
    }
  }
  return bank
}
