// Escenas de preguntas: test, Sí/No, escalera de premios y pantalla final de la escalera.
import { contestantOrder, playerCount } from '../../shared/order'
import { formatPoints, ladderBank, LIFELINES, targetKey, type LifelineId, type Target } from '../../shared/quiz'
import type { Box } from '../../shared/layouts'
import type { ContestantId, GameState, SlotId } from '../../shared/types'
import { bevelBar, camFrame, h, svg, type CamFrameEl } from '../ds/components'
import { buildEstimationScene, buildQuienScene } from './gameScenes'
import type { Scene } from './scenes'

const OK_ICON = '<path fill="#fff" d="M9.5 16.2 4.8 11.5 3.4 12.9l6.1 6.1L21 7.5l-1.4-1.4z"></path>'
const KO_ICON = '<path fill="#fff" d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"></path>'
export const DIAMOND = '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="#e6cb85"></path>'
const CHIP_DIAMOND = '<svg viewBox="0 0 10 10" width="16" height="16" aria-hidden="true"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="#1c1003"></path></svg>'

/** Concursantes que corresponden a un turno (un equipo son sus miembros). */
export function membersOf(s: GameState, t: Target | null | undefined): ContestantId[] {
  if (!t) return []
  if (t.kind === 'contestant') return [t.id]
  return contestantOrder(s).filter((id) => s.contestants.find((c) => c.id === id)?.team === t.index)
}

/** Marcos a resaltar en el plató: el del turno de la pregunta en curso (o el turno elegido). */
export function turnSlots(s: GameState): Set<SlotId> {
  const t = s.quiz.current?.target ?? (s.quiz.ladder.active ? s.quiz.ladder.target : s.quiz.turn)
  return new Set(membersOf(s, t))
}

export function targetName(s: GameState, t: Target | null): string {
  if (!t) return ''
  if (t.kind === 'team') return s.teams[t.index].name
  return s.contestants.find((c) => c.id === t.id)?.name ?? ''
}

export function targetScore(s: GameState, t: Target | null): number {
  if (!t) return 0
  if (t.kind === 'team') return s.teams[t.index].score
  return s.contestants.find((c) => c.id === t.id)?.score ?? 0
}

type Kind = 'test' | 'sino' | 'ladder' | 'quien' | 'estimacion'

function quizKind(s: GameState): Kind {
  if (s.quiz.ladder.active && s.quiz.current?.ladderLevel !== null && s.quiz.current?.ladderLevel !== undefined) return 'ladder'
  const t = s.quiz.current?.question.tipo
  return t === 'sino' || t === 'quien' || t === 'estimacion' ? t : 'test'
}

/** ¿La escena Juego enseña la pantalla final de la escalera? */
export const showsLadderResult = (s: GameState): boolean => s.liveGame === 'escalera' && s.quiz.ladder.showResult && !!s.quiz.ladder.outcome

export function quizSceneKey(s: GameState): string {
  if (showsLadderResult(s)) {
    const t = s.quiz.ladder.target
    return `result:${t ? JSON.stringify(t) : ''}:${membersOf(s, t).join(',')}`
  }
  const kind = quizKind(s)
  const n = s.quiz.current?.question.opciones.length ?? 4
  if (kind === 'ladder') {
    const t = s.quiz.ladder.target
    return `ladder:${n}:${t?.kind === 'team' ? membersOf(s, t).join(',') : t?.kind === 'contestant' ? t.id : ''}:${s.quiz.ladder.levels.length}`
  }
  return `${kind}:${n}:${s.layout}:${contestantOrder(s).join(',')}`
}

// ---------------------------------------------------------------- piezas

export interface PlateEl {
  root: HTMLDivElement
  set(name: string, score: string | null, chip: string, chipCls: string): void
}

