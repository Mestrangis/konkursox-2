// Pestaña "Preguntas" del panel: banco, flujo de la pregunta (con atajos), turnos, puntuación,
// temporizador, escalera y sonidos. El estado vive en el main; aquí solo se envían acciones.
import type { Bank, BankInfo, Question } from '../../shared/questions'
import { questionKey } from '../../shared/questions'
import {
  CUES,
  defaultLevels,
  fiftyFifty,
  formatPoints,
  ladderBank,
  ladderSafe,
  LIFELINES,
  sameTarget,
  shuffle,
  turnTargets,
  type CueId,
  type QuizAction,
  type Target
} from '../../shared/quiz'
import type { GameState } from '../../shared/types'
import { h } from '../ds/components'
import { targetName } from '../plato/quizScenes'
import type { AudioEngine } from './audio'

interface Ctx {
  send(a: QuizAction): void
  getState(): GameState
  audio: AudioEngine
  getSfx(): string[]
  previewSlot: HTMLElement
}

const btn = (label: string, onClick: () => void, cls = '', key?: string) => {
  const b = h('button', `p-btn ${cls}`.trim(), {}, [label])
  if (key) b.append(h('kbd', 'p-kbd', {}, [key]))
  b.onclick = onClick
  return b
}
const card = (title: string, ...children: Node[]) => h('section', 'p-card', {}, [h('h3', 'p-card__title', {}, [title]), ...children])
const LETTERS = 'ABCD'
const targetLabel = (s: GameState, t: Target) => (t.kind === 'team' ? s.teams[t.index].name : targetName(s, t))

