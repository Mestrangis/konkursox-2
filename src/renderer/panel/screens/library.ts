// Biblioteca (design/panel.html: "Biblioteca · pregunta tipo test" y "Biblioteca · editor del rosco").
// Un banco por archivo en Documentos\KONKURSOX\preguntas\<tipo>\. Se guarda solo.
// Filtros (banco, etiqueta, dificultad, usadas, sin revisar, falta imagen, texto), selección múltiple
// (mover/copiar, etiqueta, dificultad, revisadas, borrar), arrastrar a otro banco, edición rápida,
// dos imágenes por pregunta (pegar, arrastrar o buscar), duplicados e importar / exportar.
import { DIF_LABEL, DIFICULTADES, isPlayable, missingImage, normText, parseNumber, ROSCO_ALPHABET, type Bank, type Dificultad, type Question } from '../../../shared/questions'
import { formatNumber } from '../../../shared/games'
import { LIB_TYPES, newQuestionId, parseRoscoText, QTYPE_OF, sortRosco, toFileBank, type LibBankInfo, type LibType } from '../../../shared/library'
import { findDuplicates, parseImport, questionsToCsv, type ImportResult } from '../../../shared/importer'
import type { GameState } from '../../../shared/types'
import { askConfirm, askText, btn, h, icon, ICONS, openDialog, type Ctx, type Screen } from '../ui'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const usedLabel = (d?: string) => {
  if (!d) return 'Sin usar'
  const [, m, day] = d.split('-').map(Number)
  return `Usada ${day} ${MONTHS[(m || 1) - 1]}`
}
/** "Todas las preguntas de este tipo" en lugar de un banco. */
const ALL = '*'
type Estado = '' | 'sinusar' | 'usadas' | 'revisar' | 'faltaimg' | 'conimg'
interface Row {
  ref: string
  q: Question
  i: number
}
const keyOf = (ref: string, id: string) => `${ref}::${id}`
const DRAG_TYPE = 'application/x-konk-preguntas'

