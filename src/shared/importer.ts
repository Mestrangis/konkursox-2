// Importar y exportar preguntas: .json de banco, .csv (o pegado desde Excel / Google Sheets) y texto libre.
//
// CSV / Excel: una fila por pregunta con las columnas
//   pregunta, correcta, incorrecta1, incorrecta2, incorrecta3, etiqueta, dificultad
// (con o sin fila de títulos). Con una sola incorrecta es de Sí o no.
//
// Texto libre:
//   ¿Capital de Francia?
//   + París
//   - Lyon
//   - Marsella
//   # Geografía, fácil
//   (línea en blanco entre preguntas; "+" o "*" la correcta, "-" las incorrectas,
//    "#" etiquetas y dificultad, "imagen:" la imagen que falta)
import { normDificultad, normText, parseBank, type Dificultad, type Question } from './questions'

export interface ImportIssue {
  line: number
  msg: string
}
export interface ImportResult {
  format: 'json' | 'csv' | 'texto'
  questions: Question[]
  errors: ImportIssue[]
}

type Rand = () => number

// ---------------------------------------------------------------- CSV

/** Separador de la primera línea: tabulador (pegado de Excel), punto y coma (Excel en español) o coma. */
export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  if (first.includes('\t')) return '\t'
  const count = (ch: string) => {
    let n = 0
    let q = false
    for (const c of first) {
      if (c === '"') q = !q
      else if (c === ch && !q) n++
    }
    return n
  }
  return count(';') > count(',') ? ';' : ','
}

/** CSV con comillas ("...", "" dentro) y saltos de línea dentro de una celda. */
export function parseCsv(text: string, delim = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"' && !cell.trim()) {
      cell = ''
      q = true
    } else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c))
}

const SI = /^(si|sí|verdadero|true|cierto|v|s)$/i
const NO = /^(no|falso|false|f|n)$/i

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Pregunta de Test (2-3 incorrectas) o de Sí o no (1 incorrecta) a partir de la correcta y las incorrectas. */
export function buildQuestion(
  id: string,
  enunciado: string,
  correcta: string,
  incorrectas: string[],
  extra: { etiquetas?: string[]; dificultad?: Dificultad; imagen_sugerida?: string; nota_presentador?: string } = {},
  rand: Rand = Math.random
): Question | string {
  const e = enunciado.trim()
  const c = correcta.trim()
  const inc = incorrectas.map((x) => x.trim()).filter(Boolean)
  if (!e) return 'Falta la pregunta'
  if (!c) return 'Falta la respuesta correcta'
  if (!inc.length) return 'Falta al menos una respuesta incorrecta'
  if (inc.some((x) => normText(x) === normText(c))) return 'Una incorrecta es igual que la correcta'
  const base: Partial<Question> = { sin_revisar: true }
  if (extra.etiquetas?.length) base.etiquetas = extra.etiquetas
  if (extra.dificultad) base.dificultad = extra.dificultad
  if (extra.imagen_sugerida) base.imagen_sugerida = extra.imagen_sugerida
  if (extra.nota_presentador) base.nota_presentador = extra.nota_presentador
  if (inc.length === 1) {
    const yes = SI.test(c) && NO.test(inc[0])
    const no = NO.test(c) && SI.test(inc[0])
    if (yes || no) return { ...base, id, tipo: 'sino', enunciado: e, opciones: ['Sí', 'No'], correcta: yes ? 0 : 1 }
    const opciones = shuffle([c, inc[0]], rand)
    return { ...base, id, tipo: 'sino', enunciado: e, opciones, correcta: opciones.indexOf(c) }
  }
  const opciones = shuffle([c, ...inc.slice(0, 3)], rand)
  return { ...base, id, tipo: 'test', enunciado: e, opciones, correcta: opciones.indexOf(c) }
}

const tagsOf = (s: string): string[] =>
  s
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Filas de una hoja (con o sin títulos) a preguntas. */
export function rowsToQuestions(rows: string[][], rand: Rand = Math.random): ImportResult {
  const out: ImportResult = { format: 'csv', questions: [], errors: [] }
  if (!rows.length) return out
  const head = rows[0].map((c) => normText(c).replace(/\s+/g, ''))
  const hasHead = head.some((c) => /^(pregunta|enunciado|question)$/.test(c))
  const col = (re: RegExp, fb: number) => {
    if (!hasHead) return fb
    const i = head.findIndex((c) => re.test(c))
    return i
  }
  const iQ = col(/^(pregunta|enunciado|question)$/, 0)
  const iC = col(/^(correcta|respuesta|respuestacorrecta|correct)$/, 1)
  const iInc = hasHead ? head.map((c, i) => (/^(incorrecta|incorrect|mal|falsa)\d*$/.test(c) ? i : -1)).filter((i) => i >= 0) : [2, 3, 4]
  const iT = col(/^(etiqueta|etiquetas|categoria|tema|tags?)$/, 5)
  const iD = col(/^(dificultad|nivel|difficulty)$/, 6)
  const iImg = col(/^(imagen|imagensugerida)$/, -1)
  const iNote = col(/^(nota|notapresentador|explicacion)$/, -1)
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '')
  rows.slice(hasHead ? 1 : 0).forEach((r, k) => {
    const line = k + (hasHead ? 2 : 1)
    const dRaw = at(r, iD)
    const dificultad = normDificultad(dRaw)
    const q = buildQuestion(
      `i${line}`,
      at(r, iQ),
      at(r, iC),
      iInc.map((i) => at(r, i)),
      { etiquetas: tagsOf(at(r, iT)), dificultad, imagen_sugerida: at(r, iImg) || undefined, nota_presentador: at(r, iNote) || undefined },
      rand
    )
    if (typeof q === 'string') out.errors.push({ line, msg: q })
    else {
      if (dRaw && !dificultad) out.errors.push({ line, msg: `Dificultad "${dRaw}" no reconocida (fácil, media o difícil): se deja sin dificultad` })
      out.questions.push(q)
    }
  })
  return out
}

