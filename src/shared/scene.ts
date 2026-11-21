// Escenas del plató (lo que está "en el aire"), escena Cámaras, juego en el aire,
// juegos jugados y deshacer. El estado de los juegos vive aparte: cambiar de escena no lo toca.
import type { Gender } from './games'
import { contestantOrder, playerCount, targetMembers } from './order'
import type { Target } from './quiz'
import type { RoscoState } from './rosco'
import { CONTESTANT_IDS, type Action, type ContestantId, type GameState, type SlotId } from './types'

export type SceneId = 'cabecera' | 'camaras' | 'juego' | 'marcador' | 'final'
export const SCENES: { id: SceneId; key: string; label: string }[] = [
  { id: 'cabecera', key: 'F1', label: 'Cabecera' },
  { id: 'camaras', key: 'F2', label: 'Cámaras' },
  { id: 'juego', key: 'F3', label: 'Juego' },
  { id: 'marcador', key: 'F4', label: 'Marcador' },
  { id: 'final', key: 'F5', label: 'Clasificación' }
]

export type GameId = 'test' | 'sino' | 'escalera' | 'estimacion' | 'quien' | 'rosco'
export type QuizGameId = Exclude<GameId, 'rosco'>
export const GAMES: { id: GameId; label: string }[] = [
  { id: 'test', label: 'Tipo test' },
  { id: 'sino', label: 'Sí o no' },
  { id: 'escalera', label: 'Escalera' },
  { id: 'estimacion', label: 'Estimación' },
  { id: 'quien', label: '¿Quién lo dijo?' },
  { id: 'rosco', label: 'Rosco' }
]
export const gameLabel = (g: GameId): string => GAMES.find((x) => x.id === g)?.label ?? g

export type CamsPreset = 'yo' | 'turno' | 'todos'

export interface CamsScene {
  /** quién sale en la escena Cámaras */
  on: Record<SlotId, boolean>
  names: boolean
  scores: boolean
  transition: 'cut' | 'fade'
  preset: CamsPreset | null
}

export interface ShowState {
  /** juegos jugados, en orden (cuenta para el marcador final) */
  played: GameId[]
  /** ajuste manual del número de pruebas jugadas */
  extra: number
}

export interface Person {
  id: string
  name: string
  /** archivo dentro de Documentos\KONKURSOX\personas\ */
  photo?: string
}

export interface FxSlot {
  label: string
  file: string | null
}

export type SceneAction =
  | { type: 'setScene'; scene: SceneId }
  | { type: 'setLiveGame'; game: GameId; scene?: boolean }
  | { type: 'camsToggle'; slot: SlotId }
  | { type: 'camsPreset'; preset: CamsPreset }
  | { type: 'camsSet'; patch: Partial<Omit<CamsScene, 'on'>> }
  | { type: 'markPlayed'; game: GameId }
  | { type: 'playedAdjust'; delta: number }
  | { type: 'playedReset' }
  | { type: 'setPeople'; people: Person[] }
  | { type: 'setGender'; id: ContestantId; gender: Gender }
  | { type: 'setContestantCam'; id: ContestantId | 'host'; cam: SlotId }
  | { type: 'setPlayers'; count: number }
  | { type: 'setFormat'; teams: boolean }
  | { type: 'removeContestant'; id: ContestantId }
  | { type: 'setFx'; index: number; patch: Partial<FxSlot> }
  /** deshacer el último paso de un juego (lo resuelve el store del main) */
  | { type: 'undo'; game: GameId }

export const SCENE_ACTIONS = new Set<string>([
  'setScene',
  'setLiveGame',
  'camsToggle',
  'camsPreset',
  'camsSet',
  'markPlayed',
  'playedAdjust',
  'playedReset',
  'setPeople',
  'setGender',
  'setContestantCam',
  'setPlayers',
  'setFormat',
  'removeContestant',
  'setFx'
])

export function defaultCams(): CamsScene {
  return { on: { host: true, c1: true, c2: false, c3: false, c4: false }, names: true, scores: true, transition: 'fade', preset: 'turno' }
}

