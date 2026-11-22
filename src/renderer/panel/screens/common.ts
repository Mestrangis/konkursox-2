// Piezas compartidas por las pantallas de juego: lista de preguntas del banco, pasos del flujo, botón grande.
import { isPlayable, questionKey, type Question } from '../../../shared/questions'
import type { LibType } from '../../../shared/library'
import type { CurrentQuestion, QuizAction } from '../../../shared/quiz'
import type { QuizGameId } from '../../../shared/scene'
import type { GameState } from '../../../shared/types'
import { askConfirm, btn, h, icon, ICONS, kbd, type Ctx } from '../ui'

const store = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    } catch {
      /* sin almacenamiento */
    }
  }
}

/** Banco elegido en cada juego (se recuerda). */
export function bankFor(ctx: Ctx, tipo: LibType): string | null {
  const saved = store.get(`konk.bank.${tipo}`)
  const banks = ctx.lib.banksOf(tipo)
  if (saved && banks.some((b) => b.ref === saved)) return saved
  return banks[0]?.ref ?? null
}
export const setBankFor = (tipo: LibType, ref: string | null) => store.set(`konk.bank.${tipo}`, ref)

/** Preguntas completas del banco en el orden elegido (barajado o el del archivo). */
export function orderedQuestions(ctx: Ctx, ref: string | null): Question[] {
  return orderedAll(ctx, ref).filter(isPlayable)
}

function orderedAll(ctx: Ctx, ref: string | null): Question[] {
  const bank = ctx.lib.peek(ref)
  if (!bank) return []
  const raw = store.get(`konk.order.${ref}`)
  if (!raw) return bank.preguntas
  try {
    const order: string[] = JSON.parse(raw)
    const by = new Map(bank.preguntas.map((q) => [q.id, q]))
    const out = order.map((id) => by.get(id)).filter(Boolean) as Question[]
    for (const q of bank.preguntas) if (!order.includes(q.id)) out.push(q)
    return out
  } catch {
    return bank.preguntas
  }
}

