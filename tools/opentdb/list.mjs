// node list.mjs "<categoría en inglés>" [desde] [cuántas]  → líneas "idx|T/B|dif|pregunta|correcta|inc..."
import fs from 'node:fs'
const raw = JSON.parse(fs.readFileSync(new URL('./raw.json', import.meta.url), 'utf8'))
const [cat, from = '0', n = '100000'] = process.argv.slice(2)
const rows = raw.map((q, i) => ({ ...q, i })).filter((q) => q.category === cat)
const d = { easy: 'F', medium: 'M', hard: 'D' }
for (const q of rows.slice(Number(from), Number(from) + Number(n))) console.log([q.i, q.type === 'boolean' ? 'B' : 'T', d[q.difficulty], q.question, q.correct, ...q.incorrect].join('|'))
console.error(`${rows.length} en total`)
