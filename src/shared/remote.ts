// El mando (móvil): comandos que manda y la instantánea compacta del estado que recibe.
// El programa es la única fuente de verdad: el mando solo pide cosas y el panel las ejecuta.
import { EFFECTS } from './effects'
import { formatNumber } from './games'
import { targetMembers } from './order'
import { lastMiss, sameTarget, targetKey, turnTargets, type Target } from './quiz'
import { remainingMs, roscoStats, roscoWaiting } from './rosco'
import { activeContestants, currentPlano, currentTurn, hasLiveGame, type GameId, type Plano, type QuizGameId, type SceneId } from './scene'
import type { Action, GameState, SlotId } from './types'

// ---------------------------------------------------------------- comandos

export type RemoteCmd =
  | { t: 'hello' }
  | { t: 'go' }
  | { t: 'pick'; i: number }
  | { t: 'answer'; key: string; i: number | null }
  | { t: 'unpick' }
  | { t: 'showAll' }
  | { t: 'secondChance' }
  | { t: 'forgive' }
  | { t: 'bribe' }
  | { t: 'setCorrect'; i: number }
  | { t: 'lifeline'; i: number }
  | { t: 'walk' }
  | { t: 'turn'; key: string }
  | { t: 'reboundToggle' }
  | { t: 'score'; key: string; d: number }
  | { t: 'undo' }
  | { t: 'scene'; id: SceneId }
  | { t: 'plano'; id: Plano }
  | { t: 'preset'; id: 'yo' | 'turno' | 'todos' }
  | { t: 'person'; slot: SlotId }
  | { t: 'liveGame'; game: GameId }
  | { t: 'sound'; i: number }
  | { t: 'effect'; i: number }
  | { t: 'effectsOff' }
  | { t: 'music'; op: 'toggle' | 'next' | 'prev' | 'fade' | 'vol'; v?: number }
  | { t: 'auto' }
  | { t: 'guess'; key: string; value: number | null }
  | { t: 'rosco'; op: 'ok' | 'ko' | 'pasa' | 'clock' | 'swap' }
  | { t: 'roscoFix'; player: number; index: number; status: 'ok' | 'pasa' }
  | { t: 'timer'; op: 'show' | 'play' | 'reset' }
  | { t: 'load'; ref: string; id: string }
  | { t: 'bank'; ref?: string }
  | { t: 'lowerThird' }

/** Un comando del mando llega con la versión del estado que vio (rev). */
export interface RemoteEnvelope {
  cmd: RemoteCmd
  rev: number
  /** identificador del mando (para varios móviles) */
  from?: string
}

/** Comandos que nunca chocan con nada (solo piden datos). */
const HARMLESS = new Set(['hello', 'bank'])

/**
 * ¿Se acepta un comando del mando? Si el panel ha hecho algo hace muy poco y el mando no lo había
 * visto (su rev es anterior), manda el panel: el comando se descarta y el mando recibe el estado nuevo.
 */
export function acceptRemote(cmd: RemoteCmd, cmdRev: number, curRev: number, lastLocalAt: number, now: number, windowMs = 1500): boolean {
  if (HARMLESS.has(cmd.t)) return true
  if (cmdRev >= curRev) return true
  return now - lastLocalAt > windowMs
}

const isQuizGame = (g: GameId): g is QuizGameId => g !== 'rosco'

/** Destino (concursante o equipo) a partir de su clave. */
function targetOf(s: GameState, key: string): Target | null {
  return turnTargets(s).find((t) => targetKey(t) === key) ?? null
}

/**
 * Comandos que son una acción directa del programa (no necesitan la lógica de pasos del panel).
 * Devuelve las acciones a despachar, o null si el comando lo ejecuta el panel.
 */
