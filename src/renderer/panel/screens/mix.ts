// Partida mezclada: elegir varios bancos o filtros ("10 de Videojuegos difíciles + 5 de Deportes medias +
// las del grupo") y sacar una lista barajada sin repetir usadas. En la escalera, de fácil a difícil.
import { DIF_LABEL, DIFICULTADES, isPlayable, normText, type Dificultad, type Question } from '../../../shared/questions'
import type { LibBankInfo, LibType } from '../../../shared/library'
import { TRIVIA_DISCARDED_FILE, TRIVIA_GROUP } from '../../../shared/trivia'
import { btn, h, openDialog, type Ctx } from '../ui'

export type MixKind = 'test' | 'sino' | 'escalera'
interface MixRow {
  /** "*" cualquier banco, "b:<ref>" un banco, "g:<grupo>" un grupo, "t:<etiqueta>" una etiqueta,
   *  "c:<categoría>" una categoría de la Trivia ("c:*" toda la Trivia) */
  src: string
  dif: '' | Dificultad
  /** null = todas */
  count: number | null
}
export interface Pick {
  ref: string
  id: string
}

const DIF_ORDER: Record<string, number> = { facil: 0, media: 1, '': 1, dificil: 2 }
const store = {
  get(k: string): MixRow[] | null {
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? 'null')
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  },
  set(k: string, v: MixRow[]) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* sin almacenamiento */
    }
  }
}

