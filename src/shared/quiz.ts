// Juegos de preguntas del modo clásico: flujo de pregunta, turnos/rebote, puntuación y escalera.
// Todo puro: lo ejecuta el reducer del proceso main.
import { imageView, toggleImage } from './questionImage'
import { estimationPoints, estimationResult, type EstimationConfig, type EstimationResult } from './games'
import { contestantOrder, playerCount } from './order'
import type { QuizGameId } from './scene'
import type { Question } from './questions'
import type { ContestantId, GameState } from './types'

// ---------------------------------------------------------------- tipos

export type Target = { kind: 'contestant'; id: ContestantId } | { kind: 'team'; index: 0 | 1 }

/** 'ready' = cargada pero aún no se ve en el plató */
/** 'rebound': ha fallado y hay rebote; espera a que pulses "Rebote a X" (la correcta sigue oculta) */
export type Phase = 'ready' | 'question' | 'options' | 'locked' | 'rebound' | 'revealed'

export interface Attempt {
  target: Target | null
  pick: number
  correct: boolean
  delta: number
  awarded: boolean
  /** fallo perdonado por el presentador: "seguir igualmente" (cuenta como acierto) */
  forgiven?: boolean
  /** ya se le dio una segunda oportunidad por este fallo */
  retried?: boolean
}

export interface CurrentQuestion {
  key: string
  bankFile: string
  question: Question
  phase: Phase
  /** opciones visibles (se muestran en orden A, B, C...) */
  shown: number
  /** opciones quitadas por el 50:50 */
  hidden: number[]
  picked: number | null
  target: Target | null
  attempts: Attempt[]
  /** imagen de la pregunta: null = según la pregunta (automática después del texto o manual); true / false = a mano */
  showImage: boolean | null
  /** imagen de la respuesta: null = al revelar; true / false = a mano */
  showAnswerImage?: boolean | null
  /** la imagen que se ve, a pantalla completa en el plató */
  imageFull?: boolean
  /** escalón por el que se juega (solo en escalera) */
  ladderLevel: number | null
  /** a quién pasa la pregunta si pulsas "Rebote a X" */
  reboundTo?: Target | null
  /** 'turn' = responde quien tiene el turno; 'all' = todos responden */
  mode: 'turn' | 'all'
  /** respuestas de cada uno en "todos responden" (clave de targetKey) */
  answers: Record<string, number>
  /** cifras de cada uno en estimación */
  guesses: Record<string, number>
  revealedAt: number | null
  estimation: EstimationResult | null
  /** estimación: enseñar las cifras de cada uno en el plató antes de revelar */
  showGuesses?: boolean
}

export interface Scoring {
  pointsCorrect: number
  penalize: boolean
  pointsWrong: number
  autoAward: boolean
}

export interface TimerState {
  enabled: boolean
  seconds: number
  /** marca de tiempo (ms) en que llega a 0 si está corriendo */
  endsAt: number | null
  /** ms restantes si está en pausa */
  remainingMs: number | null
}

export interface LadderLevel {
  value: number
  safe: boolean
}

