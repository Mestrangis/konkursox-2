// Biblioteca (design/panel.html: "Biblioteca · pregunta tipo test" y "Biblioteca · editor del rosco").
// Un banco por archivo en Documentos\KONKURSOX\preguntas\<tipo>\. Se guarda solo.
import { parseNumber, isPlayable, ROSCO_ALPHABET, type Bank, type Question } from '../../../shared/questions'
import { formatNumber } from '../../../shared/games'
import { LIB_TYPES, newQuestionId, parseRoscoText, QTYPE_OF, sortRosco, type LibType } from '../../../shared/library'
import type { GameState } from '../../../shared/types'
import { btn, h, icon, ICONS, type Ctx, type Screen } from '../ui'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const usedLabel = (d?: string) => {
  if (!d) return 'Sin usar'
  const [, m, day] = d.split('-').map(Number)
  return `Usada ${day} ${MONTHS[(m || 1) - 1]}`
}

export function createLibraryScreen(ctx: Ctx): Screen {
  let tipo: LibType = 'test'
  let ref: string | null = null
  let selId: string | null = null
  let editingLetter: string | null = null
  let search = ''
  const open = new Set<LibType>(['test'])

  const searchInput = h('input', 'inp', { width: 260 })
  searchInput.placeholder = 'Buscar en toda la biblioteca'
  searchInput.setAttribute('aria-label', 'Buscar en la biblioteca')
  searchInput.oninput = () => {
    search = searchInput.value.trim().toLowerCase()
    if (search) void Promise.all(ctx.lib.list.map((b) => ctx.lib.get(b.ref))).then(render)
    render()
  }
  const navEl = h('nav', 'pnl', { width: 210, flex: 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' })
  navEl.setAttribute('aria-label', 'Juegos y bancos')
  const listEl = h('div', 'pnl', { width: 290, flex: 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 })
  const editEl = h('div', 'pnl', { flex: 1, minWidth: 0, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' })
  const work = h('div', '', { display: 'flex', gap: 14, flex: 1, minHeight: 0 })
  const el = h('div', 'screen', {}, [
    h('div', 'head', {}, [
      h('div', 'title', {}, [h('b', '', {}, ['Biblioteca']), h('span', 'mut', { fontSize: 13 }, ['Los cambios se guardan solos · lo que esté en el aire no se toca'])]),
      h('span', 'spacer'),
      searchInput
    ]),
    work
  ])

  const bank = (): Bank | null => ctx.lib.peek(ref)
  const save = (b: Bank) => ref && ctx.lib.update(ref, b)
  const setQ = (id: string, patch: Partial<Question>) => {
    const b = bank()
    if (!b) return
    save({ ...b, preguntas: b.preguntas.map((q) => (q.id === id ? { ...q, ...patch } : q)) })
  }

  function pickBank(t: LibType, r: string | null): void {
    tipo = t
    ref = r
    selId = null
    editingLetter = null
    open.add(t)
    render()
  }

  async function newBank(): Promise<void> {
    const nombre = prompt(`Nombre del banco nuevo de ${LIB_TYPES.find((x) => x.id === tipo)?.label}`, 'Nuevo banco')
    if (!nombre?.trim()) return
    const r = await ctx.lib.create(tipo, nombre.trim())
    await ctx.lib.get(r)
    pickBank(tipo, r)
  }

  function newQuestion(): void {
    const b = bank()
    if (!b) return
    const id = newQuestionId(b, tipo === 'quien' ? 'q' : tipo === 'estimacion' ? 'e' : 'p')
    const t = QTYPE_OF[tipo]
    const q: Question =
      t === 'sino'
        ? { id, tipo: 'sino', enunciado: '', opciones: ['Sí', 'No'], correcta: 0 }
        : t === 'estimacion'
          ? { id, tipo: 'estimacion', enunciado: '', opciones: [], correcta: -1, unidad: '' }
          : t === 'quien'
            ? { id, tipo: 'quien', enunciado: '', opciones: [], correcta: -1, autor: '' }
            : { id, tipo: 'test', enunciado: '', opciones: ['', '', '', ''], correcta: 0 }
    save({ ...b, preguntas: [...b.preguntas, q] })
    selId = id
    render()
    requestAnimationFrame(() => editEl.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  }

  // ---------------------------------------------------------------- navegación de tipos y bancos
  function renderNav(): void {
    navEl.replaceChildren()
    for (const t of LIB_TYPES) {
      const banks = ctx.lib.banksOf(t.id)
      const isOpen = open.has(t.id)
      const sec = h('a', 'tg tsec', {}, [icon(isOpen ? ICONS.triDown : ICONS.triRight, 12, '#9a9aa3'), t.label, h('span', 'c', {}, [String(banks.length)])])
      sec.onclick = () => {
        if (isOpen && tipo === t.id) open.delete(t.id)
        else open.add(t.id)
        tipo = t.id
        if (!banks.some((b) => b.ref === ref)) pickBank(t.id, banks[0]?.ref ?? null)
        else render()
      }
      navEl.append(sec)
      if (!isOpen) continue
      for (const b of banks) {
        const c = t.id === 'rosco' ? `${b.letters ?? 0}/27` : String(b.count)
        const a = h('a', `tg bank${b.ref === ref ? ' on' : ''}`, {}, [h('span', '', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [b.nombre]), h('span', 'c', {}, [c])])
        a.onclick = () => {
          void ctx.lib.get(b.ref)
          pickBank(t.id, b.ref)
        }
        navEl.append(a)
      }
    }
    navEl.append(h('span', 'spacer'), btn('+ Nuevo banco', () => void newBank(), 'b ghost'), btn('Abrir la carpeta', () => void window.konk.libOpenDir(), 'b ghost'))
  }

  // ---------------------------------------------------------------- lista de preguntas
  function renderList(): void {
    listEl.replaceChildren()
    if (search) {
      const hits: { ref: string; q: Question; bank: string }[] = []
      for (const b of ctx.lib.list) {
        const bk = ctx.lib.peek(b.ref)
        if (!bk) continue
        for (const q of bk.preguntas)
          if ([q.enunciado, ...q.opciones, q.autor ?? '', q.respuesta ?? '', q.nota_presentador ?? ''].join(' ').toLowerCase().includes(search)) hits.push({ ref: b.ref, q, bank: b.nombre })
      }
      listEl.append(
        h('div', '', { padding: '2px 4px 6px', fontWeight: 700 }, [`${hits.length} resultados`]),
        h(
          'div',
          '',
          { display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' },
          hits.slice(0, 200).map(({ ref: r, q, bank: name }) => {
            const it = h('div', `it${r === ref && q.id === selId ? ' on' : ''}`, {}, [h('span', 't', {}, [q.tipo === 'rosco' ? `${q.letra}: ${q.enunciado}` : q.enunciado || '(sin enunciado)']), h('span', 'm', {}, [`${name} · ${usedLabel(q.usada)}`])])
            it.onclick = () => {
              const info = ctx.lib.info(r)!
              tipo = info.tipo
              ref = r
              open.add(info.tipo)
              if (q.tipo === 'rosco') editingLetter = q.letra ?? null
              else selId = q.id
              render()
            }
            return it
          })
        )
      )
      return
    }
    const b = bank()
    const info = ctx.lib.info(ref)
    if (!ref || !info) {
      listEl.append(h('div', 'mut', { padding: 8, fontSize: 13 }, [`No hay bancos de ${LIB_TYPES.find((x) => x.id === tipo)?.label}. Crea uno con "+ Nuevo banco".`]))
      return
    }
    const name = h('input', 'inp', { height: 30, fontWeight: 700, background: 'transparent', border: '1px solid transparent', padding: '0 6px' })
    name.value = info.nombre
    name.title = 'Nombre del banco (clic para cambiarlo)'
    name.onchange = () => b && save({ ...b, nombre: name.value.trim() || b.nombre })
    listEl.append(
      h('div', '', { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0 6px' }, [name, btn('+ Nueva', newQuestion, 'b acc sm')]),
      h(
        'div',
        '',
        { display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto', flex: 1 },
        (b?.preguntas ?? []).map((q) => {
          const meta = [usedLabel(q.usada), q.imagen ? 'con imagen' : '', isPlayable(q) ? '' : 'incompleta'].filter(Boolean).join(' · ')
          const it = h('div', `it${q.id === selId ? ' on' : ''}`, {}, [h('span', 't', {}, [q.enunciado || '(sin enunciado)']), h('span', 'm', { color: isPlayable(q) ? '' : '#e8a23a' }, [meta])])
          it.onclick = () => {
            selId = q.id
            render()
          }
          return it
        })
      ),
      h('div', '', { display: 'flex', gap: 6 }, [btn('Eliminar banco', () => void deleteBank(), 'b ghost sm danger')])
    )
  }

  async function deleteBank(): Promise<void> {
    const info = ctx.lib.info(ref)
    if (!ref || !info) return
    if (!confirm(`¿Eliminar el banco «${info.nombre}»? Se mueve a la carpeta _papelera (no se pierde).`)) return
    await ctx.lib.remove(ref)
    pickBank(tipo, ctx.lib.banksOf(tipo)[0]?.ref ?? null)
  }

  // ---------------------------------------------------------------- editor de una pregunta
  let editorKey = ''
  function renderEditor(): void {
    const b = bank()
    const q = b?.preguntas.find((x) => x.id === selId) ?? null
    const key = `${ref}|${q?.id ?? ''}`
    // no se reconstruye mientras escribes en la misma pregunta
    if (key === editorKey && editEl.contains(document.activeElement)) return
    editorKey = key
    editEl.replaceChildren()
    if (!b || !q) {
      editEl.append(h('div', 'mut', { fontSize: 14 }, [b ? 'Elige una pregunta de la lista o crea una nueva.' : '']))
      return
    }
    const area = (label: string, value: string, set: (v: string) => void, height = 70, hint?: string) => {
      const t = h('textarea', 'inp', { height, fontSize: label === 'Enunciado' || label === 'Frase' ? 15 : 14 })
      t.value = value
      t.oninput = () => set(t.value)
      return h('div', 'field', {}, [h('label', 'fl', {}, [label, ...(hint ? [h('span', 'mut', { fontWeight: 400 }, [` · ${hint}`])] : [])]), t])
    }
    const input = (label: string, value: string, set: (v: string) => void, attrs: Partial<HTMLInputElement> = {}) => {
      const i = h('input', 'inp')
      Object.assign(i, attrs)
      i.value = value
      i.oninput = () => set(i.value)
      return h('div', 'field', { flex: 1 }, [h('label', 'fl', {}, [label]), i])
    }
    const t = q.tipo
    if (t === 'test' || t === 'sino') {
      editEl.append(area('Enunciado', q.enunciado, (v) => setQ(q.id, { enunciado: v })))
      const n = t === 'sino' ? 2 : 4
      const opts = Array.from({ length: n }, (_, i) => q.opciones[i] ?? '')
      editEl.append(
        h('div', 'field', { gap: 8 }, [
          h('span', 'fl', {}, ['Opciones · marca la correcta']),
          ...opts.map((o, i) => {
            const right = q.correcta === i
            const rb = h('button', `rb${right ? ' on' : ''}`)
            if (right) rb.append(icon(ICONS.check, 12, '#0d2a1c'))
            rb.setAttribute('aria-label', `Marcar ${'ABCD'[i]} como correcta`)
            rb.onclick = () => {
              setQ(q.id, { correcta: i })
              editorKey = ''
              renderEditor()
            }
            const inp = h('input', 'inp')
            inp.value = o
            inp.setAttribute('aria-label', `Opción ${'ABCD'[i]}`)
            inp.oninput = () => {
              const next = [...opts]
              next[i] = inp.value
              opts[i] = inp.value
              setQ(q.id, { opciones: next })
            }
            if (t === 'sino') inp.readOnly = true
            return h('div', `or${right ? ' right' : ''}`, {}, [rb, h('span', '', { width: 16, fontWeight: 700, color: '#9a9aa3' }, [t === 'sino' ? '' : 'ABCD'[i]]), inp])
          })
        ])
      )
    } else if (t === 'estimacion') {
      editEl.append(
        area('Enunciado', q.enunciado, (v) => setQ(q.id, { enunciado: v })),
        h('div', '', { display: 'flex', gap: 12 }, [
          input('Respuesta (número)', q.valor === undefined ? '' : formatNumber(q.valor), (v) => {
            const n = parseNumber(v)
            setQ(q.id, n === null ? { valor: undefined } : { valor: n })
          }),
          input('Unidad', q.unidad ?? '', (v) => setQ(q.id, { unidad: v })),
          input('Fuente', q.fuente ?? '', (v) => setQ(q.id, { fuente: v || undefined }))
        ])
      )
    } else if (t === 'quien') {
      const people = ctx.state.people.map((p) => p.name)
      editEl.append(
        area('Frase', q.enunciado, (v) => setQ(q.id, { enunciado: v })),
        h('div', '', { display: 'flex', gap: 12 }, [
          input('Autor', q.autor ?? '', (v) => setQ(q.id, { autor: v }), { placeholder: people.slice(0, 3).join(', ') }),
          input('Dónde se dijo', q.fuente ?? '', (v) => setQ(q.id, { fuente: v || undefined }), { placeholder: 'Chat del grupo' })
        ]),
        h('div', '', { display: 'flex', gap: 12 }, [
          input('Fecha', q.fecha ?? '', (v) => setQ(q.id, { fecha: v || undefined }), { placeholder: '14 de marzo de 2024' }),
          input('Hora', q.hora ?? '', (v) => setQ(q.id, { hora: v || undefined }), { placeholder: '03:12' })
        ]),
        area('Opciones', q.opciones.join(', '), (v) => setQ(q.id, { opciones: v.split(',').map((x) => x.trim()).filter(Boolean) }), 52, 'separadas por comas; vacío = personas del grupo')
      )
    }
    editEl.append(area('Nota del presentador', q.nota_presentador ?? '', (v) => setQ(q.id, { nota_presentador: v || undefined }), 60, 'solo la ves tú'))

    if (t !== 'estimacion') editEl.append(imageField(q))

    // pie
    const playable = isPlayable(q)
    editEl.append(
      h('div', '', { display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }, [
        h('span', 'mut', { fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }, [
          icon(ICONS.check, 14, playable ? '#3ecf8e' : '#e8a23a'),
          `Guardado · ${usedLabel(q.usada).toLowerCase()}${playable ? '' : ' · incompleta (no sale en el juego)'}`
        ]),
        h('span', 'spacer'),
        btn(q.usada ? 'Marcar sin usar' : 'Marcar como usada', () => {
          ref && ctx.lib.markUsed(ref, [q.id], !q.usada)
          editorKey = ''
        }, 'b ghost'),
        btn('Duplicar', () => {
          const b2 = bank()
          if (!b2) return
          const id = newQuestionId(b2, q.id.replace(/\d+$/, '') || 'p')
          const i = b2.preguntas.findIndex((x) => x.id === q.id)
          const copy = { ...q, id, usada: undefined }
          save({ ...b2, preguntas: [...b2.preguntas.slice(0, i + 1), copy, ...b2.preguntas.slice(i + 1)] })
          selId = id
          editorKey = ''
        }, 'b ghost'),
        btn('Eliminar', () => {
          const b2 = bank()
          if (!b2 || !confirm('¿Eliminar esta pregunta del banco?')) return
          save({ ...b2, preguntas: b2.preguntas.filter((x) => x.id !== q.id) })
          selId = null
          editorKey = ''
        }, 'b ghost danger')
      ])
    )
  }

  function imageField(q: Question): HTMLElement {
    const img = h('div', 'img')
    if (q.imagen) {
      const i = h('img')
      i.src = `konk-media://imagenes/${encodeURIComponent(q.imagen)}`
      i.alt = ''
      img.append(i)
    } else img.append(icon(ICONS.image, 28, '#55555d'))
    const drop = h('div', 'drop', {}, [
      img,
      h('div', '', { flex: 1 }, [h('div', '', { fontSize: 13 }, [q.imagen ?? 'Sin imagen']), h('div', 'mut', { fontSize: 12 }, [q.imagen ? 'Arrastra otra imagen para cambiarla' : 'Arrastra una imagen aquí'])]),
      btn('Elegir…', async () => {
        const f = await window.konk.libChooseImage()
        if (f) {
          setQ(q.id, { imagen: f })
          editorKey = ''
        }
      }, 'b ghost sm'),
      ...(q.imagen
        ? [
            btn('Quitar', () => {
              setQ(q.id, { imagen: undefined })
              editorKey = ''
            }, 'b ghost sm')
          ]
        : [])
    ])
    drop.ondragover = (e) => {
      e.preventDefault()
      drop.classList.add('over')
    }
    drop.ondragleave = () => drop.classList.remove('over')
    drop.ondrop = async (e) => {
      e.preventDefault()
      drop.classList.remove('over')
      const file = e.dataTransfer?.files[0]
      if (!file) return
      try {
        const name = await window.konk.libImportImage(window.konk.pathForFile(file))
        setQ(q.id, { imagen: name })
        editorKey = ''
      } catch (err) {
        ctx.toast(String((err as Error).message ?? err))
      }
    }
    return h('div', 'field', {}, [h('span', 'fl', {}, ['Imagen ', h('span', 'mut', { fontWeight: 400 }, ['· opcional, sale en el plató'])]), drop])
  }

  // ---------------------------------------------------------------- editor del rosco (cuadrícula)
  let roscoKey = ''
  function renderRosco(): void {
    const b = bank()
    const info = ctx.lib.info(ref)
    const key = `${ref}|${editingLetter}`
    if (key === roscoKey && editEl.contains(document.activeElement)) return
    roscoKey = key
    editEl.replaceChildren()
    if (!b || !info) {
      editEl.append(h('div', 'mut', {}, ['No hay roscos. Crea uno con "+ Nuevo banco".']))
      return
    }
    const byLetter = new Map<string, Question>()
    for (const q of b.preguntas) if (q.letra && !byLetter.has(q.letra)) byLetter.set(q.letra, q)
    const done = ROSCO_ALPHABET.filter((l) => {
      const q = byLetter.get(l)
      return q && q.enunciado.trim() && q.respuesta?.trim()
    }).length
    const upsert = (letra: string, patch: Partial<Question>) => {
      const cur = bank()!
      const ex = cur.preguntas.find((q) => q.letra === letra)
      if (ex) save({ ...cur, preguntas: cur.preguntas.map((q) => (q === ex ? { ...q, ...patch } : q)) })
      else
        save({
          ...cur,
          preguntas: sortRosco([...cur.preguntas, { id: newQuestionId(cur, 'r'), tipo: 'rosco', letra, modo: 'empieza', enunciado: '', opciones: [], correcta: -1, respuesta: '', ...patch }])
        })
    }
    const name = h('input', 'inp', { width: 220, height: 32, fontWeight: 700 })
    name.value = b.nombre
    name.onchange = () => save({ ...bank()!, nombre: name.value.trim() || b.nombre })
    editEl.append(
      h('div', '', { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, [
        name,
        h('span', 'mut', { fontSize: 13 }, [`${done} de 27 letras completas · pulsa una letra para editarla`]),
        h('div', 'bar6', {}, [h('i', '', { width: `${Math.round((done / 27) * 100)}%` })]),
        h('span', 'spacer'),
        btn('Importar desde texto', importText, 'b'),
        btn('Probar rosco', () => {
          ctx.send({ type: 'roscoConfig', patch: { bankFile: ref } })
          ctx.go('rosco')
        }, 'b ghost'),
        btn('Eliminar', () => void deleteBank(), 'b ghost danger')
      ])
    )
    const grid = h('div', '', { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, overflow: 'auto', paddingRight: 4 })
    for (const l of ROSCO_ALPHABET) {
      const q = byLetter.get(l)
      const def = q?.enunciado ?? ''
      const ans = q?.respuesta ?? ''
      const miss = !def.trim() || !ans.trim()
      const editing = editingLetter === l
      const modo = q?.modo ?? 'empieza'
      const mini = h('div', 'mini', {}, [
        (() => {
          const x = h('button', modo === 'empieza' ? 'on' : '', {}, ['Empieza'])
          x.onclick = (e) => {
            e.stopPropagation()
            upsert(l, { modo: 'empieza' })
            roscoKey = ''
          }
          return x
        })(),
        (() => {
          const x = h('button', modo === 'contiene' ? 'on' : '', {}, ['Contiene'])
          x.onclick = (e) => {
            e.stopPropagation()
            upsert(l, { modo: 'contiene' })
            roscoKey = ''
          }
          return x
        })()
      ])
      mini.setAttribute('aria-label', `Tipo de pista para ${l}`)
      const card = h('div', `lc${miss ? ' miss' : ''}${editing ? ' editing' : ''}`, {}, [
        h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
          h('span', 'lb', {}, [l]),
          mini,
          h('span', 'spacer', { minWidth: 4 }),
          h('span', '', { fontWeight: 700, fontSize: 13, letterSpacing: '0.03em', color: ans ? '#ececef' : '#e8a23a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [ans ? ans.toUpperCase() : 'SIN RESPUESTA'])
        ])
      ])
      if (editing) {
        const ta = h('textarea', 'inp', { height: 52, padding: '8px 10px', fontSize: 12, resize: 'none' })
        ta.placeholder = 'Definición'
        ta.value = def
        ta.setAttribute('aria-label', `Definición de la ${l}`)
        ta.oninput = () => upsert(l, { enunciado: ta.value })
        const an = h('input', 'inp', { height: 32, fontSize: 13, fontWeight: 700 })
        an.placeholder = 'Respuesta'
        an.value = ans
        an.setAttribute('aria-label', `Respuesta de la ${l}`)
        an.oninput = () => upsert(l, { respuesta: an.value })
        an.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const i = ROSCO_ALPHABET.indexOf(l)
            editingLetter = ROSCO_ALPHABET[(i + 1) % 27]
            roscoKey = ''
            render()
            requestAnimationFrame(() => editEl.querySelector<HTMLTextAreaElement>('.lc.editing textarea')?.focus())
          }
        }
        card.append(ta, an)
      } else {
        card.append(h('span', 'def', { color: def ? '#b9b9c1' : '#e8a23a' }, [def || 'Falta la definición']))
        card.onclick = () => {
          editingLetter = l
          roscoKey = ''
          render()
          requestAnimationFrame(() => editEl.querySelector<HTMLTextAreaElement>('.lc.editing textarea')?.focus())
        }
      }
      grid.append(card)
    }
    editEl.append(grid)
  }

  function importText(): void {
    const ta = h('textarea', 'inp', { height: 260, fontFamily: 'Consolas, monospace', fontSize: 13 })
    ta.placeholder = 'A: Fruto seco del almendro = Almendra\nÑ (contiene): Período de doce meses = Año\n...'
    const box = h('div', 'ctx ui', { left: '50%', top: '15%', transform: 'translateX(-50%)', width: 620, padding: 16, gap: 10 }, [
      h('b', '', {}, ['Importar el rosco desde texto']),
      h('span', 'mut', { fontSize: 12 }, ['Una línea por letra: "LETRA: definición = RESPUESTA". Añade "(contiene)" detrás de la letra si la pista es "contiene". Sustituye las letras que traiga el texto.']),
      ta,
      h('div', '', { display: 'flex', gap: 8, justifyContent: 'flex-end' }, [
        btn('Cancelar', () => box.remove(), 'b ghost'),
        btn('Importar', () => {
          const rows = parseRoscoText(ta.value)
          if (!rows.length) return ctx.toast('No se ha reconocido ninguna línea')
          let b = bank()!
          for (const r of rows) {
            const ex = b.preguntas.find((q) => q.letra === r.letra)
            const patch = { modo: r.modo, enunciado: r.definicion, respuesta: r.respuesta }
            b = ex
              ? { ...b, preguntas: b.preguntas.map((q) => (q === ex ? { ...q, ...patch } : q)) }
              : { ...b, preguntas: [...b.preguntas, { id: newQuestionId(b, 'r'), tipo: 'rosco', letra: r.letra, opciones: [], correcta: -1, ...patch }] }
          }
          save({ ...b, preguntas: sortRosco(b.preguntas) })
          box.remove()
          roscoKey = ''
          ctx.toast(`Importadas ${rows.length} letras`)
          render()
        }, 'b acc')
      ])
    ])
    document.body.append(box)
    ta.focus()
  }

  // ---------------------------------------------------------------- pintado general
  function render(): void {
    if (!ref || !ctx.lib.info(ref)) {
      const first = ctx.lib.banksOf(tipo)[0]
      ref = first?.ref ?? null
    }
    if (ref) void ctx.lib.get(ref)
    renderNav()
    const rosco = tipo === 'rosco' && !search
    work.replaceChildren(navEl, ...(rosco ? [] : [listEl]), editEl)
    if (!rosco) renderList()
    if (rosco) renderRosco()
    else {
      if (!selId && bank()?.preguntas[0]) selId = bank()!.preguntas[0].id
      renderEditor()
    }
  }

  ctx.lib.onChange(() => {
    if (el.isConnected) render()
  })

  return {
    el,
    update(_s: GameState) {
      /* la biblioteca no depende del estado del juego */
    },
    shown: render
  }
}
