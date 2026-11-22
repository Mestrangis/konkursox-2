import { describe, expect, it } from 'vitest'
import { estimationPoints, estimationResult, finalStandings, niceScale, quienOptions, roman, winnerWord } from '../src/shared/games'
import type { Question } from '../src/shared/questions'
import type { Target } from '../src/shared/quiz'
import { buildLetters, defaultRosco, nextLetter, roscoMark, roscoPassTurn, roscoPoints, roscoStats, roscoTimeUp, roscoWaiting, roscoWinners, type RoscoLetter, type RoscoState } from '../src/shared/rosco'
import { applyAction, defaultState } from '../src/shared/state'
import type { GameState } from '../src/shared/types'

// ---------------------------------------------------------------- rosco

const L = (letra: string): RoscoLetter => ({ letra, modo: 'empieza', definicion: 'def ' + letra, respuesta: letra, qid: letra, status: 'pend' })
const c1: Target = { kind: 'contestant', id: 'c1' }
const c2: Target = { kind: 'contestant', id: 'c2' }

function rosco(players: number, letters = 'ABC', seconds = 100): RoscoState {
  return {
    ...defaultRosco(),
    active: true,
    seconds,
    players: [c1, c2].slice(0, players).map((target) => ({
      target,
      letters: letters.split('').map(L),
      current: 0,
      remainingMs: seconds * 1000,
      endsAt: 0 + seconds * 1000,
      done: false
    }))
  }
}
const statuses = (r: RoscoState, i = 0) => r.players[i].letters.map((l) => l.status).join(',')

describe('rosco', () => {
  it('construye una letra por cada letra con definición (incluida la Ñ) y evita las ya usadas', () => {
    const qs: Question[] = [
      { id: '1', tipo: 'rosco', enunciado: 'a1', opciones: [], correcta: -1, letra: 'A', modo: 'empieza', respuesta: 'x' },
      { id: '2', tipo: 'rosco', enunciado: 'a2', opciones: [], correcta: -1, letra: 'A', modo: 'empieza', respuesta: 'y' },
      { id: '3', tipo: 'rosco', enunciado: 'ñ', opciones: [], correcta: -1, letra: 'Ñ', modo: 'contiene', respuesta: 'año' }
    ]
    const ls = buildLetters(qs, new Set(['1']))
    expect(ls.map((l) => l.letra)).toEqual(['A', 'Ñ'])
    expect(ls[0].qid).toBe('2')
    expect(ls[1].modo).toBe('contiene')
  })

  it('las pasadas vuelven en la siguiente vuelta', () => {
    let r = rosco(1)
    r = roscoMark(r, 'pasa', 10) // A pasa
    expect(r.players[0].current).toBe(1)
    expect(r.players[0].endsAt).toBeNull() // el reloj se para al pasar
    r = roscoMark(r, 'ok', 10) // B
    r = roscoMark(r, 'ok', 10) // C -> vuelve a A
    expect(r.players[0].current).toBe(0)
    r = roscoMark(r, 'ok', 10)
    expect(statuses(r)).toBe('ok,ok,ok')
    expect(r.players[0].done).toBe(true)
    expect(r.finished).toBe(true)
  })

  it('con dos jugadores el turno cambia al fallar o pasar, no al acertar', () => {
    let r = rosco(2)
    r = roscoMark(r, 'ok', 10)
    expect(r.turn).toBe(0)
    r = roscoMark(r, 'ko', 10)
    expect(r.turn).toBe(1)
    expect(r.players[0].endsAt).toBeNull()
    r = roscoMark(r, 'pasa', 10)
    expect(r.turn).toBe(0)
  })

  it('si un jugador termina, sigue el otro hasta acabar', () => {
    let r = rosco(2, 'A')
    r = roscoMark(r, 'ok', 0) // jugador 0 termina
    expect(r.turn).toBe(1)
    expect(r.finished).toBe(false)
    r = roscoMark(r, 'ko', 0)
    expect(r.finished).toBe(true)
  })

  it('al acabarse el tiempo se para y NO pasa el turno hasta "Pasar turno"', () => {
    let r = rosco(2, 'AB', 10)
    // solo corre el reloj del que tiene el turno
    r = { ...r, players: [r.players[0], { ...r.players[1], endsAt: null }] }
    expect(roscoTimeUp(r, 5000)).toBe(r)
    r = roscoTimeUp(r, 10000)
    expect(r.players[0].done).toBe(true)
    expect(r.players[0].timeUp).toBe(true)
    expect(r.players[0].remainingMs).toBe(0)
    expect(r.players[0].endsAt).toBeNull()
    // sigue siendo su turno, esperando
    expect(r.turn).toBe(0)
    expect(roscoWaiting(r)).toBe(true)
    expect(r.finished).toBe(false)
    // al pulsar "Pasar turno" juega el otro y arranca su reloj
    r = roscoPassTurn(r, 20000)
    expect(r.turn).toBe(1)
    expect(roscoWaiting(r)).toBe(false)
    expect(r.players[1].endsAt).toBe(20000 + r.players[1].remainingMs)
  })

  it('con un solo jugador, acabarse el tiempo termina el rosco', () => {
    let r = rosco(1, 'AB', 10)
    r = roscoTimeUp(r, 10000)
    expect(r.finished).toBe(true)
    expect(roscoWaiting(r)).toBe(false)
  })

  it('cambiar turno (Tab) cambia de concursante sin marcar pasapalabra', () => {
    let r = rosco(2, 'ABC', 100)
    r = roscoPassTurn(r, 5000)
    expect(r.turn).toBe(1)
    // la letra del primero sigue pendiente (no pasada) y su reloj está parado
    expect(r.players[0].letters[0].status).toBe('pend')
    expect(r.players[0].current).toBe(0)
    expect(r.players[0].endsAt).toBeNull()
    expect(r.players[0].remainingMs).toBe(95000)
    expect(r.players[1].endsAt).not.toBeNull()
    // y vuelta
    r = roscoPassTurn(r, 6000)
    expect(r.turn).toBe(0)
    expect(r.players[0].endsAt).toBe(6000 + 95000)
  })

  it('pasar turno no hace nada si el otro ya ha terminado', () => {
    let r = rosco(2, 'A', 100)
    r = { ...r, players: [r.players[0], { ...r.players[1], done: true }] }
    expect(roscoPassTurn(r, 1000)).toBe(r)
  })

  it('ganador por aciertos y, a igualdad, por menos fallos; puntos y bote', () => {
    const r = rosco(2, 'ABC')
    r.players[0].letters = r.players[0].letters.map((l, i) => ({ ...l, status: i < 2 ? 'ok' : 'ko' }))
    r.players[1].letters = r.players[1].letters.map((l, i) => ({ ...l, status: i < 2 ? 'ok' : 'pend' }))
    expect(roscoWinners(r)).toEqual([1])
    expect(roscoStats(r.players[1])).toEqual({ ok: 2, ko: 0, pending: 1 })
    const full = { ...r, pointsPerHit: 10, jackpot: 500 }
    full.players[1] = { ...full.players[1], letters: full.players[1].letters.map((l) => ({ ...l, status: 'ok' as const })) }
    expect(roscoPoints(full)).toEqual([20, 530])
    expect(nextLetter(full.players[1].letters, 0)).toBeNull()
  })

  it('en el reducer, al acabar se suman los puntos una sola vez', () => {
    let s: GameState = { ...defaultState(), layout: 'duo' }
    s = applyAction(s, { type: 'roscoConfig', patch: { pointsPerHit: 5 } })
    s = applyAction(s, { type: 'roscoStart', players: [{ target: c1, letters: ['A', 'B'].map(L) }] })
    expect(s.rosco.active).toBe(true)
    s = applyAction(s, { type: 'roscoMark', result: 'ok', now: 0 })
    s = applyAction(s, { type: 'roscoMark', result: 'ok', now: 0 })
    expect(s.rosco.finished).toBe(true)
    expect(s.contestants[0].score).toBe(10)
    s = applyAction(s, { type: 'roscoFinish' })
    expect(s.contestants[0].score).toBe(10)
  })
})

