import { describe, expect, it } from 'vitest'
import type { Question } from '../src/shared/questions'
import {
  applyDelta,
  defaultLadder,
  defaultLevels,
  fiftyFifty,
  formatPoints,
  ladderAnswer,
  ladderBank,
  ladderSafe,
  ladderWalkAway,
  nextTarget,
  scoreDelta,
  turnTargets,
  type Target
} from '../src/shared/quiz'
import { applyAction, defaultState } from '../src/shared/state'
import type { Action, GameState } from '../src/shared/types'

const q4: Question = { id: '1', tipo: 'test', enunciado: '¿?', opciones: ['a', 'b', 'c', 'd'], correcta: 2 }
const c = (id: 'c1' | 'c2' | 'c3' | 'c4'): Target => ({ kind: 'contestant', id })
const run = (s: GameState, ...actions: Action[]) => actions.reduce(applyAction, s)
const score = (s: GameState, id: string) => s.contestants.find((x) => x.id === id)!.score

describe('puntuación', () => {
  it('acierto suma, fallo resta solo si está activado', () => {
    const sc = { pointsCorrect: 10, penalize: false, pointsWrong: 5, autoAward: true }
    expect(scoreDelta(sc, true)).toBe(10)
    expect(scoreDelta(sc, false)).toBe(0)
    expect(scoreDelta({ ...sc, penalize: true }, false)).toBe(-5)
    expect(scoreDelta({ ...sc, penalize: true, pointsWrong: -7 }, false)).toBe(-7)
  })
  it('aplica a concursante o a equipo', () => {
    const s = defaultState()
    expect(score(applyDelta(s, c('c2'), 15), 'c2')).toBe(15)
    expect(applyDelta(s, { kind: 'team', index: 1 }, 20).teams[1].score).toBe(20)
    expect(applyDelta(s, null, 20)).toBe(s)
  })
  it('formatea con puntos de millar', () => {
    expect(formatPoints(1000000)).toBe('1.000.000')
    expect(formatPoints(4000)).toBe('4.000')
    expect(formatPoints(300)).toBe('300')
    expect(formatPoints(-1500)).toBe('-1.500')
  })
})

describe('turnos y rebote', () => {
  it('rueda según la plantilla', () => {
    const s = { ...defaultState(), layout: 'trio' as const }
    const t = turnTargets(s)
    expect(t.map((x) => (x.kind === 'contestant' ? x.id : x.index))).toEqual(['c1', 'c2', 'c3'])
    expect(nextTarget(t, c('c3'))).toEqual(c('c1'))
    expect(nextTarget(t, c('c1'), [c('c1'), c('c2')])).toEqual(c('c3'))
    expect(nextTarget(t, c('c1'), t)).toBeNull()
    expect(turnTargets({ ...s, layout: 'teams' })).toEqual([
      { kind: 'team', index: 0 },
      { kind: 'team', index: 1 }
    ])
  })

  it('flujo completo: acierto suma al del turno', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = run(s, { type: 'quizSetTurn', target: c('c2') }, { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 })
    s = run(s, { type: 'quizShowAll', now: 0 }, { type: 'quizPick', index: 2, now: 0 }, { type: 'quizReveal', now: 0 })
    expect(s.quiz.current!.phase).toBe('revealed')
    expect(score(s, 'c2')).toBe(10)
    expect(s.quiz.used['b::1']).toBe(true)
  })

  it('fallo con rebote pasa al siguiente sin desvelar y resta si está activado', () => {
    let s: GameState = { ...defaultState(), layout: 'trio' }
    s = run(
      s,
      { type: 'quizSetScoring', patch: { penalize: true, pointsWrong: 5 } },
      { type: 'quizSetTurn', target: c('c1') },
      { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 },
      { type: 'quizShowAll', now: 0 },
      { type: 'quizPick', index: 0, now: 0 },
      { type: 'quizReveal', now: 0 }
    )
    expect(s.quiz.current!.phase).toBe('options')
    expect(s.quiz.current!.target).toEqual(c('c2'))
    expect(score(s, 'c1')).toBe(-5)
    // no se puede volver a marcar la opción fallada
    expect(run(s, { type: 'quizPick', index: 0, now: 0 }).quiz.current!.picked).toBeNull()
    s = run(s, { type: 'quizPick', index: 2, now: 0 }, { type: 'quizReveal', now: 0 })
    expect(s.quiz.current!.phase).toBe('revealed')
    expect(score(s, 'c2')).toBe(10)
  })

  it('sin rebote se desvela al primer fallo; sin autoAward hay que sumar a mano una sola vez', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = run(
      s,
      { type: 'quizSetOptions', patch: { rebound: false } },
      { type: 'quizSetScoring', patch: { autoAward: false } },
      { type: 'quizSetTurn', target: c('c1') },
      { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 },
      { type: 'quizShowAll', now: 0 },
      { type: 'quizPick', index: 2, now: 0 },
      { type: 'quizReveal', now: 0 }
    )
    expect(score(s, 'c1')).toBe(0)
    s = run(s, { type: 'quizAward' }, { type: 'quizAward' })
    expect(score(s, 'c1')).toBe(10)
  })

  it('rota el turno al lanzar la siguiente pregunta', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = run(s, { type: 'quizSetTurn', target: c('c1') }, { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 })
    expect(s.quiz.current!.target).toEqual(c('c1'))
    s = run(s, { type: 'quizLoad', key: 'b::2', bankFile: 'b', question: q4, now: 0 })
    expect(s.quiz.current!.target).toEqual(c('c2'))
  })

  it('el temporizador arranca al mostrar todas las opciones y se para al marcar', () => {
    let s: GameState = defaultState()
    s = run(s, { type: 'timerConfig', patch: { enabled: true, seconds: 20 } }, { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 })
    s = run(s, { type: 'quizShowAll', now: 1000 })
    expect(s.quiz.timer.endsAt).toBe(21000)
    s = run(s, { type: 'quizPick', index: 1, now: 6000 })
    expect(s.quiz.timer.endsAt).toBeNull()
    expect(s.quiz.timer.remainingMs).toBe(15000)
  })
})