export function quizPlate(box: Box, c: number, nameSize?: number): PlateEl {
  const name = h('span', 'k-name', nameSize ? { fontSize: nameSize } : undefined)
  const chip = h('span', 'k-chip', { marginLeft: 'auto' })
  const score = h('span', 'k-score', { marginLeft: 0, minWidth: 64, textAlign: 'right' })
  const root = bevelBar({ box, c }, [name, chip, score])
  return {
    root,
    set: (n, sc, ch, cls) => {
      name.textContent = n
      score.textContent = sc ?? ''
      score.style.display = sc === null ? 'none' : ''
      if (ch === 'DIAMOND') chip.innerHTML = CHIP_DIAMOND
      else chip.textContent = ch
      chip.className = `k-chip ${cls}`.trim()
      chip.style.visibility = ch ? 'visible' : 'hidden'
    }
  }
}

export interface OptEl {
  root: HTMLDivElement
  set(text: string, state: '' | 'ok' | 'ko' | 'locked', visible: boolean): void
}

export function optionBar(key: string, box: Box, c: number, sino: boolean, upper = false): OptEl {
  const keyEl = h('span', 'k-key k-answer', {}, [`${key}:`])
  const text = h('span', sino ? 'k-sino' : 'k-answer')
  const icon = svg('0 0 24 24', { width: sino ? 52 : 34, height: sino ? 52 : 34 }, '')
  const children: Node[] = sino ? [text, icon] : [keyEl, text, icon]
  const root = bevelBar({ box, c, center: sino }, children)
  root.classList.add('k-opt')
  if (sino) root.classList.add('k-opt--sino')
  let last = ''
  return {
    root,
    set: (t, st, visible) => {
      const sig = `${t}|${st}|${visible}`
      if (sig === last) return
      last = sig
      text.textContent = sino || upper ? t.toUpperCase() : t
      root.classList.toggle('is-ok', st === 'ok')
      root.classList.toggle('is-ko', st === 'ko')
      root.classList.toggle('is-locked', st === 'locked')
      root.classList.toggle('is-off', !visible)
      icon.innerHTML = st === 'ok' ? OK_ICON : st === 'ko' ? KO_ICON : ''
      icon.style.display = st === 'ok' || st === 'ko' ? '' : 'none'
    }
  }
}

function lifelineEl(id: LifelineId): HTMLDivElement {
  let inner: Node
  if (id === '5050') inner = h('span', '', { fontSize: 30, fontWeight: 700, color: '#e6cb85', letterSpacing: '0.02em' }, ['50:50'])
  else if (id === 'llamada')
    inner = svg(
      '0 0 24 24',
      { width: 40, height: 40 },
      '<path fill="#e6cb85" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"></path>'
    )
  else
    inner = svg(
      '0 0 24 22',
      { width: 44, height: 40 },
      '<rect x="2" y="12" width="4" height="9" fill="#e6cb85"></rect><rect x="8" y="4" width="4" height="17" fill="#e6cb85"></rect><rect x="14" y="9" width="4" height="12" fill="#e6cb85"></rect><rect x="20" y="15" width="3" height="6" fill="#e6cb85"></rect>'
    )
  const slash = svg('0 0 140 80', { width: 140, height: 80, class: 'k-life__slash' }, '<line x1="30" y1="70" x2="110" y2="10" stroke="#e6cb85" stroke-width="4"></line>')
  const el = h('div', 'k-life', {}, [inner, slash])
  el.dataset.life = id
  return el
}

/** Temporizador circular que se actualiza solo (rAF). */
export function liveTimer(x: number, y: number, scale = 1) {
  const len = 2 * Math.PI * 52
  const ring = svg(
    '0 0 120 120',
    { width: 120, height: 120 },
    `<circle cx="60" cy="60" r="52" fill="none" stroke="rgba(201,169,97,0.18)" stroke-width="5"></circle><circle class="k-timer__arc" cx="60" cy="60" r="52" fill="none" stroke="#e6cb85" stroke-width="5" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="0" transform="rotate(-90 60 60)" stroke-linecap="round"></circle>`
  )
  const value = h('div', 'k-timer__value')
  const root = h('div', 'k-timer', { left: x, top: y, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: '0 0' }, [ring, value])
  const arc = ring.querySelector('.k-timer__arc') as SVGCircleElement
  return {
    root,
    tick(s: GameState) {
      const t = s.quiz.timer
      const cur = s.quiz.current
      const show = t.enabled && !!cur && cur.phase !== 'revealed' && (t.endsAt !== null || t.remainingMs !== null || cur.shown > 0)
      root.style.display = show ? '' : 'none'
      if (!show) return
      const total = t.seconds * 1000
      const left = t.endsAt !== null ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs ?? total
      const secs = Math.ceil(left / 1000)
      if (value.textContent !== String(secs)) value.textContent = String(secs)
      arc.setAttribute('stroke-dashoffset', (len * (1 - left / total)).toFixed(1))
      arc.setAttribute('stroke', left <= 5000 && left > 0 ? '#f4b552' : left === 0 ? '#d4483b' : '#e6cb85')
    }
  }
}