export const DEFAULT_FX: FxSlot[] = [
  { label: 'Correcto', file: 'correcto.mp3' },
  { label: 'Error', file: 'error.mp3' },
  { label: 'Tensión', file: 'tension.mp3' },
  { label: 'Redoble', file: null },
  { label: 'Aplausos', file: 'victoria.mp3' },
  { label: 'Pasapalabra', file: 'pregunta.mp3' },
  { label: 'Comodín', file: null },
  { label: 'Tiempo', file: 'reloj.mp3' },
  { label: 'Risas', file: null }
]

/** Número de concursantes en juego (1-4) según la plantilla. */
export const playersInGame = (s: Pick<GameState, 'layout'>): number => playerCount(s.layout)

/** Concursantes visibles, en orden de pantalla. */
export const activeContestants = (s: GameState): ContestantId[] => contestantOrder(s).slice(0, playersInGame(s))

/** Quién tiene el turno ahora mismo en el juego en el aire. */
export function currentTurn(s: GameState): Target | null {
  if (s.liveGame === 'rosco') {
    const p = s.rosco.players[s.rosco.turn]
    return p?.target ?? null
  }
  const cur = s.quiz.slots[s.liveGame]
  if (s.liveGame === 'escalera' && s.quiz.ladder.active) return s.quiz.ladder.target
  return cur?.target ?? s.quiz.turn
}

function camsFor(s: GameState, preset: CamsPreset): Record<SlotId, boolean> {
  const active = new Set<SlotId>(activeContestants(s))
  const on = { host: true, c1: false, c2: false, c3: false, c4: false } as Record<SlotId, boolean>
  if (preset === 'todos') for (const id of active) on[id] = true
  if (preset === 'turno') for (const id of targetMembers(s, currentTurn(s))) on[id] = true
  return on
}

const layoutFor = (teams: boolean, count: number): GameState['layout'] =>
  teams ? 'teams' : (['solo', 'duo', 'trio', 'quad'] as const)[Math.max(1, Math.min(4, count)) - 1]

export function applySceneAction(s: GameState, a: SceneAction): GameState {
  switch (a.type) {
    case 'setScene':
      return { ...s, scene: a.scene }
    case 'setLiveGame':
      return { ...s, liveGame: a.game, scene: a.scene ? 'juego' : s.scene }
    case 'camsToggle':
      return { ...s, camsScene: { ...s.camsScene, on: { ...s.camsScene.on, [a.slot]: !s.camsScene.on[a.slot] }, preset: null } }
    case 'camsPreset':
      return { ...s, scene: 'camaras', camsScene: { ...s.camsScene, on: camsFor(s, a.preset), preset: a.preset } }
    case 'camsSet':
      return { ...s, camsScene: { ...s.camsScene, ...a.patch } }
    case 'markPlayed': {
      const last = s.show.played[s.show.played.length - 1]
      if (last === a.game) return s
      return { ...s, show: { ...s.show, played: [...s.show.played, a.game] } }
    }
    case 'playedAdjust':
      return { ...s, show: { ...s.show, extra: s.show.extra + a.delta } }
    case 'playedReset':
      return { ...s, show: { played: [], extra: 0 } }
    case 'setPeople':
      return { ...s, people: a.people }
    case 'setGender':
      return { ...s, contestants: s.contestants.map((c) => (c.id === a.id ? { ...c, gender: a.gender } : c)) }
    case 'setContestantCam':
      if (a.id === 'host') return { ...s, host: { ...s.host, cam: a.cam } }
      return { ...s, contestants: s.contestants.map((c) => (c.id === a.id ? { ...c, cam: a.cam } : c)) }
    case 'setPlayers':
      return { ...s, layout: layoutFor(s.layout === 'teams' && a.count === 4, a.count) }
    case 'setFormat':
      return { ...s, layout: layoutFor(a.teams, a.teams ? 4 : playersInGame(s)) }
    case 'removeContestant': {
      // los de detrás suben un puesto (con su nombre, puntos y cámara)
      const n = playersInGame(s)
      const idx = CONTESTANT_IDS.indexOf(a.id)
      if (idx < 0 || idx >= n || n <= 1 || s.layout === 'teams') return s
      const data = s.contestants.map(({ id: _id, ...rest }) => rest)
      const moved = [...data.slice(0, idx), ...data.slice(idx + 1), data[idx]]
      const contestants = s.contestants.map((c, i) => ({ ...moved[i], id: c.id, score: i === 3 && idx < 3 ? 0 : moved[i].score }))
      return { ...s, contestants, layout: layoutFor(false, n - 1) }
    }
    case 'setFx': {
      const fx = s.audio.fx.map((f, i) => (i === a.index ? { ...f, ...a.patch } : f))
      return { ...s, audio: { ...s.audio, fx } }
    }
    default:
      return s
  }
}