// ---------------------------------------------------------------- texto libre

export function parseFreeText(text: string, rand: Rand = Math.random): ImportResult {
  const out: ImportResult = { format: 'texto', questions: [], errors: [] }
  interface Block {
    line: number
    q: string
    right: string[]
    wrong: string[]
    tags: string[]
    dif?: Dificultad
    img?: string
    note?: string
  }
  const blocks: Block[] = []
  let cur: Block | null = null
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  lines.forEach((raw, i) => {
    const l = raw.trim()
    if (!l) {
      cur = null
      return
    }
    const opt = /^([+*✓-])\s*(.+)$/.exec(l)
    if (opt && cur) {
      if (opt[1] === '-') cur.wrong.push(opt[2])
      else cur.right.push(opt[2])
      return
    }
    const tag = /^#\s*(.*)$/.exec(l)
    if (tag && cur) {
      for (const t of tagsOf(tag[1])) {
        const d = normDificultad(t)
        if (d) cur.dif = d
        else cur.tags.push(t)
      }
      return
    }
    const img = /^imagen\s*:\s*(.+)$/i.exec(l)
    if (img && cur) {
      cur.img = img[1]
      return
    }
    const note = /^nota\s*:\s*(.+)$/i.exec(l)
    if (note && cur) {
      cur.note = note[1]
      return
    }
    // una línea de texto empieza otra pregunta (si la anterior ya tenía opciones) o continúa el enunciado
    const qText = l.replace(/^\d+\s*[.)-]\s*/, '')
    if (cur && !cur.right.length && !cur.wrong.length) {
      cur.q += ' ' + qText
      return
    }
    cur = { line: i + 1, q: qText, right: [], wrong: [], tags: [] }
    blocks.push(cur)
  })
  for (const b of blocks) {
    if (b.right.length > 1) {
      out.errors.push({ line: b.line, msg: 'Tiene más de una correcta (+)' })
      continue
    }
    const q = buildQuestion(`i${b.line}`, b.q, b.right[0] ?? '', b.wrong, { etiquetas: b.tags, dificultad: b.dif, imagen_sugerida: b.img, nota_presentador: b.note }, rand)
    if (typeof q === 'string') out.errors.push({ line: b.line, msg: q })
    else out.questions.push(q)
  }
  return out
}

// ---------------------------------------------------------------- detectar el formato

export function parseImport(text: string, rand: Rand = Math.random): ImportResult {
  const t = text.replace(/^﻿/, '').trim()
  if (!t) return { format: 'texto', questions: [], errors: [{ line: 0, msg: 'No hay nada que importar' }] }
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const bank = parseBank(JSON.parse(t), 'Importado')
      return { format: 'json', questions: bank.preguntas.map((q) => ({ ...q, usada: undefined })), errors: [] }
    } catch (err) {
      return { format: 'json', questions: [], errors: [{ line: 0, msg: `JSON no válido: ${String((err as Error).message ?? err)}` }] }
    }
  }
  // hoja: casi todas las líneas tienen 3 o más columnas
  const rows = parseCsv(t)
  const wide = rows.filter((r) => r.filter(Boolean).length >= 3).length
  if (rows.length && wide >= Math.max(1, rows.length * 0.6) && !/^[+*-]\s/m.test(t)) return rowsToQuestions(rows, rand)
  return parseFreeText(t, rand)
}

// ---------------------------------------------------------------- duplicados

/** Índices de las preguntas nuevas que ya existen (mismo texto) en la biblioteca o antes en la misma importación. */
export function findDuplicates(incoming: Pick<Question, 'enunciado'>[], existing: Pick<Question, 'enunciado'>[]): Map<number, 'biblioteca' | 'repetida'> {
  const have = new Set(existing.map((q) => normText(q.enunciado)).filter(Boolean))
  const seen = new Set<string>()
  const out = new Map<number, 'biblioteca' | 'repetida'>()
  incoming.forEach((q, i) => {
    const k = normText(q.enunciado)
    if (!k) return
    if (have.has(k)) out.set(i, 'biblioteca')
    else if (seen.has(k)) out.set(i, 'repetida')
    seen.add(k)
  })
  return out
}

// ---------------------------------------------------------------- exportar

const cell = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Banco de Test o Sí o no a CSV (punto y coma: se abre bien en Excel en español). */
export function questionsToCsv(qs: Question[]): string {
  const head = ['pregunta', 'correcta', 'incorrecta1', 'incorrecta2', 'incorrecta3', 'etiqueta', 'dificultad']
  const lines = [head.join(';')]
  for (const q of qs) {
    if (q.tipo !== 'test' && q.tipo !== 'sino') continue
    const right = q.opciones[q.correcta] ?? ''
    const wrong = q.opciones.filter((_, i) => i !== q.correcta)
    lines.push([q.enunciado, right, wrong[0] ?? '', wrong[1] ?? '', wrong[2] ?? '', (q.etiquetas ?? []).join(', '), q.dificultad ?? ''].map(cell).join(';'))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}