export function cmdToActions(cmd: RemoteCmd, s: GameState, now = Date.now()): Action[] | null {
  const g = s.liveGame
  switch (cmd.t) {
    case 'setCorrect':
      return isQuizGame(g) ? [{ type: 'quizSetCorrect', index: cmd.i, game: g } as Action] : []
    case 'bribe':
      return [{ type: 'quizSetForgive', patch: { bribe: !s.quiz.bribe.enabled } }]
    case 'reboundToggle':
      return [{ type: 'quizSetOptions', patch: { rebound: !s.quiz.rebound } }]
    case 'turn': {
      if (cmd.key === 'all') return [{ type: 'quizSetAllMode', allMode: true }, ...(isQuizGame(g) ? [{ type: 'quizSetMode', mode: 'all', game: g } as Action] : [])]
      const t = targetOf(s, cmd.key)
      if (!t) return []
      const out: Action[] = []
      if (s.quiz.allMode) out.push({ type: 'quizSetAllMode', allMode: false })
      if (isQuizGame(g) && s.quiz.slots[g]?.mode === 'all') out.push({ type: 'quizSetMode', mode: 'turn', game: g } as Action)
      out.push({ type: 'quizSetTurn', target: t, ...(isQuizGame(g) ? { game: g } : {}) } as Action)
      return out
    }
    case 'score': {
      const t = targetOf(s, cmd.key)
      if (!t || !Number.isFinite(cmd.d)) return []
      return [t.kind === 'team' ? { type: 'addTeamScore', index: t.index, delta: cmd.d } : { type: 'addScore', id: t.id, delta: cmd.d }]
    }
    case 'undo':
      return [{ type: 'undo', game: g }]
    case 'plano':
      return [{ type: 'setPlano', plano: cmd.id }]
    case 'preset':
      return [{ type: 'camsPreset', preset: cmd.id }]
    case 'person':
      return [{ type: 'camsToggle', slot: cmd.slot }]
    case 'liveGame':
      return [{ type: 'setLiveGame', game: cmd.game, scene: true }]
    case 'effectsOff':
      return [{ type: 'fxvClear' }]
    case 'auto':
      return [{ type: 'setAudio', patch: { autoSounds: !s.audio.autoSounds } }]
    case 'lowerThird':
      return [{ type: 'setLowerThird', patch: { visible: !s.lowerThird.visible } }]
    case 'answer':
      return isQuizGame(g) ? [{ type: 'quizAnswerAll', key: cmd.key, index: cmd.i, game: g } as Action] : []
    case 'guess':
      return [{ type: 'quizGuess', key: cmd.key, value: cmd.value, game: 'estimacion' } as Action]
    case 'roscoFix':
      return [{ type: 'roscoFix', player: cmd.player, index: cmd.index, status: cmd.status, now }]
    case 'showAll':
      return isQuizGame(g) ? [{ type: 'quizShowAll', now, game: g } as Action] : []
    case 'timer':
      if (cmd.op === 'reset') return [{ type: 'timerReset' }]
      if (cmd.op === 'show') return [{ type: 'timerConfig', patch: { enabled: !s.quiz.timer.enabled } }]
      return [s.quiz.timer.endsAt !== null ? { type: 'timerPause', now } : { type: 'timerStart', now }]
    default:
      // el resto (siguiente paso, marcar, sonidos, música, escenas con F9, cargar pregunta...) lo hace el panel
      return null
  }
}

// ---------------------------------------------------------------- instantánea

/** Lo que solo sabe el panel (pasos, música, banco) y se añade a la instantánea. */
export interface SnapExtras {
  rev: number
  go: { label: string; after: string; enabled: boolean }
  music: { track: string | null; playing: boolean; current: number; duration: number; volume: number }
  fx: string[]
  bank: { ref: string | null; name: string; index: number; count: number } | null
}

export interface SnapOption {
  t: string
  /** right = correcta (solo la ve el presentador); wrong = fallada; gone = quitada (50:50); hidden = aún no sale */
  st: string
}

export interface Snap {
  v: 1
  rev: number
  now: number
  scene: SceneId
  plano: Plano | null
  liveGame: GameId
  hasGame: boolean
  people: { slot: SlotId; name: string; on: boolean }[]
  hostMode: string
  players: { key: string; name: string; score: number; turn: boolean }[]
  teams: boolean
  rebound: boolean
  allMode: boolean
  bribe: boolean
  autoSounds: boolean
  lowerThird: boolean
  timer: { on: boolean; endsAt: number | null; remainingMs: number | null; seconds: number }
  effects: { id: string; label: string; hold: boolean; on: boolean }[]
  go: SnapExtras['go']
  music: SnapExtras['music']
  fx: string[]
  bank: SnapExtras['bank']
  game: SnapGame | null
}

