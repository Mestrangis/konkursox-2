import { describe, expect, it } from 'vitest'
import { parseRoscoText, splitBank, toFileBank } from '../src/shared/library'
import { parseBank, type Bank, type Question } from '../src/shared/questions'
import { camsLineup, restoreSnapshot, SCENES, snapshotOf, undoKey } from '../src/shared/scene'
import { applyAction, defaultState, hydrate } from '../src/shared/state'
import type { Action, GameState } from '../src/shared/types'

const q4: Question = { id: '1', tipo: 'test', enunciado: '¿?', opciones: ['a', 'b', 'c', 'd'], correcta: 2 }
const run = (s: GameState, ...a: Action[]) => a.reduce(applyAction, s)

// ---------------------------------------------------------------- escenas

describe('escenas', () => {
  /** Una partida a medias: test con respuesta marcada, estimación con cifras y rosco en marcha. */
  function midGame(): GameState {
    let s: GameState = { ...defaultState(), layout: 'trio' }
    s = run(
      s,
      { type: 'quizSetTurn', target: { kind: 'contestant', id: 'c1' } },
      { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0, game: 'test', stage: true },
      { type: 'quizShowQuestion', game: 'test' },
      { type: 'quizShowAll', now: 0, game: 'test' },
      { type: 'quizPick', index: 1, now: 0, game: 'test' },
      { type: 'quizLoad', key: 'e::1', bankFile: 'e', question: { id: 'e', tipo: 'estimacion', enunciado: '?', opciones: [], correcta: -1, valor: 10 }, now: 0, game: 'estimacion' },
      { type: 'quizGuess', key: 'c2', value: 7, game: 'estimacion' },
      {
        type: 'roscoStart',
        players: [{ target: { kind: 'contestant', id: 'c3' }, letters: [{ letra: 'A', modo: 'empieza', definicion: 'd', respuesta: 'r', qid: 'a', status: 'pend' }] }],
        now: 0
      },
      { type: 'setLiveGame', game: 'test', scene: true }
    )
    return s
  }

  it('cambiar de escena no toca ningún juego', () => {
    const s = midGame()
    for (const sc of SCENES) {
      const t = applyAction(s, { type: 'setScene', scene: sc.id })
      expect(t.scene).toBe(sc.id)
      expect(t.quiz).toBe(s.quiz)
      expect(t.rosco).toBe(s.rosco)
      expect(t.contestants).toBe(s.contestants)
      expect(t.teams).toBe(s.teams)
      expect(t.liveGame).toBe('test')
    }
  })

  it('ir a Cabecera a mitad de pregunta y volver con F3 la deja tal cual', () => {
    const s = midGame()
    const back = run(s, { type: 'setScene', scene: 'cabecera' }, { type: 'setScene', scene: 'camaras' }, { type: 'setScene', scene: 'juego' })
    expect(back.quiz.slots.test).toEqual(s.quiz.slots.test)
    expect(back.quiz.slots.test!.phase).toBe('locked')
    expect(back.quiz.slots.test!.picked).toBe(1)
  })

  it('cada juego guarda su propia pregunta: trabajar en uno no borra el otro', () => {
    const s = midGame()
    expect(s.quiz.slots.test!.question.id).toBe('1')
    expect(s.quiz.slots.estimacion!.guesses).toEqual({ c2: 7 })
    const t = run(s, { type: 'quizReveal', now: 1, game: 'test' })
    expect(t.quiz.slots.estimacion).toBe(s.quiz.slots.estimacion)
    expect(t.quiz.slots.test!.attempts).toHaveLength(1)
  })

  it('cambiar el juego en el aire no toca los juegos', () => {
    const s = midGame()
    const t = applyAction(s, { type: 'setLiveGame', game: 'rosco' })
    expect(t.liveGame).toBe('rosco')
    expect(t.quiz).toBe(s.quiz)
    expect(t.rosco).toBe(s.rosco)
  })

  it('una pregunta cargada sin mostrar queda preparada (no sale en el plató)', () => {
    const s = run(defaultState(), { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0, game: 'test', stage: true })
    expect(s.quiz.slots.test!.phase).toBe('ready')
    expect(run(s, { type: 'quizShowQuestion', game: 'test' }).quiz.slots.test!.phase).toBe('question')
  })

  it('los atajos de cámaras ponen la escena Cámaras y eligen quién sale', () => {
    const s = midGame()
    const todos = applyAction(s, { type: 'camsPreset', preset: 'todos' })
    expect(todos.scene).toBe('camaras')
    expect(todos.quiz).toBe(s.quiz)
    expect(camsLineup(todos)).toEqual(['c1', 'host', 'c2', 'c3'])
    const yo = applyAction(s, { type: 'camsPreset', preset: 'yo' })
    expect(camsLineup(yo)).toEqual(['host'])
    const turno = applyAction(s, { type: 'camsPreset', preset: 'turno' })
    expect(camsLineup(turno)).toEqual(['c1', 'host'])
  })

  it('el presentador va en medio cuando hay concursantes a ambos lados', () => {
    let s: GameState = { ...defaultState(), layout: 'quad' }
    s = applyAction(s, { type: 'camsPreset', preset: 'todos' })
    expect(camsLineup(s)).toEqual(['c1', 'c2', 'host', 'c3', 'c4'])
    s = applyAction(s, { type: 'camsToggle', slot: 'c4' })
    expect(camsLineup(s)).toEqual(['c1', 'host', 'c2', 'c3'])
  })

  it('deshacer restaura el juego pero no la escena', () => {
    const s = midGame()
    const step: Action = { type: 'quizReveal', now: 1, game: 'test' }
    expect(undoKey(step, s)).toBe('test')
    expect(undoKey({ type: 'setScene', scene: 'final' }, s)).toBeNull()
    expect(undoKey({ type: 'roscoMark', result: 'ok', now: 0 }, s)).toBe('rosco')
    const snap = snapshotOf(s)
    const after = run(s, step, { type: 'setScene', scene: 'final' })
    const undone = restoreSnapshot(after, snap)
    expect(undone.quiz.slots.test!.phase).toBe('locked')
    expect(undone.contestants).toEqual(s.contestants)
    expect(undone.scene).toBe('final')
  })

  it('un estado guardado por versiones anteriores se abre bien', () => {
    const old = { view: 'quiz', layout: 'logo', quiz: { current: { question: q4, phase: 'options' } }, show: { played: ['s1', 's2'], extraPlayed: 1 } }
    const s = hydrate(old)
    expect(s.scene).toBe('cabecera')
    expect(s.layout).toBe('quad')
    expect(s.quiz.current!.mode).toBe('turn')
    expect(s.show.played.length + s.show.extra).toBe(3)
  })
})

