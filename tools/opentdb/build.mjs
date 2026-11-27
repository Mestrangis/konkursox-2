// Junta las traducciones (trad/*.txt: "idx|pregunta|correcta|inc1|inc2|inc3", o "idx|pregunta|Sí/No" en las
// de verdadero/falso) con la categoría de raw.json y la dificultad reclasificada a mano (dif/*.txt:
// líneas "f: ids", "m: ids", "d: ids" y "x: ids" = descartada) y escribe en resources/trivia un banco
// "Trivia" y otro "Trivia · descartadas" por tipo, más pack.json para migrar las versiones anteriores.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))
const OUT = 'E:/El Konkurso REMAKE/konkursox-2/resources/trivia'
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'raw.json'), 'utf8'))
// las traducciones viven en el repo (tools/opentdb/trad)
const CAT = {
  'General Knowledge': 'Cultura general',
  'Entertainment: Books': 'Libros',
  'Entertainment: Film': 'Cine',
  'Entertainment: Music': 'Música',
  'Entertainment: Musicals & Theatres': 'Musicales y teatro',
  'Entertainment: Television': 'Televisión',
  'Entertainment: Video Games': 'Videojuegos',
  'Entertainment: Board Games': 'Juegos de mesa',
  'Science & Nature': 'Ciencia y naturaleza',
  'Science: Computers': 'Informática',
  'Science: Mathematics': 'Matemáticas',
  Mythology: 'Mitología',
  Sports: 'Deportes',
  Geography: 'Geografía',
  History: 'Historia',
  Politics: 'Política',
  Art: 'Arte',
  Celebrities: 'Famosos',
  Animals: 'Animales',
  Vehicles: 'Vehículos',
  'Entertainment: Comics': 'Cómics',
  'Science: Gadgets': 'Tecnología',
  'Entertainment: Japanese Anime & Manga': 'Anime y manga',
  'Entertainment: Cartoon & Animations': 'Dibujos animados'
}
const LETTER = { f: 'facil', m: 'media', d: 'dificil', x: 'descartada' }
const dif = new Map()
for (const f of fs.readdirSync(path.join(dir, 'dif')).filter((f) => f.endsWith('.txt'))) {
  for (const line of fs.readFileSync(path.join(dir, 'dif', f), 'utf8').split(/\r?\n/)) {
    const m = /^([fmdx]):(.*)$/.exec(line.trim())
    if (!m) continue
    for (const id of m[2].split(/\s+/).filter(Boolean)) {
      if (dif.has(Number(id))) throw new Error(`${f}: ${id} clasificada dos veces`)
      dif.set(Number(id), LETTER[m[1]])
    }
  }
}
// versión anterior (v2) de cada pregunta: para respetar lo que el usuario haya cambiado al migrar
const prev = JSON.parse(fs.readFileSync(path.join(dir, 'v2-base.json'), 'utf8'))
const FUENTE = 'Open Trivia DB (CC BY-SA 4.0)'
const LICENCIA = 'Preguntas de Open Trivia Database (opentdb.com), licencia CC BY-SA 4.0, traducidas y adaptadas al español. Este banco se distribuye con la misma licencia (CC BY-SA 4.0).'
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const shuffle = (a, seed) => {
  // barajado fijo (mismo resultado cada vez que se genera)
  let x = seed + 1
  const rnd = () => ((x = (x * 9301 + 49297) % 233280), x / 233280)
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

// las descartadas guardan una dificultad orientativa (la de Open Trivia DB) por si las rescatas
const DESC_DIF = { easy: 'facil', medium: 'media', hard: 'dificil' }
const stats = new Map()
const banks = new Map()
const seen = new Set()
let kept = 0
const problems = []
for (const f of fs
  .readdirSync(path.join(dir, 'trad'))
  .filter((f) => f.endsWith('.txt'))
  .sort()) {
  for (const line of fs.readFileSync(path.join(dir, 'trad', f), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    const parts = line.split('|').map((s) => s.trim())
    const idx = Number(parts[0])
    const src = raw[idx]
    if (!src) {
      problems.push(`${f}: índice ${parts[0]} no existe`)
      continue
    }
    if (seen.has(idx)) {
      problems.push(`${f}: ${idx} repetido`)
      continue
    }
    seen.add(idx)
    const [, enunciado, correcta, ...inc] = parts
    const bool = src.type === 'boolean'
    const d = dif.get(idx)
    if (!d) {
      problems.push(`${f}: ${idx} sin dificultad`)
      continue
    }
    const cat = CAT[src.category]
    if (!cat) {
      problems.push(`${idx}: categoría ${src.category}`)
      continue
    }
    let q
    if (bool) {
      if (!/^(Sí|No)$/.test(correcta)) {
        problems.push(`${idx}: Sí/No esperado, hay "${correcta}"`)
        continue
      }
      q = { tipo: 'sino', enunciado, opciones: ['Sí', 'No'], correcta: correcta === 'Sí' ? 0 : 1 }
    } else {
      const wrong = inc.filter(Boolean)
      if (wrong.length !== 3) {
        problems.push(`${idx}: ${wrong.length} incorrectas`)
        continue
      }
      const opciones = shuffle([correcta, ...wrong], idx)
      q = { tipo: 'test', enunciado, opciones, correcta: opciones.indexOf(correcta) }
    }
    const tipo = bool ? 'sino' : 'test'
    const key = `${tipo}|${d === 'descartada' ? 'x' : 'ok'}`
    if (!banks.has(key)) banks.set(key, { tipo, out: d === 'descartada', preguntas: [] })
    const b = banks.get(key)
    b.preguntas.push({ id: `o${idx}`, ...q, etiquetas: [cat], ...(d === 'descartada' ? { dificultad: DESC_DIF[src.difficulty] } : { dificultad: d }), fuente: FUENTE })
    const st = `${tipo}\t${cat}\t${d}`
    stats.set(st, (stats.get(st) ?? 0) + 1)
    kept++
  }
}
for (const idx of dif.keys()) if (!seen.has(idx)) problems.push(`dif: ${idx} no está en las traducciones`)
fs.rmSync(OUT, { recursive: true, force: true })
const ORDER = { facil: 0, media: 1, dificil: 2 }
const cats = Object.values(CAT).sort((a, b) => a.localeCompare(b, 'es'))
const files = {}
for (const b of banks.values()) {
  const d = path.join(OUT, b.tipo)
  fs.mkdirSync(d, { recursive: true })
  const file = b.out ? 'opentdb-descartadas.json' : 'opentdb-trivia.json'
  // por categoría y, dentro, de fácil a difícil
  b.preguntas.sort((x, y) => cats.indexOf(x.etiquetas[0]) - cats.indexOf(y.etiquetas[0]) || ORDER[x.dificultad] - ORDER[y.dificultad])
  const nombre = b.out ? 'Trivia · descartadas' : 'Trivia'
  fs.writeFileSync(path.join(d, file), JSON.stringify({ formato: 'konkursox-banco', version: 1, nombre, grupo: 'Trivia', licencia: LICENCIA, preguntas: b.preguntas }, null, 2) + '\n')
  ;(files[b.tipo] ??= {})[b.out ? 'descartadas' : 'trivia'] = file
}
// para migrar: slug de cada banco antiguo -> categoría, y dificultad y enunciado de la v2 de cada pregunta
const nowText = new Map([...banks.values()].flatMap((b) => b.preguntas.map((q) => [q.id, q.enunciado])))
const cambios = {}
for (const [id, [, en]] of Object.entries(prev)) if (nowText.has(id) && nowText.get(id) !== en) cambios[id] = en
fs.writeFileSync(
  path.join(OUT, 'pack.json'),
  JSON.stringify({
    version: 3,
    archivos: files,
    categorias: Object.fromEntries(cats.map((c) => [slug(c), c])),
    previa: Object.fromEntries(Object.entries(prev).map(([id, [d]]) => [id, d])),
    cambios
  }) + '\n'
)
const LBL = { facil: 'fáciles', media: 'medias', dificil: 'difíciles', descartada: 'descartadas' }
const summary = []
for (const t of ['test', 'sino'])
  for (const c of cats) {
    const n = (d) => stats.get(`${t}\t${c}\t${d}`) ?? 0
    if (['facil', 'media', 'dificil', 'descartada'].some(n))
      summary.push(`${t === 'test' ? 'Tipo test' : 'Sí o no'}\t${c}\t${['facil', 'media', 'dificil', 'descartada'].map((d) => n(d) + ' ' + LBL[d]).join(', ')}`)
  }
fs.writeFileSync(
  path.join(OUT, 'LEEME.txt'),
  [
    'Packs de preguntas de Open Trivia Database (https://opentdb.com), licencia Creative Commons',
    'Atribución-CompartirIgual 4.0 (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    '',
    'Traducidas al español de España y adaptadas. La dificultad está reclasificada a mano pensando en un',
    'grupo de amigos españoles de 20-25 años; las que casi nadie sabría aquí están en «Trivia · descartadas».',
    'Las de verdadero/falso están en Sí o no. La categoría de cada pregunta va como etiqueta.',
    'Estos bancos se distribuyen con la misma licencia CC BY-SA 4.0.',
    '',
    ...summary,
    '',
    `Total: ${kept} preguntas de ${raw.length} originales.`,
    ''
  ].join('\r\n')
)
console.log(summary.join('\n'))
console.log(`TOTAL ${kept} de ${raw.length}; cambios de texto: ${Object.keys(cambios).length}`)
if (problems.length) console.log('PROBLEMAS:\n' + problems.join('\n'))
