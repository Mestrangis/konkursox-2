import { describe, expect, it } from 'vitest'
import type { Question } from '../src/shared/questions'
import { acceptRemote, buildSnapshot, clockLeft, cmdToActions, snapKey, type SnapExtras } from '../src/shared/remote'
import { remainingMs } from '../src/shared/rosco'
import { currentPlano } from '../src/shared/scene'
import { applyAction, defaultState, hydrate } from '../src/shared/state'
import type { Action, GameState } from '../src/shared/types'

const q4: Question = { id: '1', tipo: 'test', enunciado: '¿Año del grupo?', opciones: ['2014', '2016', '2018', '2019'], correcta: 1, nota_presentador: 'Solo tú' }
const run = (s: GameState, ...a: Action[]) => a.reduce(applyAction, s)
const apply = (s: GameState, acts: Action[] | null) => (acts ? run(s, ...acts) : s)
const extras = (rev = 1): SnapExtras => ({
  rev,
  go: { label: 'Mostrar pregunta', after: '', enabled: true },
  music: { track: null, playing: false, current: 0, duration: 0, volume: 0.8 },
  fx: ['Acierto', 'Fallo'],
  bank: null
})
const base = (): GameState => run({ ...defaultState(), layout: 'trio' })
const withTest = (): GameState =>
  run(
    base(),
    { type: 'quizSetTurn', target: { kind: 'contestant', id: 'c1' } },
    { type: 'quizLoad', key: 'b::1', bankFile: 'b', question: q4, now: 0, game: 'test' },
    { type: 'setLiveGame', game: 'test', scene: true }
  )

describe('el mando: cuándo se acepta un comando', () => {
  it('si vio el estado actual, siempre', () => {
    expect(acceptRemote({ t: 'go' }, 5, 5, 1000, 1001)).toBe(true)
  })
  it('si el panel acaba de hacer algo que el mando no vio, manda el panel', () => {
    expect(acceptRemote({ t: 'go' }, 4, 5, 1000, 1500)).toBe(false)
  })
  it('si el estado cambió hace rato (o por el propio mando), se acepta', () => {
    expect(acceptRemote({ t: 'go' }, 4, 5, 1000, 3000)).toBe(true)
  })
  it('pedir el estado o la lista de preguntas nunca choca', () => {
    expect(acceptRemote({ t: 'hello' }, 0, 99, 1000, 1001)).toBe(true)
    expect(acceptRemote({ t: 'bank' }, 0, 99, 1000, 1001)).toBe(true)
  })
})

describe('el mando: comandos que son acciones directas', () => {
  it('puntos a un concursante o a un equipo', () => {
    let s = apply(base(), cmdToActions({ t: 'score', key: 'c2', d: 10 }, base()))
    expect(s.contestants.find((c) => c.id === 'c2')!.score).toBe(10)
    s = run(base(), { type: 'setFormat', teams: true })
    s = apply(s, cmdToActions({ t: 'score', key: 't1', d: -5 }, s))
    expect(s.teams[1].score).toBe(-5)
  })
  it('turno a uno concreto o a todos', () => {
    let s = withTest()
    s = apply(s, cmdToActions({ t: 'turn', key: 'c3' }, s))
    expect(s.quiz.turn).toEqual({ kind: 'contestant', id: 'c3' })
    s = apply(s, cmdToActions({ t: 'turn', key: 'all' }, s))
    expect(s.quiz.allMode).toBe(true)
    expect(s.quiz.slots.test!.mode).toBe('all')
    s = apply(s, cmdToActions({ t: 'turn', key: 'c1' }, s))
    expect(s.quiz.allMode).toBe(false)
    expect(s.quiz.slots.test!.mode).toBe('turn')
  })
  it('cambiar la correcta va al juego en el aire', () => {
    const s = apply(withTest(), cmdToActions({ t: 'setCorrect', i: 3 }, withTest()))
    expect(s.quiz.slots.test!.question.correcta).toBe(3)
  })
  it('plano, escena y quién sale', () => {
    let s = withTest()
    s = apply(s, cmdToActions({ t: 'plano', id: 'limpio' }, s))
    expect(currentPlano(s)).toBe('limpio')
    s = apply(s, cmdToActions({ t: 'plano', id: 'sincam' }, s))
    expect(s.scene).toBe('juego')
    expect(currentPlano(s)).toBe('sincam')
    s = apply(s, cmdToActions({ t: 'person', slot: 'host' }, s))
    expect(s.camsScene.on.host).toBe(true)
  })
  it('los pasos del juego, sonidos y música los ejecuta el panel (no son acciones directas)', () => {
    for (const t of ['go', 'sound', 'music', 'load', 'pick', 'lifeline', 'rosco'] as const) expect(cmdToActions({ t } as never, base())).toBeNull()
  })
})

