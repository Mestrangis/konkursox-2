import { describe, expect, it } from 'vitest'
import { detectDelimiter, findDuplicates, parseCsv, parseImport, questionsToCsv } from '../src/shared/importer'
import { parseNumber, type Question } from '../src/shared/questions'

const right = (q: Question) => q.opciones[q.correcta]

describe('importar desde una hoja (CSV o pegado de Excel / Google Sheets)', () => {
  it('detecta el separador: tabulador al pegar de Excel, punto y coma o coma', () => {
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('a;b;c,d')).toBe(';')
    expect(detectDelimiter('"x;y",b,c')).toBe(',')
  })

  it('respeta comillas, comillas dobles y saltos de línea dentro de una celda', () => {
    expect(parseCsv('"Hola, ""mundo""",b\n"dos\nlíneas",c')).toEqual([
      ['Hola, "mundo"', 'b'],
      ['dos\nlíneas', 'c']
    ])
  })

  it('con títulos: test con tres incorrectas, Sí o no con una, etiqueta y dificultad', () => {
    const r = parseImport(
      'pregunta\tcorrecta\tincorrecta1\tincorrecta2\tincorrecta3\tetiqueta\tdificultad\n' +
        '¿Capital de Francia?\tParís\tLyon\tMarsella\tNiza\tGeografía\tFácil\n' +
        '¿El Sol es una estrella?\tVerdadero\tFalso\t\t\tCiencia\thard\n' +
        '¿Quién pintó el Guernica?\tPicasso\tDalí\t\t\tArte\tmedia'
    )
    expect(r.format).toBe('csv')
    expect(r.errors).toEqual([])
    const [a, b, c] = r.questions
    expect(a).toMatchObject({ tipo: 'test', etiquetas: ['Geografía'], dificultad: 'facil', sin_revisar: true })
    expect(a.opciones).toHaveLength(4)
    expect(right(a)).toBe('París')
    // verdadero / falso pasa a Sí o no con las opciones de siempre
    expect(b).toMatchObject({ tipo: 'sino', opciones: ['Sí', 'No'], correcta: 0, dificultad: 'dificil' })
    // una sola incorrecta cualquiera: Sí o no con esas dos opciones
    expect(c.tipo).toBe('sino')
    expect(right(c)).toBe('Picasso')
    expect(c.opciones).toContain('Dalí')
  })

  it('sin títulos: columnas en el orden de siempre', () => {
    const r = parseImport('¿2+2?;4;3;5;22;Mates;1')
    expect(r.questions[0]).toMatchObject({ tipo: 'test', etiquetas: ['Mates'], dificultad: 'facil' })
    expect(right(r.questions[0])).toBe('4')
  })

  it('las filas con fallos se avisan con su número de línea y no se importan', () => {
    const r = parseImport('pregunta,correcta,incorrecta1\n¿Sin incorrectas?,Sí,\n,Respuesta,Otra\n¿Repe?,A,A\n¿Bien?,A,B')
    expect(r.questions.map((q) => q.enunciado)).toEqual(['¿Bien?'])
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4])
  })
})

describe('importar texto libre', () => {
  it('pregunta, + correcta, - incorrectas, # etiquetas y dificultad, imagen que falta', () => {
    const r = parseImport(`1. ¿Quién es este gato
de Persona 5?
+ Morgana
- Garfield
- Tom
- Azrael
# Videojuegos, difícil
imagen: Morgana (Persona 5)

¿Madrid es la capital de España?
* Sí
- No`)
    expect(r.format).toBe('texto')
    expect(r.errors).toEqual([])
    const [a, b] = r.questions
    expect(a).toMatchObject({ tipo: 'test', enunciado: '¿Quién es este gato de Persona 5?', etiquetas: ['Videojuegos'], dificultad: 'dificil', imagen_sugerida: 'Morgana (Persona 5)' })
    expect(right(a)).toBe('Morgana')
    expect(b).toMatchObject({ tipo: 'sino', opciones: ['Sí', 'No'], correcta: 0 })
  })

  it('avisa si falta la correcta o hay dos', () => {
    const r = parseImport('¿Una?\n- a\n- b\n\n¿Dos?\n+ a\n+ b\n- c')
    expect(r.questions).toHaveLength(0)
    expect(r.errors.map((e) => e.msg)).toEqual(['Falta la respuesta correcta', 'Tiene más de una correcta (+)'])
  })
})

describe('importar un .json de banco', () => {
  it('lee el banco y quita las marcas de usada', () => {
    const r = parseImport(
      JSON.stringify({
        formato: 'konkursox-banco',
        version: 1,
        nombre: 'X',
        preguntas: [{ id: '1', tipo: 'test', enunciado: '¿A?', opciones: ['a', 'b'], correcta: 1, usada: '2024-01-01', etiquetas: ['T'] }]
      })
    )
    expect(r.format).toBe('json')
    expect(r.questions[0]).toMatchObject({ enunciado: '¿A?', etiquetas: ['T'] })
    expect(r.questions[0].usada).toBeUndefined()
  })
  it('un JSON roto se avisa', () => {
    expect(parseImport('{ "preguntas": [').errors[0].msg).toMatch(/JSON no válido/)
  })
})

describe('duplicados y exportar', () => {
  it('avisa de las que ya están en la biblioteca (sin mirar tildes, mayúsculas ni signos) y de las repetidas', () => {
    const d = findDuplicates([{ enunciado: '¿Capital de Francia?' }, { enunciado: 'capital de francia' }, { enunciado: '¿Otra?' }, { enunciado: '¿otra' }], [{ enunciado: 'CAPITAL DE FRANCIA' }])
    expect([...d]).toEqual([
      [0, 'biblioteca'],
      [1, 'biblioteca'],
      [3, 'repetida']
    ])
  })
  it('exportar a CSV y volver a importarlo deja las mismas preguntas', () => {
    const qs = parseImport('¿A; "b"?\tsí\tno\n¿C?\tc\td\te\tf\tTema, Otro\tmedia').questions
    const back = parseImport(questionsToCsv(qs)).questions
    expect(back.map((q) => [q.enunciado, right(q), q.tipo, q.etiquetas, q.dificultad])).toEqual(qs.map((q) => [q.enunciado, right(q), q.tipo, q.etiquetas, q.dificultad]))
  })
  it('los números con coma o puntos de miles se leen bien (estimación)', () => {
    expect(parseNumber('21,5')).toBe(21.5)
    expect(parseNumber('21.196')).toBe(21196)
    expect(parseNumber('1 000')).toBe(1000)
  })
})