export function imageBox(box: Box) {
  const img = h('img')
  img.alt = ''
  const root = h('div', 'k-qimage is-off', { left: box.x, top: box.y, width: box.w, height: box.h }, [img])
  let src = ''
  return {
    root,
    set(file: string | undefined, visible: boolean) {
      const next = file ? `konk-media://imagenes/${encodeURIComponent(file)}` : ''
      if (next !== src) {
        src = next
        if (next) img.src = next
        else img.removeAttribute('src')
      }
      root.classList.toggle('is-off', !(visible && !!file))
    }
  }
}

// ---------------------------------------------------------------- escena de pregunta

export interface CamGeo {
  slot: ContestantId
  cam: Box
  plate: Box
  c: number
  nameSize?: number
}

export function camGeometry(s: GameState, kind: Kind, camH0?: number, plateY0?: number): CamGeo[] {
  const order = contestantOrder(s)
  const n = playerCount(s.layout)
  const sino = kind === 'sino'
  const camH = camH0 ?? (sino ? 560 : 600)
  const plateY = plateY0 ?? (sino ? 572 : 612)
  const ids = order.slice(0, n)
  const xs: Record<number, number[]> = { 1: [370], 2: [100, 980], 3: [100, 687, 1274], 4: [100, 539, 978, 1417] }
  const ws: Record<number, number> = { 1: 1180, 2: 840, 3: 546, 4: 403 }
  const pw: Record<number, number> = { 1: 600, 2: 560, 3: 480, 4: 351 }
  return ids.map((slot, i) => {
    const x = xs[n][i]
    const w = ws[n]
    return {
      slot,
      cam: { x, y: 40, w, h: camH },
      plate: { x: x + (w - pw[n]) / 2, y: plateY, w: pw[n], h: 56 },
      c: n === 4 ? 22 : 24,
      nameSize: n >= 4 ? 26 : n === 3 ? 28 : undefined
    }
  })
}

export function optionStates(s: GameState): { text: string; state: '' | 'ok' | 'ko' | 'locked'; visible: boolean }[] {
  const cur = s.quiz.current
  if (!cur) return []
  const q = cur.question
  const failed = new Set(cur.attempts.filter((a) => !a.correct).map((a) => a.pick))
  if (cur.mode === 'all') {
    // nadie ve las respuestas hasta revelar
    return q.opciones.map((text, i) => ({
      text: cur.hidden.includes(i) ? '' : text,
      state: cur.phase === 'revealed' ? (i === q.correcta ? 'ok' : failed.has(i) ? 'ko' : '') : '',
      visible: i < cur.shown || cur.phase === 'revealed'
    }))
  }
  return q.opciones.map((text, i) => {
    let state: '' | 'ok' | 'ko' | 'locked' = ''
    if (cur.phase === 'revealed' && i === q.correcta) state = 'ok'
    else if (failed.has(i)) state = 'ko'
    else if (cur.phase === 'locked' && cur.picked === i) state = 'locked'
    const removed = cur.hidden.includes(i)
    return { text: removed ? '' : text, state, visible: i < cur.shown || cur.phase === 'revealed' }
  })
}

/** Clave de turno de un marco: el concursante, o su equipo en la plantilla de equipos. */
export function keyForSlot(s: GameState, slot: ContestantId): string {
  if (s.layout !== 'teams') return slot
  return 't' + (s.contestants.find((c) => c.id === slot)?.team ?? 0)
}

