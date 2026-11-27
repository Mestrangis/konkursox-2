import { describe, expect, it } from 'vitest'
import type { Bank, Question } from '../src/shared/questions'
import { mergeTrivia, oldTriviaBank, type TriviaPackMeta } from '../src/shared/trivia'

const q = (id: string, extra: Partial<Question> = {}): Question => ({ id, tipo: 'test', enunciado: `Pregunta ${id}`, opciones: ['a', 'b', 'c', 'd'], correcta: 0, ...extra })
const bank = (nombre: string, preguntas: Question[]): Bank => ({ formato: 'konkursox-banco', version: 1, nombre, grupo: 'Trivia', preguntas })
const files = { trivia: 'opentdb-trivia.json', descartadas: 'opentdb-descartadas.json' }
const meta: TriviaPackMeta = {
  version: 3,
  archivos: { test: files, sino: files },
  categorias: { cine: 'Cine', videojuegos: 'Videojuegos', 'ciencia-y-naturaleza': 'Ciencia y naturaleza' },
  previa: { o1: 'media', o2: 'facil', o3: 'facil', o4: 'dificil', o5: 'media', o6: 'facil', o7: 'dificil' },
  cambios: { o6: '¿En qué año salió en Norteamérica?' }
}
// el pack nuevo: dificultad reclasificada y o4 / o7 descartadas
const pack = {
  trivia: bank('Trivia', [
    q('o1', { etiquetas: ['Cine'], dificultad: 'facil' }),
    q('o2', { etiquetas: ['Cine'], dificultad: 'facil' }),
    q('o3', { etiquetas: ['Cine'], dificultad: 'dificil' }),
    q('o5', { etiquetas: ['Ciencia y naturaleza'], dificultad: 'media' }),
    q('o6', { etiquetas: ['Videojuegos'], enunciado: '¿En qué año salió?', opciones: ['2016', '2015', '2017', '2014'], dificultad: 'media' })
  ]),
  descartadas: bank('Trivia · descartadas', [q('o4', { etiquetas: ['Videojuegos'], dificultad: 'dificil' }), q('o7', { etiquetas: ['Videojuegos'], dificultad: 'dificil' })])
}

describe('migración del pack de Trivia a un solo banco por tipo', () => {
  it('reconoce los bancos antiguos (v2 por categoría, v1 por categoría y dificultad) y no los nuevos', () => {
    expect(oldTriviaBank('opentdb-cine.json', meta)).toEqual({ cat: 'Cine' })
    expect(oldTriviaBank('opentdb-ciencia-y-naturaleza-dificil.json', meta)).toEqual({ cat: 'Ciencia y naturaleza', dif: 'dificil' })
    expect(oldTriviaBank('opentdb-trivia.json', meta)).toBeNull()
    expect(oldTriviaBank('opentdb-descartadas.json', meta)).toBeNull()
    expect(oldTriviaBank('mis-preguntas.json', meta)).toBeNull()
  })

  it('conserva usadas, ediciones y borrados; las añadidas van a Trivia', () => {
    const old = [
      {
        file: 'opentdb-cine.json',
        bank: bank('Cine', [
          q('o1', { etiquetas: ['Cine'], dificultad: 'media', usada: '2026-11-20', enunciado: 'Mi versión', imagen: 'foto.jpg' }),
          // o2 la borró
          q('o3', { etiquetas: ['Cine'], dificultad: 'media' }), // le cambió la dificultad (antes era fácil)
          q('p1', { etiquetas: ['Cine'], enunciado: 'Una mía' })
        ])
      },
      {
        file: 'opentdb-videojuegos.json',
        bank: bank('Videojuegos', [
          q('o4', { etiquetas: ['Videojuegos'], dificultad: 'dificil', usada: '2026-11-01' }),
          q('o6', { etiquetas: ['Videojuegos'], dificultad: 'facil', enunciado: '¿En qué año salió en Norteamérica?' }),
          q('o7', { dificultad: 'media' }), // la descartamos, pero él le puso otra dificultad
          q('p1', { etiquetas: [], enunciado: 'Otra mía con el mismo id' })
        ])
      }
      // no hay opentdb-ciencia-y-naturaleza.json: borró el banco entero
    ]
    const r = mergeTrivia(pack, meta, old, files)
    const t = r.trivia!.preguntas
    const byId = (id: string) => [...t, ...r.descartadas!.preguntas].find((x) => x.id === id)

    // su versión manda, con la dificultad nueva
    expect(byId('o1')).toMatchObject({ usada: '2026-11-20', enunciado: 'Mi versión', imagen: 'foto.jpg', dificultad: 'facil', etiquetas: ['Cine'] })
    // la borrada y las del banco que borró no vuelven
    expect(byId('o2')).toBeUndefined()
    expect(byId('o5')).toBeUndefined()
    // la dificultad que puso él se respeta
    expect(byId('o3')!.dificultad).toBe('media')
    // la corregida (Norteamérica) se actualiza porque no la había tocado
    expect(byId('o6')).toMatchObject({ enunciado: '¿En qué año salió?', opciones: ['2016', '2015', '2017', '2014'], dificultad: 'media' })
    // descartadas: o4 sigue usada; o7 se queda en Trivia porque le cambió la dificultad, y gana la etiqueta
    expect(r.descartadas!.preguntas.map((x) => x.id)).toEqual(['o4'])
    expect(r.descartadas!.preguntas[0].usada).toBe('2026-11-01')
    expect(byId('o7')).toMatchObject({ dificultad: 'media', etiquetas: ['Videojuegos'] })
    expect(t.some((x) => x.id === 'o7')).toBe(true)
    // las suyas, al final de Trivia y sin ids repetidos
    const mias = t.filter((x) => x.enunciado.includes('mía'))
    expect(mias.map((x) => x.enunciado)).toEqual(['Una mía', 'Otra mía con el mismo id'])
    expect(new Set(t.map((x) => x.id)).size).toBe(t.length)
    expect(mias[1].etiquetas).toEqual(['Videojuegos'])
    // banco nuevo con los datos del pack
    expect(r.trivia).toMatchObject({ nombre: 'Trivia', grupo: 'Trivia' })
    // para las partidas mezcladas: de dónde viene cada pregunta y adónde ha ido
    expect(r.moved.get('opentdb-cine.json#o1')).toEqual({ file: 'opentdb-trivia.json', id: 'o1' })
    expect(r.moved.get('opentdb-videojuegos.json#o4')).toEqual({ file: 'opentdb-descartadas.json', id: 'o4' })
    expect(r.moved.get('opentdb-videojuegos.json#p1')).toEqual({ file: 'opentdb-trivia.json', id: mias[1].id })
  })

  it('desde la v1 (un banco por dificultad) toma la dificultad del nombre si la pregunta no la tiene', () => {
    const r = mergeTrivia(pack, { ...meta, previa: {} }, [{ file: 'opentdb-cine-media.json', bank: bank('Cine · Media', [q('o1'), q('p9')]) }], files)
    expect(r.trivia!.preguntas.map((x) => [x.id, x.dificultad])).toEqual([
      ['o1', 'facil'],
      ['p9', 'media']
    ])
    expect(r.descartadas).toBeNull()
  })
})