export type LifelineId = string
/** fifty: quita dos opciones incorrectas; mark: solo se marca como usado */
export type LifelineKind = 'fifty' | 'mark'
export interface LifelineDef {
  id: string
  name: string
  /** icono propio (clave de LIFELINE_ICONS) o "img:<archivo>" de la carpeta de imágenes */
  icon: string
  kind: LifelineKind
}
export const MAX_LIFELINES = 5
/** Iconos propios para comodines (trazados 24x24, o texto). */
export const LIFELINE_ICONS: Record<string, { label: string; path?: string; text?: string }> = {
  mitad: { label: '50:50', text: '50:50' },
  telefono: {
    label: 'Teléfono',
    path: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z'
  },
  publico: { label: 'Público', path: 'M2 12h4v9H2zM8 4h4v17H8zM14 9h4v12h-4zM20 15h3v6h-3z' },
  cambio: { label: 'Cambio', path: 'M7 6h10.2l-2.6-2.6L16 2l5 5-5 5-1.4-1.4L17.2 8H7zM17 18H6.8l2.6 2.6L8 22l-5-5 5-5 1.4 1.4L6.8 16H17z' },
  bombilla: { label: 'Pista', path: 'M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 19h6v2H9z' },
  estrella: { label: 'Estrella', path: 'M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4-5.7-5 7.5-.7z' },
  reloj: { label: 'Reloj', path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v6l5 3 1-1.7-4-2.3V7z' },
  pregunta: {
    label: 'Pregunta',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 15h2v2h-2zm1-12a4 4 0 0 1 2.8 6.8l-.9.9c-.6.6-.9 1.1-.9 2.3h-2v-.5c0-1.1.4-2.1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 9H8a4 4 0 0 1 4-4z'
  },
  amigo: { label: 'Persona', path: 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c5 0 9 2.2 9 5v3H3v-3c0-2.8 4-5 9-5z' },
  dado: {
    label: 'Dado',
    path: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'
  }
}
export const DEFAULT_LIFELINES: LifelineDef[] = [
  { id: '5050', name: '50:50', icon: 'mitad', kind: 'fifty' },
  { id: 'llamada', name: 'Llamada', icon: 'telefono', kind: 'mark' },
  { id: 'publico', name: 'Público', icon: 'publico', kind: 'mark' }
]

/** Pregunta de la escalera: de cualquier banco de test o sí o no (o de un banco de escalera). */
export interface LadderPick {
  ref: string
  id: string
}

export type LadderOutcomeKind = 'won' | 'walked' | 'failed'

export interface LadderState {
  active: boolean
  target: Target | null
  /** índice (0-based) del escalón por el que se juega ahora */
  level: number
  levels: LadderLevel[]
  used: Record<string, boolean>
  /** preguntas de la escalera en orden (escalón 1, 2...) */
  plan: LadderPick[]
  outcome: { kind: LadderOutcomeKind; prize: number } | null
  /** sumar el premio final a los puntos del concursante/equipo */
  awardToScore: boolean
  awarded: boolean
  /** la escena Juego enseña la pantalla final de la escalera */
  showResult: boolean
}

export type CueId =
  'pregunta' | 'marcar' | 'respondido' | 'correcto' | 'error' | 'reloj' | 'victoria' | 'plantarse' | 'caida' | 'transicion' | 'pasapalabra' | 'estimacion' | 'ganador' | 'soborno' | 'opcion' | 'tiempo'
export const CUES: { id: CueId; label: string; def: string | null }[] = [
  { id: 'pregunta', label: 'Entrada de pregunta', def: 'kx-pregunta.wav' },
  { id: 'opcion', label: 'Aparece una opción', def: 'kx-opcion.wav' },
  { id: 'marcar', label: 'Respuesta marcada (tensión)', def: 'kx-marcada.wav' },
  { id: 'correcto', label: 'Correcto', def: 'kx-acierto.wav' },
  { id: 'error', label: 'Incorrecto', def: 'kx-fallo.wav' },
  { id: 'reloj', label: 'Tic-tac del temporizador (bucle)', def: 'kx-tictac.wav' },
  { id: 'tiempo', label: 'Tiempo agotado', def: 'kx-tiempo.wav' },
  { id: 'victoria', label: 'Victoria / fanfarria (escalera gana)', def: 'kx-victoria.wav' },
  { id: 'plantarse', label: 'Escalera: se planta', def: 'kx-comodin.wav' },
  { id: 'caida', label: 'Escalera: cae', def: 'kx-fallo.wav' },
  { id: 'respondido', label: 'Todos responden: marca', def: 'kx-opcion.wav' },
  { id: 'estimacion', label: 'Estimación: revelado', def: 'kx-redoble.wav' },
  { id: 'pasapalabra', label: 'Rosco: pasapalabra', def: 'kx-opcion.wav' },
  { id: 'transicion', label: 'Rótulo de prueba', def: 'kx-pregunta.wav' },
  { id: 'ganador', label: 'Marcador final', def: 'kx-victoria.wav' },
  { id: 'soborno', label: 'Soborno aceptado', def: 'kx-soborno.wav' }
]

export interface QuizState {
  bankFile: string | null
  /** orden barajado de ids por banco */
  order: Record<string, string[]>
  /** preguntas ya usadas (clave banco::id) */
  used: Record<string, true>
  /** pregunta del juego con el que se trabajó por última vez (= slots[focus]) */
  current: CurrentQuestion | null
  /** pregunta en curso de cada juego: cambiar de juego o de escena no la pierde */
  slots: Partial<Record<QuizGameId, CurrentQuestion | null>>
  focus: QuizGameId
  scoring: Scoring
  timer: TimerState
  turn: Target | null
  rebound: boolean
  autoRotate: boolean
  asked: number
  ladder: LadderState
  sounds: Record<CueId, string | null>
  /** las preguntas nuevas son para todos */
  allMode: boolean
  estimation: EstimationConfig
  /** comodines de la escalera (hasta 5) */
  lifelines: LifelineDef[]
  /** volumen propio de cada sonido automático (0-1, por defecto 1) */
  soundVolumes: Partial<Record<CueId, number>>
  /** "seguir igualmente" tras un fallo suma los puntos del acierto */
  forgiveScores: boolean
  /** rótulo "SOBORNO ACEPTADO" al perdonar un fallo (para la coña) */
  bribe: { enabled: boolean; at: number | null }
}

export type QuizAction = (
  | { type: 'quizSetBank'; file: string | null }
  | { type: 'quizSetOrder'; file: string; order: string[] | null }
  | { type: 'quizMarkUsed'; key: string; used: boolean }
  | { type: 'quizResetUsed'; bankFile: string }
  | { type: 'quizLoad'; key: string; bankFile: string; question: Question; now: number; mode?: 'turn' | 'all'; stage?: boolean }
  | { type: 'quizShowQuestion' }
  | { type: 'quizHideOptions' }
  | { type: 'quizShowGuesses'; show: boolean }
  | { type: 'ladderShowResult'; show: boolean }
  | { type: 'quizAnswerAll'; key: string; index: number | null }
  | { type: 'quizGuess'; key: string; value: number | null }
  | { type: 'quizSetMode'; mode: 'turn' | 'all' }
  | { type: 'quizSetAllMode'; allMode: boolean }
  | { type: 'quizSetEstimation'; patch: Partial<EstimationConfig> }
  | { type: 'quizShowNext'; now: number }
  | { type: 'quizShowAll'; now: number }
  | { type: 'quizPick'; index: number; now: number }
  | { type: 'quizUnpick' }
  | { type: 'quizReveal'; now: number }
  | { type: 'quizAward' }
  | { type: 'quizClear' }
  | { type: 'quizToggleImage'; which?: 'q' | 'a' }
  | { type: 'quizImageFull' }
  | { type: 'quizSetScoring'; patch: Partial<Scoring> }
  | { type: 'quizSetTurn'; target: Target | null }
  | { type: 'quizSetOptions'; patch: Partial<Pick<QuizState, 'rebound' | 'autoRotate'>> }
  | { type: 'quizSetSound'; cue: CueId; file: string | null }
  | { type: 'timerConfig'; patch: Partial<Pick<TimerState, 'enabled' | 'seconds'>> }
  | { type: 'timerStart'; now: number }
  | { type: 'timerPause'; now: number }
  | { type: 'timerReset' }
  | { type: 'ladderStart'; target: Target }
  | { type: 'ladderStop' }
  | { type: 'ladderSetLevels'; levels: LadderLevel[] }
  | { type: 'ladderSetLevel'; level: number }
  | { type: 'ladderSetLifeline'; id: LifelineId; used: boolean; hide?: number[] }
  | { type: 'ladderWalk' }
  | { type: 'ladderSetAward'; awardToScore: boolean }
  | { type: 'ladderSetLifelines'; lifelines: LifelineDef[] }
  | { type: 'quizRebound' }
  | { type: 'quizSecondChance'; now: number }
  | { type: 'quizForgive'; now: number; key?: string }
  | { type: 'quizSetCorrect'; index: number }
  | { type: 'quizSetValue'; value: number }
  | { type: 'quizSetSoundVolume'; cue: CueId; volume: number }
  | { type: 'quizSetForgive'; patch: Partial<{ forgiveScores: boolean; bribe: boolean }> }
  | { type: 'ladderSetPlan'; plan: LadderPick[] }
) & { /** juego sobre el que actúa (por defecto, el último usado) */ game?: QuizGameId }

// ---------------------------------------------------------------- valores por defecto

const LADDER_VALUES = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000]

export function defaultLevels(): LadderLevel[] {
  return LADDER_VALUES.map((value, i) => ({ value, safe: i === 4 || i === 9 || i === 14 }))
}

export function defaultLadder(): LadderState {
  return {
    active: false,
    target: null,
    level: 0,
    levels: defaultLevels(),
    used: {},
    plan: [],
    outcome: null,
    awardToScore: true,
    awarded: false,
    showResult: false
  }
}

export function defaultQuiz(): QuizState {
  return {
    bankFile: null,
    order: {},
    used: {},
    current: null,
    scoring: { pointsCorrect: 10, penalize: false, pointsWrong: 5, autoAward: true },
    timer: { enabled: false, seconds: 30, endsAt: null, remainingMs: null },
    turn: null,
    rebound: true,
    autoRotate: true,
    asked: 0,
    ladder: defaultLadder(),
    lifelines: DEFAULT_LIFELINES.map((l) => ({ ...l })),
    forgiveScores: true,
    soundVolumes: {},
    bribe: { enabled: false, at: null },
    sounds: Object.fromEntries(CUES.map((c) => [c.id, c.def])) as Record<CueId, string | null>,
    slots: {},
    focus: 'test',
    allMode: false,
    estimation: { priceIsRight: false, mode: 'closest', ranked: [10, 6, 3, 1] }
  }
}

// ---------------------------------------------------------------- utilidades

/** 1000000 -> "1.000.000" (siempre con puntos de millar, como en el diseño). */
export function formatPoints(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.round(Math.abs(n))
  return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export const sameTarget = (a: Target | null | undefined, b: Target | null | undefined): boolean =>
  !!a && !!b && (a.kind === 'contestant' ? b.kind === 'contestant' && a.id === b.id : b.kind === 'team' && a.index === b.index)

/** Clave estable de un turno ("c1", "t0"). */
export const targetKey = (t: Target): string => (t.kind === 'team' ? 't' + t.index : t.id)
export function targetFromKey(key: string): Target | null {
  if (/^t[01]$/.test(key)) return { kind: 'team', index: Number(key[1]) as 0 | 1 }
  if (/^c[1-4]$/.test(key)) return { kind: 'contestant', id: key as ContestantId }
  return null
}

/** Concursantes/equipos que pueden recibir turno según la plantilla. */
export function turnTargets(s: Pick<GameState, 'layout' | 'contestants'>): Target[] {
  if (s.layout === 'teams')
    return [
      { kind: 'team', index: 0 },
      { kind: 'team', index: 1 }
    ]
  return contestantOrder(s)
    .slice(0, playerCount(s.layout))
    .map((id) => ({ kind: 'contestant', id }))
}

/** Siguiente en la rueda después de `from`, saltando los de `exclude`. null si no queda nadie. */
export function nextTarget(targets: Target[], from: Target | null, exclude: (Target | null)[] = []): Target | null {
  if (!targets.length) return null
  const start = from ? targets.findIndex((t) => sameTarget(t, from)) : -1
  for (let k = 1; k <= targets.length; k++) {
    const t = targets[(start + k + targets.length) % targets.length]
    if (!exclude.some((e) => sameTarget(e, t))) return t
  }
  return null
}

/** Puntos que suma (o resta) una respuesta. */
export function scoreDelta(scoring: Scoring, correct: boolean): number {
  if (correct) return scoring.pointsCorrect
  return scoring.penalize ? -Math.abs(scoring.pointsWrong) : 0
}

/** Aplica puntos a un concursante o equipo. */
export function applyDelta<S extends Pick<GameState, 'contestants' | 'teams'>>(s: S, target: Target | null, delta: number): S {
  if (!target || !delta) return s
  if (target.kind === 'contestant') return { ...s, contestants: s.contestants.map((c) => (c.id === target.id ? { ...c, score: c.score + delta } : c)) }
  const teams = [...s.teams] as GameState['teams']
  teams[target.index] = { ...teams[target.index], score: teams[target.index].score + delta }
  return { ...s, teams }
}

/** Lo ganado hasta ahora: el valor del último escalón superado. */
export function ladderBank(levels: LadderLevel[], level: number): number {
  return level > 0 ? (levels[Math.min(level, levels.length) - 1]?.value ?? 0) : 0
}

/** Lo que se lleva si falla: el último escalón seguro superado. */
export function ladderSafe(levels: LadderLevel[], level: number): number {
  let v = 0
  for (let i = 0; i < Math.min(level, levels.length); i++) if (levels[i].safe) v = levels[i].value
  return v
}

/** Resultado de responder en la escalera. */
export function ladderAnswer(l: LadderState, correct: boolean): LadderState {
  if (l.outcome || !l.levels.length) return l
  if (!correct) return { ...l, outcome: { kind: 'failed', prize: ladderSafe(l.levels, l.level) } }
  const level = l.level + 1
  if (level >= l.levels.length) return { ...l, level: l.levels.length, outcome: { kind: 'won', prize: l.levels[l.levels.length - 1].value } }
  return { ...l, level }
}

/** Plantarse: se lleva lo ganado hasta el último escalón superado. */
export function ladderWalkAway(l: LadderState): LadderState {
  if (l.outcome) return l
  return { ...l, outcome: { kind: 'walked', prize: ladderBank(l.levels, l.level) } }
}

/** 50:50: elige dos opciones incorrectas visibles al azar. */
export function fiftyFifty(q: Question, alreadyHidden: number[] = [], rnd: () => number = Math.random): number[] {
  const wrong = q.opciones.map((_, i) => i).filter((i) => i !== q.correcta && !alreadyHidden.includes(i))
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[wrong[i], wrong[j]] = [wrong[j], wrong[i]]
  }
  return wrong.slice(0, Math.max(0, Math.min(2, q.opciones.length - 2)))
}

/** Fisher-Yates para barajar el banco. */
export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------- reducer

type S = GameState

const withQuiz = (s: S, patch: Partial<QuizState>): S => ({ ...s, quiz: { ...s.quiz, ...patch } })
const withCurrent = (s: S, patch: Partial<CurrentQuestion>): S => (s.quiz.current ? withQuiz(s, { current: { ...s.quiz.current, ...patch } }) : s)

function startTimer(t: TimerState, now: number): TimerState {
  if (t.endsAt !== null) return t
  return { ...t, endsAt: now + (t.remainingMs ?? t.seconds * 1000), remainingMs: null }
}
function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.endsAt === null) return t
  return { ...t, endsAt: null, remainingMs: Math.max(0, t.endsAt - now) }
}
const resetTimer = (t: TimerState): TimerState => ({ ...t, endsAt: null, remainingMs: null })

