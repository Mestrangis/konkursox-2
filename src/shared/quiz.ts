// Juegos de preguntas del modo clásico: flujo de pregunta, turnos/rebote, puntuación y escalera.
// Todo puro: lo ejecuta el reducer del proceso main.
import { contestantOrder, playerCount } from './order'
import type { Question } from './questions'
import type { ContestantId, GameState } from './types'

// ---------------------------------------------------------------- tipos

export type Target = { kind: 'contestant'; id: ContestantId } | { kind: 'team'; index: 0 | 1 }

export type Phase = 'question' | 'options' | 'locked' | 'revealed'

export interface Attempt {
  target: Target | null
  pick: number
  correct: boolean
  delta: number
  awarded: boolean
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
  showImage: boolean
  /** escalón por el que se juega (solo en escalera) */
  ladderLevel: number | null
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

export type LifelineId = '5050' | 'llamada' | 'publico'
export const LIFELINES: { id: LifelineId; label: string }[] = [
  { id: '5050', label: '50:50' },
  { id: 'llamada', label: 'Llamada' },
  { id: 'publico', label: 'Público' }
]

export type LadderOutcomeKind = 'won' | 'walked' | 'failed'

export interface LadderState {
  active: boolean
  target: Target | null
  /** índice (0-based) del escalón por el que se juega ahora */
  level: number
  levels: LadderLevel[]
  used: Record<LifelineId, boolean>
  outcome: { kind: LadderOutcomeKind; prize: number } | null
  /** sumar el premio final a los puntos del concursante/equipo */
  awardToScore: boolean
  awarded: boolean
}

export type CueId = 'pregunta' | 'marcar' | 'correcto' | 'error' | 'reloj' | 'victoria' | 'plantarse' | 'caida'
export const CUES: { id: CueId; label: string; def: string }[] = [
  { id: 'pregunta', label: 'Nueva pregunta', def: 'pregunta.mp3' },
  { id: 'marcar', label: 'Respuesta definitiva', def: 'tension.mp3' },
  { id: 'correcto', label: 'Acierto', def: 'correcto.mp3' },
  { id: 'error', label: 'Fallo', def: 'error.mp3' },
  { id: 'reloj', label: 'Temporizador (bucle)', def: 'reloj.mp3' },
  { id: 'victoria', label: 'Escalera: gana', def: 'victoria.mp3' },
  { id: 'plantarse', label: 'Escalera: se planta', def: 'victoria.mp3' },
  { id: 'caida', label: 'Escalera: cae', def: 'error.mp3' }
]

export interface QuizState {
  bankFile: string | null
  /** orden barajado de ids por banco */
  order: Record<string, string[]>
  /** preguntas ya usadas (clave banco::id) */
  used: Record<string, true>
  current: CurrentQuestion | null
  scoring: Scoring
  timer: TimerState
  turn: Target | null
  rebound: boolean
  autoRotate: boolean
  asked: number
  ladder: LadderState
  sounds: Record<CueId, string | null>
}

export type QuizView = 'plato' | 'quiz' | 'result'

export type QuizAction =
  | { type: 'setView'; view: QuizView }
  | { type: 'quizSetBank'; file: string | null }
  | { type: 'quizSetOrder'; file: string; order: string[] | null }
  | { type: 'quizMarkUsed'; key: string; used: boolean }
  | { type: 'quizResetUsed'; bankFile: string }
  | { type: 'quizLoad'; key: string; bankFile: string; question: Question; now: number }
  | { type: 'quizShowNext'; now: number }
  | { type: 'quizShowAll'; now: number }
  | { type: 'quizPick'; index: number; now: number }
  | { type: 'quizUnpick' }
  | { type: 'quizReveal'; now: number }
  | { type: 'quizAward' }
  | { type: 'quizClear' }
  | { type: 'quizToggleImage' }
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
    used: { '5050': false, llamada: false, publico: false },
    outcome: null,
    awardToScore: true,
    awarded: false
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
    sounds: Object.fromEntries(CUES.map((c) => [c.id, c.def])) as Record<CueId, string | null>
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

/** Concursantes/equipos que pueden recibir turno según la plantilla. */
export function turnTargets(s: Pick<GameState, 'layout' | 'contestants'>): Target[] {
  if (s.layout === 'teams') return [
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
  if (target.kind === 'contestant')
    return { ...s, contestants: s.contestants.map((c) => (c.id === target.id ? { ...c, score: c.score + delta } : c)) }
  const teams = [...s.teams] as GameState['teams']
  teams[target.index] = { ...teams[target.index], score: teams[target.index].score + delta }
  return { ...s, teams }
}

/** Lo ganado hasta ahora: el valor del último escalón superado. */
export function ladderBank(levels: LadderLevel[], level: number): number {
  return level > 0 ? levels[Math.min(level, levels.length) - 1]?.value ?? 0 : 0
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
const withCurrent = (s: S, patch: Partial<CurrentQuestion>): S =>
  s.quiz.current ? withQuiz(s, { current: { ...s.quiz.current, ...patch } }) : s

function startTimer(t: TimerState, now: number): TimerState {
  if (!t.enabled || t.endsAt !== null) return t
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

function reveal(s: S, now: number): S {
  const cur = s.quiz.current
  if (!cur || cur.phase !== 'locked' || cur.picked === null) return s
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
  let current: CurrentQuestion = { ...cur, attempts, phase: 'revealed' }
  let timer = resetTimer(s.quiz.timer)

  if (!correct && !inLadder && s.quiz.rebound) {
    const tried = attempts.map((a) => a.target)
    const nt = nextTarget(turnTargets(s), cur.target, tried)
    // queda alguien: rebote sin desvelar la correcta (si solo quedaba una opción, se desvela)
    const remaining = cur.question.opciones.length - cur.hidden.length - attempts.filter((a) => !a.correct).length
    if (nt && remaining > 1) {
      current = { ...current, phase: 'options', picked: null, target: nt }
      timer = startTimer(timer, now)
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

export function applyQuizAction(s: S, a: QuizAction): S {
  const q = s.quiz
  switch (a.type) {
    case 'setView':
      return { ...s, view: a.view }
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
      const inLadder = ladder.active && !ladder.outcome
      let turn = q.turn
      if (!inLadder && q.autoRotate && q.asked > 0) turn = nextTarget(turnTargets(s), turn) ?? turn
      const current: CurrentQuestion = {
        key: a.key,
        bankFile: a.bankFile,
        question: a.question,
        phase: 'question',
        shown: 0,
        hidden: [],
        picked: null,
        target: inLadder ? ladder.target : turn,
        attempts: [],
        showImage: !!a.question.imagen,
        ladderLevel: inLadder ? ladder.level : null
      }
      return {
        ...s,
        view: 'quiz',
        quiz: { ...q, current, turn, asked: q.asked + 1, used: { ...q.used, [a.key]: true }, timer: resetTimer(q.timer) }
      }
    }
    case 'quizShowNext':
    case 'quizShowAll': {
      const cur = q.current
      if (!cur || cur.phase === 'revealed') return s
      const n = cur.question.opciones.length
      const shown = a.type === 'quizShowAll' ? n : Math.min(n, cur.shown + 1)
      const phase = cur.phase === 'question' ? 'options' : cur.phase
      const timer = shown === n && cur.phase !== 'locked' ? startTimer(q.timer, a.now) : q.timer
      return withQuiz(s, { current: { ...cur, shown, phase }, timer })
    }
    case 'quizPick': {
      const cur = q.current
      if (!cur || (cur.phase !== 'options' && cur.phase !== 'locked')) return s
      const failed = cur.attempts.filter((x) => !x.correct).map((x) => x.pick)
      if (a.index < 0 || a.index >= cur.shown || cur.hidden.includes(a.index) || failed.includes(a.index)) return s
      return withQuiz(s, { current: { ...cur, picked: a.index, phase: 'locked' }, timer: pauseTimer(q.timer, a.now) })
    }
    case 'quizUnpick': {
      const cur = q.current
      if (!cur || cur.phase !== 'locked') return s
      return withCurrent(s, { picked: null, phase: 'options' })
    }
    case 'quizReveal':
      return reveal(s, a.now)
    case 'quizAward':
      return awardPending(s)
    case 'quizClear':
      return { ...s, view: s.view === 'quiz' ? 'plato' : s.view, quiz: { ...q, current: null, timer: resetTimer(q.timer) } }
    case 'quizToggleImage':
      return q.current?.question.imagen ? withCurrent(s, { showImage: !q.current.showImage }) : s
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
    case 'timerConfig': {
      const timer = { ...q.timer, ...a.patch }
      if (a.patch.seconds !== undefined) timer.seconds = Math.max(1, Math.round(a.patch.seconds))
      return withQuiz(s, { timer: a.patch.enabled === false ? resetTimer(timer) : timer })
    }
    case 'timerStart':
      return withQuiz(s, { timer: startTimer(q.timer, a.now) })
    case 'timerPause':
      return withQuiz(s, { timer: pauseTimer(q.timer, a.now) })
    case 'timerReset':
      return withQuiz(s, { timer: resetTimer(q.timer) })
    case 'ladderStart':
      return withQuiz(s, {
        ladder: { ...defaultLadder(), levels: q.ladder.levels, awardToScore: q.ladder.awardToScore, active: true, target: a.target },
        turn: a.target
      })
    case 'ladderStop':
      return { ...s, view: s.view === 'result' ? 'plato' : s.view, quiz: { ...q, ladder: { ...q.ladder, active: false } } }
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
      if (a.id === '5050' && q.current && a.hide) next = withCurrent(next, { hidden: a.used ? a.hide : [] })
      return next
    }
    case 'ladderWalk': {
      if (!q.ladder.active || q.ladder.outcome) return s
      const next = withQuiz(s, { ladder: ladderWalkAway(q.ladder), timer: resetTimer(q.timer) })
      return { ...settleLadder(next), view: 'result' }
    }
    case 'ladderSetAward':
      return withQuiz(s, { ladder: { ...q.ladder, awardToScore: a.awardToScore } })
    default:
      return s
  }
}