export function shuffleBank(ctx: Ctx, ref: string): void {
  const bank = ctx.lib.peek(ref)
  if (!bank) return
  const ids = bank.preguntas.map((q) => q.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  store.set(`konk.order.${ref}`, JSON.stringify(ids))
}

/** Siguiente pregunta sin usar del banco (después de la actual). */
export function nextUnused(ctx: Ctx, ref: string | null, currentKey?: string): Question | undefined {
  const list = orderedQuestions(ctx, ref)
  const i = currentKey ? list.findIndex((q) => questionKey(ref ?? '', q.id) === currentKey) : -1
  return [...list.slice(i + 1), ...list.slice(0, i + 1)].find((q) => !q.usada && questionKey(ref ?? '', q.id) !== currentKey)
}

/** Lista de preguntas a la derecha (banco, barajar, buscar). */
export function questionList(ctx: Ctx, tipo: LibType, onPick: (q: Question, ref: string) => void) {
  const bankSel = h('select', 'inp', { height: 34, flex: 'none' })
  const search = h('input', 'inp', { height: 34 })
  search.placeholder = 'Buscar pregunta'
  search.setAttribute('aria-label', 'Buscar pregunta')
  const items = h('div', 'items')
  const title = h('span', 'lbl', { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  const shuffle = btn([icon(ICONS.shuffle, 14, '#ececef'), 'Barajar'], () => {
    const ref = bankFor(ctx, tipo)
    if (ref) shuffleBank(ctx, ref)
    render(ctx.state)
  }, 'b sm')
  // en la escalera el orden del banco es el de los niveles: no se baraja
  if (tipo === 'escalera') shuffle.style.display = 'none'
  // reiniciar las usadas del banco elegido
  const resetUsed = btn('Reiniciar usadas', async () => {
    const ref = bankFor(ctx, tipo)
    const bank = ctx.lib.peek(ref)
    if (!ref || !bank) return
    const ids = bank.preguntas.filter((x) => x.usada).map((x) => x.id)
    if (!ids.length) return ctx.toast('No hay preguntas usadas en este banco')
    if (!(await askConfirm(`¿Marcar las ${ids.length} preguntas usadas como sin usar?`, '', 'Reiniciar'))) return
    ctx.lib.markUsed(ref, ids, false)
  }, 'b sm ghost')
  resetUsed.style.flex = 'none'
  bankSel.onchange = () => {
    setBankFor(tipo, bankSel.value || null)
    render(ctx.state)
  }
  search.oninput = () => render(ctx.state)
  const el = h('div', 'pnl qlist', {}, [
    h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [title, shuffle]),
    bankSel,
    h('div', '', { display: 'flex', gap: 6 }, [search, resetUsed]),
    items,
    h('span', 'mut', { fontSize: 11 }, ['Tachadas: ya usadas (al revelarlas). ↺ o clic derecho para desmarcar.'])
  ])

  function render(s: GameState, current?: CurrentQuestion | null): void {
    const banks = ctx.lib.banksOf(tipo)
    const ref = bankFor(ctx, tipo)
    if (document.activeElement !== bankSel) {
      bankSel.replaceChildren(
        ...(banks.length ? [] : [h('option', '', {}, ['No hay bancos: créalos en Biblioteca'])]),
        ...banks.map((b) => {
          const o = h('option', '', {}, [`${b.nombre} (${b.count - b.used} sin usar)`])
          o.value = b.ref
          o.selected = b.ref === ref
          return o
        })
      )
    }
    const info = ctx.lib.info(ref)
    title.textContent = `Preguntas · ${info?.nombre ?? '-'}`
    const q = search.value.trim().toLowerCase()
    const list = orderedQuestions(ctx, ref)
    items.replaceChildren(
      ...list
        .map((x, i) => ({ x, i }))
        .filter(({ x }) => !q || [x.enunciado, ...x.opciones, x.autor ?? '', x.nota_presentador ?? ''].join(' ').toLowerCase().includes(q))
        .map(({ x, i }) => {
          const isCur = current?.key === questionKey(ref ?? '', x.id)
          const unmark = () => ref && ctx.lib.markUsed(ref, [x.id], false)
          const undo = h('button', 'x', { flex: 'none', fontSize: 14 }, ['↺'])
          undo.title = 'Desmarcar como usada'
          undo.onclick = (e) => {
            e.stopPropagation()
            unmark()
          }
          const row = h('div', `ql${isCur ? ' cur' : x.usada ? ' used' : ''}`, {}, [h('span', 'n', {}, [String(i + 1)]), h('span', 'qx', {}, [x.enunciado]), ...(x.usada ? [undo] : [])])
          row.title = x.usada ? `${x.enunciado}\n(usada: clic derecho para desmarcarla)` : x.enunciado
          row.onclick = () => ref && onPick(x, ref)
          row.oncontextmenu = (e) => {
            if (!x.usada) return
            e.preventDefault()
            unmark()
          }
          return row
        })
    )
    if (ref && !list.length) items.append(h('div', 'mut', { padding: 8, fontSize: 12 }, [ctx.lib.peek(ref) ? 'Banco vacío: añade preguntas en Biblioteca.' : 'Cargando…']))
    void s
  }
  return { el, render }
}

/** Pasos del flujo (Pregunta · Opciones · Revelar · Siguiente). */
export function flowSteps(labels: string[], step: number): HTMLElement[] {
  return labels.map((t, i) => h('span', `stp${i < step ? ' done' : i === step ? ' cur' : ''}`, {}, [h('i', '', {}, [i < step ? '✓' : String(i + 1)]), t]))
}

/** Botón grande del siguiente paso. */
export function goButton(): { el: HTMLButtonElement; set(label: string, after: string, run: (() => void) | null, warm?: boolean): void } {
  const lab = h('b')
  const sub = h('span')
  const el = h('button', 'go', {}, [icon(ICONS.play, 30, '#fff'), h('span', 'lab', {}, [lab, sub]), h('span', 'spacer'), kbd('Espacio')])
  let action: (() => void) | null = null
  el.onclick = () => action?.()
  return {
    el,
    set(label, after, run, warm = false) {
      lab.textContent = label
      sub.textContent = after
      action = run
      el.disabled = !run
      el.classList.toggle('warm', warm)
    }
  }
}

/** "Plató: ..." con el punto rojo. */
export function onAirLabel(s: GameState, game: QuizGameId | 'rosco', what: string): HTMLElement {
  const live = s.scene === 'juego' && s.liveGame === game
  return h('span', 'mut', { fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }, [
    h('span', 'dotlive', { background: live ? '#ff5a5f' : '#55555d' }),
    live ? `Plató: ${what}` : s.liveGame === game ? 'Plató: este juego, pero la escena en el aire es otra (F3)' : 'Este juego no está en el aire'
  ])
}

/** Acción de pregunta dirigida a un juego concreto. */
export const toGame = (game: QuizGameId, a: QuizAction): QuizAction => ({ ...a, game }) as QuizAction

/** Insignia "EN EL AIRE" o botón "Poner en el aire" (cabecera de cada pantalla de juego). */
export function airBadge(ctx: Ctx, s: GameState, game: QuizGameId | 'rosco'): HTMLElement {
  const onAir = s.scene === 'juego' && s.liveGame === game
  if (onAir)
    return h('span', 'air', { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: 5 }, [h('span', 'dotlive'), 'EN EL AIRE'])
  return btn('Poner en el aire', () => ctx.send({ type: 'setLiveGame', game, scene: true }), 'b sm acc')
}

/** Controles del temporizador (independiente: nunca arranca solo). T mostrar/ocultar, Y play/pausa. */
export function timerControls(ctx: Ctx): { el: HTMLElement; update(s: GameState): void; toggleShow(): void; togglePlay(): void } {
  const el = h('div', '', { display: 'inline-flex', alignItems: 'center', gap: 6 })
  const toggleShow = () => ctx.send({ type: 'timerConfig', patch: { enabled: !ctx.state.quiz.timer.enabled } })
  const togglePlay = () => {
    const t = ctx.state.quiz.timer
    ctx.send(t.endsAt !== null ? { type: 'timerPause', now: Date.now() } : { type: 'timerStart', now: Date.now() })
  }
  const label = h('span', 'mut', { fontSize: 12, minWidth: 92 })
  const left = (s: GameState) => {
    const t = s.quiz.timer
    const ms = t.endsAt !== null ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs ?? t.seconds * 1000
    return Math.ceil(ms / 1000)
  }
  setInterval(() => {
    const s = ctx.state
    if (el.isConnected && s?.quiz.timer.endsAt !== null) label.textContent = `Reloj · ${left(s)} s`
  }, 250)
  return {
    el,
    toggleShow,
    togglePlay,
    update(s) {
      const t = s.quiz.timer
      label.textContent = `Reloj · ${left(s)} s`
      el.replaceChildren(
        label,
        btn(t.enabled ? 'Ocultar reloj' : 'Mostrar reloj', toggleShow, `b sm ghost${t.enabled ? ' on' : ''}`, 'T'),
        btn(t.endsAt !== null ? 'Pausar' : t.remainingMs !== null ? 'Seguir' : 'Arrancar', togglePlay, `b sm ghost${t.endsAt !== null ? ' on' : ''}`, 'Y'),
        btn('Reiniciar', () => ctx.send({ type: 'timerReset' }), 'b sm ghost')
      )
    }
  }
}
