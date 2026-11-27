// Plano "Sin cámaras" (modo salón): los juegos sin marcos de cámara, con la pregunta y las opciones
// más grandes y una fila de placas con los puntos (el turno resaltado). Rosco: dos roscos grandes.
import { formatNumber } from '../../shared/games'
import { formatPoints, ladderBank, targetFromKey } from '../../shared/quiz'
import { ROSCO_ALPHABET } from '../../shared/questions'
import { remainingMs, roscoStats, roscoWinners, type RoscoPlayer } from '../../shared/rosco'
import { activeContestants } from '../../shared/scene'
import type { ContestantId, GameState, SlotId } from '../../shared/types'
import { bevelBar, emblem, h, svg, type CamFrameEl } from '../ds/components'
import {
  chipFor,
  DIAMOND,
  flowLayout,
  imageBox,
  type FlowItem,
  keyForSlot,
  lifelineEl,
  liveTimer,
  optionBar,
  optionStates,
  quizPlate,
  targetName,
  turnSlots,
  type OptEl,
  type PlateEl
} from './quizScenes'
import type { Scene } from './scenes'

type SalonKind = 'test' | 'sino' | 'quien' | 'ladder' | 'estimacion' | 'rosco'

function salonKind(s: GameState): SalonKind {
  if (s.liveGame === 'rosco') return 'rosco'
  const cur = s.quiz.current
  if (s.quiz.ladder.active && cur?.ladderLevel !== null && cur?.ladderLevel !== undefined) return 'ladder'
  const t = cur?.question.tipo
  return t === 'sino' || t === 'quien' || t === 'estimacion' ? t : 'test'
}

/** Placas de la fila inferior: un concursante por placa (o un equipo en la plantilla de equipos). */
function plateIds(s: GameState): { key: string; slots: ContestantId[] }[] {
  if (s.layout === 'teams') return s.teams.map((_, i) => ({ key: 't' + i, slots: activeContestants(s).filter((id) => s.contestants.find((c) => c.id === id)?.team === i) }))
  // solo los que juegan (Ajustes: número de concursantes)
  return activeContestants(s).map((id) => ({ key: id, slots: [id] }))
}

export function salonKey(s: GameState): string {
  const k = salonKind(s)
  if (k === 'rosco') return `salon:rosco:${s.rosco.players.length}:${s.rosco.players.map((p) => p.letters.length).join(',')}`
  const n = s.quiz.current?.question.opciones.length ?? 4
  return `salon:${k}:${n}:${s.layout}:${plateIds(s)
    .map((p) => p.key)
    .join(',')}:${s.quiz.ladder.levels.length}:${s.quiz.lifelines.map((l) => l.id + l.icon).join(',')}`
}

export function buildSalonScene(s: GameState): Scene {
  return salonKind(s) === 'rosco' ? buildSalonRosco(s) : buildSalonQuiz(s)
}

/** Logotipo pequeño arriba a la izquierda: sin cámaras, el plató sigue siendo el programa. */
function corner(label: string): HTMLDivElement {
  return h('div', 'k-abs', { left: 100, top: 46, display: 'flex', alignItems: 'center', gap: 18 }, [
    emblem(16),
    h('span', 'k-logo', { fontSize: 34, lineHeight: '40px' }, ['KONKURSOX']),
    h('span', 'k-caption k-caption--muted', { fontSize: 18, marginLeft: 8 }, [label])
  ])
}
const LABELS: Record<string, string> = { test: 'Tipo test', sino: 'Sí o no', quien: '¿Quién lo dijo?', ladder: 'Escalera', estimacion: 'Estimación' }

// ---------------------------------------------------------------- juegos de preguntas