/** Bancos de los que se puede sacar preguntas para cada juego. */
function sourceBanks(ctx: Ctx, kind: MixKind): LibBankInfo[] {
  const types: LibType[] = kind === 'sino' ? ['sino'] : kind === 'escalera' ? ['test', 'sino'] : ['test']
  return ctx.lib.list.filter((b) => types.includes(b.tipo) && !b.mezcla)
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** Preguntas jugables y sin usar que cumplen una fila. */
const isTrivia = (b: LibBankInfo) => b.grupo === TRIVIA_GROUP
/** las descartadas solo salen si eliges ese banco */
const isDiscarded = (b: LibBankInfo) => isTrivia(b) && b.file === TRIVIA_DISCARDED_FILE

function pool(ctx: Ctx, banks: LibBankInfo[], row: MixRow): { ref: string; q: Question }[] {
  const out: { ref: string; q: Question }[] = []
  const cat = row.src.startsWith('c:') ? row.src.slice(2) : null
  for (const b of banks) {
    if (row.src.startsWith('b:') && row.src.slice(2) !== b.ref) continue
    if (!row.src.startsWith('b:') && isDiscarded(b)) continue
    if (row.src.startsWith('g:') && b.grupo !== row.src.slice(2)) continue
    if (cat !== null && !isTrivia(b)) continue
    for (const q of ctx.lib.peek(b.ref)?.preguntas ?? []) {
      if (!isPlayable(q) || q.usada) continue
      if (row.src.startsWith('t:') && !(q.etiquetas ?? []).includes(row.src.slice(2))) continue
      if (cat && cat !== '*' && !(q.etiquetas ?? []).includes(cat)) continue
      if (row.dif && q.dificultad !== row.dif) continue
      out.push({ ref: b.ref, q })
    }
  }
  return out
}

/** Saca la lista: cada fila aporta sus preguntas al azar, sin repetir (ni el mismo texto dos veces). */
function build(ctx: Ctx, kind: MixKind, rows: MixRow[]): { ref: string; q: Question }[] {
  const banks = sourceBanks(ctx, kind)
  const seen = new Set<string>()
  const out: { ref: string; q: Question }[] = []
  for (const row of rows) {
    const avail = shuffle(pool(ctx, banks, row)).filter((x) => !seen.has(normText(x.q.enunciado)))
    const take = row.count === null ? avail : avail.slice(0, row.count)
    for (const x of take) {
      const k = normText(x.q.enunciado)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(x)
    }
  }
  if (kind === 'escalera') {
    // de fácil a difícil (barajadas dentro de cada dificultad)
    return shuffle(out).sort((a, b) => DIF_ORDER[a.q.dificultad ?? ''] - DIF_ORDER[b.q.dificultad ?? ''])
  }
  return shuffle(out)
}

/** Diálogo: devuelve la lista elegida (o null si se cancela). */
export async function mixDialog(ctx: Ctx, kind: MixKind): Promise<{ ref: string; q: Question }[] | null> {
  const banks = sourceBanks(ctx, kind)
  await Promise.all(banks.map((b) => ctx.lib.get(b.ref)))
  const levels = ctx.state.quiz.ladder.levels.length
  const key = `konk.mix.${kind}`
  let rows: MixRow[] = store.get(key) ?? [{ src: '*', dif: '', count: kind === 'escalera' ? levels : 20 }]
  const tagsOf = (bs: LibBankInfo[]) => [...new Set(bs.flatMap((b) => (ctx.lib.peek(b.ref)?.preguntas ?? []).flatMap((q) => q.etiquetas ?? [])))].sort((a, b) => a.localeCompare(b, 'es'))
  // tus etiquetas aparte; las de la Trivia son sus categorías
  const tags = tagsOf(banks.filter((b) => !isTrivia(b)))
  const cats = tagsOf(banks.filter((b) => isTrivia(b) && !isDiscarded(b)))
  const groups = [...new Set(banks.map((b) => b.grupo).filter((g) => g && g !== TRIVIA_GROUP) as string[])]
  // filas guardadas de versiones anteriores: la Trivia era un grupo y sus categorías, etiquetas o bancos sueltos
  rows = rows.map((r) => {
    const v = r.src.slice(2)
    let src = r.src
    if (r.src === `g:${TRIVIA_GROUP}`) src = 'c:*'
    else if (r.src.startsWith('t:') && !tags.includes(v) && cats.includes(v)) src = `c:${v}`
    const ok =
      src === '*' ||
      (src.startsWith('b:') && banks.some((b) => b.ref === src.slice(2))) ||
      (src.startsWith('g:') && groups.includes(src.slice(2))) ||
      (src.startsWith('t:') && tags.includes(src.slice(2))) ||
      (src.startsWith('c:') && (src === 'c:*' || cats.includes(src.slice(2))))
    return { ...r, src: ok ? src : '*' }
  })
  const list = h('div', '', { display: 'flex', flexDirection: 'column', gap: 8 })
  const total = h('div', '', { fontSize: 13 })
  let result: { ref: string; q: Question }[] | null = null

  const paint = () => {
    list.replaceChildren(
      ...rows.map((row, i) => {
        const src = h('select', 'inp', { flex: 2, minWidth: 0 })
        const opt = (v: string, t: string, parent: HTMLElement = src) => {
          const o = h('option', '', {}, [t])
          o.value = v
          o.selected = v === row.src
          parent.append(o)
        }
        opt('*', 'Cualquier banco')
        if (groups.length) {
          const og = h('optgroup')
          og.label = 'Grupos'
          for (const g of groups) opt(`g:${g}`, g, og)
          src.append(og)
        }
        if (cats.length) {
          const oc = h('optgroup')
          oc.label = 'Trivia'
          opt('c:*', 'Trivia · todas las categorías', oc)
          for (const c of cats) opt(`c:${c}`, `Trivia · ${c}`, oc)
          src.append(oc)
        }
        const ob = h('optgroup')
        ob.label = 'Bancos'
        for (const b of banks)
          opt(`b:${b.ref}`, `${kind === 'escalera' ? (b.tipo === 'sino' ? 'Sí o no · ' : 'Test · ') : ''}${b.grupo && !b.nombre.startsWith(b.grupo) ? b.grupo + ' · ' : ''}${b.nombre}`, ob)
        src.append(ob)
        if (tags.length) {
          const ot = h('optgroup')
          ot.label = 'Etiquetas'
          for (const t of tags) opt(`t:${t}`, `Etiqueta: ${t}`, ot)
          src.append(ot)
        }
        src.onchange = () => ((row.src = src.value), paint())
        const dif = h('select', 'inp', { flex: 1 })
        for (const [v, t] of [['', 'Cualquier dificultad'], ...DIFICULTADES.map((d) => [d, DIF_LABEL[d]])]) {
          const o = h('option', '', {}, [t])
          o.value = v
          o.selected = v === row.dif
          dif.append(o)
        }
        dif.onchange = () => ((row.dif = dif.value as MixRow['dif']), paint())
        const n = h('input', 'inp', { width: 80 })
        n.type = 'number'
        n.min = '1'
        n.placeholder = 'Todas'
        n.value = row.count === null ? '' : String(row.count)
        n.onchange = () => {
          const v = parseInt(n.value, 10)
          row.count = Number.isFinite(v) && v > 0 ? v : null
          paint()
        }
        const avail = pool(ctx, banks, row).length
        const x = btn(
          '×',
          () => {
            rows.splice(i, 1)
            paint()
          },
          'b sm ghost'
        )
        x.title = 'Quitar'
        return h('div', '', { display: 'flex', gap: 8, alignItems: 'center' }, [
          n,
          h('span', 'mut', { fontSize: 12 }, ['de']),
          src,
          dif,
          h('span', 'mut', { fontSize: 11, width: 90 }, [`${avail} sin usar`]),
          x
        ])
      })
    )
    const n = build(ctx, kind, rows).length
    total.textContent =
      kind === 'escalera'
        ? `Saldrán ${n} preguntas ordenadas de fácil a difícil${n < levels ? ` · la escalera tiene ${levels} escalones: faltan ${levels - n}` : n > levels ? ` · la escalera usa las ${levels} primeras` : ''}`
        : `Saldrán ${n} preguntas barajadas, sin repetir y sin las ya usadas`
  }
  paint()
  await openDialog(
    kind === 'escalera' ? 'Escalera mezclada' : 'Partida mezclada',
    (close) => [
      h('span', 'mut', { fontSize: 12, lineHeight: '1.45' }, [
        kind === 'escalera'
          ? 'Elige de dónde sacar las preguntas (por ejemplo, 5 fáciles + 5 medias + 5 difíciles). Se ordenan de fácil a difícil.'
          : 'Elige de dónde sacar las preguntas (por ejemplo, 10 de Trivia · Videojuegos difíciles + 5 de Trivia · Cine medias + todas las de un banco tuyo). Sale un banco "Partida mezclada" barajado; al usar una pregunta se marca también en su banco.'
      ]),
      list,
      h('div', '', { display: 'flex', gap: 8 }, [btn('+ Añadir', () => (rows.push({ src: '*', dif: '', count: 5 }), paint()), 'b sm')]),
      total,
      h('div', 'dlg-actions', {}, [
        btn('Cancelar', close, 'b ghost'),
        btn(
          kind === 'escalera' ? 'Preparar la escalera' : 'Crear la partida',
          () => {
            rows = rows.filter((r) => r.src)
            store.set(key, rows)
            result = build(ctx, kind, rows)
            close()
          },
          'b acc'
        )
      ])
    ],
    860
  )
  return result
}

/** Test / Sí o no: deja la mezcla en el banco "Partida mezclada" (se rehace cada vez) y lo elige. */
export async function applyMix(ctx: Ctx, kind: 'test' | 'sino', picks: { ref: string; q: Question }[]): Promise<string | null> {
  if (!picks.length) {
    ctx.toast('No hay preguntas sin usar que cumplan eso')
    return null
  }
  let ref = ctx.lib.banksOf(kind).find((b) => b.mezcla)?.ref ?? null
  if (!ref) ref = await ctx.lib.create(kind, 'Partida mezclada')
  const bank = await ctx.lib.get(ref)
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  ctx.lib.update(ref, {
    ...bank,
    nombre: `Partida mezclada · ${today}`,
    mezcla: true,
    preguntas: picks.map((p, i) => ({ ...p.q, id: `m${i + 1}`, usada: undefined, origen: { ref: p.ref, id: p.q.id } }))
  })
  return ref
}
