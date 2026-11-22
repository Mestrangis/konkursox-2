import { describe, expect, it } from 'vitest'
import type { Question } from '../src/shared/questions'
import type { Target } from '../src/shared/quiz'
import { applyRoscoAction, defaultRosco, type RoscoLetter } from '../src/shared/rosco'
import { applyAction, defaultState } from '../src/shared/state'
import type { Action, GameState } from '../src/shared/types'

const q4: Question = { id: '1', tipo: 'test', enunciado: '¿?', opciones: ['a', 'b', 'c', 'd'], correcta: 2 }
const est: Question = { id: 'e', tipo: 'estimacion', enunciado: '¿Cuántos?', opciones: [], correcta: -1, valor: 100 }
const c1: Target = { kind: 'contestant', id: 'c1' }
const c2: Target = { kind: 'contestant', id: 'c2' }
const run = (s: GameState, ...actions: Action[]) => actions.reduce(applyAction, s)
const score = (s: GameState, id: string) => s.contestants.find((x) => x.id === id)!.score

/** Pregunta cargada para c1, opciones visibles, con puntuación 10 / -5 y suma automática. */
function asked(pick: number, penalize = true): GameState {
  let s: GameState = { ...defaultState(), layout: 'duo' }
  s = run(
    s,
    { type: 'quizSetScoring', patch: { pointsCorrect: 10, penalize, pointsWrong: 5, autoAward: true } },
    { type: 'quizSetTurn', target: c1 },
    { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 },
    { type: 'quizShowAll', now: 1 },
    { type: 'quizPick', index: pick, now: 2 },
    { type: 'quizReveal', now: 3 }
  )
  return s
}

describe('perdonar un fallo', () => {
  it('segunda oportunidad: quita la penalización, la opción queda tachada y vuelve a elegir', () => {
    let s = asked(0)
    expect(score(s, 'c1')).toBe(-5)
    s = run(s, { type: 'quizSecondChance', now: 10 })
    expect(score(s, 'c1')).toBe(0)
    expect(s.quiz.current!.phase).toBe('options')
    expect(s.quiz.current!.picked).toBeNull()
    // la fallada no se puede volver a elegir
    expect(run(s, { type: 'quizPick', index: 0, now: 11 }).quiz.current!.picked).toBeNull()
    s = run(s, { type: 'quizPick', index: 2, now: 12 }, { type: 'quizReveal', now: 13 })
    expect(score(s, 'c1')).toBe(10)
  })

  it('seguir igualmente: suma como acierto si el interruptor está activado, y no si no', () => {
    let s = run(asked(1), { type: 'quizForgive', now: 10 })
    expect(score(s, 'c1')).toBe(10)
    expect(s.quiz.current!.attempts[0].forgiven).toBe(true)
    s = run(asked(1), { type: 'quizSetForgive', patch: { forgiveScores: false } }, { type: 'quizForgive', now: 10 })
    expect(score(s, 'c1')).toBe(0)
    // no se puede perdonar dos veces
    expect(run(s, { type: 'quizForgive', now: 11 })).toBe(s)
  })

  it('el soborno solo sale si está activado', () => {
    expect(run(asked(1), { type: 'quizForgive', now: 10 }).quiz.bribe.at).toBeNull()
    const s = run(asked(1), { type: 'quizSetForgive', patch: { bribe: true } }, { type: 'quizSecondChance', now: 77 })
    expect(s.quiz.bribe.at).toBe(77)
  })
})

describe('escalera al corregir o perdonar', () => {
  function ladder(pick: number): GameState {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = run(
      s,
      { type: 'ladderSetAward', awardToScore: true },
      { type: 'ladderStart', target: c1 },
      { type: 'ladderSetLevel', level: 5 },
      { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0, game: 'escalera' },
      { type: 'quizShowAll', now: 1, game: 'escalera' },
      { type: 'quizPick', index: pick, now: 2, game: 'escalera' },
      { type: 'quizReveal', now: 3, game: 'escalera' }
    )
    return s
  }

  it('al fallar cae al seguro; con segunda oportunidad no cae ni se suma nada', () => {
    let s = ladder(0)
    expect(s.quiz.ladder.outcome?.kind).toBe('failed')
    expect(score(s, 'c1')).toBe(1000)
    s = run(s, { type: 'quizSecondChance', now: 10, game: 'escalera' })
    expect(s.quiz.ladder.outcome).toBeNull()
    expect(s.quiz.ladder.level).toBe(5)
    expect(score(s, 'c1')).toBe(0)
  })

  it('seguir igualmente sube al siguiente escalón', () => {
    const s = run(ladder(0), { type: 'quizForgive', now: 10, game: 'escalera' })
    expect(s.quiz.ladder.outcome).toBeNull()
    expect(s.quiz.ladder.level).toBe(6)
    expect(score(s, 'c1')).toBe(0)
  })

  it('cambiar la correcta tras revelar: de fallo a acierto sube; de acierto a fallo cae', () => {
    let s = run(ladder(0), { type: 'quizSetCorrect', index: 0, game: 'escalera' })
    expect(s.quiz.ladder.outcome).toBeNull()
    expect(s.quiz.ladder.level).toBe(6)
    expect(score(s, 'c1')).toBe(0)
    s = run(ladder(2), { type: 'quizSetCorrect', index: 3, game: 'escalera' })
    expect(s.quiz.ladder.level).toBe(5)
    expect(s.quiz.ladder.outcome?.kind).toBe('failed')
    expect(score(s, 'c1')).toBe(1000)
  })
})

