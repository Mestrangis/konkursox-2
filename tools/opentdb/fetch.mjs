// Descarga Open Trivia DB entera (todas las categorías y dificultades) a raw.json.
// Límite de la API: 1 llamada cada 5 s por IP. Máximo 50 por llamada. Token de sesión para no repetir.
import fs from 'node:fs'
const OUT = new URL('./raw.json', import.meta.url)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let last = 0
async function get(url) {
  for (let tries = 0; tries < 8; tries++) {
    const gap = Date.now() - last
    if (gap < 5600) await wait(5600 - gap)
    last = Date.now()
    const r = await fetch(url, { headers: { 'User-Agent': 'trivia-pack-builder' } })
    if (r.status === 429) {
      await wait(8000)
      continue
    }
    const j = await r.json()
    if (j.response_code === 5) {
      await wait(8000)
      continue
    }
    return j
  }
  throw new Error('demasiados reintentos ' + url)
}
const dec = (s) => decodeURIComponent(s)
const cats = (await get('https://opentdb.com/api_category.php')).trivia_categories
let token = (await get('https://opentdb.com/api_token.php?command=request')).token
const all = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : []
const seen = new Set(all.map((q) => q.question))
for (const c of cats) {
  for (const d of ['easy', 'medium', 'hard']) {
    const count = await get(`https://opentdb.com/api_count.php?category=${c.id}`)
    const n = count.category_question_count[`total_${d}_question_count`]
    let got = all.filter((q) => q.category === c.name && q.difficulty === d).length
    if (got >= n) continue
    while (got < n) {
      const amount = Math.min(50, n - got)
      const j = await get(`https://opentdb.com/api.php?amount=${amount}&category=${c.id}&difficulty=${d}&token=${token}&encode=url3986`)
      if (j.response_code === 3) {
        token = (await get('https://opentdb.com/api_token.php?command=request')).token
        continue
      }
      if (j.response_code === 4 || j.response_code === 1 || !j.results?.length) break
      for (const r of j.results) {
        const q = { category: dec(r.category), difficulty: dec(r.difficulty), type: dec(r.type), question: dec(r.question), correct: dec(r.correct_answer), incorrect: r.incorrect_answers.map(dec) }
        if (!seen.has(q.question)) {
          seen.add(q.question)
          all.push(q)
        }
      }
      got += j.results.length
      fs.writeFileSync(OUT, JSON.stringify(all, null, 1))
    }
    console.log(c.name, d, n, '->', all.filter((q) => q.category === c.name && q.difficulty === d).length)
  }
}
fs.writeFileSync(OUT, JSON.stringify(all, null, 1))
console.log('TOTAL', all.length)