/** Chip de respuesta en la placa de un concursante. */
export function chipFor(s: GameState, slot: ContestantId): { text: string; cls: string } {
  const cur = s.quiz.current
  if (!cur) return { text: '', cls: '' }
  const label = (i: number) => (cur.question.tipo === 'sino' ? cur.question.opciones[i].toUpperCase() : 'ABCD'[i])
  if (cur.mode === 'all') {
    const key = keyForSlot(s, slot)
    if (cur.phase === 'revealed') {
      const att = cur.attempts.find((a) => a.target && targetKey(a.target) === key)
      return att ? { text: label(att.pick), cls: att.correct ? 'k-chip--ok' : 'k-chip--ko' } : { text: '', cls: '' }
    }
    if (key in cur.answers) return { text: 'DIAMOND', cls: 'k-chip--lock' }
    return cur.phase === 'question' ? { text: '', cls: '' } : { text: '…', cls: '' }
  }
  const mine = (t: Target | null) => membersOf(s, t).includes(slot)
  const isTarget = mine(cur.target)
  if (isTarget) {
    if (cur.phase === 'locked' && cur.picked !== null) return { text: label(cur.picked), cls: 'k-chip--lock' }
    if (cur.phase === 'revealed') {
      const last = [...cur.attempts].reverse().find((a) => mine(a.target))
      if (last) return { text: label(last.pick), cls: last.correct ? 'k-chip--ok' : 'k-chip--ko' }
    }
    if (cur.phase === 'options' || cur.phase === 'question') return { text: '…', cls: '' }
  }
  const att = [...cur.attempts].reverse().find((a) => mine(a.target))
  if (att) return { text: label(att.pick), cls: att.correct ? 'k-chip--ok' : 'k-chip--ko' }
  return { text: '', cls: '' }
}

