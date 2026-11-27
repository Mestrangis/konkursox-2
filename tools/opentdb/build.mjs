// Junta las traducciones (trad/*.txt: "idx|pregunta|correcta|inc1|inc2|inc3", o "idx|pregunta|Sí/No" en las
// de verdadero/falso) con la categoría y dificultad de raw.json y escribe los bancos en resources/trivia.
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
const DIF = { easy: ['facil', 'Fácil'], medium: ['media', 'Media'], hard: ['dificil', 'Difícil'] }
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
    const [dif, difLabel] = DIF[src.difficulty]
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
    const key = `${tipo}|${cat}|${dif}`
    if (!banks.has(key)) banks.set(key, { tipo, cat, dif, difLabel, preguntas: [] })
    const b = banks.get(key)
    b.preguntas.push({ id: `o${idx}`, ...q, etiquetas: [cat], dificultad: dif, fuente: FUENTE })
    kept++
  }
}
fs.rmSync(OUT, { recursive: true, force: true })
const summary = []
for (const b of [...banks.values()].sort((a, b) => a.cat.localeCompare(b.cat, 'es') || ['facil', 'media', 'dificil'].indexOf(a.dif) - ['facil', 'media', 'dificil'].indexOf(b.dif))) {
  const d = path.join(OUT, b.tipo)
  fs.mkdirSync(d, { recursive: true })
  const file = `opentdb-${slug(b.cat)}-${b.dif}.json`
  fs.writeFileSync(
    path.join(d, file),
    JSON.stringify({ formato: 'konkursox-banco', version: 1, nombre: `${b.cat} · ${b.difLabel}`, grupo: 'Open Trivia DB', licencia: LICENCIA, preguntas: b.preguntas }, null, 2) + '\n'
  )
  summary.push(`${b.tipo}\t${b.cat} · ${b.difLabel}\t${b.preguntas.length}`)
}
fs.writeFileSync(
  path.join(OUT, 'LEEME.txt'),
  `Packs de preguntas de Open Trivia Database (https://opentdb.com), licencia Creative Commons\r\nAtribución-CompartirIgual 4.0 (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/deed.es\r\n\r\nTraducidas al español de España y adaptadas (se descartaron las que solo tienen sentido en\r\nEE. UU. o pierden el sentido al traducirse). Las de verdadero/falso están en Sí o no.\r\nEstos bancos se distribuyen con la misma licencia CC BY-SA 4.0.\r\n\r\n${summary.join('\r\n')}\r\n\r\nTotal: ${kept} preguntas de ${raw.length} originales.\r\n`
)
console.log(summary.join('\n'))
console.log(`TOTAL ${kept} de ${raw.length} (${Math.round((kept / raw.length) * 100)} %)`)
if (problems.length) console.log('PROBLEMAS:\n' + problems.join('\n'))