// ---------------------------------------------------------------- deshacer

/** Lo que guarda un paso de juego para poder deshacerlo. */
export interface Snapshot {
  quiz: GameState['quiz']
  rosco: RoscoState
  contestants: GameState['contestants']
  teams: GameState['teams']
  show: ShowState
}

export const snapshotOf = (s: GameState): Snapshot => ({ quiz: s.quiz, rosco: s.rosco, contestants: s.contestants, teams: s.teams, show: s.show })
/** Restaura el juego (no toca escena, cámaras ni ajustes). */
export const restoreSnapshot = (s: GameState, snap: Snapshot): GameState => ({ ...s, ...snap, quiz: { ...snap.quiz, timer: { ...snap.quiz.timer, endsAt: null } } })

const QUIZ_STEPS = new Set([
  'quizLoad',
  'quizShowQuestion',
  'quizShowNext',
  'quizShowAll',
  'quizHideOptions',
  'quizPick',
  'quizUnpick',
  'quizReveal',
  'quizAward',
  'quizAnswerAll',
  'quizGuess',
  'quizSetMode',
  'quizClear'
])
const LADDER_STEPS = new Set(['ladderStart', 'ladderStop', 'ladderSetLevel', 'ladderSetLifeline', 'ladderWalk', 'ladderShowResult'])
const ROSCO_STEPS = new Set(['roscoStart', 'roscoMark', 'roscoSetTurn', 'roscoUndo', 'roscoFinish', 'roscoTimeUp'])

/** Juego al que pertenece un paso deshacible (null si la acción no es un paso de juego). */
export function undoKey(a: Action, s: GameState): GameId | null {
  if (ROSCO_STEPS.has(a.type)) return 'rosco'
  if (LADDER_STEPS.has(a.type)) return 'escalera'
  if (QUIZ_STEPS.has(a.type)) return ((a as { game?: QuizGameId }).game ?? s.quiz.focus) as GameId
  return null
}

// ---------------------------------------------------------------- marcador final

/** Pruebas jugadas que cuenta el marcador final. */
export const playedCount = (s: GameState): number => Math.max(0, s.show.played.length + s.show.extra)

/** Entradas del marcador: equipos si se juega por equipos; si no, los concursantes en juego. */
export function scoreboardEntries(s: GameState): { key: string; name: string; score: number }[] {
  if (s.layout === 'teams') return s.teams.map((t, i) => ({ key: `t${i}`, name: t.name, score: t.score }))
  return activeContestants(s).map((id) => {
    const c = s.contestants.find((x) => x.id === id)!
    return { key: id, name: c.name, score: c.score }
  })
}

/** Recuadro de cámara que corresponde a una persona (concursante o presentador). */
export function camOf(s: GameState, person: SlotId): SlotId {
  if (person === 'host') return s.host.cam ?? 'host'
  return s.contestants.find((c) => c.id === person)?.cam ?? person
}

/** Personas que salen en la escena Cámaras, en orden: el presentador en medio si hay concursantes a ambos lados. */
export function camsLineup(s: GameState): SlotId[] {
  const cs = activeContestants(s).filter((id) => s.camsScene.on[id])
  if (!s.camsScene.on.host) return cs
  if (cs.length === 0) return ['host']
  if (cs.length === 1) return [cs[0], 'host']
  const mid = Math.floor(cs.length / 2)
  return [...cs.slice(0, mid), 'host', ...cs.slice(mid)]
}

export const newId = (): string => Math.random().toString(36).slice(2, 10)
