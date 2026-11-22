// El rosco: 1 concursante o 2 alternándose (cada uno con su rosco y su reloj).
import { ROSCO_ALPHABET, type Question } from './questions'
import { applyDelta, type Target } from './quiz'
import type { GameState } from './types'

export type LetterStatus = 'pend' | 'ok' | 'ko' | 'pasa'

export interface RoscoLetter {
  letra: string
  modo: 'empieza' | 'contiene'
  definicion: string
  respuesta: string
  qid: string
  status: LetterStatus
}

export interface RoscoPlayer {
  target: Target
  letters: RoscoLetter[]
  current: number
  remainingMs: number
  /** marca de tiempo en que se acaba si el reloj corre */
  endsAt: number | null
  done: boolean
  /** se le acabó el tiempo (el turno no pasa solo: espera a "Pasar turno") */
  timeUp?: boolean
}

export interface RoscoState {
  active: boolean
  bankFile: string | null
  /** banco del segundo concursante (cada uno su rosco) */
  bankFile2: string | null
  players: RoscoPlayer[]
  turn: number
  seconds: number
  pointsPerHit: number
  /** bote por completar el rosco sin fallos (0 = sin bote) */
  jackpot: number
  finished: boolean
  awarded: boolean
}

export type RoscoAction =
  | { type: 'roscoConfig'; patch: Partial<Pick<RoscoState, 'bankFile' | 'bankFile2' | 'seconds' | 'pointsPerHit' | 'jackpot'>> }
  | { type: 'roscoStart'; players: { target: Target; letters: RoscoLetter[] }[]; now?: number }
  | { type: 'roscoMark'; result: 'ok' | 'ko' | 'pasa'; now: number }
  | { type: 'roscoClock'; run: boolean; now: number }
  | { type: 'roscoTimeUp'; now: number }
  | { type: 'roscoSetTurn'; turn: number; now: number }
  | { type: 'roscoPassTurn'; now: number }
  | { type: 'roscoUndo'; index: number; status: LetterStatus }
  | { type: 'roscoFinish' }
  | { type: 'roscoStop' }

export function defaultRosco(): RoscoState {
  return { active: false, bankFile: null, bankFile2: null, players: [], turn: 0, seconds: 150, pointsPerHit: 10, jackpot: 0, finished: false, awarded: false }
}

/** Una definición por letra (al azar entre las que haya), evitando las de `exclude`. Letras sin definición se omiten. */
export function buildLetters(questions: Question[], exclude: Set<string> = new Set(), rnd: () => number = Math.random): RoscoLetter[] {
  const out: RoscoLetter[] = []
  for (const letra of ROSCO_ALPHABET) {
    const all = questions.filter((q) => q.tipo === 'rosco' && q.letra === letra)
    const pool = all.filter((q) => !exclude.has(q.id))
    const list = pool.length ? pool : all
    if (!list.length) continue
    const q = list[Math.floor(rnd() * list.length)]
    out.push({ letra, modo: q.modo ?? 'empieza', definicion: q.enunciado, respuesta: q.respuesta ?? '', qid: q.id, status: 'pend' })
  }
  return out
}

/** Siguiente letra pendiente o pasada, en orden circular después de `from`. null si no queda ninguna. */
export function nextLetter(letters: RoscoLetter[], from: number): number | null {
  for (let k = 1; k <= letters.length; k++) {
    const i = (from + k) % letters.length
    if (letters[i].status === 'pend' || letters[i].status === 'pasa') return i
  }
  return null
}

export function roscoStats(p: RoscoPlayer): { ok: number; ko: number; pending: number } {
  let ok = 0
  let ko = 0
  for (const l of p.letters) {
    if (l.status === 'ok') ok++
    else if (l.status === 'ko') ko++
  }
  return { ok, ko, pending: p.letters.length - ok - ko }
}

export function remainingMs(p: RoscoPlayer, now: number): number {
  return p.endsAt !== null ? Math.max(0, p.endsAt - now) : p.remainingMs
}

const pause = (p: RoscoPlayer, now: number): RoscoPlayer => (p.endsAt === null ? p : { ...p, endsAt: null, remainingMs: Math.max(0, p.endsAt - now) })
const run = (p: RoscoPlayer, now: number): RoscoPlayer =>
  p.endsAt !== null || p.done || p.remainingMs <= 0 ? p : { ...p, endsAt: now + p.remainingMs }

/** Tras un cambio, pasa el turno si toca (y arranca el reloj del otro) y detecta el final.
 *  Si al de turno se le acabó el tiempo, el turno NO pasa solo: se espera a "Pasar turno". */
function settle(s: RoscoState, switchTurn: boolean, now: number): RoscoState {
  let players = s.players
  let turn = s.turn
  const other = players.length === 2 ? 1 - turn : -1
  if (other >= 0 && !players[other].done && !players[turn].timeUp && (switchTurn || players[turn].done)) {
    turn = other
    players = players.map((p, i) => (i === turn ? run(p, now) : p))
  }
  const finished = players.length > 0 && players.every((p) => p.done)
  return { ...s, players, turn, finished }
}

