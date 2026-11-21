// Tipos compartidos entre main, preload y renderers.

export type ContestantId = 'c1' | 'c2' | 'c3' | 'c4'
export type SlotId = ContestantId | 'host'
export const CONTESTANT_IDS: ContestantId[] = ['c1', 'c2', 'c3', 'c4']
export const SLOT_IDS: SlotId[] = ['c1', 'c2', 'c3', 'c4', 'host']

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
}

export interface GameState {
  layout: LayoutId
  contestants: Contestant[]
  teams: [Team, Team]
  host: { name: string; label: string }
  lowerThird: LowerThird
  sideInfo: SideInfo
  cameras: CameraConfig
  plato: PlatoConfig
  audio: AudioConfig
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
