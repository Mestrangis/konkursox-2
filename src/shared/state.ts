// Estado inicial + reducer puro. El proceso main es el único que lo ejecuta (fuente única de verdad).
import { sanitizeRel } from './crop'
import { applyQuizAction, defaultQuiz, type QuizAction, type QuizState } from './quiz'
import { applyRoscoAction, defaultRosco, type RoscoAction, type RoscoState } from './rosco'
import { applyShowAction, defaultShow, normalizeSegment, type Person, type ShowAction, type ShowState } from './show'
import { CONTESTANT_IDS, type Action, type GameState } from './types'

export function todayLabel(d = new Date()): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `Programa del ${d.getDate()} de ${months[d.getMonth()]}`
}

export function defaultState(): GameState {
  return {
    view: 'plato',
    layout: 'logo',
    contestants: CONTESTANT_IDS.map((id, i) => ({
      id,
      name: `Concursante ${i + 1}`,
      score: 0,
      team: i < 2 ? 0 : 1,
      gender: null
    })),
    teams: [
      { name: 'Equipo Norte', score: 0 },
      { name: 'Equipo Sur', score: 0 }
    ],
    host: { name: 'Marcos', label: 'Presentador' },
    lowerThird: { visible: true, kicker: 'Presentación', title: 'Los concursantes de esta noche', right: todayLabel() },
    sideInfo: { label1: 'Premio en juego', value1: '1.000.000', label2: 'Pregunta', value2: '1 de 15' },
    cameras: { sourceId: null, sourceName: null, rects: {} },
    plato: { displayId: null, windowed: false, visible: true },
    audio: { dir: null, musicVolume: 0.8, sfxVolume: 0.9, fadeSeconds: 1.5 },
    quiz: defaultQuiz(),
    rosco: defaultRosco(),
    show: defaultShow(),
    people: [],
    runtime: {
      capture: { plato: 'idle', panel: 'idle' },
      update: { state: 'disabled' },
      appVersion: '0.0.0',
      captureEpoch: 0
    }
  }
}

export { contestantOrder } from './order'

const SHOW_ACTIONS = new Set<string>(['showSet', 'showLoad', 'showStart', 'showResetPlayed', 'setPeople', 'setGender'])

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function applyAction(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'setLayout':
      return { ...s, layout: a.layout }
    case 'setContestant':
      return { ...s, contestants: s.contestants.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c)) }
    case 'addScore':
      return { ...s, contestants: s.contestants.map((c) => (c.id === a.id ? { ...c, score: c.score + num(a.delta, 0) } : c)) }
    case 'setScore':
      return { ...s, contestants: s.contestants.map((c) => (c.id === a.id ? { ...c, score: num(a.value, c.score) } : c)) }
    case 'setTeam': {
      const teams = [...s.teams] as GameState['teams']
      teams[a.index] = { ...teams[a.index], ...a.patch }
      return { ...s, teams }
    }
    case 'addTeamScore': {
      const teams = [...s.teams] as GameState['teams']
      teams[a.index] = { ...teams[a.index], score: teams[a.index].score + num(a.delta, 0) }
      return { ...s, teams }
    }
    case 'setTeamScore': {
      const teams = [...s.teams] as GameState['teams']
      teams[a.index] = { ...teams[a.index], score: num(a.value, teams[a.index].score) }
      return { ...s, teams }
    }
    case 'resetScores':
      return {
        ...s,
        contestants: s.contestants.map((c) => ({ ...c, score: 0 })),
        teams: s.teams.map((t) => ({ ...t, score: 0 })) as GameState['teams']
      }
    case 'setHost':
      return { ...s, host: { ...s.host, ...a.patch } }
    case 'setLowerThird':
      return { ...s, lowerThird: { ...s.lowerThird, ...a.patch } }
    case 'setSideInfo':
      return { ...s, sideInfo: { ...s.sideInfo, ...a.patch } }
    case 'setCameraSource':
      return { ...s, cameras: { ...s.cameras, sourceId: a.sourceId, sourceName: a.sourceName } }
    case 'setRect': {
      const rects = { ...s.cameras.rects }
      const r = sanitizeRel(a.rect)
      if (r) rects[a.slot] = r
      else delete rects[a.slot]
      return { ...s, cameras: { ...s.cameras, rects } }
    }
    case 'setPlato':
      return { ...s, plato: { ...s.plato, ...a.patch } }
    case 'setAudio':
      return { ...s, audio: { ...s.audio, ...a.patch } }
    case 'setCaptureHealth':
      return {
        ...s,
        runtime: { ...s.runtime, capture: { ...s.runtime.capture, [a.who]: a.health, error: a.error ?? s.runtime.capture.error } }
      }
    case 'restartCapture':
      return { ...s, runtime: { ...s.runtime, captureEpoch: s.runtime.captureEpoch + 1 } }
    case 'setUpdate':
      return { ...s, runtime: { ...s.runtime, update: a.status } }
    default:
      if (a.type.startsWith('rosco')) return applyRoscoAction(s, a as RoscoAction)
      if (SHOW_ACTIONS.has(a.type)) return applyShowAction(s, a as ShowAction)
      return applyQuizAction(s, a as QuizAction)
  }
}

