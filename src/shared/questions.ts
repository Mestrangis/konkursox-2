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

export type Dificultad = 'facil' | 'media' | 'dificil'
export const DIFICULTADES: Dificultad[] = ['facil', 'media', 'dificil']
export const DIF_LABEL: Record<Dificultad, string> = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' }

/** Fácil / media / difícil a partir de lo que venga (texto en español o inglés, o 1-3). */
export function normDificultad(v: unknown): Dificultad | undefined {
  if (typeof v === 'number') return v <= 1 ? 'facil' : v === 2 ? 'media' : 'dificil'
  if (typeof v !== 'string') return undefined
  const t = v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/^(facil|easy|f|1|baja|basica)$/.test(t)) return 'facil'
  if (/^(media|medio|medium|normal|m|2|intermedia)$/.test(t)) return 'media'
  if (/^(dificil|hard|d|3|alta|experta?)$/.test(t)) return 'dificil'
  return undefined
}

export interface Question {
  id: string
  tipo: QuestionType
  enunciado: string
  opciones: string[]
  /** índice de la opción correcta */
  correcta: number
  /** imagen que sale con la pregunta (pista): archivo dentro de Documentos\KONKURSOX\preguntas\imagenes\ */
  imagen?: string
  /** "auto" (por defecto): sale sola después del texto; "manual": solo cuando la muestras */
  imagen_modo?: 'auto' | 'manual'
  /** imagen que sale al revelar (explicación, o si destripa la respuesta) */
  imagen_respuesta?: string
  /** descripción de la imagen que falta (p. ej. "Morgana (Persona 5)") */
  imagen_sugerida?: string
  imagen_respuesta_sugerida?: string
  /** contexto que solo ve el presentador */
  nota_presentador?: string
  dificultad?: Dificultad
  etiquetas?: string[]
  /** importada o creada y aún no revisada (botón "Revisada") */
  sin_revisar?: boolean
  /** copia de otra pregunta (partida mezclada): al usarla se marca también la original */
  origen?: { ref: string; id: string }
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

  /** fecha (ISO) en que se usó en un programa; sin valor = sin usar */
  usada?: string
}

export interface Bank {
  formato: 'konkursox-banco'
  version: 1
  nombre: string
  /** grupo en la navegación de la biblioteca (p. ej. "Open Trivia DB") */
  grupo?: string
  /** banco generado por "Partida mezclada" (se rehace cada vez) */
  mezcla?: boolean
  /** texto de licencia o atribución del banco */
  licencia?: string
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

const isSiNo = (ops: string[]) => ops.length === 2 && /^s[ií]$/i.test(ops[0].trim()) && /^no$/i.test(ops[1].trim())

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined)

/** Número escrito como 21196, "21.196", "21196,5"... */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let t = v.trim().replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const ROSCO_ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('')

/** Campos comunes a todos los tipos (imágenes, etiquetas, dificultad, revisión...). */
function commonFields(r: Record<string, unknown>): Partial<Question> {
  const c: Partial<Question> = {}
  for (const k of ['imagen', 'imagen_respuesta', 'imagen_sugerida', 'imagen_respuesta_sugerida', 'nota_presentador', 'fuente', 'usada'] as const) if (str(r[k])) c[k] = str(r[k])
  if (r.imagen_modo === 'manual') c.imagen_modo = 'manual'
  const d = normDificultad(r.dificultad)
  if (d) c.dificultad = d
  const tags = Array.isArray(r.etiquetas) ? r.etiquetas : typeof r.etiquetas === 'string' ? r.etiquetas.split(/[,;]/) : typeof r.etiqueta === 'string' ? [r.etiqueta] : []
  const etiquetas = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))]
  if (etiquetas.length) c.etiquetas = etiquetas
  if (r.sin_revisar === true) c.sin_revisar = true
  const o = r.origen as { ref?: unknown; id?: unknown } | undefined
  if (o && typeof o.ref === 'string' && o.id !== undefined) c.origen = { ref: o.ref, id: String(o.id) }
  return c
}

/** ¿Le falta alguna imagen que tiene sugerida? */
export const missingImage = (q: Question): boolean => (!!q.imagen_sugerida && !q.imagen) || (!!q.imagen_respuesta_sugerida && !q.imagen_respuesta)

/** Texto normalizado para comparar preguntas (duplicados). */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