describe('el mando: instantánea del estado', () => {
  it('lleva la pregunta del juego en el aire con la correcta marcada y lo que falta por salir', () => {
    let s = run(withTest(), { type: 'quizShowQuestion', game: 'test' }, { type: 'quizShowNext', now: 1, game: 'test' })
    const snap = buildSnapshot(s, extras(7), 1000)
    expect(snap.rev).toBe(7)
    expect(snap.liveGame).toBe('test')
    expect(snap.game?.kind).toBe('quiz')
    if (snap.game?.kind !== 'quiz') return
    expect(snap.game.text).toBe('¿Año del grupo?')
    expect(snap.game.correcta).toBe(1)
    expect(snap.game.options.map((o) => o.st)).toEqual(['', 'right', 'hidden', 'hidden'])
    expect(snap.game.note).toBe('Solo tú')
    expect(snap.game.target).toBe(s.contestants[0].name)
    // tras marcar y fallar
    s = run(s, { type: 'quizShowAll', now: 2, game: 'test' }, { type: 'quizPick', index: 0, now: 3, game: 'test' }, { type: 'quizReveal', now: 4, game: 'test' })
    const g = buildSnapshot(s, extras(8)).game
    if (g?.kind !== 'quiz') throw new Error('quiz')
    expect(g.options[0].st).toBe('wrong')
    expect(g.miss?.pick).toBe(0)
  })
  it('marcador con el turno y personas de la fila de realización', () => {
    const snap = buildSnapshot(withTest(), extras())
    expect(snap.players.map((p) => p.turn)).toEqual([true, false, false])
    expect(snap.people[0].slot).toBe('host')
  })
  it('el rosco va compacto: letras y estado de cada una en una cadena', () => {
    const s: GameState = {
      ...base(),
      liveGame: 'rosco',
      rosco: {
        ...base().rosco,
        active: true,
        players: [
          {
            target: { kind: 'contestant', id: 'c1' },
            letters: [
              { letra: 'A', modo: 'empieza', definicion: 'Ave', respuesta: 'ÁGUILA', qid: 'a', status: 'ok' },
              { letra: 'B', modo: 'empieza', definicion: 'Barco', respuesta: 'BARCA', qid: 'b', status: 'pend' }
            ],
            current: 1,
            remainingMs: 90000,
            endsAt: null,
            done: false
          }
        ]
      }
    }
    const g = buildSnapshot(s, extras()).game
    if (g?.kind !== 'rosco') throw new Error('rosco')
    expect(g.players[0].letters).toBe('AB')
    expect(g.players[0].status).toBe('op')
    expect(g.def?.respuesta).toBe('BARCA')
  })
  it('cabe en un mensaje (menos de 16 KB) con una partida normal', () => {
    const snap = buildSnapshot(withTest(), extras())
    expect(JSON.stringify(snap).length).toBeLessThan(16000)
  })
})

describe('el mando: los relojes no generan mensajes', () => {
  it('con el rosco, el temporizador y la música corriendo, el estado no cambia de un segundo a otro y el mando cuenta lo mismo que el programa', () => {
    const t0 = 1_000_000
    const s: GameState = {
      ...base(),
      liveGame: 'rosco',
      quiz: { ...base().quiz, timer: { ...base().quiz.timer, enabled: true, endsAt: t0 + 20000, remainingMs: null } },
      rosco: {
        ...base().rosco,
        active: true,
        players: [
          {
            target: { kind: 'contestant', id: 'c1' },
            letters: [{ letra: 'A', modo: 'empieza', definicion: 'Ave', respuesta: 'ÁGUILA', qid: 'a', status: 'pend' }],
            current: 0,
            remainingMs: 120000,
            endsAt: t0 + 60000,
            done: false
          }
        ]
      }
    }
    const playing = (current: number): SnapExtras => ({ ...extras(), music: { track: 'Tema', playing: true, current, duration: 200, volume: 0.8 } })
    const a = buildSnapshot(s, playing(10), t0)
    const b = buildSnapshot(s, playing(13), t0 + 3000)
    // nada que mandar: los tics no cambian la clave
    expect(snapKey(b)).toBe(snapKey(a))
    // el mando, con la instantánea del principio, cuenta lo mismo que el programa 3 s después
    const g = a.game
    if (g?.kind !== 'rosco') throw new Error('rosco')
    expect(clockLeft(g.players[0], t0 + 3000)).toBe(remainingMs(s.rosco.players[0], t0 + 3000))
    expect(clockLeft(a.timer, t0 + 3000)).toBe(17000)
    // pausar sí es un cambio que se manda, con el tiempo restante
    const paused = { ...s, rosco: { ...s.rosco, players: [{ ...s.rosco.players[0], endsAt: null, remainingMs: 57000 }] } }
    const c = buildSnapshot(paused, playing(13), t0 + 3000)
    expect(snapKey(c)).not.toBe(snapKey(a))
    if (c.game?.kind !== 'rosco') throw new Error('rosco')
    expect(clockLeft(c.game.players[0], t0 + 9000)).toBe(57000)
    // la música en pausa sí manda su posición
    expect(snapKey(buildSnapshot(s, { ...playing(13), music: { ...playing(13).music, playing: false } }, t0))).not.toBe(
      snapKey(buildSnapshot(s, { ...playing(14), music: { ...playing(14).music, playing: false } }, t0))
    )
  })
})

describe('plano por defecto (salón)', () => {
  it('al abrir, la escena Juego empieza sin cámaras si así se eligió', () => {
    const saved = { ...defaultState(), plato: { ...defaultState().plato, defaultPlano: 'sincam' as const } }
    expect(hydrate(JSON.parse(JSON.stringify(saved))).camsScene.noCam).toBe(true)
    expect(hydrate(JSON.parse(JSON.stringify(defaultState()))).camsScene.noCam).toBe(false)
  })
})