export type SnapGame =
  | {
      kind: 'quiz'
      tipo: string
      text: string
      author?: string
      source?: string
      note?: string
      options: SnapOption[]
      correcta: number
      phase: string
      picked: number | null
      mode: string
      target: string
      reboundTo: string | null
      miss: { name: string; pick: number } | null
      answers: { key: string; name: string; pick: number }[]
      ladder: { level: number; levels: { v: number; safe: boolean }[]; target: string; outcome: string | null; prize: number; lifelines: { name: string; used: boolean }[] } | null
    }
  | {
      kind: 'estimacion'
      text: string
      value: number
      unit: string
      revealed: boolean
      rows: { key: string; name: string; value: number | null; best: boolean; diff: number | null }[]
    }
  | {
      kind: 'rosco'
      turn: number
      finished: boolean
      waiting: boolean
      players: { name: string; ok: number; ko: number; pend: number; remainingMs: number; endsAt: number | null; done: boolean; timeUp: boolean; letters: string; status: string; current: number }[]
      def: { letra: string; modo: string; definicion: string; respuesta: string } | null
      lastKo: { player: number; index: number; letra: string } | null
    }

const nameOfTarget = (s: GameState, t: Target | null | undefined): string => {
  if (!t) return ''
  if (t.kind === 'team') return s.teams[t.index]?.name ?? ''
  return s.contestants.find((c) => c.id === t.id)?.name ?? ''
}

const LETTER_CODE: Record<string, string> = { pend: 'p', ok: 'o', ko: 'k', pasa: 's' }

/** Instantánea compacta del estado para el mando (incluye la respuesta correcta: solo la ve el presentador). */
export function buildSnapshot(s: GameState, x: SnapExtras, now = Date.now()): Snap {
  const turn = currentTurn(s)
  const teams = s.layout === 'teams'
  const players = teams
    ? s.teams.map((t, i) => ({ key: `t${i}`, name: t.name, score: t.score, turn: turn?.kind === 'team' && turn.index === i }))
    : activeContestants(s).map((id) => {
        const c = s.contestants.find((x2) => x2.id === id)!
        return { key: id, name: c.name, score: c.score, turn: !!turn && targetMembers(s, turn).includes(id) }
      })
  const people: Snap['people'] = (['host', ...activeContestants(s), ...(s.cameras.rects.publico ? ['publico'] : [])] as SlotId[]).map((slot) => ({
    slot,
    name: slot === 'host' ? s.host.name : slot === 'publico' ? 'Público' : s.contestants.find((c) => c.id === slot)?.name ?? slot,
    on: !!s.camsScene.on[slot]
  }))
  return {
    v: 1,
    rev: x.rev,
    now,
    scene: s.scene,
    plano: currentPlano(s),
    liveGame: s.liveGame,
    hasGame: hasLiveGame(s),
    people,
    hostMode: s.camsScene.hostMode,
    players,
    teams,
    rebound: s.quiz.rebound,
    allMode: s.quiz.allMode,
    bribe: s.quiz.bribe.enabled,
    autoSounds: s.audio.autoSounds,
    lowerThird: s.lowerThird.visible,
    timer: { on: s.quiz.timer.enabled, endsAt: s.quiz.timer.endsAt, remainingMs: s.quiz.timer.remainingMs, seconds: s.quiz.timer.seconds },
    effects: EFFECTS.map((e) => ({ id: e.id, label: e.label, hold: e.kind === 'hold', on: e.kind === 'hold' && !!s.effects.on[e.id] })),
    go: x.go,
    music: x.music,
    fx: x.fx,
    bank: x.bank,
    game: snapGame(s, now)
  }
}

