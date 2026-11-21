// Formato unificado del banco de preguntas + conversión del formato antiguo (legacy).

/** Tipos de pregunta. */
export type QuestionType = 'test' | 'sino' | 'quien' | 'estimacion' | 'rosco'
export const QUESTION_TYPES: QuestionType[] = ['test', 'sino', 'quien', 'estimacion', 'rosco']
export const TYPE_LABEL: Record<QuestionType, string> = {
  test: 'Test',
  sino: 'Sí o No',
  quien: '¿Quién lo dijo?',
  estimacion: 'Estimación',
  rosco: 'Rosco'
}

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
  /** origen de la pregunta; en "quién lo dijo", dónde se dijo la frase (p. ej. "Chat del grupo") */
  fuente?: string

  // ---- ¿Quién lo dijo? (enunciado = la frase; correcta = índice del autor en opciones)
  autor?: string
  fecha?: string
  hora?: string

  // ---- Estimación
  valor?: number
  unidad?: string

  // ---- Rosco (enunciado = la definición)
  letra?: string
  modo?: 'empieza' | 'contiene'
  respuesta?: string
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
  tipos: QuestionType[]
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

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined)

/** Número escrito como 21196, "21.196", "21196,5"... */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let t = v.trim().replace(/s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/./g, '').replace(',', '.')
  else if (/^-?d{1,3}(.d{3})+$/.test(t)) t = t.replace(/./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const ROSCO_ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('')

/** Valida/normaliza una pregunta (formato de archivo o interno). Devuelve null si no es utilizable. */
export function normalizeQuestion(raw: unknown, fallbackId: string): Question | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = r.id !== undefined && r.id !== null && String(r.id).trim() ? String(r.id) : fallbackId
  const common: Partial<Question> = {}
  if (str(r.imagen)) common.imagen = str(r.imagen)
  if (str(r.nota_presentador)) common.nota_presentador = str(r.nota_presentador)
  if (typeof r.dificultad === 'number' || typeof r.dificultad === 'string') common.dificultad = r.dificultad
  if (str(r.fuente)) common.fuente = str(r.fuente)
  const tipoRaw = typeof r.tipo === 'string' ? r.tipo : ''

  if (tipoRaw === 'rosco' || (r.letra !== undefined && r.definicion !== undefined)) {
    const letra = (str(r.letra) ?? '').toUpperCase().slice(0, 1)
    const definicion = str(r.definicion) ?? str(r.enunciado)
    const respuesta = str(r.respuesta)
    if (!letra || !ROSCO_ALPHABET.includes(letra) || !definicion || !respuesta) return null
    const modo = r.modo === 'contiene' ? 'contiene' : 'empieza'
    return { ...common, id, tipo: 'rosco', enunciado: definicion, opciones: [], correcta: -1, letra, modo, respuesta }
  }

  if (tipoRaw === 'estimacion') {
    const enunciado = str(r.enunciado) ?? str(r.pregunta)
    const valor = parseNumber(r.valor ?? r.respuesta)
    if (!enunciado || valor === null) return null
    return { ...common, id, tipo: 'estimacion', enunciado, opciones: [], correcta: -1, valor, unidad: str(r.unidad) ?? '' }
  }

  if (tipoRaw === 'quien') {
    const frase = str(r.frase) ?? str(r.enunciado)
    const autor = str(r.autor)
    if (!frase || !autor) return null
    const opciones = Array.isArray(r.opciones) ? r.opciones.map((o) => String(o).trim()).filter(Boolean) : []
    const q: Question = { ...common, id, tipo: 'quien', enunciado: frase, opciones, correcta: opciones.findIndex((o) => o.toLowerCase() === autor.toLowerCase()), autor }
    if (str(r.fecha)) q.fecha = str(r.fecha)
    if (str(r.hora)) q.hora = str(r.hora)
    return q
  }

  const enunciado = str(r.enunciado) ?? str(r.pregunta) ?? ''
  const opciones = Array.isArray(r.opciones) ? r.opciones.map((o) => String(o)) : []
  const correcta = Number(r.correcta)
  if (!enunciado || opciones.length < 2 || !Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) return null
  const tipo: QuestionType = tipoRaw === 'sino' || tipoRaw === 'test' ? tipoRaw : isSiNo(opciones) ? 'sino' : 'test'
  const q: Question = {
    ...common,
    id,
    tipo,
    enunciado,
    opciones: tipo === 'test' ? opciones.slice(0, 4) : opciones.slice(0, 2),
    correcta
  }
  if (q.correcta >= q.opciones.length) return null
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
