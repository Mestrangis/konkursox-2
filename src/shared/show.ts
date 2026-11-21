// Escaleta del programa (lista ordenada de pruebas), personas del grupo y marcador final.
import { contestantOrder, playerCount } from './order'
import type { EstimationConfig, Gender } from './games'
import type { GameState } from './types'

export type GameKind = 'test' | 'sino' | 'quien' | 'estimacion' | 'rosco' | 'escalera' | 'libre'

export const GAME_KINDS: { id: GameKind; label: string }[] = [
  { id: 'test', label: 'Pregunta tipo test' },
  { id: 'sino', label: 'Sí o No' },
  { id: 'quien', label: '¿Quién lo dijo?' },
  { id: 'estimacion', label: 'Estimación' },
  { id: 'rosco', label: 'El rosco' },
  { id: 'escalera', label: 'Escalera de premios' },
  { id: 'libre', label: 'Libre (sin juego)' }
]
export const gameLabel = (k: GameKind): string => GAME_KINDS.find((g) => g.id === k)?.label ?? k

export interface SegmentConfig {
  mode: 'turn' | 'all'
  pointsCorrect: number
  penalize: boolean
  pointsWrong: number
  /** 0 = sin temporizador */
  timerSeconds: number
  rebound: boolean
  priceIsRight: boolean
  estimationMode: 'closest' | 'ranked'
  ranked: number[]
  roscoSeconds: number
  roscoPoints: number
  jackpot: number
  /** pista de audio\musica\ para el rótulo de transición (null = efecto "transición") */
  music: string | null
}

export interface Segment {
  id: string
  name: string
  game: GameKind
  bankFile: string | null
  config: SegmentConfig
}

export interface ShowState {
  title: string
  segments: Segment[]
  /** índice de la prueba en curso */
  current: number | null
  /** ids de las pruebas ya jugadas */
  played: string[]
  /** pruebas jugadas sueltas (sin escaleta) que se suman al marcador final */
  extraPlayed: number
}

export interface Person {
  id: string
  name: string
  /** archivo dentro de Documentos\KONKURSOX\personas\ */
  photo?: string
}

export type ShowAction =
  | { type: 'showSet'; patch: Partial<Pick<ShowState, 'title' | 'segments' | 'extraPlayed'>> }
  | { type: 'showLoad'; show: Pick<ShowState, 'title' | 'segments'> }
  | { type: 'showStart'; index: number }
  | { type: 'showResetPlayed' }
  | { type: 'setPeople'; people: Person[] }
  | { type: 'setGender'; id: string; gender: Gender }

export function defaultConfig(): SegmentConfig {
  return {
    mode: 'turn',
    pointsCorrect: 10,
    penalize: false,
    pointsWrong: 5,
    timerSeconds: 0,
    rebound: true,
    priceIsRight: false,
    estimationMode: 'closest',
    ranked: [10, 6, 3, 1],
    roscoSeconds: 150,
    roscoPoints: 10,
    jackpot: 0,
    music: null
  }
}

export function defaultShow(): ShowState {
  return { title: '', segments: [], current: null, played: [], extraPlayed: 0 }
}

export const newId = (): string => Math.random().toString(36).slice(2, 10)

/** Rellena valores que falten (escaletas guardadas con versiones anteriores). */
export function normalizeSegment(raw: Partial<Segment>): Segment {
  const game = (raw.game && ['test', 'sino', 'quien', 'estimacion', 'rosco', 'escalera', 'libre'].includes(raw.game) ? raw.game : 'test') as GameKind
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name : gameLabel(game),
    game,
    bankFile: typeof raw.bankFile === 'string' ? raw.bankFile : null,
    config: { ...defaultConfig(), ...(raw.config ?? {}) }
  }
}

export const playedCount = (s: GameState): number => s.show.played.length + s.show.extraPlayed

/** Concursantes que juegan (para el marcador final). */
export function activePlayers(s: GameState): number {
  return s.layout === 'teams' ? 4 : playerCount(s.layout)
}

export const estimationOf = (c: SegmentConfig): EstimationConfig => ({ priceIsRight: c.priceIsRight, mode: c.estimationMode, ranked: c.ranked })

export function applyShowAction(s: GameState, a: ShowAction): GameState {
  const show = s.show
  switch (a.type) {
    case 'showSet':
      return { ...s, show: { ...show, ...a.patch, segments: a.patch.segments ? a.patch.segments.map(normalizeSegment) : show.segments } }
    case 'showLoad':
      return { ...s, show: { ...show, title: a.show.title ?? '', segments: (a.show.segments ?? []).map(normalizeSegment), current: null, played: [] } }
    case 'showResetPlayed':
      return { ...s, show: { ...show, played: [], current: null, extraPlayed: 0 } }
    case 'showStart': {
      const seg = show.segments[a.index]
      if (!seg) return s
      const c = seg.config
      const n = show.segments.length
      const quiz = s.quiz
      const usesBank = ['test', 'sino', 'quien', 'estimacion', 'escalera'].includes(seg.game)
      return {
        ...s,
        view: 'transition',
        lowerThird: { ...s.lowerThird, kicker: `Prueba ${a.index + 1}`, title: seg.name, right: `Prueba ${a.index + 1} de ${n}` },
        show: { ...show, current: a.index, played: show.played.includes(seg.id) ? show.played : [...show.played, seg.id] },
        quiz: {
          ...quiz,
          bankFile: usesBank && seg.bankFile ? seg.bankFile : quiz.bankFile,
          scoring: { ...quiz.scoring, pointsCorrect: c.pointsCorrect, penalize: c.penalize, pointsWrong: c.pointsWrong },
          timer: { ...quiz.timer, enabled: c.timerSeconds > 0, seconds: c.timerSeconds > 0 ? c.timerSeconds : quiz.timer.seconds, endsAt: null, remainingMs: null },
          rebound: c.rebound,
          allMode: c.mode === 'all',
          estimation: estimationOf(c),
          current: null
        },
        rosco:
          seg.game === 'rosco'
            ? { ...s.rosco, bankFile: seg.bankFile ?? s.rosco.bankFile, seconds: c.roscoSeconds, pointsPerHit: c.roscoPoints, jackpot: c.jackpot }
            : s.rosco
      }
    }
    case 'setPeople':
      return { ...s, people: a.people.filter((p) => p.name.trim() || p.photo) }
    case 'setGender':
      return { ...s, contestants: s.contestants.map((c) => (c.id === a.id ? { ...c, gender: a.gender } : c)) }
    default:
      return s
  }
}

/** Entradas del marcador final: equipos si la plantilla es de equipos; si no, los concursantes en juego. */
export function scoreboardEntries(s: GameState): { key: string; name: string; score: number }[] {
  if (s.layout === 'teams') return s.teams.map((t, i) => ({ key: `t${i}`, name: t.name, score: t.score }))
  return contestantOrder(s)
    .slice(0, playerCount(s.layout))
    .map((id) => {
      const c = s.contestants.find((x) => x.id === id)!
      return { key: id, name: c.name, score: c.score }
    })
}
