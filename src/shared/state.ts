// Estado inicial + reducer puro. El proceso main es el único que lo ejecuta (fuente única de verdad).
import { sanitizeRel } from './crop'
import { applyQuizAction, defaultQuiz, type QuizAction, type QuizState } from './quiz'
import { applyRoscoAction, defaultRosco, type RoscoAction, type RoscoState } from './rosco'
import { applyEffectsAction, defaultEffects, type EffectsAction } from './effects'
import { applySceneAction, DEFAULT_FX, defaultCams, SCENE_ACTIONS, type Person, type SceneAction, type ShowState } from './scene'
import { CONTESTANT_IDS, type Action, type GameState } from './types'

export function todayLabel(d = new Date()): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `Programa del ${d.getDate()} de ${months[d.getMonth()]}`
}

export function defaultState(): GameState {
  return {
    scene: 'cabecera',
    liveGame: 'test',
    camsScene: defaultCams(),
    media: { item: null, prevScene: 'cabecera', playing: false, at: 0, since: 0, volume: 1 },
    layout: 'quad',
    contestants: CONTESTANT_IDS.map((id, i) => ({
      id,
      name: `Concursante ${i + 1}`,
      score: 0,
      team: i < 2 ? 0 : 1,
      gender: null,
      cam: id
    })),
    teams: [
      { name: 'Equipo Norte', score: 0 },
      { name: 'Equipo Sur', score: 0 }
    ],
    host: { name: 'Marcos', label: 'Presentador', cam: 'host' },
    lowerThird: { visible: true, kicker: 'Presentación', title: 'Los concursantes de esta noche', right: todayLabel() },
    sideInfo: { label1: 'Premio en juego', value1: '1.000.000', label2: 'Pregunta', value2: '1 de 15' },
    cameras: { sourceId: null, sourceName: null, rects: {} },
    plato: { displayId: null, windowed: false, visible: true, theme: 'clasico' },
    audio: { dir: null, musicVolume: 0.8, sfxVolume: 0.9, fadeSeconds: 3, loop: true, autoSounds: true, fx: DEFAULT_FX.map((f) => ({ ...f })), soundsRev: 2 },
    quiz: defaultQuiz(),
    rosco: defaultRosco(),
    effects: defaultEffects(),
    show: { played: [], extra: 0 },
    people: [],
    runtime: {
      capture: { plato: 'idle', panel: 'idle' },
      update: { state: 'disabled' },
      appVersion: '0.0.0',
      captureEpoch: 0,
      undo: {},
      media: { duration: 0, error: null }
    }
  }
}

export { contestantOrder } from './order'

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
      if (a.type.startsWith('fxv')) return applyEffectsAction(s, a as EffectsAction)
      if (SCENE_ACTIONS.has(a.type)) return applySceneAction(s, a as SceneAction)
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
      gender: c?.gender === 'm' || c?.gender === 'f' ? c.gender : null,
      cam: isSlot(c?.cam) ? c!.cam : id
    } as const
  })
  const rects: GameState['cameras']['rects'] = {}
  for (const [k, v] of Object.entries(s.cameras?.rects ?? {})) {
    const r = sanitizeRel(v)
    if (r) rects[k as keyof typeof rects] = r
  }
  return {
    ...d,
    layout: s.layout && ['solo', 'duo', 'trio', 'quad', 'teams'].includes(s.layout) ? s.layout : d.layout,
    contestants: [...contestants],
    teams: [0, 1].map((i) => ({
      name: typeof s.teams?.[i]?.name === 'string' ? s.teams[i].name : d.teams[i].name,
      score: num(s.teams?.[i]?.score, 0)
    })) as GameState['teams'],
    host: { ...d.host, ...(s.host ?? {}), cam: isSlot(s.host?.cam) ? s.host!.cam : 'host' },
    lowerThird: { ...d.lowerThird, ...(s.lowerThird ?? {}) },
    sideInfo: { ...d.sideInfo, ...(s.sideInfo ?? {}) },
    cameras: { sourceId: s.cameras?.sourceId ?? null, sourceName: s.cameras?.sourceName ?? null, rects },
    plato: { ...d.plato, ...(s.plato ?? {}) },
    // 0.6.0: el juego de sonidos nuevo (kx-*) se asigna una vez; los de antes siguen en la carpeta para elegirlos
    audio:
      s.audio?.soundsRev === 2
        ? { ...d.audio, ...(s.audio ?? {}), fx: d.audio.fx.map((f, i) => ({ ...f, ...(Array.isArray(s.audio?.fx) ? s.audio!.fx[i] : {}) })) }
        : { ...d.audio, ...(s.audio ?? {}), fx: d.audio.fx.map((f) => ({ ...f })), soundsRev: 2 },
    scene: s.scene && ['cabecera', 'camaras', 'juego', 'marcador', 'final', 'multimedia'].includes(s.scene) ? s.scene : 'cabecera',
    liveGame: s.liveGame && ['test', 'sino', 'escalera', 'estimacion', 'quien', 'rosco'].includes(s.liveGame) ? s.liveGame : 'test',
    // la fila "quién sale" cambió en la 0.4.1: los estados anteriores empiezan con todos los concursantes
    camsScene: s.camsScene?.rev === 2 ? { ...d.camsScene, ...s.camsScene, on: { ...d.camsScene.on, ...s.camsScene.on } } : { ...d.camsScene, transition: s.camsScene?.transition ?? d.camsScene.transition },
    media: { ...d.media, ...(s.media ?? {}), playing: false },
    quiz: hydrateQuiz(s.quiz, s.audio?.soundsRev === 2),
    rosco: hydrateRosco(s.rosco),
    // los efectos activos no sobreviven a un reinicio; los sonidos sí
    effects: { ...defaultEffects(), ...(s.effects && typeof s.effects === 'object' ? (s.effects as object) : {}), on: {}, hit: null },
    show: hydrateShow(s.show),
    people: Array.isArray(s.people) ? (s.people as Person[]).filter((p) => p && typeof p.name === 'string') : []
  }
}