// ---------------------------------------------------------------- estimación

describe('estimación', () => {
  const g = (o: Record<string, number>) => Object.entries(o).map(([key, value]) => ({ key, value }))

  it('gana el más cercano (por arriba o por abajo)', () => {
    const r = estimationResult(21196, g({ c1: 8000, c2: 25000, c3: 18500, c4: 40000 }), false)
    expect(r.winners).toEqual(['c3'])
    expect(r.rows.map((x) => x.key)).toEqual(['c3', 'c2', 'c1', 'c4'])
    expect(r.rows[0].diff).toBe(2696)
  })

  it('precio justo: quien se pasa queda fuera', () => {
    const r = estimationResult(100, g({ c1: 101, c2: 90, c3: 50 }), true)
    expect(r.winners).toEqual(['c2'])
    expect(r.rows.find((x) => x.key === 'c1')!.rank).toBeNull()
    expect(estimationResult(100, g({ c1: 101, c2: 150 }), true).winners).toEqual([])
    // acertar exacto no es pasarse
    expect(estimationResult(100, g({ c1: 100, c2: 99 }), true).winners).toEqual(['c1'])
  })

  it('empates: comparten puesto y puntos', () => {
    const r = estimationResult(50, g({ c1: 40, c2: 60, c3: 70, c4: 30 }), false)
    expect(r.winners.sort()).toEqual(['c1', 'c2'])
    const rank = Object.fromEntries(r.rows.map((x) => [x.key, x.rank]))
    expect(rank).toEqual({ c1: 1, c2: 1, c3: 3, c4: 3 })
    expect(estimationPoints(r, { priceIsRight: false, mode: 'closest', ranked: [] }, 10)).toEqual({ c1: 10, c2: 10, c3: 0, c4: 0 })
    expect(estimationPoints(r, { priceIsRight: false, mode: 'ranked', ranked: [10, 6, 3, 1] }, 10)).toEqual({ c1: 10, c2: 10, c3: 3, c4: 3 })
  })

  it('escala de la recta', () => {
    const s = niceScale(40000)
    expect(s.max).toBeGreaterThanOrEqual(40000)
    expect(s.max % s.step).toBe(0)
  })

  it('en el reducer: cifras, revelado y puntos al más cercano', () => {
    let s: GameState = { ...defaultState(), layout: 'trio' }
    const q: Question = { id: 'e1', tipo: 'estimacion', enunciado: '¿?', opciones: [], correcta: -1, valor: 100, unidad: 'km' }
    s = applyAction(s, { type: 'quizLoad', key: 'b::e1', bankFile: 'b', question: q, now: 0 })
    s = applyAction(s, { type: 'quizGuess', key: 'c1', value: 80 })
    s = applyAction(s, { type: 'quizGuess', key: 'c2', value: 110 })
    s = applyAction(s, { type: 'quizReveal', now: 5 })
    expect(s.quiz.current!.estimation!.winners).toEqual(['c2'])
    expect(s.contestants.map((c) => c.score)).toEqual([0, 10, 0, 0])
  })
})

