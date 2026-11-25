// Escenas del plató (lo que está "en el aire"), escena Cámaras, juego en el aire,
// juegos jugados y deshacer. El estado de los juegos vive aparte: cambiar de escena no lo toca.
import type { Corner, HostMode } from './arrange'
import type { Gender } from './games'
import { contestantOrder, playerCount, targetMembers } from './order'
import type { Target } from './quiz'
import type { RoscoState } from './rosco'
import { CONTESTANT_IDS, type Action, type ContestantId, type GameState, type LayoutId, type SlotId } from './types'

export type SceneId = 'cabecera' | 'camaras' | 'juego' | 'marcador' | 'final' | 'multimedia'
export const SCENES: { id: SceneId; key: string; label: string }[] = [
  { id: 'cabecera', key: 'F1', label: 'Cabecera' },
  { id: 'camaras', key: 'F2', label: 'Cámaras' },
  { id: 'juego', key: 'F3', label: 'Juego' },
  { id: 'marcador', key: 'F4', label: 'Marcador' },
  { id: 'final', key: 'F5', label: 'Clasificación' },
  { id: 'multimedia', key: 'F9', label: 'Multimedia' }
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
  /** versión del formato (para reiniciar la fila al actualizar) */
  rev?: number
  /** cómo sale el presentador en Cámaras y Juego */
  hostMode: HostMode
  /** esquina del presentador en modo "esquina" */
  corner: Corner
  /** plantilla fija de la escena Cámaras (null: reparto automático) */
  template: LayoutId | null
  /** último plano de cámaras usado (F2 vuelve a él) */
  camsPlano: CamsPlano
  /** escena Juego sin marcos de cámara (para el salón: todos en la sala) */
  noCam?: boolean
}

/**
 * Plano: un solo concepto. "Juego" es la escena Juego; los otros tres son la escena Cámaras con
 * marcos, con los datos del juego activo o limpias. Ctrl+F1..F4 siempre en este orden.
 */
export type Plano = 'juego' | 'marcos' | 'datos' | 'limpio' | 'sincam'
export type CamsPlano = Exclude<Plano, 'juego' | 'sincam'>
export const PLANOS: { id: Plano; label: string; short: string; key: string }[] = [
  { id: 'juego', label: 'Juego', short: 'Juego', key: 'Ctrl F1' },
  { id: 'marcos', label: 'Cámaras con marcos', short: 'Marcos', key: 'Ctrl F2' },
  { id: 'datos', label: 'Cámaras + datos', short: '+ Datos', key: 'Ctrl F3' },
  { id: 'limpio', label: 'Cámaras limpias', short: 'Limpias', key: 'Ctrl F4' },
  { id: 'sincam', label: 'Sin cámaras', short: 'Sin cámaras', key: 'Ctrl F5' }
]

/** ¿Hay un juego en el aire con algo que enseñar? (sin él no se puede elegir el plano Juego) */
export function hasLiveGame(s: Pick<GameState, 'liveGame' | 'rosco' | 'quiz'>): boolean {
  if (s.liveGame === 'rosco') return s.rosco.players.length > 0
  if (s.liveGame === 'escalera' && s.quiz.ladder.active) return true
  return !!s.quiz.slots[s.liveGame]
}

/** El plano que está en el aire (null si la escena en el aire es otra: cabecera, marcador...). */
export function currentPlano(s: Pick<GameState, 'scene' | 'camsScene'>): Plano | null {
  if (s.scene === 'juego') return s.camsScene.noCam ? 'sincam' : 'juego'
  if (s.scene === 'camaras') return s.camsScene.camsPlano
  return null
}

/** Plano de cámaras distinto del de marcos que pinta el plató ahora (null: la escena tal cual). */
export function activePlano(s: Pick<GameState, 'scene' | 'camsScene'>): 'datos' | 'limpio' | null {
  if (s.scene !== 'camaras') return null
  return s.camsScene.camsPlano === 'marcos' ? null : s.camsScene.camsPlano
}

/** Poner un plano en el aire. */
export function setPlano(s: GameState, plano: Plano): GameState {
  // Juego y Sin cámaras son la escena Juego (con o sin marcos); solo si hay juego en el aire
  if (plano === 'juego' || plano === 'sincam') {
    const camsScene = { ...s.camsScene, noCam: plano === 'sincam' }
    return hasLiveGame(s) ? { ...s, scene: 'juego', camsScene } : { ...s, camsScene }
  }
  return { ...s, scene: 'camaras', camsScene: { ...s.camsScene, camsPlano: plano } }
}

/** La plantilla elegida, si se puede usar con los concursantes que hay. */
export function camsTemplate(s: GameState): LayoutId | null {
  const t = s.camsScene.template
  if (!t || t === 'logo') return null
  if (t === 'teams') return s.layout === 'teams' ? t : null
  const n = { solo: 1, duo: 2, trio: 3, quad: 4 }[t]
  return activeContestants(s).length >= n ? t : null
}

// ---------------------------------------------------------------- multimedia

export interface MediaItem {
  kind: 'image' | 'video' | 'youtube'
  /** imagen/vídeo: URL konk-media://...; YouTube: id del vídeo */
  src: string
  title: string
  thumb?: string
}

export interface MediaState {
  item: MediaItem | null
  /** escena a la que se vuelve al ocultar */
  prevScene: SceneId
  playing: boolean
  /** posición (s) en el instante `since` */
  at: number
  since: number
  volume: number
}

/** Posición actual de reproducción (s). */
export const mediaPosition = (m: MediaState, now: number): number => (m.playing ? m.at + Math.max(0, now - m.since) / 1000 : m.at)

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
  /** volumen propio (0-1, por defecto 1) */
  volume?: number
}