describe('escalera', () => {
  const levels = defaultLevels()

  it('15 niveles con seguros en 5, 10 y 15', () => {
    expect(levels).toHaveLength(15)
    expect(levels.filter((l) => l.safe).map((l) => l.value)).toEqual([1000, 32000, 1000000])
  })

  it('lo ganado y el seguro según el escalón', () => {
    expect(ladderBank(levels, 0)).toBe(0)
    expect(ladderBank(levels, 7)).toBe(4000)
    expect(ladderSafe(levels, 4)).toBe(0)
    expect(ladderSafe(levels, 5)).toBe(1000)
    expect(ladderSafe(levels, 12)).toBe(32000)
  })

  it('acertar sube, fallar cae al seguro, plantarse se lleva lo ganado', () => {
    let l = { ...defaultLadder(), active: true, level: 6 }
    l = ladderAnswer(l, true)
    expect(l.level).toBe(7)
    expect(ladderAnswer(l, false).outcome).toEqual({ kind: 'failed', prize: 1000 })
    expect(ladderWalkAway(l).outcome).toEqual({ kind: 'walked', prize: 4000 })
    expect(ladderAnswer({ ...defaultLadder(), level: 2 }, false).outcome).toEqual({ kind: 'failed', prize: 0 })
  })

  it('acertar la última gana el premio máximo; con desenlace ya no cambia', () => {
    const l = ladderAnswer({ ...defaultLadder(), active: true, level: 14 }, true)
    expect(l.outcome).toEqual({ kind: 'won', prize: 1000000 })
    expect(ladderAnswer(l, false)).toBe(l)
    expect(ladderWalkAway(l)).toBe(l)
  })

  it('escalera personalizada sin seguros: fallar deja a 0', () => {
    const custom = { ...defaultLadder(), levels: [{ value: 10, safe: false }, { value: 20, safe: false }], level: 1 }
    expect(ladderAnswer(custom, false).outcome).toEqual({ kind: 'failed', prize: 0 })
    expect(ladderAnswer(custom, true).outcome).toEqual({ kind: 'won', prize: 20 })
  })

  it('partida en el reducer: no suma puntos normales y al fallar suma el seguro una sola vez', () => {
    let s: GameState = { ...defaultState(), layout: 'solo' }
    s = run(s, { type: 'ladderStart', target: c('c1') }, { type: 'ladderSetLevel', level: 5 })
    s = run(s, { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0 }, { type: 'quizShowAll', now: 0 })
    s = run(s, { type: 'quizPick', index: 2, now: 0 }, { type: 'quizReveal', now: 0 })
    expect(s.quiz.ladder.level).toBe(6)
    expect(score(s, 'c1')).toBe(0)
    s = run(s, { type: 'quizLoad', key: 'b::2', bankFile: 'b', question: q4, now: 0 }, { type: 'quizShowAll', now: 0 })
    s = run(s, { type: 'quizPick', index: 0, now: 0 }, { type: 'quizReveal', now: 0 })
    expect(s.quiz.ladder.outcome).toEqual({ kind: 'failed', prize: 1000 })
    expect(score(s, 'c1')).toBe(1000)
    s = run(s, { type: 'quizAward' }, { type: 'ladderWalk' })
    expect(score(s, 'c1')).toBe(1000)
  })

  it('plantarse suma lo ganado y muestra la pantalla final', () => {
    let s: GameState = defaultState()
    s = run(s, { type: 'ladderStart', target: { kind: 'team', index: 0 } }, { type: 'ladderSetLevel', level: 7 }, { type: 'ladderWalk' })
    expect(s.quiz.ladder.showResult).toBe(true)
    expect(s.teams[0].score).toBe(4000)
  })

  it('50:50 quita dos incorrectas y nunca la correcta', () => {
    for (let i = 0; i < 50; i++) {
      const h = fiftyFifty(q4)
      expect(h).toHaveLength(2)
      expect(h).not.toContain(2)
      expect(new Set(h).size).toBe(2)
    }
    expect(fiftyFifty({ ...q4, opciones: ['sí', 'no'], correcta: 0 })).toEqual([])
  })
})