/** Suma los puntos pendientes de los intentos ya resueltos. */
export function awardPending(s: S): S {
  const cur = s.quiz.current
  if (!cur) return s
  let next: S = s
  for (const a of cur.attempts) if (!a.awarded) next = applyDelta(next, a.target, a.delta)
  return withCurrent(next, { attempts: cur.attempts.map((a) => ({ ...a, awarded: true })) })
}

/** Cierra la escalera: suma el premio si toca. */
function settleLadder(s: S): S {
  const l = s.quiz.ladder
  if (!l.outcome || l.awarded) return s
  const next = l.awardToScore ? applyDelta(s, l.target, l.outcome.prize) : s
  return withQuiz(next, { ladder: { ...l, awarded: true } })
}

/** Revelado de estimación: más cercano (o precio justo) y puntos. */
function revealEstimation(s: S, now: number): S {
  const cur = s.quiz.current!
  const answer = cur.question.valor ?? 0
  const guesses = Object.entries(cur.guesses).map(([key, value]) => ({ key, value }))
  if (!guesses.length) return s
  const res = estimationResult(answer, guesses, s.quiz.estimation.priceIsRight)
  const pts = estimationPoints(res, s.quiz.estimation, s.quiz.scoring.pointsCorrect)
  const attempts: Attempt[] = res.rows.map((r) => ({
    target: targetFromKey(r.key),
    pick: -1,
    correct: res.winners.includes(r.key),
    delta: pts[r.key] ?? 0,
    awarded: false
  }))
  let next = withQuiz(s, { current: { ...cur, phase: 'revealed', attempts, estimation: res, revealedAt: now }, timer: resetTimer(s.quiz.timer) })
  if (s.quiz.scoring.autoAward) next = awardPending(next)
  return next
}