export function createLibraryScreen(ctx: Ctx): Screen {
  let tipo: LibType = 'test'
  let ref: string | null = null
  /** pregunta abierta en el editor (con su banco: en "Todas" pueden ser de varios) */
  let selRef: string | null = null
  let selId: string | null = null
  let editingLetter: string | null = null
  let search = ''
  const open = new Set<LibType>(['test'])
  const openGroups = new Set<string>()
  const filt = { tag: '', dif: '' as '' | Dificultad | 'none', estado: '' as Estado, text: '' }
  const checked = new Set<string>()
  let lastClicked = -1
  let quick: string | null = null
  /** a qué imagen va lo que se pegue con Ctrl+V (la última zona que tocaste) */
  let pasteTo: 'q' | 'a' = 'q'

  const searchInput = h('input', 'inp', { width: 260 })
  searchInput.placeholder = 'Buscar en toda la biblioteca'
  searchInput.setAttribute('aria-label', 'Buscar en la biblioteca')
  searchInput.oninput = () => {
    search = searchInput.value.trim().toLowerCase()
    if (search) void Promise.all(ctx.lib.list.map((b) => ctx.lib.get(b.ref))).then(render)
    render()
  }
  const navEl = h('nav', 'pnl', { width: 220, flex: 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' })
  navEl.setAttribute('aria-label', 'Juegos y bancos')
  const listEl = h('div', 'pnl', { width: 340, flex: 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 })
  const editEl = h('div', 'pnl', { flex: 1, minWidth: 0, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' })
  const work = h('div', '', { display: 'flex', gap: 14, flex: 1, minHeight: 0 })
  const el = h('div', 'screen', {}, [
    h('div', 'head', {}, [
      h('div', 'title', {}, [h('b', '', {}, ['Biblioteca']), h('span', 'mut', { fontSize: 13 }, ['Los cambios se guardan solos · lo que esté en el aire no se toca'])]),
      h('span', 'spacer'),
      btn('Importar…', () => void importDialog(), 'b'),
      searchInput
    ]),
    work
  ])

  const bank = (): Bank | null => (ref && ref !== ALL ? ctx.lib.peek(ref) : null)
  const save = (b: Bank) => ref && ref !== ALL && ctx.lib.update(ref, b)
  const saveTo = (r: string, b: Bank) => ctx.lib.update(r, b)
  const setQ = (r: string, id: string, patch: Partial<Question>) => {
    const b = ctx.lib.peek(r)
    if (!b) return
    saveTo(r, { ...b, preguntas: b.preguntas.map((q) => (q.id === id ? { ...q, ...patch } : q)) })
  }
  /** bancos donde puede ir una pregunta de este tipo */
  const compatible = (q: Question): LibBankInfo[] => ctx.lib.list.filter((b) => QTYPE_OF[b.tipo] === q.tipo && b.tipo !== 'rosco')
  const banksInScope = (): string[] => (ref === ALL ? ctx.lib.banksOf(tipo).map((b) => b.ref) : ref ? [ref] : [])

  function pickBank(t: LibType, r: string | null): void {
    tipo = t
    ref = r
    selRef = null
    selId = null
    editingLetter = null
    checked.clear()
    quick = null
    open.add(t)
    if (r === ALL) void Promise.all(ctx.lib.banksOf(t).map((b) => ctx.lib.get(b.ref))).then(render)
    render()
  }

  async function newBank(): Promise<void> {
    const label = LIB_TYPES.find((x) => x.id === tipo)?.label ?? ''
    const nombre = await askText(`Banco nuevo de ${label}`, '', 'Crear', 'Ponle un nombre (por ejemplo "Cultura general")')
    if (!nombre) return
    const r = await ctx.lib.create(tipo, nombre)
    await ctx.lib.get(r)
    pickBank(tipo, r)
  }

  function newQuestion(): void {
    const b = bank()
    if (!b || !ref) return
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
    selRef = ref
    selId = id
    render()
    requestAnimationFrame(() => editEl.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  }

  // ---------------------------------------------------------------- mover / copiar entre bancos
  async function moveQuestions(items: { ref: string; id: string }[], to: string, copy: boolean): Promise<number> {
    const target = await ctx.lib.get(to)
    const toInfo = ctx.lib.info(to)
    if (!toInfo) return 0
    let tb = target
    let n = 0
    const bySource = new Map<string, Set<string>>()
    for (const it of items) if (it.ref !== to || copy) bySource.set(it.ref, (bySource.get(it.ref) ?? new Set()).add(it.id))
    for (const [src, ids] of bySource) {
      const sb = await ctx.lib.get(src)
      const moving = sb.preguntas.filter((q) => ids.has(q.id) && QTYPE_OF[toInfo.tipo] === q.tipo)
      for (const q of moving) {
        const id = tb.preguntas.some((x) => x.id === q.id) ? newQuestionId(tb, q.id.replace(/\d+$/, '') || 'p') : q.id
        tb = { ...tb, preguntas: [...tb.preguntas, { ...q, id, origen: undefined }] }
        n++
      }
      if (!copy && src !== to) {
        const gone = new Set(moving.map((q) => q.id))
        saveTo(src, { ...sb, preguntas: sb.preguntas.filter((q) => !gone.has(q.id)) })
      }
    }
    saveTo(to, tb)
    return n
  }

  /** Arrastrar preguntas de la lista a un banco de la izquierda (Ctrl = copiar). */
  function dropTarget(a: HTMLElement, b: LibBankInfo): void {
    a.ondragover = (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'
      a.classList.add('drop-on')
    }
    a.ondragleave = () => a.classList.remove('drop-on')
    a.ondrop = async (e) => {
      a.classList.remove('drop-on')
      const raw = e.dataTransfer?.getData(DRAG_TYPE)
      if (!raw) return
      e.preventDefault()
      const items = JSON.parse(raw) as { ref: string; id: string }[]
      const n = await moveQuestions(items, b.ref, e.ctrlKey)
      checked.clear()
      ctx.toast(n ? `${n} ${n === 1 ? 'pregunta' : 'preguntas'} ${e.ctrlKey ? 'copiadas' : 'movidas'} a «${b.nombre}»` : 'Esas preguntas no son de este tipo de banco')
      render()
    }
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
        if (!banks.some((b) => b.ref === ref) && ref !== ALL) pickBank(t.id, banks[0]?.ref ?? null)
        else render()
      }
      navEl.append(sec)
      if (!isOpen) continue
      const bankLink = (b: LibBankInfo, indent = false) => {
        const c = t.id === 'rosco' ? `${b.letters ?? 0}/27` : String(b.count)
        const a = h('a', `tg bank${b.ref === ref ? ' on' : ''}`, indent ? { paddingLeft: 40 } : {}, [
          h('span', '', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: b.mezcla ? 'italic' : '' }, [b.nombre]),
          h('span', 'c', {}, [c])
        ])
        a.title = b.mezcla ? 'Generado por "Partida mezclada": se rehace cada vez' : b.nombre
        a.onclick = () => {
          void ctx.lib.get(b.ref)
          pickBank(t.id, b.ref)
        }
        if (t.id !== 'rosco') dropTarget(a, b)
        return a
      }
      if (banks.length > 1 && t.id !== 'rosco') {
        const all = h('a', `tg bank${ref === ALL && tipo === t.id ? ' on' : ''}`, {}, [h('span', '', {}, ['Todas']), h('span', 'c', {}, [String(banks.reduce((n, b) => n + b.count, 0))])])
        all.title = 'Todas las preguntas de este juego (para filtrar por etiqueta, dificultad...)'
        all.onclick = () => pickBank(t.id, ALL)
        navEl.append(all)
      }
      for (const b of banks.filter((x) => !x.grupo)) navEl.append(bankLink(b))
      const groups = [...new Set(banks.map((b) => b.grupo).filter(Boolean) as string[])]
      for (const g of groups) {
        const gk = `${t.id}|${g}`
        const inGroup = banks.filter((b) => b.grupo === g)
        const gOpen = openGroups.has(gk) || inGroup.some((b) => b.ref === ref)
        const head = h('a', 'tg bank', { fontWeight: 600 }, [
          icon(gOpen ? ICONS.triDown : ICONS.triRight, 10, '#9a9aa3'),
          h('span', '', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [g]),
          h('span', 'c', {}, [String(inGroup.length)])
        ])
        head.onclick = () => {
          if (gOpen) openGroups.delete(gk)
          else openGroups.add(gk)
          renderNav()
        }
        navEl.append(head)
        if (gOpen) for (const b of inGroup) navEl.append(bankLink(b, true))
      }
    }
    navEl.append(
      h('span', 'spacer'),
      btn('+ Nuevo banco', () => void newBank(), 'b ghost'),
      btn('Abrir la carpeta', () => void window.konk.libOpenDir(), 'b ghost')
    )
  }

  // ---------------------------------------------------------------- filtros
  function tagsInScope(): string[] {
    const set = new Set<string>()
    for (const r of banksInScope()) for (const q of ctx.lib.peek(r)?.preguntas ?? []) for (const t of q.etiquetas ?? []) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }
  function matches(q: Question): boolean {
    if (filt.tag && !(q.etiquetas ?? []).includes(filt.tag)) return false
    if (filt.dif === 'none' ? !!q.dificultad : filt.dif && q.dificultad !== filt.dif) return false
    switch (filt.estado) {
      case 'sinusar':
        if (q.usada) return false
        break
      case 'usadas':
        if (!q.usada) return false
        break
      case 'revisar':
        if (!q.sin_revisar) return false
        break
      case 'faltaimg':
        if (!missingImage(q)) return false
        break
      case 'conimg':
        if (!q.imagen && !q.imagen_respuesta) return false
        break
    }
    if (filt.text) {
      const t = normText(filt.text)
      if (!normText([q.enunciado, ...q.opciones, q.autor ?? '', q.respuesta ?? '', q.nota_presentador ?? '', ...(q.etiquetas ?? [])].join(' ')).includes(t)) return false
    }
    return true
  }
  const filtering = () => !!(filt.tag || filt.dif || filt.estado || filt.text)
  function rows(): Row[] {
    const out: Row[] = []
    for (const r of banksInScope()) (ctx.lib.peek(r)?.preguntas ?? []).forEach((q, i) => matches(q) && out.push({ ref: r, q, i }))
    return out
  }

  function filterBar(): HTMLElement {
    const sel = (label: string, value: string, opts: [string, string][], set: (v: string) => void) => {
      const s = h('select', 'inp', { height: 30, fontSize: 12, flex: 1, minWidth: 0 })
      s.setAttribute('aria-label', label)
      for (const [v, t] of opts) {
        const o = h('option', '', {}, [t])
        o.value = v
        o.selected = v === value
        s.append(o)
      }
      s.onchange = () => {
        set(s.value)
        checked.clear()
        render()
      }
      return s
    }
    const text = h('input', 'inp', { height: 30, fontSize: 12 })
    text.placeholder = 'Filtrar por texto'
    text.value = filt.text
    text.oninput = () => {
      filt.text = text.value
      renderList()
      requestAnimationFrame(() => {
        const t2 = listEl.querySelector<HTMLInputElement>('.libfilters input')
        if (t2 && document.activeElement !== t2) {
          t2.focus()
          t2.setSelectionRange(t2.value.length, t2.value.length)
        }
      })
    }
    const tags = tagsInScope()
    return h('div', 'libfilters', { display: 'flex', flexDirection: 'column', gap: 6 }, [
      h('div', '', { display: 'flex', gap: 6 }, [
        sel('Etiqueta', filt.tag, [['', 'Todas las etiquetas'], ...tags.map((t) => [t, t] as [string, string])], (v) => (filt.tag = v)),
        sel(
          'Dificultad',
          filt.dif,
          [['', 'Cualquier dificultad'], ...DIFICULTADES.map((d) => [d, DIF_LABEL[d]] as [string, string]), ['none', 'Sin dificultad']],
          (v) => (filt.dif = v as typeof filt.dif)
        )
      ]),
      h('div', '', { display: 'flex', gap: 6 }, [
        sel(
          'Estado',
          filt.estado,
          [
            ['', 'Todas'],
            ['sinusar', 'Sin usar'],
            ['usadas', 'Usadas'],
            ['revisar', 'Sin revisar'],
            ['faltaimg', 'Falta imagen'],
            ['conimg', 'Con imagen']
          ],
          (v) => (filt.estado = v as Estado)
        ),
        text
      ])
    ])
  }

  // ---------------------------------------------------------------- lista de preguntas
  function badges(q: Question): HTMLElement {
    const b: (HTMLElement | string)[] = []
    if (q.dificultad) b.push(h('span', `bdg dif-${q.dificultad}`, {}, [DIF_LABEL[q.dificultad]]))
    for (const t of (q.etiquetas ?? []).slice(0, 2)) b.push(h('span', 'bdg', {}, [t]))
    if (q.sin_revisar) b.push(h('span', 'bdg warn', {}, ['Sin revisar']))
    if (missingImage(q)) b.push(h('span', 'bdg warn', {}, ['Falta imagen']))
    else if (q.imagen || q.imagen_respuesta) b.push(h('span', 'bdg', {}, ['Imagen']))
    return h('span', 'bdgs', {}, b)
  }

  function renderList(): void {
    listEl.replaceChildren()
    if (search) return renderSearch()
    const info = ref === ALL ? null : ctx.lib.info(ref)
    if (!ref || (ref !== ALL && !info)) {
      listEl.append(h('div', 'mut', { padding: 8, fontSize: 13 }, [`No hay bancos de ${LIB_TYPES.find((x) => x.id === tipo)?.label}. Crea uno con "+ Nuevo banco".`]))
      return
    }
    const b = bank()
    const ladder = tipo === 'escalera' && ref !== ALL
    const levels = ctx.state.quiz.ladder.levels
    const all = rows()
    const total = banksInScope().reduce((n, r) => n + (ctx.lib.peek(r)?.preguntas.length ?? 0), 0)

    // cabecera: nombre del banco (o "Todas"), nueva, importar / exportar
    let title: HTMLElement
    if (ref === ALL) title = h('b', '', { flex: 1, padding: '0 6px' }, [`Todas · ${LIB_TYPES.find((x) => x.id === tipo)?.label}`])
    else {
      const name = h('input', 'inp', { height: 30, fontWeight: 700, background: 'transparent', border: '1px solid transparent', padding: '0 6px', flex: 1, minWidth: 0 })
      name.value = info!.nombre
      name.title = 'Nombre del banco (clic para cambiarlo)'
      name.onchange = () => b && save({ ...b, nombre: name.value.trim() || b.nombre })
      title = name
    }
    listEl.append(h('div', '', { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0 4px' }, [title, ...(ref !== ALL ? [btn('+ Nueva', newQuestion, 'b acc sm')] : [])]))
    if (ladder)
      listEl.append(
        btn('Traer de Tipo test', () => void bringFromTest(), 'b sm'),
        h('span', 'mut', { fontSize: 11, color: (b?.preguntas.length ?? 0) === levels.length ? '' : '#e8a23a' }, [
          `${b?.preguntas.length ?? 0} preguntas para ${levels.length} escalones · arrastra para ordenar (1 = la más fácil)`
        ])
      )
    listEl.append(filterBar())

    // barra de selección
    const sel = all.filter((r) => checked.has(keyOf(r.ref, r.q.id)))
    if (sel.length) listEl.append(selectionBar(sel, all))
    else
      listEl.append(
        h('div', 'mut', { fontSize: 11, display: 'flex', gap: 8, alignItems: 'center' }, [
          h('span', '', { flex: 1 }, [filtering() ? `${all.length} de ${total}` : `${total} preguntas`, ' · casilla o Ctrl+clic para elegir varias · doble clic para editar rápido']),
          ...(all.length ? [btn('Todas', () => (all.forEach((r) => checked.add(keyOf(r.ref, r.q.id))), renderList()), 'b sm ghost')] : [])
        ])
      )

    const LIMIT = 400
    let dragFrom = -1
    const box = h('div', '', { display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto', flex: 1 })
    all.slice(0, LIMIT).forEach((r, idx) => {
      const { q } = r
      const k = keyOf(r.ref, q.id)
      if (quick === k) return box.append(quickEditor(r))
      const bankName = ref === ALL ? (ctx.lib.info(r.ref)?.nombre ?? '') : ''
      const meta = [ladder ? `Escalón ${r.i + 1}${levels[r.i] ? ' · ' + levels[r.i].value.toLocaleString('es-ES') : ''}` : usedLabel(q.usada), bankName, isPlayable(q) ? '' : 'incompleta']
        .filter(Boolean)
        .join(' · ')
      const chk = h('input', 'chk')
      chk.type = 'checkbox'
      chk.checked = checked.has(k)
      chk.setAttribute('aria-label', 'Elegir esta pregunta')
      chk.onclick = (e) => {
        e.stopPropagation()
        toggleCheck(all, idx, (e as MouseEvent).shiftKey)
      }
      const it = h('div', `it row${selRef === r.ref && q.id === selId ? ' on' : ''}${checked.has(k) ? ' chk-on' : ''}`, {}, [
        chk,
        h('div', '', { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }, [
          h('span', 't', {}, [ladder ? `${r.i + 1}. ${q.enunciado || '(sin enunciado)'}` : q.enunciado || '(sin enunciado)']),
          h('span', 'm', { color: isPlayable(q) ? '' : '#e8a23a' }, [meta]),
          badges(q)
        ])
      ])
      it.onclick = (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return toggleCheck(all, idx, e.shiftKey)
        selRef = r.ref
        selId = q.id
        lastClicked = idx
        render()
      }
      it.ondblclick = () => {
        quick = k
        renderList()
        requestAnimationFrame(() => listEl.querySelector<HTMLTextAreaElement>('.qe textarea')?.focus())
      }
      it.draggable = true
      it.ondragstart = (e) => {
        dragFrom = r.i
        // se arrastran las elegidas (o esta sola)
        const items = checked.has(k) ? all.filter((x) => checked.has(keyOf(x.ref, x.q.id))).map((x) => ({ ref: x.ref, id: x.q.id })) : [{ ref: r.ref, id: q.id }]
        e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(items))
        e.dataTransfer?.setData('text/plain', String(r.i))
        it.style.opacity = '0.4'
      }
      it.ondragend = () => (it.style.opacity = '')
      if (ladder && !filtering()) {
        // en la escalera también se reordena arrastrando dentro de la lista
        it.ondragover = (e) => {
          e.preventDefault()
          it.style.boxShadow = '0 -2px 0 #4f7dff'
        }
        it.ondragleave = () => (it.style.boxShadow = '')
        it.ondrop = (e) => {
          e.preventDefault()
          it.style.boxShadow = ''
          const cur = bank()
          const from = dragFrom
          if (!cur || from < 0 || from === r.i) return
          const arr = [...cur.preguntas]
          const [moved] = arr.splice(from, 1)
          arr.splice(r.i, 0, moved)
          save({ ...cur, preguntas: arr })
        }
      }
      box.append(it)
    })
    if (all.length > LIMIT) box.append(h('div', 'mut', { padding: 8, fontSize: 12 }, [`y ${all.length - LIMIT} más: usa los filtros para verlas`]))
    if (!all.length) box.append(h('div', 'mut', { padding: 8, fontSize: 12 }, [total ? 'Ninguna pregunta cumple los filtros.' : 'Banco vacío.']))
    listEl.append(box)
    listEl.append(
      h('div', '', { display: 'flex', gap: 6, flexWrap: 'wrap' }, [
        ...(ref !== ALL
          ? [btn('Exportar…', () => void exportDialog(), 'b ghost sm'), btn('Eliminar banco', () => void deleteBank(), 'b ghost sm danger')]
          : [h('span', 'mut', { fontSize: 11 }, ['Arrastra preguntas a un banco de la izquierda para moverlas (Ctrl: copiarlas).'])])
      ])
    )
  }

  function toggleCheck(all: Row[], idx: number, range: boolean): void {
    if (range && lastClicked >= 0) {
      const [a, b] = [Math.min(lastClicked, idx), Math.max(lastClicked, idx)]
      for (let i = a; i <= b; i++) checked.add(keyOf(all[i].ref, all[i].q.id))
    } else {
      const k = keyOf(all[idx].ref, all[idx].q.id)
      if (checked.has(k)) checked.delete(k)
      else checked.add(k)
    }
    lastClicked = idx
    renderList()
  }

  function renderSearch(): void {
    const hits: { ref: string; q: Question; bank: string }[] = []
    for (const b of ctx.lib.list) {
      const bk = ctx.lib.peek(b.ref)
      if (!bk) continue
      for (const q of bk.preguntas)
        if ([q.enunciado, ...q.opciones, q.autor ?? '', q.respuesta ?? '', q.nota_presentador ?? '', ...(q.etiquetas ?? [])].join(' ').toLowerCase().includes(search))
          hits.push({ ref: b.ref, q, bank: b.nombre })
    }
    listEl.append(
      h('div', '', { padding: '2px 4px 6px', fontWeight: 700 }, [`${hits.length} resultados`]),
      h(
        'div',
        '',
        { display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' },
        hits.slice(0, 200).map(({ ref: r, q, bank: name }) => {
          const it = h('div', `it${r === selRef && q.id === selId ? ' on' : ''}`, {}, [
            h('span', 't', {}, [q.tipo === 'rosco' ? `${q.letra}: ${q.enunciado}` : q.enunciado || '(sin enunciado)']),
            h('span', 'm', {}, [`${name} · ${usedLabel(q.usada)}`])
          ])
          it.onclick = () => {
            const info = ctx.lib.info(r)!
            tipo = info.tipo
            ref = r
            selRef = r
            open.add(info.tipo)
            if (q.tipo === 'rosco') editingLetter = q.letra ?? null
            else selId = q.id
            render()
          }
          return it
        })
      )
    )
  }

  // ---------------------------------------------------------------- selección múltiple
  function selectionBar(sel: Row[], all: Row[]): HTMLElement {
    const items = sel.map((r) => ({ ref: r.ref, id: r.q.id }))
    const apply = (fn: (q: Question) => Question | null) => {
      const by = new Map<string, Set<string>>()
      for (const it of items) by.set(it.ref, (by.get(it.ref) ?? new Set()).add(it.id))
      for (const [r, ids] of by) {
        const b = ctx.lib.peek(r)
        if (!b) continue
        saveTo(r, { ...b, preguntas: b.preguntas.map((q) => (ids.has(q.id) ? fn(q) : q)).filter(Boolean) as Question[] })
      }
    }
    const moveTo = async (copy: boolean) => {
      const tgt = await chooseBank(sel[0].q, copy ? 'Copiar a…' : 'Mover a…')
      if (!tgt) return
      const n = await moveQuestions(items, tgt, copy)
      checked.clear()
      ctx.toast(`${n} ${copy ? 'copiadas' : 'movidas'} a «${ctx.lib.info(tgt)?.nombre}»`)
      render()
    }
    return h('div', 'selbar', {}, [
      h('b', '', { fontSize: 12 }, [`${sel.length} elegidas`]),
      btn('Mover a…', () => void moveTo(false), 'b sm'),
      btn('Copiar a…', () => void moveTo(true), 'b sm'),
      btn(
        'Etiqueta…',
        async () => {
          const v = await askText('Etiqueta de las elegidas', '', 'Aplicar', 'Escribe una etiqueta para añadirla; empieza por "-" para quitarla (p. ej. "-Repetida")')
          if (!v) return
          const remove = v.startsWith('-')
          const tag = v.replace(/^-/, '').trim()
          if (!tag) return
          apply((q) => {
            const t = new Set(q.etiquetas ?? [])
            if (remove) t.delete(tag)
            else t.add(tag)
            return { ...q, etiquetas: t.size ? [...t] : undefined }
          })
        },
        'b sm'
      ),
      btn(
        'Dificultad…',
        async () => {
          let pick: Dificultad | null | undefined
          await openDialog(
            'Dificultad de las elegidas',
            (close) => [
              h('div', '', { display: 'flex', gap: 8 }, [
                ...DIFICULTADES.map((d) => btn(DIF_LABEL[d], () => ((pick = d), close()), 'b')),
                btn('Sin dificultad', () => ((pick = null), close()), 'b ghost')
              ])
            ],
            460
          )
          if (pick === undefined) return
          apply((q) => ({ ...q, dificultad: pick ?? undefined }))
        },
        'b sm'
      ),
      btn('Revisadas', () => apply((q) => ({ ...q, sin_revisar: undefined })), 'b sm'),
      btn(
        'Borrar',
        async () => {
          if (!(await askConfirm(`¿Borrar ${sel.length} ${sel.length === 1 ? 'pregunta' : 'preguntas'}?`, 'Se quitan de sus bancos.', 'Borrar', true))) return
          apply(() => null)
          checked.clear()
          selId = null
        },
        'b sm danger'
      ),
      h('span', 'spacer'),
      btn(
        sel.length < all.length ? 'Todas' : 'Ninguna',
        () => {
          if (sel.length < all.length) all.forEach((r) => checked.add(keyOf(r.ref, r.q.id)))
          else checked.clear()
          renderList()
        },
        'b sm ghost'
      ),
      btn('×', () => (checked.clear(), renderList()), 'b sm ghost')
    ])
  }

  async function chooseBank(sample: Question, title: string): Promise<string | null> {
    const opts = compatible(sample)
    let out: string | null = null
    await openDialog(
      title,
      (close) => {
        const s = h('select', 'inp')
        for (const b of opts) {
          const o = h('option', '', {}, [`${LIB_TYPES.find((t) => t.id === b.tipo)?.label} · ${b.grupo ? b.grupo + ' · ' : ''}${b.nombre} (${b.count})`])
          o.value = b.ref
          s.append(o)
        }
        return [
          s,
          h('div', 'dlg-actions', {}, [
            btn(
              'Banco nuevo…',
              async () => {
                const n = await askText('Banco nuevo', '', 'Crear')
                if (!n) return
                const lt: LibType = sample.tipo === 'sino' ? 'sino' : sample.tipo === 'test' ? (tipo === 'escalera' ? 'escalera' : 'test') : (sample.tipo as LibType)
                out = await ctx.lib.create(lt, n)
                close()
              },
              'b ghost'
            ),
            btn('Aceptar', () => ((out = s.value || null), close()), 'b acc')
          ])
        ]
      },
      520
    )
    return out
  }

  /** Edición rápida en la propia lista (doble clic). */
  function quickEditor(r: Row): HTMLElement {
    const q = r.q
    const ta = h('textarea', 'inp', { height: 54, fontSize: 13 })
    ta.value = q.enunciado
    const right = h('input', 'inp', { height: 30, fontSize: 12 })
    right.placeholder = 'Respuesta correcta'
    right.value = q.tipo === 'estimacion' ? (q.valor === undefined ? '' : formatNumber(q.valor)) : q.tipo === 'quien' ? (q.autor ?? '') : (q.opciones[q.correcta] ?? '')
    right.readOnly = q.tipo === 'sino' && q.opciones[0] === 'Sí'
    const tags = h('input', 'inp', { height: 30, fontSize: 12 })
    tags.placeholder = 'Etiquetas, separadas por comas'
    tags.value = (q.etiquetas ?? []).join(', ')
    const dif = h('select', 'inp', { height: 30, fontSize: 12 })
    for (const [v, t] of [['', '—'], ...DIFICULTADES.map((d) => [d, DIF_LABEL[d]])]) {
      const o = h('option', '', {}, [t])
      o.value = v
      o.selected = v === (q.dificultad ?? '')
      dif.append(o)
    }
    const done = (saveIt: boolean) => {
      if (saveIt) {
        const patch: Partial<Question> = {
          enunciado: ta.value.trim(),
          etiquetas: tags.value
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          dificultad: (dif.value || undefined) as Dificultad | undefined
        }
        if (!patch.etiquetas!.length) patch.etiquetas = undefined
        if (q.tipo === 'estimacion') {
          const n = parseNumber(right.value)
          if (n !== null) patch.valor = n
        } else if (q.tipo === 'quien') patch.autor = right.value.trim()
        else if (!right.readOnly) patch.opciones = q.opciones.map((o, i) => (i === q.correcta ? right.value : o))
        setQ(r.ref, q.id, patch)
      }
      quick = null
      editorKey = ''
      render()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        done(false)
      } else if (e.key === 'Enter' && (e.ctrlKey || !(e.target instanceof HTMLTextAreaElement))) {
        e.preventDefault()
        done(true)
      }
    }
    const box = h('div', 'qe', {}, [
      ta,
      h('div', '', { display: 'flex', gap: 6 }, [right, dif]),
      tags,
      h('div', '', { display: 'flex', gap: 6, justifyContent: 'flex-end' }, [
        h('span', 'mut', { fontSize: 11, marginRight: 'auto' }, ['Intro: guardar · Esc: cancelar']),
        btn('Cancelar', () => done(false), 'b sm ghost'),
        btn('Guardar', () => done(true), 'b sm acc')
      ])
    ])
    box.addEventListener('keydown', onKey, true)
    return box
  }

  /** Escalera: copiar preguntas de un banco de Tipo test. */
  async function bringFromTest(): Promise<void> {
    const tests = ctx.lib.banksOf('test')
    if (!tests.length) return ctx.toast('No hay bancos de Tipo test')
    let src = tests[0].ref
    await openDialog(
      'Traer preguntas de Tipo test',
      () => {
        const sel = h('select', 'inp')
        for (const t of tests) {
          const o = h('option', '', {}, [`${t.nombre} (${t.count})`])
          o.value = t.ref
          sel.append(o)
        }
        const filter = h('input', 'inp')
        filter.placeholder = 'Buscar'
        const list = h('div', '', { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '46vh', overflow: 'auto' })
        const paint = async () => {
          const b = await ctx.lib.get(src)
          const target = bank()
          const have = new Set((target?.preguntas ?? []).map((q) => q.enunciado.trim()))
          const f = filter.value.trim().toLowerCase()
          list.replaceChildren(
            ...b.preguntas
              .filter((q) => isPlayable(q) && (!f || q.enunciado.toLowerCase().includes(f)))
              .map((q) => {
                const added = have.has(q.enunciado.trim())
                const add = btn(
                  added ? 'Añadida' : 'Añadir',
                  () => {
                    const cur = bank()
                    if (!cur) return
                    const copy: Question = { ...q, id: newQuestionId(cur, 'e'), usada: undefined, tipo: 'test' }
                    save({ ...cur, preguntas: [...cur.preguntas, copy] })
                    void paint()
                  },
                  `b sm${added ? ' ghost' : ' acc'}`
                )
                add.disabled = added
                return h('div', 'it', { flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'default' }, [
                  h('span', 't', { flex: 1 }, [q.enunciado]),
                  h('span', 'm', {}, [q.opciones[q.correcta] ?? '']),
                  add
                ])
              })
          )
        }
        sel.onchange = () => {
          src = sel.value
          void paint()
        }
        filter.oninput = () => void paint()
        void paint()
        return [h('span', 'mut', { fontSize: 12 }, ['Se añaden al final de la escalera; luego ordénalas arrastrando.']), sel, filter, list]
      },
      720
    )
    render()
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
        btn(
          'Probar rosco',
          () => {
            ctx.send({ type: 'roscoConfig', patch: { bankFile: ref } })
            ctx.go('rosco')
          },
          'b ghost'
        ),
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
          h(
            'span',
            '',
            { fontWeight: 700, fontSize: 13, letterSpacing: '0.03em', color: ans ? '#ececef' : '#e8a23a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            [ans ? ans.toUpperCase() : 'SIN RESPUESTA']
          )
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
      h('span', 'mut', { fontSize: 12 }, [
        'Una línea por letra: "LETRA: definición = RESPUESTA". Añade "(contiene)" detrás de la letra si la pista es "contiene". Sustituye las letras que traiga el texto.'
      ]),
      ta,
      h('div', '', { display: 'flex', gap: 8, justifyContent: 'flex-end' }, [
        btn('Cancelar', () => box.remove(), 'b ghost'),
        btn(
          'Importar',
          () => {
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
          },
          'b acc'
        )
      ])
    ])
    document.body.append(box)
    ta.focus()
  }

  async function deleteBank(): Promise<void> {
    const info = ctx.lib.info(ref)
    if (!ref || !info) return
    if (!(await askConfirm(`¿Eliminar el banco «${info.nombre}»?`, 'Se mueve a la carpeta _papelera (no se pierde).', 'Eliminar', true))) return
    await ctx.lib.remove(ref)
    pickBank(tipo, ctx.lib.banksOf(tipo)[0]?.ref ?? null)
  }

  // ---------------------------------------------------------------- editor de una pregunta
  let editorKey = ''
  /** Otras preguntas con el mismo texto en la biblioteca (bancos ya leídos). */
  function duplicatesOf(q: Question, r: string): string[] {
    const k = normText(q.enunciado)
    if (k.length < 6) return []
    const out: string[] = []
    for (const b of ctx.lib.list) {
      const bk = ctx.lib.peek(b.ref)
      if (!bk) continue
      for (const x of bk.preguntas) if (x.tipo === q.tipo && normText(x.enunciado) === k && !(b.ref === r && x.id === q.id)) out.push(b.nombre)
    }
    return out
  }

  function renderEditor(): void {
    const r = selRef
    const b = r ? ctx.lib.peek(r) : null
    const q = b?.preguntas.find((x) => x.id === selId) ?? null
    const key = `${r}|${q?.id ?? ''}`
    // no se reconstruye mientras escribes en la misma pregunta
    if (key === editorKey && editEl.contains(document.activeElement)) return
    editorKey = key
    editEl.replaceChildren()
    if (!b || !q || !r) {
      editEl.append(h('div', 'mut', { fontSize: 14 }, [bank() || ref === ALL ? 'Elige una pregunta de la lista o crea una nueva.' : '']))
      return
    }
    const set = (patch: Partial<Question>) => setQ(r, q.id, patch)
    const area = (label: string, value: string, setV: (v: string) => void, height = 70, hint?: string) => {
      const t = h('textarea', 'inp', { height, fontSize: label === 'Enunciado' || label === 'Frase' ? 15 : 14 })
      t.value = value
      t.oninput = () => setV(t.value)
      return h('div', 'field', {}, [h('label', 'fl', {}, [label, ...(hint ? [h('span', 'mut', { fontWeight: 400 }, [` · ${hint}`])] : [])]), t])
    }
    const input = (label: string, value: string, setV: (v: string) => void, attrs: Partial<HTMLInputElement> = {}) => {
      const i = h('input', 'inp')
      Object.assign(i, attrs)
      i.value = value
      i.oninput = () => setV(i.value)
      return h('div', 'field', { flex: 1 }, [h('label', 'fl', {}, [label]), i])
    }
    // avisos: sin revisar, repetida
    if (q.sin_revisar)
      editEl.append(
        h('div', 'note warnbox', {}, [
          h('span', '', { flex: 1 }, ['Sin revisar: comprueba el texto, la respuesta y la dificultad.']),
          btn(
            'Revisada',
            () => {
              set({ sin_revisar: undefined })
              editorKey = ''
            },
            'b sm acc'
          )
        ])
      )
    if (ref === ALL) editEl.append(h('span', 'mut', { fontSize: 12 }, [`Banco: ${ctx.lib.info(r)?.nombre ?? ''}`]))
    const t = q.tipo
    const enun = area(t === 'quien' ? 'Frase' : 'Enunciado', q.enunciado, (v) => set({ enunciado: v }))
    const dupLine = h('div', 'mut', { fontSize: 12, color: '#e8a23a' })
    const paintDup = () => {
      const fresh = ctx.lib.peek(r)?.preguntas.find((x) => x.id === q.id) ?? q
      const d = duplicatesOf(fresh, r)
      dupLine.textContent = d.length ? `Repetida: ya está en «${[...new Set(d)].join('», «')}»` : ''
      dupLine.style.display = d.length ? '' : 'none'
    }
    enun.querySelector('textarea')!.addEventListener('blur', paintDup)
    paintDup()
    if (t === 'test' || t === 'sino') {
      editEl.append(enun, dupLine)
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
              set({ correcta: i })
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
              set({ opciones: next })
            }
            if (t === 'sino' && (o === 'Sí' || o === 'No')) inp.readOnly = true
            return h('div', `or${right ? ' right' : ''}`, {}, [rb, h('span', '', { width: 16, fontWeight: 700, color: '#9a9aa3' }, [t === 'sino' ? '' : 'ABCD'[i]]), inp])
          })
        ])
      )
    } else if (t === 'estimacion') {
      editEl.append(
        enun,
        dupLine,
        h('div', '', { display: 'flex', gap: 12 }, [
          input('Respuesta (número)', q.valor === undefined ? '' : formatNumber(q.valor), (v) => {
            const num = parseNumber(v)
            set(num === null ? { valor: undefined } : { valor: num })
          }),
          input('Unidad', q.unidad ?? '', (v) => set({ unidad: v })),
          input('Fuente', q.fuente ?? '', (v) => set({ fuente: v || undefined }))
        ])
      )
    } else if (t === 'quien') {
      const people = ctx.state.people.map((p) => p.name)
      editEl.append(
        enun,
        dupLine,
        h('div', '', { display: 'flex', gap: 12 }, [
          input('Autor', q.autor ?? '', (v) => set({ autor: v }), { placeholder: people.slice(0, 3).join(', ') }),
          input('Dónde se dijo', q.fuente ?? '', (v) => set({ fuente: v || undefined }), { placeholder: 'Chat del grupo' })
        ]),
        h('div', '', { display: 'flex', gap: 12 }, [
          input('Fecha', q.fecha ?? '', (v) => set({ fecha: v || undefined }), { placeholder: '14 de marzo de 2024' }),
          input('Hora', q.hora ?? '', (v) => set({ hora: v || undefined }), { placeholder: '03:12' })
        ]),
        area(
          'Opciones',
          q.opciones.join(', '),
          (v) =>
            set({
              opciones: v
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
            }),
          52,
          'separadas por comas; vacío = personas del grupo'
        )
      )
    }

    // etiquetas y dificultad
    const tagIn = h('input', 'inp')
    tagIn.value = (q.etiquetas ?? []).join(', ')
    tagIn.placeholder = 'Videojuegos, Persona 5'
    tagIn.setAttribute('list', 'konk-tags')
    tagIn.oninput = () => {
      const tags = [
        ...new Set(
          tagIn.value
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        )
      ]
      set({ etiquetas: tags.length ? tags : undefined })
    }
    const dl = h('datalist')
    dl.id = 'konk-tags'
    for (const tg of tagsInScope()) {
      const o = h('option')
      o.value = tg
      dl.append(o)
    }
    const difSeg = h(
      'div',
      'seg',
      {},
      [...DIFICULTADES, undefined].map((d) => {
        const x = h('button', (q.dificultad ?? undefined) === d ? 'on' : '', {}, [d ? DIF_LABEL[d] : '—'])
        x.onclick = () => {
          set({ dificultad: d })
          editorKey = ''
          renderEditor()
        }
        return x
      })
    )
    editEl.append(
      h('div', '', { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }, [
        h('div', 'field', { flex: '1 1 200px', minWidth: 0 }, [h('label', 'fl', {}, ['Etiquetas ', h('span', 'mut', { fontWeight: 400 }, ['· separadas por comas'])]), tagIn, dl]),
        h('div', 'field', {}, [h('label', 'fl', {}, ['Dificultad']), difSeg])
      ])
    )
    editEl.append(area('Nota del presentador', q.nota_presentador ?? '', (v) => set({ nota_presentador: v || undefined }), 60, 'solo la ves tú'))

    // imágenes (no en el rosco)
    editEl.append(imageField(r, q, 'q'), imageField(r, q, 'a'))

    // pie
    const playable = isPlayable(q)
    editEl.append(
      h('div', '', { display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }, [
        h('span', 'mut', { fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }, [
          icon(ICONS.check, 14, playable ? '#3ecf8e' : '#e8a23a'),
          `Guardado · ${usedLabel(q.usada).toLowerCase()}${playable ? '' : ' · incompleta (no sale en el juego)'}${q.fuente ? ' · ' + q.fuente : ''}`
        ]),
        h('span', 'spacer'),
        btn(
          q.usada ? 'Marcar sin usar' : 'Marcar como usada',
          () => {
            ctx.lib.markUsed(r, [q.id], !q.usada)
            editorKey = ''
          },
          'b ghost'
        ),
        btn(
          'Duplicar',
          () => {
            const b2 = ctx.lib.peek(r)
            if (!b2) return
            const id = newQuestionId(b2, q.id.replace(/\d+$/, '') || 'p')
            const i = b2.preguntas.findIndex((x) => x.id === q.id)
            const copy = { ...q, id, usada: undefined }
            saveTo(r, { ...b2, preguntas: [...b2.preguntas.slice(0, i + 1), copy, ...b2.preguntas.slice(i + 1)] })
            selId = id
            editorKey = ''
          },
          'b ghost'
        ),
        btn(
          'Eliminar',
          async () => {
            const b2 = ctx.lib.peek(r)
            if (!b2 || !(await askConfirm('¿Eliminar esta pregunta del banco?', '', 'Eliminar', true))) return
            saveTo(r, { ...b2, preguntas: b2.preguntas.filter((x) => x.id !== q.id) })
            selId = null
            editorKey = ''
          },
          'b ghost danger'
        )
      ])
    )
  }

  /** Guarda una imagen pegada o arrastrada (archivo, bytes, dirección web) y la pone en la pregunta. */
  async function takeImage(r: string, q: Question, which: 'q' | 'a', data: DataTransfer | null): Promise<boolean> {
    if (!data) return false
    const field = which === 'q' ? 'imagen' : 'imagen_respuesta'
    const hint = (which === 'q' ? q.imagen_sugerida : q.imagen_respuesta_sugerida) || q.enunciado.slice(0, 40)
    try {
      let name: string | null = null
      const file = [...data.files].find((f) => f.type.startsWith('image/'))
      if (file) {
        const path = window.konk.pathForFile(file)
        name = path ? await window.konk.libImportImage(path) : await window.konk.libImportImageData(new Uint8Array(await file.arrayBuffer()), file.type, hint)
      } else {
        // desde una página web: la imagen viene como HTML (<img src>) o como dirección
        const html = data.getData('text/html')
        const src = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]
        const url =
          src ||
          data
            .getData('text/uri-list')
            .split(/\r?\n/)
            .find((l) => l && !l.startsWith('#')) ||
          data.getData('text/plain').trim()
        if (url && /^(https?:|data:image)/i.test(url)) name = await window.konk.libImportImageUrl(url.replace(/&amp;/g, '&'), hint)
      }
      if (!name) return false
      setQ(r, q.id, { [field]: name } as Partial<Question>)
      editorKey = ''
      ctx.toast(which === 'q' ? 'Imagen puesta' : 'Imagen de la respuesta puesta')
      return true
    } catch (err) {
      ctx.toast(String((err as Error).message ?? err))
      return true
    }
  }

  function imageField(r: string, q: Question, which: 'q' | 'a'): HTMLElement {
    const file = which === 'q' ? q.imagen : q.imagen_respuesta
    const sug = which === 'q' ? q.imagen_sugerida : q.imagen_respuesta_sugerida
    const field = which === 'q' ? 'imagen' : 'imagen_respuesta'
    const sugField = which === 'q' ? 'imagen_sugerida' : 'imagen_respuesta_sugerida'
    const img = h('div', 'img')
    if (file) {
      const i = h('img')
      i.src = `konk-media://imagenes/${encodeURIComponent(file)}`
      i.alt = ''
      img.append(i)
    } else img.append(icon(ICONS.image, 28, '#55555d'))
    const drop = h('div', `drop${!file && sug ? ' missing' : ''}`, {}, [
      img,
      h('div', '', { flex: '1 1 160px', minWidth: 0 }, [
        h('div', '', { fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [file ?? (sug ? `Falta imagen: ${sug}` : 'Sin imagen')]),
        h('div', 'mut', { fontSize: 12 }, [file ? 'Arrastra o pega otra para cambiarla' : 'Arrastra un archivo o una imagen de una web, o pégala con Ctrl+V'])
      ]),
      btn(
        'Elegir…',
        async () => {
          const f = await window.konk.libChooseImage()
          if (f) {
            setQ(r, q.id, { [field]: f } as Partial<Question>)
            editorKey = ''
          }
        },
        'b ghost sm'
      ),
      ...(file
        ? [
            btn(
              'Quitar',
              () => {
                setQ(r, q.id, { [field]: undefined } as Partial<Question>)
                editorKey = ''
              },
              'b ghost sm'
            )
          ]
        : [])
    ])
    drop.tabIndex = 0
    drop.title = 'Clic aquí y Ctrl+V para pegar una imagen'
    const target = () => (pasteTo = which)
    drop.onmouseenter = target
    drop.onfocus = target
    drop.ondragover = (e) => {
      e.preventDefault()
      drop.classList.add('over')
    }
    drop.ondragleave = () => drop.classList.remove('over')
    drop.ondrop = async (e) => {
      e.preventDefault()
      drop.classList.remove('over')
      if (!(await takeImage(r, q, which, e.dataTransfer))) ctx.toast('Eso no es una imagen')
    }
    // descripción de la imagen que falta + buscarla en Google Imágenes
    const sugIn = h('input', 'inp', { flex: 1 })
    sugIn.placeholder = which === 'q' ? 'Imagen sugerida (p. ej. "Morgana (Persona 5)")' : 'Imagen de la respuesta sugerida'
    sugIn.value = sug ?? ''
    sugIn.oninput = () => setQ(r, q.id, { [sugField]: sugIn.value.trim() || undefined } as Partial<Question>)
    const search = btn(
      'Buscar',
      () => {
        const text = sugIn.value.trim() || q.enunciado
        void window.konk.libSearchImage(text)
      },
      'b ghost sm'
    )
    search.title = 'Abre Google Imágenes en el navegador con ese texto'
    const extra: HTMLElement[] = [h('div', '', { display: 'flex', gap: 8, alignItems: 'center' }, [sugIn, search])]
    if (which === 'q') {
      const modo = h(
        'div',
        'seg',
        {},
        (['auto', 'manual'] as const).map((m) => {
          const x = h('button', (q.imagen_modo ?? 'auto') === m ? 'on' : '', {}, [m === 'auto' ? 'Automática' : 'Manual'])
          x.title = m === 'auto' ? 'Sale sola en el plató después del texto de la pregunta' : 'Solo sale cuando la muestras (I)'
          x.onclick = () => {
            setQ(r, q.id, { imagen_modo: m === 'manual' ? 'manual' : undefined })
            editorKey = ''
            renderEditor()
          }
          return x
        })
      )
      extra.push(h('div', '', { display: 'flex', gap: 8, alignItems: 'center' }, [h('span', 'mut', { fontSize: 12 }, ['En el plató:']), modo]))
    }
    return h('div', 'field', {}, [
      h('span', 'fl', {}, [
        which === 'q' ? 'Imagen ' : 'Imagen de la respuesta ',
        h('span', 'mut', { fontWeight: 400 }, [which === 'q' ? '· sale con la pregunta, después del texto' : '· sale al revelar (explicación, o si destripa la respuesta)'])
      ]),
      drop,
      ...extra
    ])
  }

  // pegar con Ctrl+V en la biblioteca (lista o editor): si es una imagen, va a la imagen que estés mirando
  document.addEventListener('paste', (e) => {
    if (!editEl.isConnected) return
    const tgt = e.target as HTMLElement
    // dentro de un diálogo o en otro campo de texto fuera del editor, pegar es pegar
    if (document.querySelector('.dlg-back')) return
    if ((tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) && !editEl.contains(tgt)) return
    const r = selRef
    const q = r ? ctx.lib.peek(r)?.preguntas.find((x) => x.id === selId) : null
    if (!r || !q || q.tipo === 'rosco' || !e.clipboardData) return
    const t = e.target as HTMLElement
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
    const hasImage = [...e.clipboardData.items].some((i) => i.type.startsWith('image/')) || /<img/i.test(e.clipboardData.getData('text/html'))
    // pegar texto en un campo es pegar texto
    if (typing && !hasImage) return
    if (typing && hasImage && e.clipboardData.getData('text/plain').trim() && !t.closest('.drop')) return
    e.preventDefault()
    void takeImage(r, q, pasteTo, e.clipboardData)
  })

  // ---------------------------------------------------------------- importar / exportar
  async function importDialog(preset?: { name: string; text: string }): Promise<void> {
    let res: ImportResult | null = null
    let source = preset?.name ?? ''
    let skipDup = true
    const ta = h('textarea', 'inp', { height: 150, fontFamily: 'Consolas, monospace', fontSize: 12 })
    ta.placeholder = 'Pega aquí desde Excel o Google Sheets (una fila por pregunta), un CSV o texto libre:\n\n¿Capital de Francia?\n+ París\n- Lyon\n- Marsella\n# Geografía, fácil'
    if (preset) ta.value = preset.text
    const preview = h('div', '', { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '34vh', overflow: 'auto' })
    const summary = h('div', '', { fontSize: 13 })
    const targets = h('div', '', { display: 'flex', flexDirection: 'column', gap: 8 })
    const chosen = new Map<LibType, string>()
    const libTypeFor = (q: Question): LibType => (q.tipo === 'test' && tipo === 'escalera' ? 'escalera' : (q.tipo as LibType))
    const existing = () => {
      const out: Question[] = []
      for (const b of ctx.lib.list) for (const q of ctx.lib.peek(b.ref)?.preguntas ?? []) out.push(q)
      return out
    }
    const paint = () => {
      res = ta.value.trim() ? parseImport(ta.value) : null
      preview.replaceChildren()
      targets.replaceChildren()
      if (!res) {
        summary.textContent = ''
        return
      }
      const dups = findDuplicates(res.questions, existing())
      const kinds = new Map<LibType, number>()
      res.questions.forEach((q, i) => {
        if (!(skipDup && dups.has(i))) kinds.set(libTypeFor(q), (kinds.get(libTypeFor(q)) ?? 0) + 1)
      })
      const fmt = { json: 'banco .json', csv: 'hoja (CSV / Excel)', texto: 'texto libre' }[res.format]
      summary.replaceChildren(
        h('b', '', {}, [`${res.questions.length} preguntas`]),
        ` · ${fmt}${source ? ' · ' + source : ''}`,
        ...(dups.size ? [h('span', '', { color: '#e8a23a' }, [` · ${dups.size} repetidas`])] : []),
        ...(res.errors.length ? [h('span', '', { color: '#ff8a7a' }, [` · ${res.errors.length} avisos`])] : [])
      )
      for (const e of res.errors.slice(0, 30)) preview.append(h('div', '', { fontSize: 12, color: '#ff8a7a' }, [`Línea ${e.line}: ${e.msg}`]))
      res.questions.slice(0, 300).forEach((q, i) => {
        const d = dups.get(i)
        preview.append(
          h('div', 'it', { padding: '6px 8px', opacity: d && skipDup ? 0.45 : 1, cursor: 'default' }, [
            h('span', 't', {}, [q.enunciado]),
            h('span', 'm', {}, [
              [
                q.tipo === 'sino' ? 'Sí o no' : q.tipo === 'test' ? 'Test' : q.tipo,
                q.tipo === 'test' || q.tipo === 'sino' ? `✓ ${q.opciones[q.correcta]}` : '',
                ...(q.etiquetas ?? []),
                q.dificultad ? DIF_LABEL[q.dificultad] : '',
                q.imagen_sugerida ? `falta imagen: ${q.imagen_sugerida}` : '',
                d === 'biblioteca' ? 'YA ESTÁ EN LA BIBLIOTECA' : d === 'repetida' ? 'REPETIDA EN EL ARCHIVO' : ''
              ]
                .filter(Boolean)
                .join(' · ')
            ])
          ])
        )
      })
      // a qué banco va cada tipo
      for (const [lt, n] of kinds) {
        const s = h('select', 'inp', { flex: 1 })
        const banks = ctx.lib.banksOf(lt)
        const cur = chosen.get(lt) ?? (lt === tipo && ref && ref !== ALL ? ref : '')
        const mk = (v: string, t: string) => {
          const o = h('option', '', {}, [t])
          o.value = v
          o.selected = v === cur
          s.append(o)
        }
        mk('', `Banco nuevo «${(source || 'Importadas').replace(/\.[a-z]+$/i, '')}»`)
        for (const b of banks) mk(b.ref, `${b.grupo ? b.grupo + ' · ' : ''}${b.nombre} (${b.count})`)
        s.onchange = () => chosen.set(lt, s.value)
        targets.append(h('div', '', { display: 'flex', gap: 8, alignItems: 'center' }, [h('span', '', { width: 150, fontSize: 13 }, [`${n} de ${LIB_TYPES.find((x) => x.id === lt)?.label} →`]), s]))
      }
    }
    let timer = 0
    ta.oninput = () => {
      clearTimeout(timer)
      timer = window.setTimeout(paint, 250)
    }
    const skip = h('input')
    skip.type = 'checkbox'
    skip.checked = true
    skip.onchange = () => {
      skipDup = skip.checked
      paint()
    }
    await Promise.all(ctx.lib.list.map((b) => ctx.lib.get(b.ref)))
    paint()
    await openDialog(
      'Importar preguntas',
      (close) => [
        h('div', 'mut', { fontSize: 12, lineHeight: '1.5' }, [
          'Vale un banco .json, un .csv, pegar filas desde Excel o Google Sheets (columnas: pregunta, correcta, incorrecta1, incorrecta2, incorrecta3, etiqueta, dificultad; con una sola incorrecta es de Sí o no) o texto libre: la pregunta en una línea, "+" delante de la correcta, "-" delante de las incorrectas, "#" con etiquetas y dificultad, y "imagen: …" si falta una imagen; una línea en blanco entre preguntas. Las importadas quedan "sin revisar".'
        ]),
        h('div', '', { display: 'flex', gap: 8 }, [
          btn(
            'Abrir un archivo…',
            async () => {
              const f = await window.konk.libOpenImportFile()
              if (!f) return
              source = f.name
              ta.value = f.text
              paint()
            },
            'b'
          ),
          h('label', '', { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto' }, [skip, 'Saltar las repetidas'])
        ]),
        ta,
        summary,
        preview,
        targets,
        h('div', 'dlg-actions', {}, [
          btn('Cancelar', close, 'b ghost'),
          btn(
            'Importar',
            async () => {
              if (!res || !res.questions.length) return ctx.toast('No hay preguntas que importar')
              const dups = findDuplicates(res.questions, existing())
              const groups = new Map<LibType, Question[]>()
              res.questions.forEach((q, i) => {
                if (skipDup && dups.has(i)) return
                const lt = libTypeFor(q)
                groups.set(lt, [...(groups.get(lt) ?? []), q])
              })
              let total = 0
              let last: string | null = null
              for (const [lt, qs] of groups) {
                let to = chosen.get(lt) ?? (lt === tipo && ref && ref !== ALL ? ref : '')
                if (!to) to = await ctx.lib.create(lt, (source || 'Importadas').replace(/\.[a-z]+$/i, ''))
                let tb = await ctx.lib.get(to)
                for (const q of qs) {
                  const id = newQuestionId(tb, lt === 'quien' ? 'q' : lt === 'estimacion' ? 'e' : 'p')
                  tb = { ...tb, preguntas: [...tb.preguntas, { ...q, id, sin_revisar: q.sin_revisar ?? true }] }
                }
                saveTo(to, tb)
                total += qs.length
                last = to
              }
              close()
              ctx.toast(`Importadas ${total} preguntas`)
              if (last) pickBank(ctx.lib.info(last)?.tipo ?? tipo, last)
            },
            'b acc'
          )
        ])
      ],
      900
    )
  }

  async function exportDialog(): Promise<void> {
    const b = bank()
    const info = ctx.lib.info(ref)
    if (!b || !info) return
    const base = info.file.replace(/\.json$/i, '')
    const csvOk = b.preguntas.some((q) => q.tipo === 'test' || q.tipo === 'sino')
    await openDialog(
      `Exportar «${info.nombre}»`,
      (close) => [
        h('span', 'mut', { fontSize: 12 }, ['.json: el banco completo (para otro KONKURSOX). .csv: se abre en Excel o Google Sheets (Test y Sí o no).']),
        h('div', 'dlg-actions', {}, [
          btn(
            'Como .json',
            async () => {
              const p = await window.konk.libSaveExport(`${base}.json`, JSON.stringify(toFileBank({ ...b, preguntas: b.preguntas.map((q) => ({ ...q, usada: undefined })) }), null, 2) + '\n')
              close()
              if (p) ctx.toast('Exportado')
            },
            'b'
          ),
          ...(csvOk
            ? [
                btn(
                  'Como .csv (Excel)',
                  async () => {
                    const p = await window.konk.libSaveExport(`${base}.csv`, questionsToCsv(b.preguntas))
                    close()
                    if (p) ctx.toast('Exportado')
                  },
                  'b acc'
                )
              ]
            : [])
        ])
      ],
      480
    )
  }

  // ---------------------------------------------------------------- pintado general
  function render(): void {
    if (ref !== ALL && (!ref || !ctx.lib.info(ref))) {
      const first = ctx.lib.banksOf(tipo)[0]
      ref = first?.ref ?? null
    }
    if (ref && ref !== ALL) void ctx.lib.get(ref)
    renderNav()
    const rosco = tipo === 'rosco' && !search
    work.replaceChildren(navEl, ...(rosco ? [] : [listEl]), editEl)
    if (!rosco) renderList()
    if (rosco) renderRosco()
    else {
      if (!selId && ref !== ALL && bank()?.preguntas[0]) {
        selRef = ref
        selId = bank()!.preguntas[0].id
      }
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