/** Mezcla lo guardado en disco con los valores por defecto (tolerante a versiones antiguas). */
export function hydrate(saved: unknown): GameState {
  const d = defaultState()
  if (!saved || typeof saved !== 'object') return d
  const s = saved as Partial<GameState>
  const contestants = CONTESTANT_IDS.map((id, i) => {
    const c = Array.isArray(s.contestants) ? s.contestants.find((x) => x && x.id === id) : undefined
    return {
      id,
      name: typeof c?.name === 'string' ? c.name : d.contestants[i].name,
      score: num(c?.score, 0),
      team: c?.team === 1 ? 1 : c?.team === 0 ? 0 : d.contestants[i].team,
      gender: c?.gender === 'm' || c?.gender === 'f' ? c.gender : null
    } as const
  })
  const rects: GameState['cameras']['rects'] = {}
  for (const [k, v] of Object.entries(s.cameras?.rects ?? {})) {
    const r = sanitizeRel(v)
    if (r) rects[k as keyof typeof rects] = r
  }
  return {
    ...d,
    layout: s.layout && ['logo', 'solo', 'duo', 'trio', 'quad', 'teams'].includes(s.layout) ? s.layout : d.layout,
    contestants: [...contestants],
    teams: [0, 1].map((i) => ({
      name: typeof s.teams?.[i]?.name === 'string' ? s.teams[i].name : d.teams[i].name,
      score: num(s.teams?.[i]?.score, 0)
    })) as GameState['teams'],
    host: { ...d.host, ...(s.host ?? {}) },
    lowerThird: { ...d.lowerThird, ...(s.lowerThird ?? {}) },
    sideInfo: { ...d.sideInfo, ...(s.sideInfo ?? {}) },
    cameras: { sourceId: s.cameras?.sourceId ?? null, sourceName: s.cameras?.sourceName ?? null, rects },
    plato: { ...d.plato, ...(s.plato ?? {}) },
    audio: { ...d.audio, ...(s.audio ?? {}) },
    view: s.view && ['quiz', 'result', 'rosco', 'transition', 'final'].includes(s.view) ? s.view : 'plato',
    quiz: hydrateQuiz(s.quiz),
    rosco: hydrateRosco(s.rosco),
    show: hydrateShow(s.show),
    people: Array.isArray(s.people) ? (s.people as Person[]).filter((p) => p && typeof p.name === 'string') : []
  }
}

/** Lo que se guarda en disco (sin runtime). */
export function persistable(s: GameState): Omit<GameState, 'runtime'> {
  const { runtime: _r, ...rest } = s
  return rest
}

function hydrateQuiz(saved: unknown): QuizState {
  const d = defaultQuiz()
  if (!saved || typeof saved !== 'object') return d
  const q = saved as Partial<QuizState>
  const obj = <T>(v: unknown, fb: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fb)
  const ladder = { ...d.ladder, ...obj(q.ladder, {}) }
  if (!Array.isArray(ladder.levels) || !ladder.levels.length) ladder.levels = d.ladder.levels
  ladder.used = { ...d.ladder.used, ...obj(ladder.used, {}) }
  const old = q.current as Partial<QuizState['current']> | null | undefined
  const current = old && typeof old === 'object' && old.question ? ({ mode: 'turn', answers: {}, guesses: {}, revealedAt: null, estimation: null, ...(old as object) } as QuizState['current']) : null
  return {
    ...d,
    bankFile: typeof q.bankFile === 'string' ? q.bankFile : null,
    order: obj(q.order, {}),
    used: obj(q.used, {}),
    current,
    scoring: { ...d.scoring, ...obj(q.scoring, {}) },
    // el temporizador no sigue corriendo tras reiniciar el programa
    timer: { ...d.timer, ...obj(q.timer, {}), endsAt: null, remainingMs: null },
    turn: q.turn ?? null,
    rebound: typeof q.rebound === 'boolean' ? q.rebound : d.rebound,
    autoRotate: typeof q.autoRotate === 'boolean' ? q.autoRotate : d.autoRotate,
    asked: typeof q.asked === 'number' ? q.asked : 0,
    ladder,
    sounds: { ...d.sounds, ...obj(q.sounds, {}) },
    allMode: typeof q.allMode === 'boolean' ? q.allMode : d.allMode,
    estimation: { ...d.estimation, ...obj(q.estimation, {}) }
  }
}

function hydrateRosco(saved: unknown): RoscoState {
  const d = defaultRosco()
  if (!saved || typeof saved !== 'object') return d
  const r = { ...d, ...(saved as Partial<RoscoState>) }
  if (!Array.isArray(r.players)) r.players = []
  // los relojes no siguen corriendo tras reiniciar el programa
  r.players = r.players.map((p) => ({ ...p, endsAt: null }))
  return r
}

function hydrateShow(saved: unknown): ShowState {
  const d = defaultShow()
  if (!saved || typeof saved !== 'object') return d
  const sh = saved as Partial<ShowState>
  return {
    title: typeof sh.title === 'string' ? sh.title : '',
    segments: Array.isArray(sh.segments) ? sh.segments.map(normalizeSegment) : [],
    current: typeof sh.current === 'number' ? sh.current : null,
    played: Array.isArray(sh.played) ? sh.played.filter((x) => typeof x === 'string') : [],
    extraPlayed: typeof sh.extraPlayed === 'number' ? sh.extraPlayed : 0
  }
}