/** Revelado de "todos responden": cada uno con su acierto o fallo. */
function revealAll(s: S, now: number): S {
  const cur = s.quiz.current!
  const keys = Object.keys(cur.answers)
  if (!keys.length) return s
  const attempts: Attempt[] = keys.map((k) => {
    const pick = cur.answers[k]
    const correct = pick === cur.question.correcta
    return { target: targetFromKey(k), pick, correct, delta: scoreDelta(s.quiz.scoring, correct), awarded: false }
  })
  let next = withQuiz(s, { current: { ...cur, phase: 'revealed', attempts, revealedAt: now }, timer: resetTimer(s.quiz.timer) })
  if (s.quiz.scoring.autoAward) next = awardPending(next)
  return next
}

function reveal(s: S, now: number): S {
  const cur = s.quiz.current
  if (!cur || cur.phase === 'revealed') return s
  if (cur.question.tipo === 'estimacion') return revealEstimation(s, now)
  if (cur.mode === 'all') return revealAll(s, now)
  if (cur.phase !== 'locked' || cur.picked === null) return s
  const correct = cur.picked === cur.question.correcta
  const inLadder = s.quiz.ladder.active && cur.ladderLevel !== null
  const attempt: Attempt = {
    target: cur.target,
    pick: cur.picked,
    correct,
    delta: inLadder ? 0 : scoreDelta(s.quiz.scoring, correct),
    awarded: false
  }
  const attempts = [...cur.attempts, attempt]
  let current: CurrentQuestion = { ...cur, attempts, phase: 'revealed', revealedAt: now }
  let timer = resetTimer(s.quiz.timer)

  if (!correct && !inLadder && s.quiz.rebound) {
    const tried = attempts.map((a) => a.target)
    const nt = nextTarget(turnTargets(s), cur.target, tried)
    // queda alguien: rebote sin desvelar la correcta (si solo quedaba una opción, se desvela)
    const remaining = cur.question.opciones.length - cur.hidden.length - attempts.filter((a) => !a.correct).length
    if (nt && remaining > 1) {
      // sin desvelar: el botón principal ofrece "Rebote a X"
      current = { ...current, phase: 'rebound', picked: null, reboundTo: nt, revealedAt: null }
    }
  }

  let next = withQuiz(s, { current, timer })
  if (s.quiz.scoring.autoAward) next = awardPending(next)
  if (inLadder) {
    next = withQuiz(next, { ladder: ladderAnswer(next.quiz.ladder, correct) })
    next = settleLadder(next)
  }
  return next
}