/** Acierto, fallo o pasapalabra sobre la letra actual del concursante en turno. */
export function roscoMark(s: RoscoState, result: 'ok' | 'ko' | 'pasa', now: number): RoscoState {
  if (!s.active || s.finished) return s
  const p = s.players[s.turn]
  if (!p || p.done) return s
  const cur = p.letters[p.current]
  if (!cur || (cur.status !== 'pend' && cur.status !== 'pasa')) return s
  const letters = p.letters.map((l, i) => (i === p.current ? { ...l, status: result } : l))
  let np: RoscoPlayer = { ...p, letters }
  if (result !== 'ok') np = pause(np, now)
  const next = nextLetter(letters, p.current)
  if (next === null) np = { ...pause(np, now), done: true }
  else np = { ...np, current: next }
  const players = s.players.map((x, i) => (i === s.turn ? np : x))
  return settle({ ...s, players }, result !== 'ok', now)
}

/** Se acaba el tiempo del concursante en turno. */
export function roscoTimeUp(s: RoscoState, now: number): RoscoState {
  if (!s.active || s.finished) return s
  const p = s.players[s.turn]
  if (!p || p.endsAt === null || p.endsAt > now) return s
  const players = s.players.map((x, i) => (i === s.turn ? { ...x, endsAt: null, remainingMs: 0, done: true, timeUp: true } : x))
  return settle({ ...s, players }, false, now)
}

/** "Pasar turno": el otro concursante juega y arranca su reloj (tras acabarse el tiempo, por ejemplo). */
export function roscoPassTurn(s: RoscoState, now: number): RoscoState {
  if (!s.active || s.finished || s.players.length !== 2) return s
  const other = 1 - s.turn
  if (s.players[other].done) return s
  const players = s.players.map((p, i) => (i === other ? run(p, now) : pause(p, now)))
  return { ...s, players, turn: other }
}

/** El concursante en turno está parado esperando a que pulses "Pasar turno". */
export const roscoWaiting = (s: RoscoState): boolean =>
  s.active && !s.finished && s.players.length === 2 && !!s.players[s.turn]?.timeUp && !s.players[1 - s.turn].done

/** Ganador(es): más aciertos; a igualdad, menos fallos. */
export function roscoWinners(s: RoscoState): number[] {
  if (!s.players.length) return []
  const stats = s.players.map(roscoStats)
  const best = stats.reduce((b, x) => (x.ok > b.ok || (x.ok === b.ok && x.ko < b.ko) ? x : b))
  return stats.map((x, i) => (x.ok === best.ok && x.ko === best.ko ? i : -1)).filter((i) => i >= 0)
}

/** Puntos de cada concursante: aciertos x puntos + bote si completa el rosco sin fallos. */
export function roscoPoints(s: RoscoState): number[] {
  return s.players.map((p) => {
    const st = roscoStats(p)
    const full = p.letters.length > 0 && st.ok === p.letters.length
    return st.ok * s.pointsPerHit + (full && s.jackpot > 0 ? s.jackpot : 0)
  })
}

function award(g: GameState): GameState {
  const r = g.rosco
  if (!r.finished || r.awarded) return g
  const pts = roscoPoints(r)
  let next = g
  r.players.forEach((p, i) => (next = applyDelta(next, p.target, pts[i])))
  return { ...next, rosco: { ...next.rosco, awarded: true } }
}

export function applyRoscoAction(g: GameState, a: RoscoAction): GameState {
  const r = g.rosco
  const set = (rosco: RoscoState) => award({ ...g, rosco })
  switch (a.type) {
    case 'roscoConfig':
      return { ...g, rosco: { ...r, ...a.patch } }
    case 'roscoStart': {
      const players: RoscoPlayer[] = a.players
        .filter((p) => p.letters.length)
        .slice(0, 2)
        .map((p) => ({ target: p.target, letters: p.letters, current: 0, remainingMs: r.seconds * 1000, endsAt: null, done: false }))
      if (!players.length) return g
      // arranca el reloj del primero
      players[0] = run(players[0], a.now ?? Date.now())
      return { ...g, rosco: { ...r, active: true, players, turn: 0, finished: false, awarded: false } }
    }
    case 'roscoMark':
      return set(roscoMark(r, a.result, a.now))
    case 'roscoClock': {
      if (!r.active || r.finished) return g
      const players = r.players.map((p, i) => (i === r.turn ? (a.run ? run(p, a.now) : pause(p, a.now)) : p))
      return { ...g, rosco: { ...r, players } }
    }
    case 'roscoTimeUp':
      return set(roscoTimeUp(r, a.now))
    case 'roscoPassTurn':
      return { ...g, rosco: roscoPassTurn(r, a.now) }
    case 'roscoSetTurn': {
      if (!r.players[a.turn] || r.players[a.turn].done) return g
      const players = r.players.map((p) => pause(p, a.now))
      return { ...g, rosco: { ...r, players, turn: a.turn } }
    }
    case 'roscoUndo': {
      // corrige el estado de una letra del concursante en turno (por si te equivocas de tecla)
      const p = r.players[r.turn]
      if (!p || !p.letters[a.index] || r.awarded) return g
      const letters = p.letters.map((l, i) => (i === a.index ? { ...l, status: a.status } : l))
      const pending = letters.some((l) => l.status === 'pend' || l.status === 'pasa')
      const np = { ...p, letters, current: a.status === 'pend' || a.status === 'pasa' ? a.index : p.current, done: pending ? p.done && p.remainingMs <= 0 && p.endsAt === null : true }
      const players = r.players.map((x, i) => (i === r.turn ? np : x))
      return { ...g, rosco: { ...r, players, finished: players.every((x) => x.done) } }
    }
    case 'roscoFinish': {
      if (!r.active) return g
      const players = r.players.map((p) => ({ ...p, endsAt: null, done: true }))
      return set({ ...r, players, finished: true })
    }
    case 'roscoStop':
      return { ...g, rosco: { ...r, active: false } }
    default:
      return g
  }
}