// ---------------------------------------------------------------- migración de bancos

describe('migración de bancos a la biblioteca por tipo', () => {
  const mixed: Bank = parseBank(
    {
      nombre: 'Mezcla',
      preguntas: [
        { id: '1', tipo: 'test', enunciado: 'a', opciones: ['x', 'y'], correcta: 0 },
        { id: '2', tipo: 'sino', enunciado: 'b', opciones: ['Sí', 'No'], correcta: 1 },
        { id: '3', tipo: 'estimacion', enunciado: 'c', respuesta: 10, unidad: 'km' },
        { id: '4', tipo: 'quien', frase: 'd', autor: 'Ana', opciones: ['Ana', 'Luis'] },
        { id: 'r1', tipo: 'rosco', letra: 'A', definicion: 'uno', respuesta: 'a1' },
        { id: 'r2', tipo: 'rosco', letra: 'A', definicion: 'dos', respuesta: 'a2' },
        { id: 'r3', tipo: 'rosco', letra: 'B', definicion: 'tres', respuesta: 'b1' }
      ]
    },
    'mezcla'
  )

  it('separa las preguntas por tipo', () => {
    const parts = splitBank(mixed, 'mezcla.json')
    const by = Object.fromEntries(parts.map((p) => [`${p.tipo}/${p.file}`, p.bank.preguntas.map((q) => q.id)]))
    expect(by['test/mezcla.json']).toEqual(['1'])
    expect(by['sino/mezcla.json']).toEqual(['2'])
    expect(by['estimacion/mezcla.json']).toEqual(['3'])
    expect(by['quien/mezcla.json']).toEqual(['4'])
  })

  it('un rosco con varias definiciones por letra se parte en un rosco por vuelta', () => {
    const roscos = splitBank(mixed, 'mezcla.json').filter((p) => p.tipo === 'rosco')
    expect(roscos.map((r) => r.file)).toEqual(['mezcla-1.json', 'mezcla-2.json'])
    expect(roscos[0].bank.preguntas.map((q) => q.id)).toEqual(['r1', 'r3'])
    expect(roscos[1].bank.preguntas.map((q) => q.id)).toEqual(['r2'])
    expect(roscos[1].bank.nombre).toBe('Mezcla 2')
  })

  it('las preguntas usadas del estado antiguo quedan marcadas en el banco', () => {
    const parts = splitBank(mixed, 'mezcla.json', { 'mezcla.json::1': true, 'otro.json::2': true }, '2026-11-21')
    const test = parts.find((p) => p.tipo === 'test')!.bank.preguntas[0]
    const sino = parts.find((p) => p.tipo === 'sino')!.bank.preguntas[0]
    expect(test.usada).toBe('2026-11-21')
    expect(sino.usada).toBeUndefined()
  })

  it('lo que se guarda se vuelve a leer igual', () => {
    for (const part of splitBank(mixed, 'mezcla.json')) {
      const again = parseBank(JSON.parse(JSON.stringify(toFileBank(part.bank))), 'x')
      expect(again.preguntas).toEqual(part.bank.preguntas)
    }
  })

  it('importar rosco desde texto', () => {
    const rows = parseRoscoText('A: Fruto seco del almendro = Almendra\nÑ (contiene): Período de doce meses | Año\nbasura\nz - Calzado = Zapato')
    expect(rows).toEqual([
      { letra: 'A', modo: 'empieza', definicion: 'Fruto seco del almendro', respuesta: 'Almendra' },
      { letra: 'Ñ', modo: 'contiene', definicion: 'Período de doce meses', respuesta: 'Año' },
      { letra: 'Z', modo: 'empieza', definicion: 'Calzado', respuesta: 'Zapato' }
    ])
  })
})