// ---------------------------------------------------------------- corregir y perdonar fallos

/** El último fallo que se puede perdonar (null si no hay). */
export function lastMiss(cur: CurrentQuestion | null): Attempt | null {
  if (!cur || cur.mode === 'all' || cur.question.tipo === 'estimacion') return null
  const a = cur.attempts[cur.attempts.length - 1]
  return a && !a.correct && !a.forgiven && !a.retried ? a : null
}

/** Sale el rótulo del soborno (si está activado). */
const bribed = (s: S, now: number): S => (s.quiz.bribe.enabled ? withQuiz(s, { bribe: { ...s.quiz.bribe, at: now } }) : s)

/** Deshace un resultado de la escalera ya cerrado (y el premio si se sumó). */
function reopenLadder(s: S): S {
  const l = s.quiz.ladder
  if (!l.outcome) return s
  const next = l.awarded && l.awardToScore ? applyDelta(s, l.target, -l.outcome.prize) : s
  return withQuiz(next, { ladder: { ...l, outcome: null, awarded: false, showResult: false } })
}

/** Cambia los puntos de un intento ya resuelto: si ya se sumaron, se ajusta la diferencia. */
function redelta(s: S, a: Attempt, delta: number): { s: S; a: Attempt } {
  const next = a.awarded ? applyDelta(s, a.target, delta - a.delta) : s
  return { s: next, a: { ...a, delta } }
}

/** "Segunda oportunidad": la opción fallada queda tachada y vuelve a elegir. En la escalera no cae. */
function secondChance(s: S, now: number): S {
  const cur = s.quiz.current
  const miss = lastMiss(cur)
  if (!cur || !miss) return s
  let next = s
  // sin penalización por el fallo perdonado
  const r = redelta(next, miss, 0)
  next = r.s
  const attempts = [...cur.attempts.slice(0, -1), { ...r.a, awarded: true, retried: true }]
  if (cur.ladderLevel !== null && next.quiz.ladder.outcome?.kind === 'failed') next = reopenLadder(next)
  next = withQuiz(next, { current: { ...cur, attempts, phase: 'options', picked: null, target: miss.target, reboundTo: null, revealedAt: null } })
  return bribed(next, now)
}

/** "Seguir igualmente": se sigue como si hubiera acertado. En la escalera sube; en el resto suma si así se elige. */
function forgive(s: S, now: number, key?: string): S {
  const cur = s.quiz.current
  if (!cur) return s
  // "todos responden": se perdona a uno concreto
  const idx = key !== undefined ? cur.attempts.findIndex((a) => !a.correct && !a.forgiven && a.target && targetKey(a.target) === key) : cur.attempts.length - 1
  const miss = cur.attempts[idx]
  if (!miss || miss.correct || miss.forgiven) return s
  const inLadder = cur.ladderLevel !== null && s.quiz.ladder.active
  let next = s
  const r = redelta(next, miss, inLadder ? 0 : s.quiz.forgiveScores ? scoreDelta(s.quiz.scoring, true) : 0)
  next = r.s
  const attempts = cur.attempts.map((a, i) => (i === idx ? { ...r.a, forgiven: true } : a))
  next = withQuiz(next, { current: { ...cur, attempts, phase: 'revealed', picked: cur.picked ?? miss.pick, target: miss.target, revealedAt: cur.revealedAt ?? now } })
  if (s.quiz.scoring.autoAward) next = awardPending(next)
  if (inLadder) {
    next = reopenLadder(next)
    next = withQuiz(next, { ladder: ladderAnswer(next.quiz.ladder, true) })
    next = settleLadder(next)
  }
  return bribed(next, now)
}

