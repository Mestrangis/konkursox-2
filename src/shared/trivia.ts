// Pack de Trivia (Open Trivia DB traducido): un banco «Trivia» por tipo, con la categoría como etiqueta,
// y otro «Trivia · descartadas» con las que casi nadie sabría aquí. Lógica pura de la migración desde
// las versiones anteriores (v1: un banco por categoría y dificultad; v2: uno por categoría).
import { newQuestionId } from './library'
import { DIFICULTADES, type Bank, type Dificultad, type Question } from './questions'

export const TRIVIA_GROUP = 'Trivia'
export type TriviaTipo = 'test' | 'sino'

/** resources/trivia/pack.json */
export interface TriviaPackMeta {
  version: number
  archivos: Partial<Record<TriviaTipo, { trivia: string; descartadas: string }>>
  /** slug del banco antiguo -> categoría (etiqueta) */
  categorias: Record<string, string>
  /** id de la pregunta -> dificultad que tenía en la versión anterior del pack */
  previa: Record<string, string>
  /** id -> enunciado anterior, en las que se ha corregido el texto */
  cambios: Record<string, string>
}

export interface TriviaPack {
  trivia: Bank
  descartadas: Bank
}

export interface OldTriviaFile {
  file: string
  bank: Bank
}

export interface TriviaMerge {
  trivia: Bank | null
  descartadas: Bank | null
  /** "archivo viejo#id viejo" -> dónde ha quedado la pregunta */
  moved: Map<string, { file: string; id: string }>
}

/** ¿Es un banco de una versión anterior del pack? Devuelve su categoría (y su dificultad en la v1). */
export function oldTriviaBank(file: string, meta: TriviaPackMeta): { cat: string; dif?: Dificultad } | null {
  const m = /^opentdb-(.+)\.json$/.exec(file)
  if (!m) return null
  if (Object.values(meta.archivos).some((a) => a && (a.trivia === file || a.descartadas === file))) return null
  let slug = m[1]
  let dif: Dificultad | undefined
  const d = /-(facil|media|dificil)$/.exec(slug)
  if (!(slug in meta.categorias) && d) {
    slug = slug.slice(0, -d[0].length)
    dif = d[1] as Dificultad
  }
  const cat = meta.categorias[slug]
  return cat ? { cat, ...(dif ? { dif } : {}) } : null
}

/**
 * Junta los bancos antiguos del usuario en los dos nuevos. Manda SU versión de cada pregunta (usada, textos
 * editados, imágenes, notas...); de la nueva solo se toma la dificultad reclasificada (salvo que la cambiara
 * él) y el texto corregido (si no lo había tocado). Las que borró no vuelven y las que añadió van a «Trivia».
 */
export function mergeTrivia(pack: TriviaPack, meta: TriviaPackMeta, old: OldTriviaFile[], files: { trivia: string; descartadas: string }): TriviaMerge {
  const inPack = new Set([...pack.trivia.preguntas, ...pack.descartadas.preguntas].map((q) => q.id))
  const mine = new Map<string, { q: Question; file: string }>()
  const extra: { q: Question; file: string }[] = []
  for (const o of [...old].sort((a, b) => a.file.localeCompare(b.file))) {
    const info = oldTriviaBank(o.file, meta)
    if (!info) continue
    for (const q of o.bank.preguntas) {
      const tags = q.etiquetas ?? []
      const copy: Question = { ...q, etiquetas: tags.includes(info.cat) ? tags : [info.cat, ...tags] }
      if (!copy.dificultad && info.dif) copy.dificultad = info.dif
      if (inPack.has(q.id) && !mine.has(q.id)) mine.set(q.id, { q: copy, file: o.file })
      else extra.push({ q: copy, file: o.file })
    }
  }
  const trivia: Question[] = []
  const descartadas: Question[] = []
  const moved = new Map<string, { file: string; id: string }>()
  const put = (q: Question, out: boolean, from: string, oldId: string) => {
    ;(out ? descartadas : trivia).push(q)
    moved.set(`${from}#${oldId}`, { file: out ? files.descartadas : files.trivia, id: q.id })
  }
  for (const [p, out] of [...pack.trivia.preguntas.map((p) => [p, false] as const), ...pack.descartadas.preguntas.map((p) => [p, true] as const)]) {
    const u = mine.get(p.id)
    if (!u) continue // la borró
    const q = { ...u.q }
    const before = meta.previa[p.id]
    const ownDif = before !== undefined && (u.q.dificultad ?? '') !== before
    if (!ownDif) q.dificultad = p.dificultad
    const oldText = meta.cambios[p.id]
    if (oldText !== undefined && u.q.enunciado === oldText) {
      q.enunciado = p.enunciado
      q.opciones = p.opciones
      q.correcta = p.correcta
    }
    // si le puso él la dificultad, la quiere en juego aunque aquí la descartemos
    put(q, out && !ownDif, u.file, p.id)
  }
  const taken = { formato: 'konkursox-banco' as const, version: 1 as const, nombre: '', preguntas: [...trivia, ...descartadas] }
  for (const { q, file } of extra) {
    const id = taken.preguntas.some((x) => x.id === q.id) ? newQuestionId(taken, 'm') : q.id
    const copy = { ...q, id }
    taken.preguntas.push(copy)
    put(copy, false, file, q.id)
  }
  const bank = (b: Bank, preguntas: Question[]): Bank | null => (preguntas.length ? { ...b, preguntas } : null)
  return { trivia: bank(pack.trivia, trivia), descartadas: bank(pack.descartadas, descartadas), moved }
}

/** Categorías (etiquetas) de un banco de Trivia, en orden alfabético. */
export function triviaCategories(qs: Question[]): string[] {
  return [...new Set(qs.flatMap((q) => q.etiquetas ?? []))].sort((a, b) => a.localeCompare(b, 'es'))
}

export const TRIVIA_DIFS: readonly Dificultad[] = DIFICULTADES

/** archivo del banco «Trivia · descartadas» (no entra en las partidas mezcladas salvo que lo elijas) */
export const TRIVIA_DISCARDED_FILE = 'opentdb-descartadas.json'
