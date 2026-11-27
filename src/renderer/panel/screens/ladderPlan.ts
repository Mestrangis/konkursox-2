// Preparar la escalera: preguntas de cualquier banco de Tipo test o Sí o no (o un banco de escalera ya guardado), en orden.
import { isPlayable, type Question } from '../../../shared/questions'
import type { LadderPick } from '../../../shared/quiz'
import { btn, h, openDialog, type Ctx } from '../ui'
import { mixDialog } from './mix'

/** Pregunta de una entrada del plan (null si ya no existe o el banco no se ha leído). */
export function planQuestion(ctx: Ctx, pick: LadderPick): Question | null {
  return ctx.lib.peek(pick.ref)?.preguntas.find((q) => q.id === pick.id) ?? null
}

export async function editLadderPlan(ctx: Ctx): Promise<void> {
  const sources = [...ctx.lib.banksOf('test'), ...ctx.lib.banksOf('sino')]
  const saved = ctx.lib.banksOf('escalera')
  // lee todos los bancos antes de abrir
  await Promise.all([...sources, ...saved].map((b) => ctx.lib.get(b.ref)))
  let plan: LadderPick[] = [...ctx.state.quiz.ladder.plan]
  const levels = ctx.state.quiz.ladder.levels.length
  let srcRef = sources[0]?.ref ?? ''
  let filter = ''

  const listEl = h('div', '', { display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto', maxHeight: 460, minHeight: 200 })
  const pickEl = h('div', '', { display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto', maxHeight: 400 })
  const count = h('span', 'mut', { fontSize: 12 })

  let dragFrom = -1
  function paintPlan(): void {
    count.textContent = `${plan.length} preguntas · la escalera tiene ${levels} escalones${plan.length < levels ? ` · faltan ${levels - plan.length}` : ''}`
    listEl.replaceChildren(
      ...plan.map((p, i) => {
        const q = planQuestion(ctx, p)
        const row = h('div', 'pnl', { padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', background: i < levels ? '' : '#2a1d1d' }, [
          h('span', 'nm', { flex: 'none' }, [`${i + 1}`]),
          h('span', '', { flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [q?.enunciado ?? '(pregunta borrada)']),
          h('span', 'mut', { fontSize: 11, flex: 'none' }, [q?.tipo === 'sino' ? 'Sí/No' : (ctx.lib.info(p.ref)?.nombre ?? '')]),
          (() => {
            const x = h('button', 'x', {}, ['×'])
            x.title = 'Quitar de la escalera'
            x.onclick = () => {
              plan.splice(i, 1)
              paintPlan()
              paintPick()
            }
            return x
          })()
        ])
        row.draggable = true
        row.ondragstart = () => (dragFrom = i)
        row.ondragover = (e) => e.preventDefault()
        row.ondrop = (e) => {
          e.preventDefault()
          if (dragFrom < 0 || dragFrom === i) return
          const [m] = plan.splice(dragFrom, 1)
          plan.splice(i, 0, m)
          dragFrom = -1
          paintPlan()
        }
        return row
      })
    )
    if (!plan.length)
      listEl.append(h('div', 'mut', { padding: 12, fontSize: 13 }, ['Añade preguntas desde la derecha, o carga un banco de escalera guardado. Arrastra para ordenarlas (1 = la más fácil).']))
  }

  function paintPick(): void {
    const bank = ctx.lib.peek(srcRef)
    const inPlan = new Set(plan.map((p) => `${p.ref}::${p.id}`))
    const f = filter.trim().toLowerCase()
    const qs = (bank?.preguntas ?? []).filter((q) => isPlayable(q) && (!f || q.enunciado.toLowerCase().includes(f)))
    pickEl.replaceChildren(
      ...qs.map((q) => {
        const added = inPlan.has(`${srcRef}::${q.id}`)
        return h('div', '', { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }, [
          h('span', '', { flex: 1, minWidth: 0, fontSize: 13, opacity: added || q.usada ? 0.5 : 1 }, [q.enunciado, q.usada ? ' (usada)' : '']),
          btn(
            added ? 'Añadida' : 'Añadir',
            () => {
              if (added) return
              plan.push({ ref: srcRef, id: q.id })
              paintPlan()
              paintPick()
            },
            added ? 'b sm ghost' : 'b sm acc'
          )
        ])
      })
    )
    if (!qs.length) pickEl.append(h('div', 'mut', { padding: 10, fontSize: 13 }, ['No hay preguntas jugables en este banco.']))
  }

  const srcSel = h('select', 'inp')
  for (const b of sources) {
    const o = h('option', '', {}, [`${b.tipo === 'sino' ? 'Sí o no' : 'Test'} · ${b.nombre} (${b.count})`])
    o.value = b.ref
    srcSel.append(o)
  }
  srcSel.onchange = () => {
    srcRef = srcSel.value
    paintPick()
  }
  const search = h('input', 'inp')
  search.placeholder = 'Buscar'
  search.oninput = () => {
    filter = search.value
    paintPick()
  }
  const savedSel = h('select', 'inp', { flex: 1 })
  savedSel.append(h('option', '', {}, [saved.length ? 'Cargar un banco de escalera guardado…' : 'No hay bancos de escalera guardados']))
  ;(savedSel.firstChild as HTMLOptionElement).value = ''
  for (const b of saved) {
    const o = h('option', '', {}, [`${b.nombre} (${b.count})`])
    o.value = b.ref
    savedSel.append(o)
  }
  savedSel.onchange = () => {
    const bank = ctx.lib.peek(savedSel.value)
    if (!bank) return
    plan = bank.preguntas.filter(isPlayable).map((q) => ({ ref: savedSel.value, id: q.id }))
    savedSel.value = ''
    paintPlan()
    paintPick()
  }

  paintPlan()
  paintPick()
  await openDialog(
    'Preguntas de la escalera',
    (close) => [
      h('div', '', { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }, [
        h('div', '', { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }, [
          h('span', 'lbl', {}, ['En orden (escalón 1 arriba)']),
          savedSel,
          count,
          listEl,
          h('div', '', { display: 'flex', gap: 8 }, [
            btn(
              'Mezclar…',
              async () => {
                // la mezcla abre su propio diálogo: este se cierra y se vuelve a abrir con el plan nuevo
                close()
                const picks = await mixDialog(ctx, 'escalera')
                if (picks?.length) {
                  ctx.send({ type: 'ladderSetPlan', plan: picks.map((x) => ({ ref: x.ref, id: x.q.id })) })
                  ctx.toast(`Escalera: ${picks.length} preguntas de fácil a difícil`)
                } else if (picks) ctx.toast('No hay preguntas sin usar que cumplan eso')
                void editLadderPlan(ctx)
              },
              'b sm acc'
            ),
            btn(
              'Vaciar',
              () => {
                plan = []
                paintPlan()
                paintPick()
              },
              'b sm ghost'
            )
          ])
        ]),
        h('div', '', { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }, [h('span', 'lbl', {}, ['Añadir de Tipo test o Sí o no']), srcSel, search, pickEl])
      ]),
      h('div', 'dlg-actions', {}, [
        btn('Cancelar', close, 'b'),
        btn(
          'Guardar',
          () => {
            ctx.send({ type: 'ladderSetPlan', plan })
            close()
          },
          'b acc'
        )
      ])
    ],
    1040
  )
}