/** Cambiar en directo cuál es la opción correcta. Si ya estaba revelada, se recalculan puntos (y escalera). */
function setCorrect(s: S, index: number): S {
  const cur = s.quiz.current
  if (!cur || cur.question.tipo === 'estimacion' || index < 0 || index >= cur.question.opciones.length || index === cur.question.correcta) return s
  const question = { ...cur.question, correcta: index }
  if (cur.phase !== 'revealed' && !cur.attempts.length) return withCurrent(s, { question })
  const inLadder = cur.ladderLevel !== null && s.quiz.ladder.active
  const before = cur.attempts[cur.attempts.length - 1]
  let next = s
  const attempts: Attempt[] = []
  for (const a of cur.attempts) {
    const correct = a.pick === index
    const r = redelta(next, a, a.forgiven ? a.delta : inLadder ? 0 : scoreDelta(s.quiz.scoring, correct))
    next = r.s
    attempts.push({ ...r.a, correct, forgiven: correct ? false : a.forgiven })
  }
  // si con la corrección alguien acierta (p. ej. tras un rebote), la pregunta queda resuelta
  const solved = cur.mode !== 'all' && attempts.some((x) => x.correct || x.forgiven)
  const phase = solved ? 'revealed' : cur.phase
  const last = attempts.find((x) => x.correct || x.forgiven) ?? attempts[attempts.length - 1]
  next = withQuiz(next, {
    current: {
      ...cur,
      question,
      attempts,
      phase,
      picked: solved && cur.phase !== 'revealed' ? last.pick : cur.picked,
      target: solved && cur.phase !== 'revealed' ? last.target : cur.target,
      revealedAt: cur.revealedAt ?? (solved ? Date.now() : null)
    }
  })
  if (inLadder && before && cur.phase === 'revealed') {
    const was = before.correct || !!before.forgiven
    const now = attempts[attempts.length - 1].correct || !!attempts[attempts.length - 1].forgiven
    if (was !== now) {
      // vuelve al escalón de esta pregunta y se resuelve otra vez
      next = reopenLadder(next)
      next = withQuiz(next, { ladder: { ...next.quiz.ladder, level: cur.ladderLevel! } })
      next = withQuiz(next, { ladder: ladderAnswer(next.quiz.ladder, now) })
      next = settleLadder(next)
    }
  }
  return next
}

/** Estimación: cambiar la cifra correcta. Si ya estaba revelada, se recalcula quién gana y los puntos. */
function setValue(s: S, value: number): S {
  const cur = s.quiz.current
  if (!cur || cur.question.tipo !== 'estimacion' || !Number.isFinite(value)) return s
  const question = { ...cur.question, valor: value }
  if (cur.phase !== 'revealed') return withCurrent(s, { question })
  // quita lo que se hubiera sumado y vuelve a revelar con la cifra nueva
  let next = s
  for (const a of cur.attempts) if (a.awarded) next = applyDelta(next, a.target, -a.delta)
  next = withQuiz(next, { current: { ...cur, question, attempts: [], estimation: null, phase: 'options' } })
  return revealEstimation(next, cur.revealedAt ?? Date.now())
}

/** Acciones que actúan sobre la pregunta en curso de un juego concreto. */
const SLOT_ACTIONS = new Set<string>([
  'quizLoad',
  'quizShowQuestion',
  'quizShowNext',
  'quizShowAll',
  'quizHideOptions',
  'quizShowGuesses',
  'quizAnswerAll',
  'quizGuess',
  'quizSetMode',
  'quizPick',
  'quizUnpick',
  'quizReveal',
  'quizAward',
  'quizClear',
  'quizToggleImage',
  'quizImageFull',
  'quizRebound',
  'quizSecondChance',
  'quizForgive',
  'quizSetCorrect',
  'quizSetValue',
  'quizSetTurn',
  'ladderSetLevel',
  'ladderSetLifeline'
])

/** Juego al que va una acción: el indicado, la escalera para sus acciones, o el último usado. */
export function quizGameOf(s: S, a: QuizAction): QuizGameId {
  if (a.game) return a.game
  if (a.type.startsWith('ladder')) return 'escalera'
  return s.quiz.focus
}

export function applyQuizAction(s: S, a: QuizAction): S {
  if (!SLOT_ACTIONS.has(a.type)) return applyQuizInner(s, a)
  const game = quizGameOf(s, a)
  const before: S = { ...s, quiz: { ...s.quiz, current: s.quiz.slots[game] ?? null } }
  const after = applyQuizInner(before, a)
  if (after === before) return s
  return { ...after, quiz: { ...after.quiz, slots: { ...after.quiz.slots, [game]: after.quiz.current }, focus: game } }
}