export type SceneAction =
  | { type: 'setScene'; scene: SceneId }
  | { type: 'setLiveGame'; game: GameId; scene?: boolean }
  | { type: 'camsToggle'; slot: SlotId }
  | { type: 'camsPreset'; preset: CamsPreset }
  | { type: 'camsSet'; patch: Partial<Omit<CamsScene, 'on'>> }
  | { type: 'setPlano'; plano: Plano }
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
  | { type: 'mediaShow'; item: MediaItem; now: number }
  | { type: 'mediaHide' }
  | { type: 'mediaPlay'; now: number }
  | { type: 'mediaPause'; now: number }
  | { type: 'mediaSeek'; t: number; now: number }
  | { type: 'mediaVolume'; volume: number }
  | { type: 'mediaReport'; duration?: number; error?: string | null }

export const SCENE_ACTIONS = new Set<string>([
  'setScene',
  'setPlano',
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
  'setFx',
  'mediaShow',
  'mediaHide',
  'mediaPlay',
  'mediaPause',
  'mediaSeek',
  'mediaVolume',
  'mediaReport'
])

export function defaultCams(): CamsScene {
  return { on: { host: false, c1: true, c2: true, c3: true, c4: true, publico: false }, names: true, scores: true, transition: 'fade', preset: null, rev: 2, hostMode: 'igual', corner: 'br', template: null, camsPlano: 'marcos' }
}

/** Botonera de sonidos (Num1..Num9). Juego de sonidos propio de la app (kx-*.wav). */
export const DEFAULT_FX: FxSlot[] = [
  { label: 'Acierto', file: 'kx-acierto.wav' },
  { label: 'Fallo', file: 'kx-fallo.wav' },
  { label: 'Golpe de tensión', file: 'kx-tension.wav' },
  { label: 'Redoble', file: 'kx-redoble.wav' },
  { label: 'Aplausos', file: 'kx-aplausos.wav' },
  { label: 'Ooooh', file: 'kx-oooh.wav' },
  { label: 'Risas', file: 'kx-risas.wav' },
  { label: 'Comodín', file: 'kx-comodin.wav' },
  { label: 'Tiempo agotado', file: 'kx-tiempo.wav' }
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
  const on = { host: true, c1: false, c2: false, c3: false, c4: false, publico: false } as Record<SlotId, boolean>
  if (preset === 'todos') for (const id of active) on[id] = true
  if (preset === 'turno') for (const id of targetMembers(s, currentTurn(s))) on[id] = true
  // la cámara del público se queda como estuviera
  on.publico = !!s.camsScene.on.publico
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
      // preajuste de la fila "quién sale": en Juego se queda en Juego; si no, pone la escena Cámaras
      return { ...s, scene: s.scene === 'juego' || s.scene === 'camaras' ? s.scene : 'camaras', camsScene: { ...s.camsScene, on: camsFor(s, a.preset), preset: a.preset } }
    case 'mediaShow': {
      // volver a mostrar lo mismo (F9 o "Mostrar") lo deja donde estaba
      if (s.media.item?.src === a.item.src && s.media.item.kind === a.item.kind)
        return { ...s, scene: 'multimedia', media: { ...s.media, item: a.item, prevScene: s.scene === 'multimedia' ? s.media.prevScene : s.scene } }
      return {
        ...s,
        scene: 'multimedia',
        media: {
          ...s.media,
          item: a.item,
          prevScene: s.scene === 'multimedia' ? s.media.prevScene : s.scene,
          playing: a.item.kind !== 'image',
          at: 0,
          since: a.now
        },
        runtime: { ...s.runtime, media: { duration: 0, error: null } }
      }
    }
    case 'mediaHide':
      return s.scene === 'multimedia' ? { ...s, scene: s.media.prevScene === 'multimedia' ? 'cabecera' : s.media.prevScene, media: { ...s.media, playing: false, at: mediaPosition(s.media, Date.now()) } } : s
    case 'mediaPlay':
      return s.media.playing ? s : { ...s, media: { ...s.media, playing: true, since: a.now } }
    case 'mediaPause':
      return s.media.playing ? { ...s, media: { ...s.media, playing: false, at: mediaPosition(s.media, a.now), since: a.now } } : s
    case 'mediaSeek':
      return { ...s, media: { ...s.media, at: Math.max(0, a.t), since: a.now } }
    case 'mediaVolume':
      return { ...s, media: { ...s.media, volume: Math.max(0, Math.min(1, a.volume)) } }
    case 'mediaReport':
      return {
        ...s,
        runtime: {
          ...s.runtime,
          media: { duration: a.duration ?? s.runtime.media.duration, error: a.error === undefined ? s.runtime.media.error : a.error }
        }
      }
    case 'setPlano':
      return setPlano(s, a.plano)
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
/** La cámara "Público" se puede sacar si está calibrada. */
export const hasPublico = (s: GameState): boolean => !!s.cameras.rects.publico

export function camsLineup(s: GameState): SlotId[] {
  const cs = activeContestants(s).filter((id) => s.camsScene.on[id])
  const pub: SlotId[] = s.camsScene.on.publico && hasPublico(s) ? ['publico'] : []
  if (!s.camsScene.on.host) return [...cs, ...pub]
  if (cs.length === 0) return ['host', ...pub]
  if (cs.length === 1) return [cs[0], 'host', ...pub]
  const mid = Math.floor(cs.length / 2)
  return [...cs.slice(0, mid), 'host', ...cs.slice(mid), ...pub]
}

export const newId = (): string => Math.random().toString(36).slice(2, 10)