/** Valida/normaliza una pregunta (formato de archivo o interno). Devuelve null si no es utilizable. */
export function normalizeQuestion(raw: unknown, fallbackId: string): Question | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = r.id !== undefined && r.id !== null && String(r.id).trim() ? String(r.id) : fallbackId
  const common: Partial<Question> = commonFields(r)
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

/**
 * Pregunta a medio escribir (borrador del editor): se guarda tal cual para no perderla,
 * pero los juegos solo usan las completas (isPlayable).
 */
export function draftQuestion(raw: unknown, fallbackId: string): Question | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const tipo = typeof r.tipo === 'string' && (QUESTION_TYPES as string[]).includes(r.tipo) ? (r.tipo as QuestionType) : null
  if (!tipo) return null
  const id = r.id !== undefined && r.id !== null && String(r.id).trim() ? String(r.id) : fallbackId
  const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
  const base: Question = { id, tipo, enunciado: '', opciones: [], correcta: -1, ...commonFields(r) }
  for (const k of ['fecha', 'hora'] as const) if (text(r[k])) base[k] = text(r[k])
  switch (tipo) {
    case 'rosco': {
      const letra = text(r.letra).toUpperCase().slice(0, 1)
      if (!ROSCO_ALPHABET.includes(letra)) return null
      return { ...base, letra, modo: r.modo === 'contiene' ? 'contiene' : 'empieza', enunciado: text(r.definicion ?? r.enunciado), respuesta: text(r.respuesta) }
    }
    case 'estimacion': {
      const v = parseNumber(r.valor ?? r.respuesta)
      return { ...base, enunciado: text(r.enunciado), unidad: text(r.unidad), ...(v === null ? {} : { valor: v }) }
    }
    case 'quien': {
      const opciones = Array.isArray(r.opciones) ? r.opciones.map((o) => String(o)) : []
      const autor = text(r.autor)
      return { ...base, enunciado: text(r.frase ?? r.enunciado), autor, opciones, correcta: opciones.findIndex((o) => o.trim().toLowerCase() === autor.trim().toLowerCase()) }
    }
    default: {
      const opciones = Array.isArray(r.opciones) ? r.opciones.map((o) => String(o)) : tipo === 'sino' ? ['Sí', 'No'] : []
      const c = Number(r.correcta)
      return { ...base, enunciado: text(r.enunciado ?? r.pregunta), opciones, correcta: Number.isInteger(c) && c >= 0 && c < opciones.length ? c : 0 }
    }
  }
}

/** ¿Está la pregunta completa para jugarla? */
export function isPlayable(q: Question): boolean {
  switch (q.tipo) {
    case 'rosco':
      return !!q.enunciado.trim() && !!q.respuesta?.trim()
    case 'estimacion':
      return !!q.enunciado.trim() && typeof q.valor === 'number' && Number.isFinite(q.valor)
    case 'quien':
      return !!q.enunciado.trim() && !!q.autor?.trim()
    default: {
      const filled = q.opciones.filter((o) => o.trim()).length
      return !!q.enunciado.trim() && filled >= 2 && q.correcta >= 0 && q.correcta < q.opciones.length && !!q.opciones[q.correcta]?.trim()
    }
  }
}

/** Lee un banco en formato nuevo (objeto) o un array (antiguo o nuevo sin envoltorio). Con `lenient`, conserva borradores. */
export function parseBank(json: unknown, fallbackName: string, lenient = false): Bank {
  const list = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray((json as Bank).preguntas) ? (json as Bank).preguntas : null
  if (!list) throw new Error('No es un banco de preguntas (falta la lista "preguntas")')
  const obj = !Array.isArray(json) ? (json as Partial<Bank>) : {}
  const nombre = typeof obj.nombre === 'string' ? obj.nombre : fallbackName
  const seen = new Set<string>()
  const preguntas: Question[] = []
  list.forEach((raw, i) => {
    const q = normalizeQuestion(raw, String(i + 1)) ?? (lenient ? draftQuestion(raw, String(i + 1)) : null)
    if (!q) return
    let id = q.id
    while (seen.has(id)) id = `${q.id}-${i + 1}`
    seen.add(id)
    preguntas.push({ ...q, id })
  })
  return {
    formato: 'konkursox-banco',
    version: 1,
    nombre,
    ...(typeof obj.grupo === 'string' && obj.grupo.trim() ? { grupo: obj.grupo.trim() } : {}),
    ...(obj.mezcla === true ? { mezcla: true } : {}),
    ...(typeof obj.licencia === 'string' ? { licencia: obj.licencia } : {}),
    preguntas
  }
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