function snapGame(s: GameState, now: number): SnapGame | null {
  const g = s.liveGame
  if (g === 'rosco') {
    const r = s.rosco
    if (!r.players.length) return null
    const p = r.players[r.turn]
    const l = p?.letters[p.current]
    const lk = r.lastKo && r.players[r.lastKo.player]?.letters[r.lastKo.index]?.status === 'ko' ? r.lastKo : null
    return {
      kind: 'rosco',
      turn: r.turn,
      finished: r.finished,
      waiting: roscoWaiting(r),
      players: r.players.map((pl) => {
        const st = roscoStats(pl)
        return {
          name: nameOfTarget(s, pl.target),
          ok: st.ok,
          ko: st.ko,
          pend: st.pending,
          remainingMs: remainingMs(pl, now),
          endsAt: pl.endsAt,
          done: pl.done,
          timeUp: !!pl.timeUp,
          letters: pl.letters.map((x) => x.letra).join(''),
          status: pl.letters.map((x) => LETTER_CODE[x.status] ?? 'p').join(''),
          current: pl.current
        }
      }),
      def: l && !p.done ? { letra: l.letra, modo: l.modo, definicion: l.definicion, respuesta: l.respuesta } : null,
      lastKo: lk ? { ...lk, letra: r.players[lk.player].letters[lk.index].letra } : null
    }
  }
  const cur = s.quiz.slots[g] ?? null
  const l = s.quiz.ladder
  if (g === 'escalera' && !cur && !l.active) return null
  if (!cur && g !== 'escalera') return null
  if (cur && cur.question.tipo === 'estimacion') {
    const res = cur.estimation
    return {
      kind: 'estimacion',
      text: cur.question.enunciado,
      value: cur.question.valor ?? 0,
      unit: cur.question.unidad ?? '',
      revealed: cur.phase === 'revealed',
      rows: turnTargets(s).map((t) => {
        const k = targetKey(t)
        const row = res?.rows.find((r2) => r2.key === k)
        return { key: k, name: nameOfTarget(s, t), value: cur.guesses[k] ?? null, best: !!res?.winners.includes(k), diff: row ? row.diff : null }
      })
    }
  }
  const q = cur?.question
  const failed = new Set(cur?.attempts.filter((a) => !a.correct).map((a) => a.pick) ?? [])
  const revealed = cur?.phase === 'revealed'
  const miss = lastMiss(cur)
  return {
    kind: 'quiz',
    tipo: q?.tipo ?? 'test',
    text: q?.enunciado ?? '',
    author: q?.tipo === 'quien' ? q.autor : undefined,
    source: q?.tipo === 'quien' ? [q.fuente, q.fecha, q.hora].filter(Boolean).join(' · ') : undefined,
    note: q?.nota_presentador,
    options: (q?.opciones ?? []).map((t, i) => ({
      t,
      st: cur!.hidden.includes(i) ? 'gone' : failed.has(i) ? 'wrong' : i === q!.correcta ? 'right' : i >= cur!.shown && !revealed ? 'hidden' : ''
    })),
    correcta: q?.correcta ?? -1,
    phase: cur?.phase ?? 'ready',
    picked: cur?.picked ?? null,
    mode: cur?.mode ?? (s.quiz.allMode ? 'all' : 'turn'),
    target: nameOfTarget(s, cur?.target ?? s.quiz.turn),
    reboundTo: cur?.reboundTo ? nameOfTarget(s, cur.reboundTo) : null,
    miss: miss ? { name: nameOfTarget(s, miss.target), pick: miss.pick } : null,
    answers: cur ? Object.entries(cur.answers).map(([k, pick]) => ({ key: k, name: nameOfTarget(s, turnTargets(s).find((t) => targetKey(t) === k)), pick })) : [],
    ladder:
      g === 'escalera' && l.active
        ? {
            level: l.level,
            levels: l.levels.map((x) => ({ v: x.value, safe: x.safe })),
            target: nameOfTarget(s, l.target),
            outcome: l.outcome?.kind ?? null,
            prize: l.outcome?.prize ?? 0,
            lifelines: s.quiz.lifelines.map((x) => ({ name: x.name, used: !!l.used[x.id] }))
          }
        : null
  }
}

/** Formato de cifras del mando (igual que el plató). */
export const fmt = (n: number): string => formatNumber(n)

void sameTarget
