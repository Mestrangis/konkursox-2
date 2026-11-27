import { describe, expect, it } from 'vitest'
import type { Question } from '../src/shared/questions'
import { imageView } from '../src/shared/questionImage'
import type { Action, GameState } from '../src/shared/types'
import { applyAction, defaultState } from '../src/shared/state'

const run = (s: GameState, ...a: Action[]) => a.reduce(applyAction, s)
const q = (extra: Partial<Question> = {}): Question => ({ id: '1', tipo: 'test', enunciado: '¿Quién es este gato?', opciones: ['Morgana', 'Garfield', 'Tom', 'Azrael'], correcta: 0, ...extra })
const load = (question: Question) =>
  run({ ...defaultState(), layout: 'trio' }, { type: 'quizSetTurn', target: { kind: 'contestant', id: 'c1' } }, {
    type: 'quizLoad',
    key: 'b::1',
    bankFile: 'b',
    question,
    now: 0,
    stage: true,
    game: 'test'
  } as Action)
const view = (s: GameState) => imageView(s.quiz.slots.test)
const G = { game: 'test' } as const

describe('orden de aparición de las imágenes', () => {
  it('la imagen nunca sale antes que el texto de la pregunta', () => {
    const s = load(q({ imagen: 'gato.png', imagen_respuesta: 'morgana.png' }))
    expect(s.quiz.slots.test!.phase).toBe('ready')
    expect(view(s).file).toBeNull()
    expect(view(run(s, { type: 'quizShowQuestion', ...G } as Action)).file).toBe('gato.png')
    // aunque la pidas a mano antes de tiempo (imagen manual), espera al texto
    const m = run(load(q({ imagen: 'gato.png', imagen_modo: 'manual' })), { type: 'quizToggleImage', ...G } as Action)
    expect(view(m).file).toBeNull()
    expect(view(run(m, { type: 'quizShowQuestion', ...G } as Action)).file).toBe('gato.png')
    // y en automática, pulsarla antes del texto es "esta vez no"
    const a = run(s, { type: 'quizToggleImage', ...G } as Action, { type: 'quizShowQuestion', ...G } as Action)
    expect(view(a).file).toBeNull()
  })

  it('automática: la de la pregunta sale con el texto; al revelar la sustituye la de la respuesta', () => {
    let s = run(load(q({ imagen: 'gato.png', imagen_respuesta: 'morgana.png' })), { type: 'quizShowQuestion', ...G } as Action)
    expect(view(s)).toMatchObject({ file: 'gato.png', which: 'q' })
    s = run(s, { type: 'quizShowAll', now: 1, ...G } as Action, { type: 'quizPick', index: 0, now: 2, ...G } as Action)
    expect(view(s).which).toBe('q')
    s = run(s, { type: 'quizReveal', now: 3, ...G } as Action)
    expect(view(s)).toMatchObject({ file: 'morgana.png', which: 'a' })
  })

  it('manual: la de la pregunta solo sale cuando la muestras', () => {
    let s = run(load(q({ imagen: 'gato.png', imagen_modo: 'manual' })), { type: 'quizShowQuestion', ...G } as Action)
    expect(view(s).file).toBeNull()
    s = run(s, { type: 'quizToggleImage', which: 'q', ...G } as Action)
    expect(view(s).file).toBe('gato.png')
    s = run(s, { type: 'quizToggleImage', which: 'q', ...G } as Action)
    expect(view(s).file).toBeNull()
  })

  it('la de la respuesta no sale antes de revelar salvo que la muestres; y se puede ocultar después', () => {
    let s = run(load(q({ imagen_respuesta: 'morgana.png' })), { type: 'quizShowQuestion', ...G } as Action)
    expect(view(s).file).toBeNull()
    s = run(s, { type: 'quizToggleImage', which: 'a', ...G } as Action)
    expect(view(s).file).toBe('morgana.png')
    s = run(s, { type: 'quizToggleImage', which: 'a', ...G } as Action, { type: 'quizShowAll', now: 1, ...G } as Action, { type: 'quizReveal', now: 2, ...G } as Action)
    // la ocultaste a mano: sigue oculta al revelar
    expect(view(s).file).toBeNull()
  })

  it('pantalla completa solo con una imagen a la vista, y se quita al ocultarla', () => {
    let s = run(load(q({ imagen: 'gato.png' })), { type: 'quizImageFull', ...G } as Action)
    expect(view(s).full).toBe(false)
    s = run(s, { type: 'quizShowQuestion', ...G } as Action, { type: 'quizImageFull', ...G } as Action)
    expect(view(s).full).toBe(true)
    s = run(s, { type: 'quizToggleImage', which: 'q', ...G } as Action)
    expect(view(s)).toMatchObject({ file: null, full: false })
  })
})