export function buildQuizScene(s: GameState): Scene {
  const key = quizSceneKey(s)
  if (showsLadderResult(s)) return buildResultScene(s, key)
  const kind = quizKind(s)
  if (kind === 'quien') return buildQuienScene(s, key)
  if (kind === 'estimacion') return buildEstimationScene(s, key)
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const q = s.quiz.current?.question
  const nOpts = q?.opciones.length ?? 4
  const sino = kind === 'sino'

  // cámaras + placas
  const plates: { slots: ContestantId[]; plate: PlateEl }[] = []
  let imgBox: Box
  let ladderEls: { rungs: HTMLDivElement[]; lifes: HTMLDivElement[] } | null = null
  if (kind === 'ladder') {
    const members = membersOf(s, s.quiz.ladder.target)
    const cams = members.length === 2 ? [{ x: 100, w: 585 }, { x: 695, w: 585 }] : [{ x: 100, w: 1180 }]
    members.slice(0, cams.length).forEach((slot, i) => {
      const f = camFrame({ x: cams[i].x, y: 40, w: cams[i].w, h: 600 }, slot)
      frames.set(slot, f)
      root.append(f.root)
    })
    const plate = quizPlate({ x: 390, y: 612, w: 600, h: 56 }, 24)
    plates.push({ slots: members, plate })
    root.append(plate.root)
    imgBox = { x: 100, y: 40, w: 1180, h: 600 }

    const lifeRow = h('div', 'k-abs', { left: 1340, top: 40, width: 480, display: 'flex', justifyContent: 'space-between' })
    const lifes = LIFELINES.map((l) => lifelineEl(l.id))
    lifeRow.append(...lifes)
    const box = h('div', 'k-ladder', { left: 1340, top: 146, width: 480, height: 494 })
    const levels = s.quiz.ladder.levels
    const rungs = levels
      .map((_, i) => {
        const r = h('div', 'k-rung', {}, [
          h('span', 'k-rung__n', {}, [String(i + 1)]),
          h('span', 'k-rung__d', {}, [svg('0 0 10 10', { width: 10, height: 10 }, DIAMOND)]),
          h('span', 'k-rung__v')
        ])
        r.style.fontSize = levels.length > 18 ? '19px' : ''
        return r
      })
      .reverse()
    box.append(...rungs)
    root.append(lifeRow, box)
    ladderEls = { rungs: rungs.reverse(), lifes }
  } else {
    const geo = camGeometry(s, kind)
    for (const g of geo) {
      const f = camFrame(g.cam, g.slot)
      frames.set(g.slot, f)
      const plate = quizPlate(g.plate, g.c, g.nameSize)
      plates.push({ slots: [g.slot], plate })
      root.append(f.root, plate.root)
    }
    imgBox = { x: 460, y: 40, w: 1000, h: kind === 'sino' ? 560 : 600 }
  }

  // pregunta + opciones
  const qText = h('span', 'k-question', sino ? { fontSize: 42 } : undefined)
  let opts: OptEl[]
  if (sino) {
    root.append(h('div', 'k-track', { top: 723 }), h('div', 'k-track', { top: 904 }))
    root.append(bevelBar({ box: { x: 100, y: 668, w: 1720, h: 110 }, c: 46, center: true }, [qText]))
    opts = [0, 1].map((i) => optionBar('', { x: i ? 980 : 100, y: 838, w: 840, h: 132 }, 56, true))
  } else {
    root.append(h('div', 'k-track', { top: 751 }), h('div', 'k-track', { top: 866 }), h('div', 'k-track', { top: 960 }))
    root.append(bevelBar({ box: { x: 100, y: 700, w: 1720, h: 104 }, c: 44, center: true }, [qText]))
    opts = Array.from({ length: Math.min(4, nOpts) }, (_, i) =>
      optionBar('ABCD'[i], { x: i % 2 ? 970 : 100, y: i < 2 ? 828 : 922, w: 850, h: 78 }, 34, false)
    )
  }
  root.append(...opts.map((o) => o.root))

  const image = imageBox(imgBox)
  root.append(image.root)

  const n = playerCount(s.layout)
  const timer =
    kind === 'ladder' ? liveTimer(1160, 520) : n === 2 ? liveTimer(900, 560) : liveTimer(1702, sino ? 680 : 710, 0.8)
  root.append(timer.root)

  const update = (st: GameState) => {
    const cur = st.quiz.current
    qText.textContent = cur && cur.phase !== 'ready' ? cur.question.enunciado : ''
    optionStates(st).forEach((o, i) => opts[i]?.set(o.text, o.state, o.visible))
    image.set(cur?.question.imagen, !!cur?.showImage && cur.phase !== 'ready')
    const turn = turnSlots(st)
    for (const [slot, f] of frames) f.root.classList.toggle('is-turn', turn.has(slot))

    if (kind === 'ladder') {
      const l = st.quiz.ladder
      const p = plates[0].plate
      const chip = cur && cur.phase === 'locked' && cur.picked !== null ? 'ABCD'[cur.picked] : ''
      const resChip = cur && cur.phase === 'revealed' && cur.attempts.length ? cur.attempts[cur.attempts.length - 1] : null
      p.set(
        targetName(st, l.target),
        formatPoints(ladderBank(l.levels, l.level)),
        resChip ? 'ABCD'[resChip.pick] : chip,
        resChip ? (resChip.correct ? 'k-chip--ok' : 'k-chip--ko') : chip ? 'k-chip--lock' : ''
      )
      ladderEls!.rungs.forEach((r, i) => {
        const lv = l.levels[i]
        ;(r.lastElementChild as HTMLElement).textContent = formatPoints(lv.value)
        r.classList.toggle('is-safe', lv.safe)
        r.classList.toggle('is-cur', i === l.level && !l.outcome)
        r.classList.toggle('is-passed', i < l.level)
      })
      ladderEls!.lifes.forEach((el) => el.classList.toggle('is-used', !!l.used[el.dataset.life as LifelineId]))
    } else {
      for (const { slots, plate } of plates) {
        const slot = slots[0]
        const c = st.contestants.find((x) => x.id === slot)
        const chip = chipFor(st, slot)
        const score = st.layout === 'teams' && c ? st.teams[c.team].score : c?.score ?? 0
        plate.set(c?.name ?? '', formatPoints(score), chip.text, chip.cls)
      }
    }
  }
  update(s)
  return { key, root, frames, update, tick: (st: GameState) => timer.tick(st) }
}

