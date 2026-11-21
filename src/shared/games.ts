// Lógica pura de estimación, "quién lo dijo" y clasificación final.
import type { Question } from './questions'

// ---------------------------------------------------------------- estimación

export interface EstimationRow {
  key: string
  value: number
  diff: number
  /** se pasa de la respuesta */
  over: boolean
  /** cuenta para ganar (en "precio justo" quien se pasa queda fuera) */
  valid: boolean
  /** puesto por cercanía (empates comparten puesto); null si no cuenta */
  rank: number | null
}

export interface EstimationResult {
  rows: EstimationRow[]
  winners: string[]
}

export interface EstimationConfig {
  /** gana el más cercano sin pasarse */
  priceIsRight: boolean
  /** solo el más cercano puntúa, o puntos escalonados por puesto */
  mode: 'closest' | 'ranked'
  /** puntos por puesto en modo escalonado (1º, 2º, 3º...) */
  ranked: number[]
}

const EPS = 1e-9

/** Ordena por cercanía con puestos de competición (1, 1, 3...). */
export function estimationResult(answer: number, guesses: { key: string; value: number }[], priceIsRight: boolean): EstimationResult {
  const rows: EstimationRow[] = guesses.map((g) => {
    const over = g.value > answer + EPS
    return { key: g.key, value: g.value, diff: Math.abs(g.value - answer), over, valid: !(priceIsRight && over), rank: null }
  })
  const valid = rows.filter((r) => r.valid).sort((a, b) => a.diff - b.diff)
  valid.forEach((r, i) => {
    r.rank = i > 0 && Math.abs(r.diff - valid[i - 1].diff) < EPS ? valid[i - 1].rank : i + 1
  })
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.diff - b.diff)
  return { rows, winners: rows.filter((r) => r.rank === 1).map((r) => r.key) }
}

/** Puntos de cada concursante según el resultado. */
export function estimationPoints(res: EstimationResult, cfg: EstimationConfig, pointsCorrect: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of res.rows) {
    if (r.rank === null) out[r.key] = 0
    else if (cfg.mode === 'closest') out[r.key] = r.rank === 1 ? pointsCorrect : 0
    else out[r.key] = cfg.ranked[r.rank - 1] ?? 0
  }
  return out
}

/** Número a la española: 21196.5 -> "21.196,5" (siempre con punto de millar). */
export function formatNumber(n: number, maxDecimals = 2): string {
  const neg = n < 0
  const fixed = Math.abs(n).toFixed(maxDecimals).replace(/\.?0+$/, '')
  const [int, dec] = fixed.split('.')
  return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '')
}

/** Escala "bonita" para la recta: máximo redondeado y paso de las marcas. */
export function niceScale(maxValue: number, ticks = 9): { max: number; step: number } {
  const target = Math.max(maxValue, 1) * 1.08
  const raw = target / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  return { max: Math.ceil(target / step) * step, step }
}

/** Etiqueta corta de una marca de la recta ("5 mil", "2 M", "750"). */
export function tickLabel(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 1e6) return `${formatNumber(v / 1e6, 1)} M`
  if (Math.abs(v) >= 1e4) return `${formatNumber(v / 1e3, 1)} mil`
  return formatNumber(v, 2)
}

// ---------------------------------------------------------------- ¿quién lo dijo?

/** Prepara las opciones (máx. 4, siempre con el autor). Si faltan, salen de la lista de personas del grupo. */
export function quienOptions(q: Question, people: string[], rnd: () => number = Math.random): Question {
  const autor = q.autor ?? ''
  const pick = <T>(arr: T[], n: number): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a.slice(0, n)
  }
  const norm = (s: string) => s.trim().toLowerCase()
  let opciones = q.opciones.filter((o) => o.trim())
  if (opciones.length > 4 || !opciones.some((o) => norm(o) === norm(autor))) {
    const others = opciones.filter((o) => norm(o) !== norm(autor))
    opciones = [autor, ...pick(others, 3)]
  }
  if (opciones.length < 4) {
    const extra = people.filter((p) => !opciones.some((o) => norm(o) === norm(p)))
    opciones = [...opciones, ...pick(extra, 4 - opciones.length)]
  }
  opciones = pick(opciones, opciones.length)
  return { ...q, opciones, correcta: opciones.findIndex((o) => norm(o) === norm(autor)) }
}

// ---------------------------------------------------------------- clasificación final

export interface StandingEntry {
  key: string
  name: string
  score: number
}

export interface Standing extends StandingEntry {
  position: number
}

/** Clasificación con puestos de competición (empates comparten puesto) y ganadores (todos los empatados en cabeza). */
export function finalStandings(entries: StandingEntry[]): { standings: Standing[]; winners: string[] } {
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.score - a.e.score || a.i - b.i)
  const standings: Standing[] = []
  sorted.forEach(({ e }, i) => {
    const position = i > 0 && standings[i - 1].score === e.score ? standings[i - 1].position : i + 1
    standings.push({ ...e, position })
  })
  return { standings, winners: standings.filter((s) => s.position === 1).map((s) => s.key) }
}

export function roman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ]
  let out = ''
  let v = n
  for (const [k, s] of map)
    while (v >= k) {
      out += s
      v -= k
    }
  return out
}

export type Gender = 'm' | 'f' | null

/** "Ganador", "Ganadora", "Ganadores" o "Ganadoras" según quién gane. */
export function winnerWord(genders: Gender[], isTeam: boolean): string {
  if (isTeam) return 'Ganadores'
  if (genders.length <= 1) return genders[0] === 'f' ? 'Ganadora' : 'Ganador'
  return genders.every((g) => g === 'f') ? 'Ganadoras' : 'Ganadores'
}