describe('cambiar la respuesta correcta en directo', () => {
  it('antes de revelar solo cambia la pregunta', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = run(s, { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 }, { type: 'quizSetCorrect', index: 1 })
    expect(s.quiz.current!.question.correcta).toBe(1)
  })

  it('después de revelar recalcula los puntos ya sumados', () => {
    let s = asked(0)
    expect(score(s, 'c1')).toBe(-5)
    s = run(s, { type: 'quizSetCorrect', index: 0 })
    expect(s.quiz.current!.attempts[0].correct).toBe(true)
    expect(score(s, 'c1')).toBe(10)
    s = run(s, { type: 'quizSetCorrect', index: 3 })
    expect(score(s, 'c1')).toBe(-5)
  })

  it('en estimación, cambiar la cifra recalcula ganador y puntos', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = run(
      s,
      { type: 'quizSetScoring', patch: { pointsCorrect: 10, autoAward: true } },
      { type: 'quizLoad', key: 'e::e', bankFile: 'e', question: est, now: 0, game: 'estimacion' },
      { type: 'quizGuess', key: 'c1', value: 90, game: 'estimacion' },
      { type: 'quizGuess', key: 'c2', value: 200, game: 'estimacion' },
      { type: 'quizReveal', now: 1, game: 'estimacion' }
    )
    const before = [score(s, 'c1'), score(s, 'c2')]
    expect(before[0]).toBeGreaterThan(before[1])
    s = run(s, { type: 'quizSetValue', value: 210, game: 'estimacion' })
    expect(score(s, 'c2')).toBe(before[0])
    expect(score(s, 'c1')).toBe(before[1])
  })
})

describe('rosco: perdonar un fallo', () => {
  const L = (letra: string, status: RoscoLetter['status'] = 'pend'): RoscoLetter => ({ letra, modo: 'empieza', definicion: '', respuesta: '', qid: letra, status })

  it('un fallo pasa a acierto y, si ya se habían sumado, se ajustan los puntos', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = {
      ...s,
      rosco: {
        ...defaultRosco(),
        active: true,
        pointsPerHit: 10,
        finished: false,
        players: [{ target: c1, letters: [L('A', 'ok'), L('B', 'ko'), L('C', 'pend')], current: 2, remainingMs: 1000, endsAt: null, done: false }]
      }
    }
    s = applyRoscoAction(s, { type: 'roscoMark', result: 'ok', now: 0 })
    expect(s.rosco.finished).toBe(true)
    expect(score(s, 'c1')).toBe(20)
    s = applyRoscoAction(s, { type: 'roscoFix', player: 0, index: 1, status: 'ok', now: 1 })
    expect(score(s, 'c1')).toBe(30)
    expect(s.rosco.awarded).toBe(true)
  })

  it('un fallo pasa a pasapalabra: vuelve a quedar pendiente y los puntos esperan al final', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = {
      ...s,
      rosco: {
        ...defaultRosco(),
        active: true,
        pointsPerHit: 10,
        players: [{ target: c1, letters: [L('A', 'ok'), L('B', 'pend')], current: 1, remainingMs: 1000, endsAt: null, done: false }]
      }
    }
    s = applyRoscoAction(s, { type: 'roscoMark', result: 'ko', now: 0 })
    expect(s.rosco.finished).toBe(true)
    expect(s.rosco.lastKo).toEqual({ player: 0, index: 1 })
    expect(score(s, 'c1')).toBe(10)
    s = applyRoscoAction(s, { type: 'roscoFix', player: 0, index: 1, status: 'pasa', now: 1 })
    expect(s.rosco.finished).toBe(false)
    expect(s.rosco.players[0].done).toBe(false)
    expect(s.rosco.players[0].current).toBe(1)
    expect(score(s, 'c1')).toBe(0)
    s = applyRoscoAction(s, { type: 'roscoMark', result: 'ok', now: 2 })
    expect(score(s, 'c1')).toBe(20)
    void c2
  })
})
