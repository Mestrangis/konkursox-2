// Pestaña "Rosco": preparar (banco, 1 o 2 concursantes, tiempo, puntos, bote) y llevar el rosco con teclas.
import { questionKey, ROSCO_ALPHABET, type Bank, type BankInfo } from '../../shared/questions'
import { sameTarget, turnTargets, type CueId, type Target } from '../../shared/quiz'
import { buildLetters, remainingMs, roscoPoints, roscoStats, roscoWinners, type LetterStatus, type RoscoAction } from '../../shared/rosco'
import type { Action, GameState } from '../../shared/types'
import { h } from '../ds/components'
import { targetName } from '../plato/quizScenes'
import type { AudioEngine } from './audio'

interface Ctx {
  send(a: Action): void
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
const NEXT_STATUS: Record<LetterStatus, LetterStatus> = { pend: 'ok', ok: 'ko', ko: 'pasa', pasa: 'pend' }

export function createRoscoTab(ctx: Ctx) {
  const { send, audio } = ctx
  const S = () => ctx.getState()
  const r = (a: RoscoAction) => send(a)
  let banks: BankInfo[] = []
  let bank: Bank | null = null
  let bankFor: string | null = null
  let players: (Target | null)[] = [null, null]

  function cue(id: CueId): void {
    const file = S().quiz.sounds[id]
    if (file && ctx.getSfx().includes(file)) audio.playSfx(file)
  }

  // ---------------------------------------------------------------- preparación
  const bankSelect = h('select', 'p-select')
  bankSelect.onchange = () => r({ type: 'roscoConfig', patch: { bankFile: bankSelect.value || null } })
  const p1 = h('select', 'p-select')
  const p2 = h('select', 'p-select')
  p1.onchange = () => (players[0] = targetAt(p1.value))
  p2.onchange = () => (players[1] = targetAt(p2.value))
  const num = (get: (s: GameState) => number, set: (v: number) => RoscoAction) => {
    const i = h('input', 'p-input', { width: 80, textAlign: 'center' })
    i.onchange = () => {
      const v = Number(i.value.replace(',', '.'))
      if (Number.isFinite(v)) r(set(v))
    }
    return { el: i, sync: (s: GameState) => document.activeElement !== i && (i.value = String(get(s))) }
  }
  const secs = num((s) => s.rosco.seconds, (v) => ({ type: 'roscoConfig', patch: { seconds: Math.max(10, Math.round(v)) } }))
  const pts = num((s) => s.rosco.pointsPerHit, (v) => ({ type: 'roscoConfig', patch: { pointsPerHit: v } }))
  const pot = num((s) => s.rosco.jackpot, (v) => ({ type: 'roscoConfig', patch: { jackpot: Math.max(0, v) } }))
  const setupMsg = h('div', 'p-muted')

  function targetAt(v: string): Target | null {
    const i = Number(v)
    return v === '' || !Number.isFinite(i) ? null : turnTargets(S())[i] ?? null
  }

  async function ensureBank(): Promise<void> {
    const file = S().rosco.bankFile
    if (file === bankFor) return
    bankFor = file
    bank = null
    if (file) bank = await window.konk.getBank(file).catch(() => null)
    render()
  }

  function start(): void {
    const s = S()
    if (!bank) return void (setupMsg.textContent = 'Elige un banco de rosco.')
    const chosen = players.filter(Boolean) as Target[]
    if (!chosen.length) return void (setupMsg.textContent = 'Elige al menos un concursante.')
    if (s.rosco.active && !s.rosco.finished && !confirm('Hay un rosco en marcha. ¿Empezar otro?')) return
    const file = s.rosco.bankFile ?? ''
    const used = new Set(bank.preguntas.filter((q) => s.quiz.used[questionKey(file, q.id)]).map((q) => q.id))
    const built = chosen.slice(0, 2).map((target) => {
      const letters = buildLetters(bank!.preguntas, used)
      letters.forEach((l) => used.add(l.qid))
      return { target, letters }
    })
    if (!built[0].letters.length) return void (setupMsg.textContent = 'El banco no tiene definiciones de rosco.')
    const missing = ROSCO_ALPHABET.filter((l) => !built[0].letters.some((x) => x.letra === l))
    setupMsg.textContent = missing.length ? `Sin definición para: ${missing.join(', ')} (esas letras no salen).` : ''
    r({ type: 'roscoStart', players: built })
    for (const b of built) for (const l of b.letters) send({ type: 'quizMarkUsed', key: questionKey(file, l.qid), used: true })
  }

  // ---------------------------------------------------------------- en juego
  const curBox = h('div', 'p-col', { gap: 8 })
  const lettersEl = h('div', 'p-rletters')
  const timeEl = h('span', 'p-timer', { fontSize: 34 })
  const bOk = btn('Acierto', () => mark('ok'), 'p-btn--ok', 'A')
  const bKo = btn('Fallo', () => mark('ko'), 'p-btn--ko', 'F')
  const bPasa = btn('Pasapalabra', () => mark('pasa'), '', 'P')
  const bClock = btn('Reloj', () => toggleClock(), '', 'Espacio')
  const bSwitch = btn('Cambiar turno', () => {
    const s = S()
    if (s.rosco.players.length === 2) r({ type: 'roscoSetTurn', turn: 1 - s.rosco.turn, now: Date.now() })
  }, 'p-btn--sm')
  const bFinish = btn('Terminar rosco', () => {
    if (confirm('¿Dar el rosco por terminado y sumar los puntos?')) r({ type: 'roscoFinish' })
  }, 'p-btn--sm p-btn--ko')
  const bShow = btn('Ver en el plató', () => send({ type: 'setView', view: 'rosco' }), 'p-btn--sm')
  const bClose = btn('Cerrar rosco', () => r({ type: 'roscoStop' }), 'p-btn--sm')
  const result = h('div', 'p-ladderstat')

  function mark(res: 'ok' | 'ko' | 'pasa'): void {
    const s = S()
    if (!s.rosco.active || s.rosco.finished) return
    r({ type: 'roscoMark', result: res, now: Date.now() })
    cue(res === 'ok' ? 'correcto' : res === 'ko' ? 'error' : 'pasapalabra')
  }
  function toggleClock(): void {
    const s = S()
    const p = s.rosco.players[s.rosco.turn]
    if (!s.rosco.active || !p || p.done) return
    r({ type: 'roscoClock', run: p.endsAt === null, now: Date.now() })
  }

  // fin de tiempo y reloj en el panel
  setInterval(() => {
    const s = S()
    if (!s || !s.rosco.active) return
    const p = s.rosco.players[s.rosco.turn]
    if (!p) return
    const left = remainingMs(p, Date.now())
    timeEl.textContent = `${Math.ceil(left / 1000)} s${p.endsAt === null && !p.done ? ' (parado)' : ''}`
    timeEl.classList.toggle('is-low', p.endsAt !== null && left <= 10000)
    if (p.endsAt !== null && left <= 0) {
      r({ type: 'roscoTimeUp', now: Date.now() })
      cue('error')
    }
  }, 200)

  function render(): void {
    const s = S()
    const ro = s.rosco
    // bancos de rosco
    if (document.activeElement !== bankSelect) {
      const rb = banks.filter((b) => b.tipos.includes('rosco'))
      bankSelect.replaceChildren(
        ...(rb.length ? [] : [h('option', '', {}, ['No hay bancos de rosco'])]),
        ...rb.map((b) => {
          const o = h('option', '', {}, [`${b.nombre} (${b.count})`])
          o.value = b.file
          o.selected = b.file === ro.bankFile
          return o
        })
      )
      if (!ro.bankFile && rb[0]) r({ type: 'roscoConfig', patch: { bankFile: rb[0].file } })
    }
    const targets = turnTargets(s)
    for (const [i, sel] of [p1, p2].entries()) {
      if (document.activeElement === sel) continue
      sel.replaceChildren(
        ...(i === 1 ? [h('option', '', {}, ['(solo uno)'])] : []),
        ...targets.map((t, j) => {
          const o = h('option', '', {}, [targetName(s, t)])
          o.value = String(j)
          o.selected = !!players[i] && sameTarget(players[i], t)
          return o
        })
      )
      if (i === 1) (sel.firstChild as HTMLOptionElement).value = ''
      if (i === 0 && !players[0]) players[0] = targets[0] ?? null
      if (i === 1 && players[1] && !targets.some((t) => sameTarget(t, players[1]))) players[1] = null
      if (i === 0 && players[0] && !targets.some((t) => sameTarget(t, players[0]))) players[0] = targets[0] ?? null
      sel.value = players[i] ? String(targets.findIndex((t) => sameTarget(t, players[i]))) : ''
    }
    for (const x of [secs, pts, pot]) x.sync(s)

    // juego
    const p = ro.players[ro.turn]
    const live = ro.active && !!p
    for (const b of [bOk, bKo, bPasa, bClock]) b.disabled = !live || ro.finished || !!p?.done
    bSwitch.disabled = !live || ro.players.length < 2 || ro.finished
    bFinish.disabled = !live || ro.finished
    bShow.disabled = !live
    bClose.disabled = !ro.active
    bClock.firstChild!.textContent = p?.endsAt !== null && p ? 'Parar reloj' : 'Arrancar reloj'
    curBox.replaceChildren()
    if (live) {
      const l = p.letters[p.current]
      curBox.append(
        h('div', 'p-row', {}, [h('span', 'p-phase', {}, [`Turno: ${targetName(s, p.target)}`]), timeEl]),
        ...(l && !p.done && !ro.finished
          ? [
              h('div', 'p-row', { alignItems: 'baseline' }, [
                h('span', 'p-rbig', {}, [l.letra]),
                h('span', 'p-label', {}, [l.modo === 'contiene' ? 'Contiene la' : 'Empieza por']),
                h('span', 'p-tag', {}, [l.status === 'pasa' ? 'Pasada antes' : 'Primera vez'])
              ]),
              h('div', 'p-qtitle', {}, [l.definicion]),
              h('div', 'p-answer', {}, [h('span', 'p-label', {}, ['Respuesta']), h('strong', '', {}, [l.respuesta.toUpperCase()])])
            ]
          : [h('div', 'p-muted', {}, [ro.finished ? 'Rosco terminado.' : 'Este concursante ha terminado.'])])
      )
      lettersEl.replaceChildren(
        ...p.letters.map((x, i) => {
          const b = h('button', `p-rl is-${i === p.current && !p.done ? 'cur' : x.status}`, {}, [x.letra])
          b.title = `${x.letra}: ${x.respuesta} (clic para corregir)`
          b.onclick = () => r({ type: 'roscoUndo', index: i, status: NEXT_STATUS[x.status] })
          return b
        })
      )
      const stats = ro.players.map((pl) => ({ name: targetName(s, pl.target), ...roscoStats(pl), time: Math.ceil(remainingMs(pl, Date.now()) / 1000) }))
      const pts2 = roscoPoints(ro)
      const win = ro.finished ? roscoWinners(ro) : []
      result.replaceChildren(
        ...stats.map((x, i) =>
          h('div', '', {}, [
            h('strong', '', {}, [x.name]),
            ` · ${x.ok} ${x.ok === 1 ? 'acierto' : 'aciertos'} · ${x.ko} ${x.ko === 1 ? 'fallo' : 'fallos'} · ${x.pending} ${x.pending === 1 ? 'pendiente' : 'pendientes'} · ${x.time} s`,
            ro.finished ? ` · ${pts2[i]} puntos${win.includes(i) ? ' · GANA' : ''}` : ''
          ])
        ),
        ...(ro.finished ? [h('span', 'p-tag p-tag--ok', {}, [ro.awarded ? 'Puntos sumados' : 'Pendiente de sumar'])] : [])
      )
    } else {
      lettersEl.replaceChildren()
      result.replaceChildren()
      curBox.append(h('div', 'p-muted', {}, ['Prepara el rosco a la izquierda y pulsa Empezar.']))
    }
  }

  const setupCard = card(
    'Preparar el rosco',
    h('div', 'p-col', { gap: 8 }, [
      h('label', 'p-field', {}, [h('span', '', {}, ['Banco de rosco']), bankSelect]),
      h('div', 'p-grid2', {}, [h('label', 'p-field', {}, [h('span', '', {}, ['Concursante 1']), p1]), h('label', 'p-field', {}, [h('span', '', {}, ['Concursante 2 (alterna)']), p2])]),
      h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Segundos']), secs.el, h('span', 'p-label', {}, ['Puntos por acierto']), pts.el]),
      h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Bote por completarlo (0 = sin bote)']), pot.el]),
      h('div', 'p-row', {}, [btn('Empezar rosco', start, 'p-btn--ok'), btn('Recargar bancos', async () => {
        banks = await window.konk.listBanks()
        bankFor = null
        await ensureBank()
      }, 'p-btn--sm')]),
      setupMsg,
      h('span', 'p-muted', {}, ['Cada concursante recibe definiciones distintas y no se repiten entre roscos (se marcan como usadas).'])
    ])
  )

  const playCard = card(
    'Rosco en juego',
    h('div', 'p-col', { gap: 10 }, [
      curBox,
      h('div', 'p-row', {}, [bOk, bKo, bPasa, bClock]),
      lettersEl,
      h('div', 'p-row', {}, [bSwitch, bShow, bFinish, bClose]),
      result,
      h('span', 'p-muted', {}, ['El reloj se para al fallar o al pasar; arráncalo con Espacio al leer la siguiente definición. Clic en una letra para corregirla.'])
    ])
  )

  const el = h('main', 'p-main p-roscotab', {}, [h('div', 'p-col', {}, [setupCard]), h('div', 'p-col', {}, [playCard]), h('div', 'p-col', {}, [ctx.previewSlot])])

  function onKey(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return false
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (k === 'a') mark('ok')
    else if (k === 'f') mark('ko')
    else if (k === 'p') mark('pasa')
    else if (k === ' ') toggleClock()
    else return false
    e.preventDefault()
    return true
  }

  return {
    el,
    onKey,
    async load(): Promise<void> {
      banks = await window.konk.listBanks()
      await ensureBank()
    },
    update(): void {
      void ensureBank()
      render()
    }
  }
}