// ---------------------------------------------------------------- todos responden

describe('todos responden', () => {
  it('cada uno marca, nadie lo ve hasta revelar, y se reparten los puntos', () => {
    let s: GameState = { ...defaultState(), layout: 'trio' }
    const q: Question = { id: '1', tipo: 'test', enunciado: '¿?', opciones: ['a', 'b', 'c', 'd'], correcta: 1 }
    s = applyAction(s, { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q, now: 0, mode: 'all' })
    s = applyAction(s, { type: 'quizShowAll', now: 0 })
    s = applyAction(s, { type: 'quizAnswerAll', key: 'c1', index: 1 })
    s = applyAction(s, { type: 'quizAnswerAll', key: 'c2', index: 3 })
    s = applyAction(s, { type: 'quizAnswerAll', key: 'c3', index: 1 })
    expect(s.quiz.current!.phase).toBe('options')
    s = applyAction(s, { type: 'quizReveal', now: 0 })
    expect(s.contestants.map((c) => c.score)).toEqual([10, 0, 10, 0])
    expect(s.quiz.current!.attempts.filter((a) => a.correct)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------- quién lo dijo

describe('quién lo dijo', () => {
  it('completa las opciones con las personas del grupo e incluye siempre al autor', () => {
    const q: Question = { id: 'q', tipo: 'quien', enunciado: 'frase', opciones: [], correcta: -1, autor: 'Marta' }
    const r = quienOptions(q, ['Sergio', 'Dani', 'Marta', 'Pablo', 'Irene'])
    expect(r.opciones).toHaveLength(4)
    expect(r.opciones[r.correcta]).toBe('Marta')
    expect(new Set(r.opciones).size).toBe(4)
    const many = quienOptions({ ...q, opciones: ['A', 'B', 'C', 'D', 'E', 'Marta'] }, [])
    expect(many.opciones).toHaveLength(4)
    expect(many.opciones).toContain('Marta')
  })
})

// ---------------------------------------------------------------- clasificación final

describe('clasificación final', () => {
  it('ordena por puntos con empates en el mismo puesto', () => {
    const { standings, winners } = finalStandings([
      { key: 'c1', name: 'Lucía', score: 1080 },
      { key: 'c2', name: 'Dani', score: 870 },
      { key: 'c3', name: 'Irene', score: 1240 },
      { key: 'c4', name: 'Pablo', score: 870 }
    ])
    expect(standings.map((s) => `${s.position}${s.key}`)).toEqual(['1c3', '2c1', '3c2', '3c4'])
    expect(winners).toEqual(['c3'])
  })

  it('empate en cabeza: varios ganadores', () => {
    const { winners, standings } = finalStandings([
      { key: 'a', name: 'A', score: 50 },
      { key: 'b', name: 'B', score: 50 },
      { key: 'c', name: 'C', score: 10 }
    ])
    expect(winners).toEqual(['a', 'b'])
    expect(standings[2].position).toBe(3)
  })

  it('ganador, ganadora, ganadores y ganadoras', () => {
    expect(winnerWord(['m'], false)).toBe('Ganador')
    expect(winnerWord([null], false)).toBe('Ganador')
    expect(winnerWord(['f'], false)).toBe('Ganadora')
    expect(winnerWord(['f', 'f'], false)).toBe('Ganadoras')
    expect(winnerWord(['f', 'm'], false)).toBe('Ganadores')
    expect(winnerWord([null], true)).toBe('Ganadores')
  })

  it('numerales romanos', () => {
    expect([1, 2, 3, 4, 5, 9].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'IX'])
  })
})