/** Lo que se guarda en disco (sin runtime). */
export function persistable(s: GameState): Omit<GameState, 'runtime'> {
  const { runtime: _r, ...rest } = s
  return rest
}

function hydrateQuiz(saved: unknown, keepSounds = true): QuizState {
  const d = defaultQuiz()
  if (!saved || typeof saved !== 'object') return d
  const q = saved as Partial<QuizState>
  const obj = <T>(v: unknown, fb: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fb)
  const ladder = { ...d.ladder, ...obj(q.ladder, {}) }
  if (!Array.isArray(ladder.levels) || !ladder.levels.length) ladder.levels = d.ladder.levels
  ladder.used = { ...obj(ladder.used, {}) }
  if (!Array.isArray(ladder.plan)) ladder.plan = []
  const old = q.current as Partial<QuizState['current']> | null | undefined
  const fix = (c: unknown) =>
    c && typeof c === 'object' && (c as { question?: unknown }).question
      ? ({ mode: 'turn', answers: {}, guesses: {}, revealedAt: null, estimation: null, ...(c as object) } as QuizState['current'])
      : null
  const current = fix(old)
  const slots: QuizState['slots'] = {}
  for (const [k, v] of Object.entries(obj<Record<string, unknown>>(q.slots, {}))) {
    if (['test', 'sino', 'escalera', 'estimacion', 'quien'].includes(k)) slots[k as keyof QuizState['slots']] = fix(v)
  }
  const focus = q.focus && ['test', 'sino', 'escalera', 'estimacion', 'quien'].includes(q.focus) ? q.focus : 'test'
  return {
    ...d,
    bankFile: typeof q.bankFile === 'string' ? q.bankFile : null,
    order: obj(q.order, {}),
    used: obj(q.used, {}),
    current: slots[focus] ?? current,
    slots,
    focus,
    scoring: { ...d.scoring, ...obj(q.scoring, {}) },
    // el temporizador no sigue corriendo tras reiniciar el programa
    timer: { ...d.timer, ...obj(q.timer, {}), endsAt: null, remainingMs: null },
    turn: q.turn ?? null,
    rebound: typeof q.rebound === 'boolean' ? q.rebound : d.rebound,
    autoRotate: typeof q.autoRotate === 'boolean' ? q.autoRotate : d.autoRotate,
    asked: typeof q.asked === 'number' ? q.asked : 0,
    ladder,
    sounds: keepSounds ? { ...d.sounds, ...obj(q.sounds, {}) } : d.sounds,
    allMode: typeof q.allMode === 'boolean' ? q.allMode : d.allMode,
    estimation: { ...d.estimation, ...obj(q.estimation, {}) },
    lifelines: Array.isArray(q.lifelines) && q.lifelines.length ? q.lifelines.slice(0, 5) : d.lifelines,
    forgiveScores: typeof q.forgiveScores === 'boolean' ? q.forgiveScores : d.forgiveScores,
    soundVolumes: obj(q.soundVolumes, {}),
    bribe: { enabled: !!(q.bribe && q.bribe.enabled), at: null }
  }
}

function hydrateRosco(saved: unknown): RoscoState {
  const d = defaultRosco()
  if (!saved || typeof saved !== 'object') return d
  const r = { ...d, ...(saved as Partial<RoscoState>) }
  if (r.bankFile2 === undefined) r.bankFile2 = null
  if (!Array.isArray(r.players)) r.players = []
  // los relojes no siguen corriendo tras reiniciar el programa
  r.players = r.players.map((p) => ({ ...p, endsAt: null }))
  return r
}

function hydrateShow(saved: unknown): ShowState {
  if (!saved || typeof saved !== 'object') return { played: [], extra: 0 }
  const sh = saved as Partial<ShowState> & { extraPlayed?: number }
  const games = ['test', 'sino', 'escalera', 'estimacion', 'quien', 'rosco']
  // la escaleta antigua guardaba ids de prueba: solo se conserva el número
  const played = Array.isArray(sh.played) ? sh.played.filter((x) => games.includes(x)) : []
  const legacy = Array.isArray(sh.played) ? sh.played.length - played.length : 0
  return { played, extra: (typeof sh.extra === 'number' ? sh.extra : 0) + (typeof sh.extraPlayed === 'number' ? sh.extraPlayed : 0) + legacy }
}

const isSlot = (v: unknown): v is 'c1' | 'c2' | 'c3' | 'c4' | 'host' => typeof v === 'string' && ['c1', 'c2', 'c3', 'c4', 'host'].includes(v)
