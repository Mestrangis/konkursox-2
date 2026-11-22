// Tipos compartidos entre main, preload y renderers.
import type { Gender } from './games'
import type { QuizAction, QuizState } from './quiz'
import type { RoscoAction, RoscoState } from './rosco'
import type { CamsScene, FxSlot, GameId, MediaState, Person, SceneAction, SceneId, ShowState } from './scene'

export type ContestantId = 'c1' | 'c2' | 'c3' | 'c4'
export type SlotId = ContestantId | 'host' | 'publico'
export const CONTESTANT_IDS: ContestantId[] = ['c1', 'c2', 'c3', 'c4']
export const SLOT_IDS: SlotId[] = ['c1', 'c2', 'c3', 'c4', 'host', 'publico']

/** Plantillas de plató disponibles en esta fase. */
export type LayoutId = 'logo' | 'solo' | 'duo' | 'trio' | 'quad' | 'teams'

/** Rectángulo relativo (0..1) respecto a la ventana capturada. */
export interface RelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Contestant {
  id: ContestantId
  name: string
  score: number
  /** 0 = equipo izquierdo, 1 = equipo derecho */
  team: 0 | 1
  /** para decir "ganador" o "ganadora" */
  gender: Gender
  /** recuadro de cámara que le corresponde (por defecto, el suyo) */
  cam: SlotId
}

export interface Team {
  name: string
  score: number
}

export interface LowerThird {
  visible: boolean
  kicker: string
  title: string
  right: string
}

export interface SideInfo {
  label1: string
  value1: string
  label2: string
  value2: string
}

export interface CameraConfig {
  sourceId: string | null
  sourceName: string | null
  rects: Partial<Record<SlotId, RelRect>>
}

export interface PlatoConfig {
  displayId: number | null
  windowed: boolean
  visible: boolean
}

export interface AudioConfig {
  dir: string | null
  musicVolume: number
  sfxVolume: number
  fadeSeconds: number
  /** la música vuelve a empezar al acabar */
  loop: boolean
  /** sonidos automáticos del juego (acierto, fallo...) */
  autoSounds: boolean
  /** botonera de 9 efectos */
  fx: FxSlot[]
}

export type CaptureHealth = 'idle' | 'starting' | 'ok' | 'lost'

export interface UpdateStatus {
  state: 'disabled' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

/** Estado que NO se persiste: lo reportan ventanas / procesos en vivo. */
export interface RuntimeState {
  capture: { plato: CaptureHealth; panel: CaptureHealth; error?: string }
  update: UpdateStatus
  appVersion: string
  /** Se incrementa para forzar que plató y panel reinicien la captura */
  captureEpoch: number
  /** pasos que se pueden deshacer en cada juego */
  undo: Partial<Record<GameId, number>>
  /** lo que informa el plató del vídeo en pantalla */
  media: { duration: number; error: string | null }
}

export interface GameState {
  /** escena en el aire: el plató pinta solo esto */
  scene: SceneId
  /** juego que sale en la escena Juego (indicador AIRE) */
  liveGame: GameId
  /** quién sale y cómo en la escena Cámaras */
  camsScene: CamsScene
  /** escena Multimedia (imagen, vídeo o YouTube) */
  media: MediaState
  layout: LayoutId
  contestants: Contestant[]
  teams: [Team, Team]
  host: { name: string; label: string; cam: SlotId }
  lowerThird: LowerThird
  sideInfo: SideInfo
  cameras: CameraConfig
  plato: PlatoConfig
  audio: AudioConfig
  quiz: QuizState
  rosco: RoscoState
  show: ShowState
  /** personas del grupo (opciones de "quién lo dijo" y juegos futuros) */
  people: Person[]
  runtime: RuntimeState
}

export type Action =
  | { type: 'setLayout'; layout: LayoutId }
  | { type: 'setContestant'; id: ContestantId; patch: Partial<Pick<Contestant, 'name' | 'team'>> }
  | { type: 'addScore'; id: ContestantId; delta: number }
  | { type: 'setScore'; id: ContestantId; value: number }
  | { type: 'setTeam'; index: 0 | 1; patch: Partial<Pick<Team, 'name'>> }
  | { type: 'addTeamScore'; index: 0 | 1; delta: number }
  | { type: 'setTeamScore'; index: 0 | 1; value: number }
  | { type: 'resetScores' }
  | { type: 'setHost'; patch: Partial<GameState['host']> }
  | { type: 'setLowerThird'; patch: Partial<LowerThird> }
  | { type: 'setSideInfo'; patch: Partial<SideInfo> }
  | { type: 'setCameraSource'; sourceId: string | null; sourceName: string | null }
  | { type: 'setRect'; slot: SlotId; rect: RelRect | null }
  | { type: 'setPlato'; patch: Partial<PlatoConfig> }
  | { type: 'setAudio'; patch: Partial<AudioConfig> }
  | { type: 'setCaptureHealth'; who: 'plato' | 'panel'; health: CaptureHealth; error?: string }
  | { type: 'setUpdate'; status: UpdateStatus }
  | { type: 'restartCapture' }
  | QuizAction
  | RoscoAction
  | SceneAction

export interface CaptureSource {
  id: string
  name: string
  thumbnail: string
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
  scaleFactor: number
}

export interface AudioLibrary {
  dir: string
  music: string[]
  sfx: string[]
}