function buildSalonQuiz(s: GameState): Scene {
  const key = salonKey(s)
  const kind = salonKind(s)
  const root = h('div', 'k-stage k-salon k-enter')
  const frames = new Map<SlotId, CamFrameEl>()
  root.append(corner(LABELS[kind] ?? ''))
  const n = Math.max(2, Math.min(4, s.quiz.current?.question.opciones.length ?? 4))
  const ladder = kind === 'ladder'
  // ancho de la pregunta y las opciones: normal, y con la imagen a la vista (se encogen y la imagen ocupa
  // el hueco grande de la derecha; en la escalera, la pregunta deja sitio al marco a su derecha)
  const W0 = ladder ? 1180 : 1720
  const W1 = ladder ? 1180 : 1060
  const QW0 = W0
  const QW1 = ladder ? 720 : W1
  const flow: FlowItem[] = []

  // pregunta
  const qText = h('span', kind === 'quien' ? 'k-quote' : 'k-question')
  const qCap = kind === 'quien' ? h('span', 'k-caption', { position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center' }, ['¿Quién lo dijo?']) : null
  const qh = kind === 'estimacion' ? 230 : 270
  const qBar = bevelBar({ box: { x: 100, y: 130, w: QW0, h: qh }, c: 64, center: true }, qCap ? [qCap, qText] : [qText])
  root.append(qBar)
  flow.push({ el: qBar, normal: { x: 100, y: 130, w: QW0, h: qh }, small: { x: 100, y: 130, w: QW1, h: qh } })

  // opciones
  let opts: OptEl[] = []
  if (kind === 'sino') {
    root.append(h('div', 'k-track', { top: 560 }))
    const sinoBox = (w: number, i: number) => {
      const sw = Math.round((w - 30) / 2)
      return { x: i ? 100 + sw + 30 : 100, y: 445, w: sw, h: 230 }
    }
    opts = [0, 1].map((i) => optionBar('', sinoBox(W0, i), 80, true))
    opts.forEach((o, i) => flow.push({ el: o.root, normal: sinoBox(W0, i), small: sinoBox(W1, i) }))
  } else if (kind !== 'estimacion') {
    const oh = ladder ? 112 : 130
    const y0 = ladder ? 440 : 450
    const optBox = (w: number, i: number) => {
      const ow = Math.round((w - 30) / 2)
      return { x: 100 + (i % 2) * (ow + 30), y: y0 + (i < 2 ? 0 : oh + 24), w: ow, h: oh }
    }
    root.append(h('div', 'k-track', { top: y0 + oh / 2 }), h('div', 'k-track', { top: y0 + oh + 24 + oh / 2 }))
    opts = Array.from({ length: n }, (_, i) => optionBar('ABCD'[i], optBox(W0, i), 46, false, kind === 'quien'))
    if (!ladder) opts.forEach((o, i) => flow.push({ el: o.root, normal: optBox(W0, i), small: optBox(W1, i) }))
  }
  root.append(...opts.map((o) => o.root))

  // estimación: la respuesta y quién se acerca más
  let est: { value: HTMLSpanElement; close: HTMLSpanElement; bar: HTMLDivElement } | null = null
  if (kind === 'estimacion') {
    const value = h('span', 'k-est__value', { fontSize: 110 })
    const close = h('span', '', { fontSize: 38, fontWeight: 600, whiteSpace: 'nowrap' })
    const estBox = { x: 260, y: 420, w: 1400, h: 260 }
    const bar = bevelBar({ box: estBox, c: 80, center: true }, [h('span', 'k-caption', {}, ['Respuesta']), value, close], {
      flexDirection: 'column',
      gap: 6
    })
    flow.push({ el: bar, normal: estBox, small: { x: 100, y: 420, w: W1, h: 260 } })
    bar.classList.add('k-opt')
    root.append(h('div', 'k-track', { top: 550 }), bar)
    est = { value, close, bar }
  }

  // escalera a la derecha + comodines; la placa del concursante abajo
  let ladderEls: { rungs: HTMLDivElement[]; lifes: HTMLDivElement[]; plate: PlateEl } | null = null
  if (ladder) {
    const defs = s.quiz.lifelines
    const lw = Math.min(140, Math.floor((480 - 10 * Math.max(0, defs.length - 1)) / Math.max(1, defs.length)))
    const lifes = defs.map((l) => lifelineEl(l, lw))
    const lifeRow = h('div', 'k-abs', { left: 1340, top: 40, width: 480, display: 'flex', gap: '10px', justifyContent: defs.length >= 3 ? 'space-between' : 'flex-start' }, lifes)
    const box = h('div', 'k-ladder', { left: 1340, top: 146, width: 480, height: 894 })
    const levels = s.quiz.ladder.levels
    const rungs = levels.map((_, i) => {
      const r = h('div', 'k-rung', {}, [h('span', 'k-rung__n', {}, [String(i + 1)]), h('span', 'k-rung__d', {}, [svg('0 0 10 10', { width: 10, height: 10 }, DIAMOND)]), h('span', 'k-rung__v')])
      r.style.fontSize = levels.length > 18 ? '22px' : '28px'
      return r
    })
    box.append(...[...rungs].reverse())
    const plate = quizPlate({ x: 100, y: 880, w: 1180, h: 110 }, 44, 50)
    plate.root.classList.add('k-salon-plate', 'k-salon-plate--chip')
    root.append(lifeRow, box, plate.root)
    ladderEls = { rungs, lifes, plate }
  }

  // fila de placas (todos menos la escalera)
  const plates: { key: string; slots: ContestantId[]; plate: PlateEl; tag: HTMLDivElement; badge: HTMLSpanElement }[] = []
  if (!ladder) {
    const ids = plateIds(s)
    const gap = 30
    const pw = Math.min(620, (1720 - gap * (ids.length - 1)) / Math.max(1, ids.length))
    const total = ids.length * pw + gap * (ids.length - 1)
    const x0 = 100 + (1720 - total) / 2
    ids.forEach((p, i) => {
      const x = Math.round(x0 + i * (pw + gap))
      const plate = quizPlate({ x, y: 890, w: Math.round(pw), h: 104 }, 40, ids.length >= 5 ? 24 : ids.length === 4 ? 28 : ids.length === 3 ? 34 : 40)
      plate.root.classList.add('k-salon-plate')
      // letrero "Turno" encima de la placa del que responde
      const tag = h('div', 'k-salon-tag', { left: x, top: 838, width: Math.round(pw) }, ['Turno'])
      // la respuesta (o la cifra) va en una insignia sobre la placa: el nombre se queda con todo el ancho
      const badge = h('span', 'k-chip k-salon-badge', { left: x + Math.round(pw) - 130, top: 812 })
      plates.push({ ...p, plate, tag, badge })
      root.append(tag, plate.root, badge)
    })
  }

  const timer = liveTimer(ladder ? 1170 : 1700, 18, 0.8)
  root.append(timer.root)
  // imagen: a la derecha (sin tapar la pregunta ni las opciones); en la escalera, junto a la pregunta
  const image = imageBox(ladder ? { x: 850, y: 130, w: 430, h: 270 } : { x: 100 + W1 + 40, y: 130, w: 1820 - (100 + W1 + 40), h: 680 })
  root.append(image.root, image.full)
  const layout = flowLayout(flow)

  const update = (st: GameState) => {
    const img = image.set(st)
    layout.apply(img.on, img.wait)
    const cur = st.quiz.current
    const text = cur && cur.phase !== 'ready' ? cur.question.enunciado : ''
    qText.textContent = kind === 'quien' && text ? `«${text}»` : text
    const len = text.length
    qText.style.fontSize =
      kind === 'quien' ? (len > 140 ? '46px' : len > 80 ? '56px' : '66px') : ladder ? (len > 150 ? '38px' : len > 90 ? '44px' : '54px') : len > 150 ? '50px' : len > 90 ? '58px' : '68px'
    optionStates(st).forEach((o, i) => opts[i]?.set(o.text, o.state, o.visible))
    const turn = turnSlots(st)

    if (ladderEls) {
      const l = st.quiz.ladder
      const chip = cur && cur.phase === 'locked' && cur.picked !== null ? 'ABCD'[cur.picked] : ''
      const res = cur && cur.phase === 'revealed' && cur.attempts.length ? cur.attempts[cur.attempts.length - 1] : null
      ladderEls.plate.set(
        targetName(st, l.target),
        formatPoints(ladderBank(l.levels, l.level)),
        res ? 'ABCD'[res.pick] : chip,
        res ? (res.correct ? 'k-chip--ok' : 'k-chip--ko') : chip ? 'k-chip--lock' : ''
      )
      ladderEls.rungs.forEach((r, i) => {
        const lv = l.levels[i]
        ;(r.lastElementChild as HTMLElement).textContent = formatPoints(lv.value)
        r.classList.toggle('is-safe', lv.safe)
        r.classList.toggle('is-cur', i === l.level && !l.outcome)
        r.classList.toggle('is-passed', i < l.level)
      })
      ladderEls.lifes.forEach((el) => el.classList.toggle('is-used', !!l.used[el.dataset.life ?? '']))
    }

    let winners = new Set<string>()
    if (est && cur) {
      const q = cur.question
      const unit = q.unidad ? ` ${q.unidad}` : ''
      const revealed = cur.phase === 'revealed'
      est.bar.classList.toggle('is-off', !revealed)
      const t = revealed && cur.revealedAt ? Math.min(1, (Date.now() - cur.revealedAt) / 2000) : 0
      const k = 1 - Math.pow(1 - t, 3)
      const answer = q.valor ?? 0
      est.value.textContent = revealed ? (t >= 1 ? formatNumber(answer) : formatNumber(answer * k, Number.isInteger(answer) ? 0 : 2)) + unit : ''
      const res = cur.estimation
      if (res && t >= 1) {
        winners = new Set(res.winners)
        const w = res.rows.filter((r) => r.rank === 1)
        est.close.textContent = w.length ? `Más cerca: ${w.map((r) => targetName(st, targetFromKey(r.key))).join(' y ')} · a ${formatNumber(w[0].diff)}${unit}` : 'Todos se pasan'
      } else est.close.textContent = ''
    }

    for (const { key: k, slots, plate, tag, badge } of plates) {
      const name = k.startsWith('t') ? (st.teams[Number(k.slice(1))]?.name ?? '') : (st.contestants.find((c) => c.id === k)?.name ?? '')
      const score = k.startsWith('t') ? (st.teams[Number(k.slice(1))]?.score ?? 0) : (st.contestants.find((c) => c.id === k)?.score ?? 0)
      if (kind === 'estimacion') {
        const g = slots[0] ? cur?.guesses[keyForSlot(st, slots[0])] : undefined
        const showG = cur?.phase === 'revealed' || !!cur?.showGuesses
        plate.set(name, formatPoints(score), '', '')
        setBadge(badge, g === undefined || !showG ? '' : formatNumber(g), 'k-salon-badge--num')
        plate.root.classList.toggle('is-ok', slots[0] ? winners.has(keyForSlot(st, slots[0])) : false)
      } else {
        const chip = slots[0] ? chipFor(st, slots[0]) : { text: '', cls: '' }
        plate.set(name, formatPoints(score), '', '')
        setBadge(badge, chip.text, chip.cls)
      }
      const on = slots.some((x) => turn.has(x)) && cur?.mode !== 'all' && kind !== 'estimacion'
      plate.root.classList.toggle('k-salon-turn', on)
      tag.classList.toggle('is-on', on)
    }
  }
  update(s)
  return {
    key,
    root,
    frames,
    update,
    tick: (st) => {
      timer.tick(st)
      // el contador de la estimación al revelar
      if (est && st.quiz.current?.phase === 'revealed' && st.quiz.current.revealedAt && Date.now() - st.quiz.current.revealedAt < 2100) update(st)
    }
  }
}

const BADGE_DIAMOND = '<svg viewBox="0 0 10 10" width="20" height="20" aria-hidden="true"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill="#1c1003"></path></svg>'
function setBadge(el: HTMLSpanElement, text: string, cls: string): void {
  if (text === 'DIAMOND') el.innerHTML = BADGE_DIAMOND
  else el.textContent = text
  el.className = `k-chip k-salon-badge ${text ? 'is-on' : ''} ${cls}`.trim()
}

// ---------------------------------------------------------------- rosco: dos roscos grandes

const secs = (p: RoscoPlayer | undefined) => (p ? Math.ceil(remainingMs(p, Date.now()) / 1000) : 0)

function buildSalonRosco(s: GameState): Scene {
  const key = salonKey(s)
  const root = h('div', 'k-stage k-salon k-enter')
  root.append(corner('Rosco'))
  const ro = s.rosco
  const two = ro.players.length >= 2
  const R = two ? 300 : 340
  const boards = ro.players.slice(0, 2).map((p, i) => {
    const cx = two ? 500 + i * 920 : 960
    const cy = 470
    const wrap = h('div', 'k-abs k-salon-rosco', { left: 0, top: 0, width: 1920, height: 1080, pointerEvents: 'none' })
    wrap.append(h('div', 'k-abs', { left: cx - R - 50, top: cy - R - 50, width: 2 * R + 100, height: 2 * R + 100, borderRadius: '50%', border: '1px solid rgba(201,169,97,0.18)' }))
    const N = p.letters.length || ROSCO_ALPHABET.length
    const letters = p.letters.map((l, j) => {
      const a = -Math.PI / 2 + (j * 2 * Math.PI) / N
      const el = h('div', 'k-lt', { left: Math.round(cx + R * Math.cos(a)), top: Math.round(cy + R * Math.sin(a)) }, [l.letra])
      wrap.append(el)
      return el
    })
    const name = h('span', 'k-name', { fontSize: 34, maxWidth: 2 * R - 140, textAlign: 'center' })
    const time = h('span', 'k-rosco__time', { fontSize: two ? 170 : 190 })
    const cap = h('span', 'k-caption k-caption--muted', { fontSize: 18 })
    const ok = h('span', '', { color: '#7ddca1' })
    const ko = h('span', '', { color: '#f08a80' })
    const pend = h('span', '', { color: 'var(--k-text-muted)' })
    const stats = h('span', '', { fontSize: 28, fontWeight: 600, display: 'flex', gap: 22 }, [ok, ko, pend])
    wrap.append(
      h('div', 'k-abs', { left: cx - R + 60, top: cy - 190, width: 2 * R - 120, height: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }, [
        name,
        time,
        cap,
        stats
      ])
    )
    root.append(wrap)
    return { wrap, letters, name, time, cap, ok, ko, pend }
  })

  // definición
  const lead = h('span', 'k-caption', { fontSize: 18 })
  const big = h('span', 'k-rosco__letter')
  const def = h('span', 'k-question', { fontSize: 44 })
  root.append(h('div', 'k-track', { top: 960 }), bevelBar({ box: { x: 100, y: 890, w: 1720, h: 140 }, c: 52 }, [h('span', 'k-rosco__lead', {}, [lead, big]), def], { gap: 30 }))

  const update = (st: GameState) => {
    const r = st.rosco
    r.players.slice(0, 2).forEach((p, i) => {
      const b = boards[i]
      if (!b) return
      const isTurn = i === r.turn && !r.finished
      b.wrap.style.opacity = isTurn || r.finished || !two ? '1' : '0.5'
      p.letters.forEach((l, j) => {
        const el = b.letters[j]
        if (el) el.className = `k-lt k-lt--${isTurn && j === p.current && !p.done ? 'cur' : l.status}`
      })
      b.name.textContent = targetName(st, p.target)
      b.time.textContent = String(secs(p))
      const ps = roscoStats(p)
      b.ok.textContent = `${ps.ok} ✓`
      b.ko.textContent = `${ps.ko} ✗`
      b.pend.textContent = `${ps.pending} pendientes`
      b.cap.textContent = p.timeUp ? 'tiempo agotado' : p.done ? 'terminado' : isTurn ? (p.endsAt !== null ? 'segundos · en juego' : 'segundos · en pausa') : 'segundos'
    })
    const p = r.players[r.turn]
    if (!p) return
    if (r.finished) {
      const w = roscoWinners(r)
      const names = w.map((i) => targetName(st, r.players[i].target))
      const best = roscoStats(r.players[w[0]])
      lead.textContent = 'Fin'
      big.style.display = 'none'
      def.textContent =
        r.players.length === 1
          ? `${names[0]} termina el rosco con ${best.ok} ${best.ok === 1 ? 'acierto' : 'aciertos'}`
          : w.length > 1
            ? `Empate a ${best.ok} aciertos y ${best.ko} fallos`
            : `Gana ${names[0]} con ${best.ok} ${best.ok === 1 ? 'acierto' : 'aciertos'}`
    } else if (p.timeUp) {
      lead.textContent = ''
      big.style.display = 'none'
      def.textContent = `Tiempo agotado para ${targetName(st, p.target)}`
    } else {
      const l = p.letters[p.current]
      big.style.display = ''
      lead.textContent = l?.modo === 'contiene' ? 'Contiene la' : 'Con la'
      big.textContent = l?.letra ?? ''
      def.textContent = l?.definicion ?? ''
    }
  }
  update(s)
  return {
    key,
    root,
    frames: new Map(),
    update,
    tick: (st) => st.rosco.players.slice(0, 2).forEach((p, i) => boards[i] && (boards[i].time.textContent = String(secs(p))))
  }
}