// ---------------------------------------------------------------- pantalla final de la escalera

function buildResultScene(s: GameState, key: string): Scene {
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const l = s.quiz.ladder
  const members = membersOf(s, l.target)
  const cams = members.length === 2 ? [{ x: 100, w: 545 }, { x: 655, w: 545 }] : [{ x: 100, w: 1100 }]
  members.slice(0, cams.length).forEach((slot, i) => {
    const f = camFrame({ x: cams[i].x, y: 100, w: cams[i].w, h: 700 }, slot)
    f.root.classList.add('is-winner')
    frames.set(slot, f)
    root.append(f.root)
  })

  const caption = h('span', 'k-caption', { fontSize: 26, letterSpacing: '0.34em', color: '#e6cb85', whiteSpace: 'nowrap' })
  root.append(
    h('div', 'k-headline', { left: 100, top: 40, width: 1100 }, [
      h('span', 'k-headline__line', { background: 'linear-gradient(90deg, transparent, #c9a961)' }),
      svg('0 0 10 10', { width: 18, height: 18 }, DIAMOND),
      caption,
      svg('0 0 10 10', { width: 18, height: 18 }, DIAMOND),
      h('span', 'k-headline__line', { background: 'linear-gradient(90deg, #c9a961, transparent)' })
    ])
  )
  const name = h('span', 'k-name', { fontSize: 44, letterSpacing: '0.12em' })
  const prize = h('span', 'k-score', { fontSize: 48 })
  root.append(bevelBar({ box: { x: 250, y: 760, w: 800, h: 84 }, c: 34 }, [name, prize]))

  const big = h('span', 'k-infobox__big')
  const label1 = h('span', 'k-caption')
  const level = h('span', 'k-infobox__mid')
  root.append(
    h('div', 'k-infobox', { left: 1260, top: 100, width: 560, height: 700 }, [
      label1,
      big,
      h('span', 'k-caption', { color: '#8e9ab3' }, ['puntos']),
      h('div', 'k-infobox__rule'),
      h('span', 'k-caption k-caption--muted', {}, ['Escalón alcanzado']),
      level
    ])
  )

  const kicker = h('span', 'k-caption', { fontSize: 17 })
  const title = h('span', 'k-lower__title')
  root.append(
    h('div', 'k-track', { top: 968 }),
    bevelBar({ box: { x: 100, y: 920, w: 1720, h: 98 }, c: 40 }, [
      h('span', 'k-logo', { fontSize: 36 }, ['KONKURSOX']),
      h('span', 'k-lower__sep'),
      h('div', 'k-lower__titles', {}, [kicker, title])
    ], { gap: 32 })
  )

  const update = (st: GameState) => {
    const lad = st.quiz.ladder
    const o = lad.outcome
    const who = targetName(st, lad.target)
    const amount = formatPoints(o?.prize ?? 0)
    const headline = o?.kind === 'won' ? 'Ha ganado la escalera' : o?.kind === 'walked' ? 'Se planta' : o?.kind === 'failed' ? 'Fin del juego' : 'Escalera'
    caption.textContent = headline
    name.textContent = who
    prize.textContent = amount
    big.textContent = amount
    big.style.fontSize = amount.length > 9 ? '96px' : ''
    label1.textContent = o?.kind === 'failed' ? 'Cae al escalón seguro' : 'Se lleva'
    const reached = o?.kind === 'won' ? lad.levels.length : lad.level
    level.textContent = `${reached} de ${lad.levels.length}`
    kicker.textContent = 'Escalera de premios'
    title.textContent =
      o?.kind === 'won'
        ? `${who} completa la escalera`
        : o?.kind === 'walked'
          ? `${who} se planta con ${amount} puntos`
          : o?.kind === 'failed'
            ? `${who} se lleva ${amount} puntos`
            : who
  }
  update(s)
  return { key, root, frames, update }
}