export function createQuizTab(ctx: Ctx) {
  const { send, audio } = ctx
  let banks: BankInfo[] = []
  let bank: Bank | null = null
  let bankLoadedFor: string | null = null
  let selectedId: string | null = null
  let search = ''
  let hideUsed = false
  const now = () => Date.now()
  const S = () => ctx.getState()

  // ---------------------------------------------------------------- sonidos
  function cue(id: CueId): void {
    const file = S().quiz.sounds[id]
    if (file && ctx.getSfx().includes(file)) audio.playSfx(file)
  }

  // ---------------------------------------------------------------- acciones del flujo
  function orderedQuestions(): Question[] {
    if (!bank) return []
    const file = S().quiz.bankFile ?? ''
    const order = S().quiz.order[file]
    if (!order) return bank.preguntas
    const byId = new Map(bank.preguntas.map((q) => [q.id, q]))
    const out = order.map((id) => byId.get(id)).filter(Boolean) as Question[]
    for (const q of bank.preguntas) if (!order.includes(q.id)) out.push(q)
    return out
  }
  const isUsed = (q: Question) => !!S().quiz.used[questionKey(S().quiz.bankFile ?? '', q.id)]

  function launch(q: Question | undefined): void {
    const file = S().quiz.bankFile
    if (!q || !file) return
    audio.stopSfx()
    audio.stopLoop()
    send({ type: 'quizLoad', key: questionKey(file, q.id), bankFile: file, question: q, now: now() })
    selectedId = q.id
    cue('pregunta')
  }
  function launchSelected(): void {
    launch(orderedQuestions().find((q) => q.id === selectedId))
  }
  function launchNext(): void {
    const list = orderedQuestions()
    launch(list.find((q) => !isUsed(q)))
  }
  function pick(i: number): void {
    const cur = S().quiz.current
    if (!cur || (cur.phase !== 'options' && cur.phase !== 'locked')) return
    if (i >= cur.shown || cur.hidden.includes(i) || cur.attempts.some((a) => !a.correct && a.pick === i)) return
    audio.stopLoop()
    audio.stopSfx()
    send({ type: 'quizPick', index: i, now: now() })
    cue('marcar')
  }
  function reveal(): void {
    const s = S()
    const cur = s.quiz.current
    if (!cur || cur.phase !== 'locked' || cur.picked === null) return
    const correct = cur.picked === cur.question.correcta
    audio.stopSfx()
    audio.stopLoop()
    send({ type: 'quizReveal', now: now() })
    cue(correct ? 'correcto' : 'error')
  }
  function showResult(): void {
    const o = S().quiz.ladder.outcome
    if (!o) return
    audio.stopSfx()
    audio.stopLoop()
    send({ type: 'setView', view: 'result' })
    cue(o.kind === 'won' ? 'victoria' : o.kind === 'walked' ? 'plantarse' : 'caida')
  }
  function walkAway(): void {
    const l = S().quiz.ladder
    if (!l.active || l.outcome) return
    if (!confirm(`¿Se planta con ${formatPoints(ladderBank(l.levels, l.level))} puntos?`)) return
    audio.stopSfx()
    audio.stopLoop()
    send({ type: 'ladderWalk' })
    cue('plantarse')
  }
  function useLifeline(id: (typeof LIFELINES)[number]['id']): void {
    const s = S()
    const used = s.quiz.ladder.used[id]
    if (id === '5050' && !used) {
      const cur = s.quiz.current
      const hide = cur ? fiftyFifty(cur.question, cur.hidden) : []
      send({ type: 'ladderSetLifeline', id, used: true, hide })
    } else send({ type: 'ladderSetLifeline', id, used: !used, hide: [] })
  }
  function toggleTimer(): void {
    const t = S().quiz.timer
    if (!t.enabled) return
    send(t.endsAt !== null ? { type: 'timerPause', now: now() } : { type: 'timerStart', now: now() })
  }

  // ---------------------------------------------------------------- columna A: banco
  const bankSelect = h('select', 'p-select')
  bankSelect.onchange = () => send({ type: 'quizSetBank', file: bankSelect.value || null })
  const searchInput = h('input', 'p-input')
  searchInput.placeholder = 'Buscar en el enunciado, opciones o nota'
  searchInput.oninput = () => {
    search = searchInput.value.trim().toLowerCase()
    renderList()
  }
  const hideUsedCheck = h('input')
  hideUsedCheck.type = 'checkbox'
  hideUsedCheck.onchange = () => {
    hideUsed = hideUsedCheck.checked
    renderList()
  }
  const listEl = h('div', 'p-qlist')
  const countEl = h('span', 'p-muted')
  const bankMsg = h('div', 'p-muted')

  async function loadBanks(): Promise<void> {
    banks = await window.konk.listBanks()
    const s = S()
    if ((!s.quiz.bankFile || !banks.some((b) => b.file === s.quiz.bankFile)) && banks.length) {
      send({ type: 'quizSetBank', file: banks[0].file })
    }
    bankLoadedFor = null
    renderBanks()
    await ensureBank()
  }

  async function ensureBank(): Promise<void> {
    const file = S().quiz.bankFile
    if (file === bankLoadedFor) return
    bankLoadedFor = file
    bank = null
    if (file) {
      try {
        bank = await window.konk.getBank(file)
        bankMsg.textContent = ''
      } catch (err) {
        bankMsg.textContent = `No se pudo leer ${file}: ${(err as Error).message}`
      }
    }
    renderList()
  }

  function renderBanks(): void {
    const cur = S().quiz.bankFile
    bankSelect.replaceChildren(
      ...banks.map((b) => {
        const o = h('option', '', {}, [`${b.nombre} (${b.count})${b.error ? ' · error' : ''}`])
        o.value = b.file
        o.selected = b.file === cur
        return o
      })
    )
    if (!banks.length) bankSelect.append(h('option', '', {}, ['No hay bancos']))
  }

  function renderList(): void {
    const s = S()
    const file = s.quiz.bankFile ?? ''
    const all = orderedQuestions()
    const used = all.filter(isUsed).length
    countEl.textContent = bank ? `${all.length - used} libres de ${all.length}${s.quiz.order[file] ? ' · barajado' : ''}` : ''
    const list = all.filter((q) => {
      if (hideUsed && isUsed(q)) return false
      if (!search) return true
      return [q.enunciado, ...q.opciones, q.nota_presentador ?? ''].join(' ').toLowerCase().includes(search)
    })
    const currentKey = s.quiz.current?.key
    listEl.replaceChildren(
      ...list.map((q) => {
        const used = isUsed(q)
        const key = questionKey(file, q.id)
        const item = h('div', 'p-qitem' + (used ? ' is-used' : '') + (q.id === selectedId ? ' is-selected' : '') + (key === currentKey ? ' is-live' : ''))
        const usedBtn = h('button', 'p-qitem__used', {}, [used ? 'Usada' : 'Libre'])
        usedBtn.title = used ? 'Marcar como no usada' : 'Marcar como usada'
        usedBtn.onclick = (e) => {
          e.stopPropagation()
          send({ type: 'quizMarkUsed', key, used: !used })
        }
        item.append(
          h('span', 'p-qitem__id', {}, [q.id]),
          h('span', 'p-tag', {}, [q.tipo === 'sino' ? 'SÍ/NO' : 'TEST']),
          h('span', 'p-qitem__text', {}, [q.enunciado]),
          ...(q.imagen ? [h('span', 'p-tag p-tag--img', {}, ['IMG'])] : []),
          usedBtn
        )
        item.title = q.enunciado
        item.onclick = () => {
          selectedId = q.id
          renderList()
          renderCurrent()
        }
        item.ondblclick = () => launch(q)
        return item
      })
    )
    if (bank && !list.length) listEl.append(h('div', 'p-muted', { padding: 8 }, ['Ninguna pregunta coincide.']))
  }

  const colA = h('div', 'p-col', {}, [
    card(
      'Banco de preguntas',
      h('div', 'p-col', { gap: 8 }, [
        bankSelect,
        h('div', 'p-row', {}, [
          btn('Barajar', () => {
            const file = S().quiz.bankFile
            if (file && bank) send({ type: 'quizSetOrder', file, order: shuffle(bank.preguntas.map((q) => q.id)) })
          }, 'p-btn--sm'),
          btn('Orden original', () => {
            const file = S().quiz.bankFile
            if (file) send({ type: 'quizSetOrder', file, order: null })
          }, 'p-btn--sm'),
          btn('Reiniciar usadas', () => {
            const file = S().quiz.bankFile
            if (file && confirm('¿Marcar todas las preguntas de este banco como no usadas?')) send({ type: 'quizResetUsed', bankFile: file })
          }, 'p-btn--sm p-btn--ko')
        ]),
        h('div', 'p-row', {}, [
          btn('Importar', async () => {
            const r = await window.konk.importBanks()
            if (r.errors.length) alert(`No se pudieron importar:\n${r.errors.join('\n')}`)
            await loadBanks()
          }, 'p-btn--sm'),
          btn('Abrir carpeta', () => void window.konk.openBanksDir(), 'p-btn--sm'),
          btn('Recargar', () => void loadBanks(), 'p-btn--sm')
        ]),
        searchInput,
        h('div', 'p-row', {}, [h('label', 'p-check', {}, [hideUsedCheck, 'Ocultar usadas']), h('span', 'p-spacer', { flex: 1 }), countEl]),
        bankMsg
      ])
    ),
    h('section', 'p-card p-card--grow', {}, [listEl])
  ])

  // ---------------------------------------------------------------- columna B: pregunta en curso
  const curBox = h('div', 'p-col', { gap: 10 })
  const flowRow1 = h('div', 'p-row')
  const flowRow2 = h('div', 'p-row')
  const pickRow = h('div', 'p-row')
  const timerLabel = h('span', 'p-timer')

  const bLaunch = btn('Lanzar', launchSelected, 'p-btn--sm', 'Intro')
  const bNext = btn('Siguiente libre', launchNext, 'p-btn--sm', 'N')
  const bOpt = btn('Siguiente opción', () => send({ type: 'quizShowNext', now: now() }), 'p-btn--sm', 'O')
  const bAll = btn('Todas', () => send({ type: 'quizShowAll', now: now() }), 'p-btn--sm', 'T')
  const bUnpick = btn('Quitar marca', () => send({ type: 'quizUnpick' }), 'p-btn--sm', 'Retroceso')
  const bReveal = btn('Revelar', reveal, 'p-btn--sm p-btn--ok', 'R')
  const bAward = btn('Sumar puntos', () => send({ type: 'quizAward' }), 'p-btn--sm', 'P')
  const bImage = btn('Imagen', () => send({ type: 'quizToggleImage' }), 'p-btn--sm', 'I')
  const bView = btn('Ver plantilla', () => send({ type: 'setView', view: S().view === 'plato' ? 'quiz' : 'plato' }), 'p-btn--sm', 'V')
  const bClear = btn('Retirar', () => {
    audio.stopLoop()
    send({ type: 'quizClear' })
  }, 'p-btn--sm p-btn--ko', 'Esc')
  const bTimer = btn('Reloj', toggleTimer, 'p-btn--sm', 'Espacio')
  const bTimerReset = btn('Reiniciar reloj', () => send({ type: 'timerReset' }), 'p-btn--sm')
  flowRow1.append(bLaunch, bNext, bOpt, bAll, bReveal, bAward)
  flowRow2.append(bUnpick, bImage, bView, bTimer, bTimerReset, timerLabel, h('span', 'p-spacer', { flex: 1 }), bClear)
  const pickBtns = [0, 1, 2, 3].map((i) => btn(LETTERS[i], () => pick(i), 'p-btn--icon p-pick', String(i + 1)))
  pickRow.append(h('span', 'p-label', {}, ['Marcar']), ...pickBtns)

  function renderQuestionDetail(q: Question, s: GameState, live: boolean): HTMLElement {
    const cur = live ? s.quiz.current : null
    const failed = new Set(cur?.attempts.filter((a) => !a.correct).map((a) => a.pick) ?? [])
    const opts = q.opciones.map((o, i) => {
      const cls = ['p-opt']
      if (i === q.correcta) cls.push('is-correct')
      if (cur?.picked === i && cur.phase === 'locked') cls.push('is-picked')
      if (failed.has(i)) cls.push('is-failed')
      if (cur?.hidden.includes(i)) cls.push('is-hidden')
      if (cur && i >= cur.shown && cur.phase !== 'revealed') cls.push('is-pending')
      return h('div', cls.join(' '), {}, [
        h('span', 'p-opt__k', {}, [q.tipo === 'sino' ? String(i + 1) : LETTERS[i]]),
        h('span', 'p-opt__t', {}, [o]),
        ...(i === q.correcta ? [h('span', 'p-opt__badge', {}, ['Correcta'])] : [])
      ])
    })
    const meta = [q.tipo === 'sino' ? 'Sí o No' : 'Test', q.dificultad !== undefined ? `Dificultad ${q.dificultad}` : '', q.fuente ? `Fuente: ${q.fuente}` : '']
      .filter(Boolean)
      .join(' · ')
    const el = h('div', 'p-col', { gap: 8 }, [
      h('div', 'p-qtitle', {}, [q.enunciado]),
      h('div', 'p-muted', {}, [`#${q.id} · ${meta}`]),
      h('div', 'p-opts', {}, opts)
    ])
    if (q.nota_presentador) el.append(h('div', 'p-note', {}, [h('strong', '', {}, ['Nota']), q.nota_presentador]))
    if (q.imagen) {
      const img = h('img', 'p-qimg')
      img.src = `konk-media://imagenes/${encodeURIComponent(q.imagen)}`
      img.alt = ''
      el.append(img)
    }
    return el
  }

  const phaseLabel: Record<string, string> = {
    question: 'Pregunta en pantalla',
    options: 'Mostrando opciones',
    locked: 'Respuesta definitiva',
    revealed: 'Revelada'
  }

  function renderCurrent(): void {
    const s = S()
    const cur = s.quiz.current
    curBox.replaceChildren()
    if (cur) {
      const who = cur.target ? targetLabel(s, cur.target) : 'Sin turno'
      const pending = cur.attempts.filter((a) => !a.awarded && a.delta)
      const status = h('div', 'p-row', {}, [
        h('span', `p-phase is-${cur.phase}`, {}, [phaseLabel[cur.phase]]),
        h('span', 'p-label', {}, ['Responde']),
        h('strong', 'p-who', {}, [who]),
        ...cur.attempts.map((a) =>
          h('span', `p-tag ${a.correct ? 'p-tag--ok' : 'p-tag--ko'}`, {}, [
            `${a.target ? targetLabel(s, a.target) : '-'}: ${cur.question.tipo === 'sino' ? cur.question.opciones[a.pick] : LETTERS[a.pick]} ${a.delta ? (a.delta > 0 ? '+' : '') + a.delta : ''}`
          ])
        ),
        ...(pending.length ? [h('span', 'p-tag p-tag--lock', {}, ['Puntos sin sumar'])] : [])
      ])
      curBox.append(status, renderQuestionDetail(cur.question, s, true))
    } else {
      const sel = orderedQuestions().find((q) => q.id === selectedId)
      if (sel) curBox.append(h('div', 'p-phase', {}, ['Seleccionada (sin lanzar)']), renderQuestionDetail(sel, s, false))
      else curBox.append(h('div', 'p-muted', {}, ['Elige una pregunta del banco y pulsa Lanzar (Intro), o N para la siguiente libre.']))
    }
    // estado de botones
    const phase = cur?.phase
    bOpt.disabled = !cur || phase === 'revealed' || cur.shown >= cur.question.opciones.length
    bAll.disabled = bOpt.disabled
    bReveal.disabled = phase !== 'locked'
    bUnpick.disabled = phase !== 'locked'
    bAward.disabled = !cur || !cur.attempts.some((a) => !a.awarded && a.delta)
    bAward.style.display = s.quiz.scoring.autoAward ? 'none' : ''
    bImage.disabled = !cur?.question.imagen
    bImage.classList.toggle('is-active', !!cur?.showImage)
    bView.textContent = s.view === 'plato' ? 'Ver pregunta' : 'Ver plantilla'
    bView.append(h('kbd', 'p-kbd', {}, ['V']))
    bClear.disabled = !cur
    bLaunch.disabled = !selectedId || !bank
    const n = cur?.question.opciones.length ?? 4
    pickBtns.forEach((b, i) => {
      b.style.display = i < n ? '' : 'none'
      b.firstChild!.textContent = cur?.question.tipo === 'sino' ? cur.question.opciones[i]?.toUpperCase() ?? '' : LETTERS[i]
      b.disabled = !cur || (phase !== 'options' && phase !== 'locked') || i >= cur.shown || cur.hidden.includes(i) || cur.attempts.some((a) => !a.correct && a.pick === i)
      b.classList.toggle('is-active', phase === 'locked' && cur?.picked === i)
    })
    bTimer.disabled = !s.quiz.timer.enabled
    bTimerReset.disabled = !s.quiz.timer.enabled
  }

  const colB = h('div', 'p-col', {}, [
    card('Pregunta en curso', curBox, h('div', 'p-flow', {}, [flowRow1, pickRow, flowRow2])),
    card(
      'Atajos de teclado',
      h('div', 'p-keys', {}, [
        ...[
          ['Intro', 'Lanzar la seleccionada'],
          ['N', 'Lanzar la siguiente libre'],
          ['O / T', 'Siguiente opción / todas'],
          ['1-4 o A-D', 'Marcar respuesta'],
          ['Retroceso', 'Quitar la marca'],
          ['R', 'Revelar'],
          ['P', 'Sumar puntos pendientes'],
          ['Espacio', 'Reloj: arrancar / pausar'],
          ['I', 'Mostrar / ocultar imagen'],
          ['V', 'Plató: plantilla o pregunta'],
          ['F', 'Escalera: 50:50'],
          ['Esc', 'Retirar la pregunta']
        ].map(([k, d]) => h('div', 'p-keyrow', {}, [h('kbd', 'p-kbd', {}, [k]), h('span', '', {}, [d])]))
      ])
    )
  ])

  // ---------------------------------------------------------------- columna C: turno, reglas, escalera, sonidos
  const turnRow = h('div', 'p-row')
  const reboundCheck = h('input')
  reboundCheck.type = 'checkbox'
  reboundCheck.onchange = () => send({ type: 'quizSetOptions', patch: { rebound: reboundCheck.checked } })
  const rotateCheck = h('input')
  rotateCheck.type = 'checkbox'
  rotateCheck.onchange = () => send({ type: 'quizSetOptions', patch: { autoRotate: rotateCheck.checked } })

  const num = (get: (s: GameState) => number, set: (v: number) => QuizAction, width = 70) => {
    const i = h('input', 'p-input', { width, textAlign: 'center' })
    i.inputMode = 'numeric'
    i.onchange = () => {
      const v = Number(i.value.replace(',', '.'))
      if (Number.isFinite(v)) send(set(v))
    }
    return { el: i, sync: (s: GameState) => document.activeElement !== i && (i.value = String(get(s))) }
  }
  const chk = (label: string, get: (s: GameState) => boolean, set: (v: boolean) => QuizAction) => {
    const i = h('input')
    i.type = 'checkbox'
    i.onchange = () => send(set(i.checked))
    return { el: h('label', 'p-check', {}, [i, label]), sync: (s: GameState) => (i.checked = get(s)) }
  }
  const ptsOk = num((s) => s.quiz.scoring.pointsCorrect, (v) => ({ type: 'quizSetScoring', patch: { pointsCorrect: v } }))
  const ptsKo = num((s) => s.quiz.scoring.pointsWrong, (v) => ({ type: 'quizSetScoring', patch: { pointsWrong: Math.abs(v) } }))
  const penal = chk('Fallar resta', (s) => s.quiz.scoring.penalize, (v) => ({ type: 'quizSetScoring', patch: { penalize: v } }))
  const autoAw = chk('Sumar al revelar', (s) => s.quiz.scoring.autoAward, (v) => ({ type: 'quizSetScoring', patch: { autoAward: v } }))
  const tOn = chk('Usar temporizador', (s) => s.quiz.timer.enabled, (v) => ({ type: 'timerConfig', patch: { enabled: v } }))
  const tSecs = num((s) => s.quiz.timer.seconds, (v) => ({ type: 'timerConfig', patch: { seconds: v } }))
  const syncers = [ptsOk, ptsKo, penal, autoAw, tOn, tSecs]

  // escalera
  const ladderTarget = h('select', 'p-select', { width: 'auto', flex: 1 })
  const ladderStatus = h('div', 'p-ladderstat')
  const lifeRow = h('div', 'p-row')
  const lifeBtns = LIFELINES.map((l) => {
    const b = btn(l.label, () => useLifeline(l.id), 'p-btn--sm', l.id === '5050' ? 'F' : undefined)
    lifeRow.append(b)
    return { id: l.id, b }
  })
  const bLadderStart = btn('Empezar escalera', () => {
    const t = turnTargets(S())[Number(ladderTarget.value)]
    if (t) send({ type: 'ladderStart', target: t })
  }, 'p-btn--sm p-btn--ok')
  const bLadderStop = btn('Terminar', () => send({ type: 'ladderStop' }), 'p-btn--sm p-btn--ko')
  const bWalk = btn('Plantarse', walkAway, 'p-btn--sm')
  const bResult = btn('Mostrar pantalla final', showResult, 'p-btn--sm p-btn--ok')
  const bBack = btn('Volver a la pregunta', () => send({ type: 'setView', view: 'quiz' }), 'p-btn--sm')
  const bLvDown = btn('−', () => send({ type: 'ladderSetLevel', level: S().quiz.ladder.level - 1 }), 'p-btn--icon')
  const bLvUp = btn('+', () => send({ type: 'ladderSetLevel', level: S().quiz.ladder.level + 1 }), 'p-btn--icon')
  const ladderAward = chk('Sumar el premio a los puntos', (s) => s.quiz.ladder.awardToScore, (v) => ({ type: 'ladderSetAward', awardToScore: v }))
  syncers.push(ladderAward)

  const levelsEditor = h('div', 'p-levels')
  function renderLevels(): void {
    const l = S().quiz.ladder
    if (levelsEditor.contains(document.activeElement)) return
    levelsEditor.replaceChildren(
      ...l.levels
        .map((lv, i) => {
          const v = h('input', 'p-input', { width: 120, textAlign: 'right' })
          v.value = String(lv.value)
          v.onchange = () => {
            const val = Number(v.value.replace(/\./g, '').replace(',', '.'))
            if (!Number.isFinite(val)) return
            send({ type: 'ladderSetLevels', levels: S().quiz.ladder.levels.map((x, j) => (j === i ? { ...x, value: val } : x)) })
          }
          const safe = h('input')
          safe.type = 'checkbox'
          safe.checked = lv.safe
          safe.onchange = () => send({ type: 'ladderSetLevels', levels: S().quiz.ladder.levels.map((x, j) => (j === i ? { ...x, safe: safe.checked } : x)) })
          return h('div', 'p-row', { gap: 6 }, [h('span', 'p-num', { width: 30, fontSize: 16 }, [String(i + 1)]), v, h('label', 'p-check', {}, [safe, 'Seguro'])])
        })
        .reverse()
    )
  }
  const levelsDetails = h('details', 'p-details', {}, [
    h('summary', '', {}, ['Configurar escalones']),
    h('div', 'p-row', { margin: '6px 0' }, [
      btn('Añadir', () => {
        const ls = S().quiz.ladder.levels
        send({ type: 'ladderSetLevels', levels: [...ls, { value: (ls[ls.length - 1]?.value ?? 0) * 2 || 100, safe: false }] })
      }, 'p-btn--sm'),
      btn('Quitar el último', () => send({ type: 'ladderSetLevels', levels: S().quiz.ladder.levels.slice(0, -1) }), 'p-btn--sm'),
      btn('15 por defecto', () => send({ type: 'ladderSetLevels', levels: defaultLevels() }), 'p-btn--sm')
    ]),
    levelsEditor
  ])

  function renderLadder(): void {
    const s = S()
    const l = s.quiz.ladder
    const targets = turnTargets(s)
    const prev = ladderTarget.value
    ladderTarget.replaceChildren(
      ...targets.map((t, i) => {
        const o = h('option', '', {}, [targetLabel(s, t)])
        o.value = String(i)
        o.selected = l.active ? sameTarget(t, l.target) : prev ? prev === String(i) : sameTarget(t, s.quiz.turn)
        return o
      })
    )
    ladderTarget.disabled = l.active
    bLadderStart.style.display = l.active ? 'none' : ''
    bLadderStop.style.display = l.active ? '' : 'none'
    bWalk.disabled = !l.active || !!l.outcome
    bResult.style.display = l.outcome && s.view !== 'result' ? '' : 'none'
    bBack.style.display = s.view === 'result' && s.quiz.current ? '' : 'none'
    bLvDown.disabled = !l.active
    bLvUp.disabled = !l.active
    lifeBtns.forEach(({ id, b }) => {
      b.disabled = !l.active
      b.classList.toggle('is-used', l.used[id])
      b.title = l.used[id] ? 'Usado (pulsa para devolverlo)' : 'Sin usar'
    })
    const out = l.outcome
    ladderStatus.replaceChildren(
      ...(l.active
        ? [
            h('div', '', {}, [h('span', 'p-label', {}, ['Juega por']), ` ${l.level + 1 > l.levels.length ? '-' : `${formatPoints(l.levels[Math.min(l.level, l.levels.length - 1)].value)} (escalón ${Math.min(l.level + 1, l.levels.length)} de ${l.levels.length})`}`]),
            h('div', '', {}, [h('span', 'p-label', {}, ['Ganado']), ` ${formatPoints(ladderBank(l.levels, l.level))}`, '   ', h('span', 'p-label', {}, ['Seguro']), ` ${formatPoints(ladderSafe(l.levels, l.level))}`]),
            ...(out
              ? [h('div', `p-tag ${out.kind === 'failed' ? 'p-tag--ko' : 'p-tag--ok'}`, {}, [`${out.kind === 'won' ? 'Ha ganado' : out.kind === 'walked' ? 'Se ha plantado' : 'Ha fallado'}: ${formatPoints(out.prize)}`])]
              : [])
          ]
        : [h('span', 'p-muted', {}, ['Modo Millonario para un concursante o un equipo. Mientras esté activa, las preguntas que lances suben la escalera.'])])
    )
    renderLevels()
  }

  // sonidos
  const soundSelects = CUES.map((c) => {
    const sel = h('select', 'p-select')
    sel.onchange = () => send({ type: 'quizSetSound', cue: c.id, file: sel.value || null })
    return { cue: c, sel, el: h('label', 'p-field', {}, [h('span', '', {}, [c.label]), sel]) }
  })
  function renderSounds(): void {
    const s = S()
    const files = ctx.getSfx()
    for (const { cue: c, sel } of soundSelects) {
      if (document.activeElement === sel) continue
      const v = s.quiz.sounds[c.id]
      const opts = ['', ...files]
      if (v && !files.includes(v)) opts.push(v)
      sel.replaceChildren(
        ...opts.map((f) => {
          const o = h('option', '', {}, [f ? (files.includes(f) ? f : `${f} (no está)`) : '(ninguno)'])
          o.value = f
          o.selected = f === (v ?? '')
          return o
        })
      )
    }
  }

  const colC = h('div', 'p-col', {}, [
    ctx.previewSlot,
    card(
      'Turno',
      h('div', 'p-col', { gap: 8 }, [
        turnRow,
        h('div', 'p-row', {}, [h('label', 'p-check', {}, [reboundCheck, 'Rebote al siguiente si falla']), h('label', 'p-check', {}, [rotateCheck, 'Rotar turno en cada pregunta'])])
      ])
    ),
    card(
      'Puntuación y reloj',
      h('div', 'p-col', { gap: 8 }, [
        h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Acierto']), ptsOk.el, h('span', 'p-label', {}, ['Fallo']), ptsKo.el, penal.el]),
        h('div', 'p-row', {}, [autoAw.el]),
        h('div', 'p-row', {}, [tOn.el, h('span', 'p-label', {}, ['Segundos']), tSecs.el])
      ])
    ),
    card(
      'Escalera de premios',
      h('div', 'p-col', { gap: 8 }, [
        h('div', 'p-row', {}, [ladderTarget, bLadderStart, bLadderStop]),
        ladderStatus,
        h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Escalón']), bLvDown, bLvUp, h('span', 'p-spacer', { flex: 1 }), bWalk]),
        h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Comodines']), lifeRow]),
        h('div', 'p-row', {}, [bResult, bBack]),
        ladderAward.el,
        levelsDetails
      ])
    ),
    h('section', 'p-card', {}, [h('details', 'p-details', {}, [h('summary', '', {}, ['Sonidos del juego']), h('div', 'p-grid2', { marginTop: 8 }, soundSelects.map((x) => x.el))])])
  ])

  function renderTurn(): void {
    const s = S()
    const targets = turnTargets(s)
    turnRow.replaceChildren(
      ...targets.map((t) => {
        const b = btn(targetLabel(s, t), () => send({ type: 'quizSetTurn', target: t }), 'p-btn--sm')
        b.classList.toggle('is-active', sameTarget(t, s.quiz.current?.target ?? s.quiz.turn))
        return b
      }),
      btn('Nadie', () => send({ type: 'quizSetTurn', target: null }), 'p-btn--sm')
    )
    reboundCheck.checked = s.quiz.rebound
    rotateCheck.checked = s.quiz.autoRotate
  }

  // ---------------------------------------------------------------- temporizador (reloj del panel + sonido)
  setInterval(() => {
    const s = S()
    if (!s) return
    const t = s.quiz.timer
    const running = t.enabled && t.endsAt !== null && t.endsAt > Date.now()
    const left = t.endsAt !== null ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs ?? t.seconds * 1000
    timerLabel.textContent = t.enabled ? `${Math.ceil(left / 1000)} s${t.endsAt === null && t.remainingMs !== null ? ' (pausa)' : ''}` : ''
    timerLabel.classList.toggle('is-low', running && left <= 5000)
    const file = s.quiz.sounds.reloj
    if (running && file && ctx.getSfx().includes(file)) audio.playLoop(file)
    else audio.stopLoop()
  }, 200)

  // ---------------------------------------------------------------- teclado
  function onKey(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return false
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const s = S()
    const cur = s.quiz.current
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const pickKeys: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 }
    if (k in pickKeys) pick(pickKeys[k])
    else if (k === 'Enter') launchSelected()
    else if (k === 'n') launchNext()
    else if (k === 'o') send({ type: 'quizShowNext', now: now() })
    else if (k === 't') send({ type: 'quizShowAll', now: now() })
    else if (k === 'r') reveal()
    else if (k === 'p') send({ type: 'quizAward' })
    else if (k === 'Backspace') send({ type: 'quizUnpick' })
    else if (k === ' ') toggleTimer()
    else if (k === 'i') send({ type: 'quizToggleImage' })
    else if (k === 'v') send({ type: 'setView', view: s.view === 'plato' ? 'quiz' : 'plato' })
    else if (k === 'f' && s.quiz.ladder.active && !s.quiz.ladder.used['5050']) useLifeline('5050')
    else if (k === 'Escape' && cur) {
      audio.stopLoop()
      send({ type: 'quizClear' })
    } else return false
    e.preventDefault()
    return true
  }

  const el = h('main', 'p-main p-quiz', {}, [colA, colB, colC])

  return {
    el,
    onKey,
    loadBanks,
    update(): void {
      const s = S()
      if (bankLoadedFor !== s.quiz.bankFile) void ensureBank()
      if (document.activeElement !== bankSelect) renderBanks()
      renderList()
      renderCurrent()
      renderTurn()
      renderLadder()
      renderSounds()
      for (const x of syncers) x.sync(s)
    },
    refreshSounds: renderSounds
  }
}