function applyQuizInner(s: S, a: QuizAction): S {
  const q = s.quiz
  switch (a.type) {
    case 'quizSetBank':
      return withQuiz(s, { bankFile: a.file })
    case 'quizSetOrder': {
      const order = { ...q.order }
      if (a.order) order[a.file] = a.order
      else delete order[a.file]
      return withQuiz(s, { order })
    }
    case 'quizMarkUsed': {
      const used = { ...q.used }
      if (a.used) used[a.key] = true
      else delete used[a.key]
      return withQuiz(s, { used })
    }
    case 'quizResetUsed': {
      const prefix = `${a.bankFile}::`
      return withQuiz(s, { used: Object.fromEntries(Object.entries(q.used).filter(([k]) => !k.startsWith(prefix))) as QuizState['used'] })
    }
    case 'quizLoad': {
      const ladder = q.ladder
      const inLadder = ladder.active && !ladder.outcome && (!a.game || a.game === 'escalera')
      let turn = q.turn
      const mode: 'turn' | 'all' = inLadder || a.question.tipo === 'estimacion' ? 'turn' : (a.mode ?? (q.allMode ? 'all' : 'turn'))
      const individual = mode === 'turn' && a.question.tipo !== 'estimacion'
      if (!inLadder && individual && q.autoRotate && q.asked > 0) turn = nextTarget(turnTargets(s), turn) ?? turn
      const current: CurrentQuestion = {
        key: a.key,
        bankFile: a.bankFile,
        question: a.question,
        phase: a.stage ? 'ready' : 'question',
        shown: 0,
        hidden: [],
        picked: null,
        target: inLadder ? ladder.target : turn,
        attempts: [],
        showImage: null,
        showAnswerImage: null,
        imageFull: false,
        ladderLevel: inLadder ? ladder.level : null,
        mode,
        answers: {},
        guesses: {},
        revealedAt: null,
        estimation: null
      }
      if (!individual && !inLadder) current.target = null
      return {
        ...s,
        quiz: { ...q, current, turn, asked: individual ? q.asked + 1 : q.asked, timer: resetTimer(q.timer) }
      }
    }
    case 'quizShowQuestion': {
      const cur = q.current
      if (!cur || cur.phase !== 'ready') return s
      return withCurrent(s, { phase: 'question' })
    }
    case 'quizHideOptions': {
      const cur = q.current
      if (!cur || cur.phase === 'revealed' || cur.phase === 'ready') return s
      return withCurrent(s, { shown: 0 })
    }
    case 'quizShowGuesses':
      return q.current ? withCurrent(s, { showGuesses: a.show }) : s
    case 'ladderShowResult':
      return withQuiz(s, { ladder: { ...q.ladder, showResult: a.show && !!q.ladder.outcome } })
    case 'quizShowNext':
    case 'quizShowAll': {
      const cur = q.current
      if (!cur || cur.phase === 'revealed') return s
      const n = cur.question.opciones.length
      const shown = a.type === 'quizShowAll' ? n : Math.min(n, cur.shown + 1)
      const phase = cur.phase === 'question' || cur.phase === 'ready' ? 'options' : cur.phase
      return withQuiz(s, { current: { ...cur, shown, phase } })
    }
    case 'quizAnswerAll': {
      const cur = q.current
      if (!cur || cur.mode !== 'all' || cur.phase === 'revealed' || cur.phase === 'question') return s
      const answers = { ...cur.answers }
      if (a.index === null) delete answers[a.key]
      else if (a.index >= 0 && a.index < cur.shown && !cur.hidden.includes(a.index)) answers[a.key] = a.index
      else return s
      return withCurrent(s, { answers })
    }
    case 'quizGuess': {
      const cur = q.current
      if (!cur || cur.question.tipo !== 'estimacion' || cur.phase === 'revealed') return s
      const guesses = { ...cur.guesses }
      if (a.value === null || !Number.isFinite(a.value)) delete guesses[a.key]
      else guesses[a.key] = a.value
      return withCurrent(s, { guesses })
    }
    case 'quizSetMode': {
      const cur = q.current
      if (!cur || cur.phase === 'revealed' || cur.attempts.length || cur.ladderLevel !== null || cur.question.tipo === 'estimacion') return s
      return withCurrent(s, { mode: a.mode, picked: null, answers: {}, phase: cur.phase === 'locked' ? 'options' : cur.phase, target: a.mode === 'all' ? null : q.turn })
    }
    case 'quizSetAllMode':
      return withQuiz(s, { allMode: a.allMode })
    case 'quizSetEstimation':
      return withQuiz(s, { estimation: { ...q.estimation, ...a.patch } })
    case 'quizPick': {
      const cur = q.current
      if (!cur || cur.mode === 'all' || (cur.phase !== 'options' && cur.phase !== 'locked')) return s
      const failed = cur.attempts.filter((x) => !x.correct).map((x) => x.pick)
      if (a.index < 0 || a.index >= cur.shown || cur.hidden.includes(a.index) || failed.includes(a.index)) return s
      return withQuiz(s, { current: { ...cur, picked: a.index, phase: 'locked' }, timer: pauseTimer(q.timer, a.now) })
    }
    case 'quizUnpick': {
      const cur = q.current
      if (!cur || cur.phase !== 'locked') return s
      return withCurrent(s, { picked: null, phase: 'options' })
    }
    case 'quizReveal': {
      // la pregunta cuenta como usada al revelarla (no al cargarla)
      const r = reveal(s, a.now)
      const key = s.quiz.current?.key
      return r === s || !key ? r : withQuiz(r, { used: { ...r.quiz.used, [key]: true } })
    }
    case 'quizAward':
      return awardPending(s)
    case 'quizRebound': {
      const cur = q.current
      if (!cur || cur.phase !== 'rebound' || !cur.reboundTo) return s
      return withCurrent(s, { phase: 'options', target: cur.reboundTo, reboundTo: null, picked: null })
    }
    case 'quizSecondChance':
      return secondChance(s, a.now)
    case 'quizForgive':
      return forgive(s, a.now, a.key)
    case 'quizSetCorrect':
      return setCorrect(s, a.index)
    case 'quizSetValue':
      return setValue(s, a.value)
    case 'quizSetForgive':
      return withQuiz(s, {
        forgiveScores: a.patch.forgiveScores ?? q.forgiveScores,
        bribe: { ...q.bribe, enabled: a.patch.bribe ?? q.bribe.enabled }
      })
    case 'quizClear':
      return { ...s, quiz: { ...q, current: null, timer: resetTimer(q.timer) } }
    case 'quizToggleImage': {
      const cur = q.current
      const which = a.which ?? 'q'
      if (!cur || !(which === 'q' ? cur.question.imagen : cur.question.imagen_respuesta)) return s
      const patch = toggleImage({ ...cur, showAnswerImage: cur.showAnswerImage ?? null }, which) as Partial<CurrentQuestion>
      // al ocultar la imagen que estaba a pantalla completa, se quita la pantalla completa
      const next = { ...cur, ...patch }
      return withCurrent(s, { ...patch, imageFull: !!cur.imageFull && !!imageView({ ...next, showAnswerImage: next.showAnswerImage ?? null }).file })
    }
    case 'quizImageFull': {
      const cur = q.current
      if (!cur) return s
      if (!cur.imageFull && !imageView({ ...cur, showAnswerImage: cur.showAnswerImage ?? null }).file) return s
      return withCurrent(s, { imageFull: !cur.imageFull })
    }
    case 'quizSetScoring':
      return withQuiz(s, { scoring: { ...q.scoring, ...a.patch } })
    case 'quizSetTurn': {
      const cur = q.current
      const retarget = !!cur && !cur.attempts.length && cur.phase !== 'revealed' && cur.ladderLevel === null
      return withQuiz(s, { turn: a.target, current: retarget ? { ...cur, target: a.target } : cur })
    }
    case 'quizSetOptions':
      return withQuiz(s, a.patch)
    case 'quizSetSound':
      return withQuiz(s, { sounds: { ...q.sounds, [a.cue]: a.file } })
    case 'quizSetSoundVolume':
      return withQuiz(s, { soundVolumes: { ...q.soundVolumes, [a.cue]: Math.max(0, Math.min(1, a.volume)) } })
    case 'timerConfig': {
      const timer = { ...q.timer, ...a.patch }
      if (a.patch.seconds !== undefined) timer.seconds = Math.max(1, Math.round(a.patch.seconds))
      return withQuiz(s, { timer })
    }
    case 'timerStart':
      return withQuiz(s, { timer: startTimer(q.timer, a.now) })
    case 'timerPause':
      return withQuiz(s, { timer: pauseTimer(q.timer, a.now) })
    case 'timerReset':
      return withQuiz(s, { timer: resetTimer(q.timer) })
    case 'ladderStart':
      return withQuiz(s, {
        ladder: { ...defaultLadder(), levels: q.ladder.levels, awardToScore: q.ladder.awardToScore, plan: q.ladder.plan, active: true, target: a.target },
        turn: a.target
      })
    case 'ladderStop':
      return withQuiz(s, { ladder: { ...q.ladder, active: false, showResult: false } })
    case 'ladderSetLevels': {
      const levels = a.levels.filter((l) => Number.isFinite(l.value)).slice(0, 30)
      if (!levels.length) return s
      return withQuiz(s, { ladder: { ...q.ladder, levels, level: Math.min(q.ladder.level, levels.length - 1) } })
    }
    case 'ladderSetLevel': {
      const level = Math.max(0, Math.min(q.ladder.levels.length - 1, Math.round(a.level)))
      const cur = q.current && q.current.ladderLevel !== null ? { ...q.current, ladderLevel: level } : q.current
      return withQuiz(s, { ladder: { ...q.ladder, level, outcome: null, awarded: false }, current: cur })
    }
    case 'ladderSetLifeline': {
      let next = withQuiz(s, { ladder: { ...q.ladder, used: { ...q.ladder.used, [a.id]: a.used } } })
      const def = q.lifelines.find((x) => x.id === a.id)
      if (def?.kind === 'fifty' && q.current && a.hide) next = withCurrent(next, { hidden: a.used ? a.hide : [] })
      return next
    }
    case 'ladderWalk': {
      if (!q.ladder.active || q.ladder.outcome) return s
      const next = withQuiz(s, { ladder: ladderWalkAway(q.ladder), timer: resetTimer(q.timer) })
      const settled = settleLadder(next)
      return withQuiz(settled, { ladder: { ...settled.quiz.ladder, showResult: true } })
    }
    case 'ladderSetAward':
      return withQuiz(s, { ladder: { ...q.ladder, awardToScore: a.awardToScore } })
    case 'ladderSetLifelines':
      return withQuiz(s, { lifelines: a.lifelines.slice(0, MAX_LIFELINES).filter((l) => l && l.id && l.name) })
    case 'ladderSetPlan':
      return withQuiz(s, { ladder: { ...q.ladder, plan: a.plan.filter((x) => x && x.ref && x.id) } })
    default:
      return s
  }
}
