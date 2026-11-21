// Escenas de "¿Quién lo dijo?" y "Estimación · revelado" (según design/KONKURSOX 2.html).
import { formatNumber, niceScale, tickLabel } from '../../shared/games'
import { playerCount } from '../../shared/order'
import { formatPoints, targetFromKey } from '../../shared/quiz'
import type { ContestantId, GameState, SlotId } from '../../shared/types'
import { bevelBar, camFrame, h, svg, type CamFrameEl } from '../ds/components'
import { camGeometry, chipFor, DIAMOND, keyForSlot, liveTimer, optionBar, optionStates, quizPlate, targetName, turnSlots, type PlateEl } from './quizScenes'
import type { Scene } from './scenes'

const plateScore = (st: GameState, slot: ContestantId): number => {
  const c = st.contestants.find((x) => x.id === slot)
  return st.layout === 'teams' && c ? st.teams[c.team].score : c?.score ?? 0
}

// ---------------------------------------------------------------- ¿Quién lo dijo?

export function buildQuienScene(s: GameState, key: string): Scene {
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const plates: { slot: ContestantId; plate: PlateEl }[] = []
  for (const g of camGeometry(s, 'test', 450, 464)) {
    const f = camFrame(g.cam, g.slot)
    frames.set(g.slot, f)
    const plate = quizPlate({ ...g.plate, h: 54 }, 22, playerCount(s.layout) >= 3 ? (playerCount(s.layout) === 3 ? 28 : 26) : undefined)
    plates.push({ slot: g.slot, plate })
    root.append(f.root, plate.root)
  }

  // caja de la cita
  const quote = h('span', 'k-quote')
  const photo = h('img', 'k-quien__photo')
  photo.alt = ''
  const metaText = h('span')
  const meta = h('span', 'k-quien__meta', {}, [h('span', 'k-quien__rule'), photo, metaText, h('span', 'k-quien__rule')])
  root.append(
    h('div', 'k-quien', { left: 100, top: 560, width: 1720, height: 300 }, [
      h('div', 'k-quien__in', {}, [
        h('span', 'k-caption', { position: 'absolute', top: 26 }, ['¿Quién lo dijo?']),
        h('span', 'k-quien__mark', { left: 60, top: 30 }, ['“']),
        h('span', 'k-quien__mark', { right: 60, top: 130 }, ['”']),
        quote,
        meta
      ])
    ])
  )

  // opciones
  const n = Math.max(2, Math.min(4, s.quiz.current?.question.opciones.length ?? 4))
  const total = n * 415 + (n - 1) * 20
  const x0 = n === 4 ? 100 : Math.round((1920 - total) / 2)
  root.append(h('div', 'k-track', { top: 939 }))
  const opts = Array.from({ length: n }, (_, i) => optionBar('ABCD'[i], { x: x0 + i * 435, y: 900, w: 415, h: 80 }, 32, false, true))
  root.append(...opts.map((o) => o.root))

  const timer = playerCount(s.layout) === 2 ? liveTimer(900, 380) : liveTimer(1700, 572, 0.8)
  root.append(timer.root)

  const update = (st: GameState) => {
    const cur = st.quiz.current
    const q = cur?.question
    const text = cur && cur.phase !== 'ready' ? q?.enunciado ?? '' : ''
    quote.textContent = text
    quote.style.fontSize = text.length > 140 ? '44px' : text.length > 90 ? '54px' : ''
    const revealed = cur?.phase === 'revealed'
    const person = st.people.find((p) => p.name.trim().toLowerCase() === (q?.autor ?? '').trim().toLowerCase())
    const parts = [q?.autor, q?.fuente, q?.fecha, q?.hora].filter(Boolean)
    metaText.textContent = parts.join(' · ')
    meta.classList.toggle('is-off', !revealed)
    photo.style.display = revealed && person?.photo ? '' : 'none'
    if (person?.photo) photo.src = `konk-media://personas/${encodeURIComponent(person.photo)}`
    optionStates(st).forEach((o, i) => opts[i]?.set(o.text, o.state, o.visible))
    const turn = turnSlots(st)
    for (const [slot, f] of frames) f.root.classList.toggle('is-turn', turn.has(slot))
    for (const { slot, plate } of plates) {
      const c = st.contestants.find((x) => x.id === slot)
      const chip = chipFor(st, slot)
      plate.set(c?.name ?? '', formatPoints(plateScore(st, slot)), chip.text, chip.cls)
    }
  }
  update(s)
  return { key, root, frames, update, tick: (st) => timer.tick(st) }
}

// ---------------------------------------------------------------- Estimación

const REVEAL_MS = 2400
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

export function buildEstimationScene(s: GameState, key: string): Scene {
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const plates: { slot: ContestantId; plate: PlateEl }[] = []
  for (const g of camGeometry(s, 'test', 430, 444)) {
    const f = camFrame(g.cam, g.slot)
    frames.set(g.slot, f)
    const plate = quizPlate(g.plate, 22, playerCount(s.layout) >= 3 ? (playerCount(s.layout) === 3 ? 28 : 26) : undefined)
    plates.push({ slot: g.slot, plate })
    root.append(f.root, plate.root)
  }

  // recta
  const W = 1600
  const line = h('div', 'k-est', { left: 160, top: 548, width: W, height: 150 })
  const ticksEl = h('div', 'k-abs', { inset: 0 })
  const marksEl = h('div', 'k-abs', { inset: 0 })
  const answerLine = h('div', 'k-est__answer')
  line.append(
    h('div', 'k-abs', { left: 0, right: 0, top: 96, height: 2, background: 'linear-gradient(90deg, rgba(201,169,97,0.2), #c9a961 10%, #c9a961 90%, rgba(201,169,97,0.2))' }),
    ticksEl,
    marksEl,
    answerLine
  )
  root.append(line)

  const qText = h('span', 'k-question')
  root.append(h('div', 'k-track', { top: 778 }), bevelBar({ box: { x: 100, y: 730, w: 1720, h: 96 }, c: 42, center: true }, [qText]))

  const ansValue = h('span', 'k-est__value')
  const closeCap = h('span', 'k-caption', { fontSize: 17 })
  const closeText = h('span', '', { fontSize: 34, fontWeight: 600, whiteSpace: 'nowrap' })
  const ansBar = bevelBar(
    { box: { x: 360, y: 864, w: 1200, h: 140 }, c: 56, center: true },
    [h('span', 'k-caption', {}, ['Respuesta']), ansValue, h('span', 'k-est__close', {}, [closeCap, closeText])],
    { gap: 36 }
  )
  ansBar.classList.add('k-opt')
  const ansTrack = h('div', 'k-track', { top: 934 })
  root.append(ansTrack, ansBar)

  let scaleKey = ''
  let scale = { max: 1, step: 1 }
  let doneAnim = false

  const X = (v: number) => Math.max(0, Math.min(W, (v / scale.max) * W))

  const draw = (st: GameState) => {
    const cur = st.quiz.current
    const q = cur?.question
    const answer = q?.valor ?? 0
    const unit = q?.unidad ? ` ${q.unidad}` : ''
    qText.textContent = cur && cur.phase !== 'ready' ? q?.enunciado ?? '' : ''
    const revealed = cur?.phase === 'revealed'
    const guesses = Object.entries(cur?.guesses ?? {})
    const sk = `${answer}|${guesses.map(([k, v]) => k + v).join(',')}|${revealed}`
    if (sk !== scaleKey) {
      scaleKey = sk
      scale = niceScale(Math.max(answer, ...guesses.map(([, v]) => Math.max(0, v))))
      ticksEl.replaceChildren()
      for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
        ticksEl.append(
          h('div', 'k-abs', { left: X(v), top: 90, width: 1, height: 14, background: 'rgba(201,169,97,0.6)' }),
          h('div', 'k-est__tick', { left: X(v), top: 112 }, [tickLabel(v)])
        )
      }
      marksEl.replaceChildren(
        ...guesses.map(([k, v]) => {
          const t = targetFromKey(k)
          const name = targetName(st, t)
          const mk = h('div', 'k-est__mark', { left: X(v) }, [h('span', '', {}, [name]), svg('0 0 10 10', { width: 18, height: 18 }, DIAMOND.replace('#e6cb85', '#cfd6e4'))])
          mk.dataset.key = k
          return mk
        })
      )
    }
    line.classList.toggle('is-off', !revealed)
    ansBar.classList.toggle('is-off', !revealed)
    ansTrack.style.opacity = revealed ? '1' : '0'

    // animación del revelado
    const t = revealed && cur?.revealedAt ? Math.min(1, (Date.now() - cur.revealedAt) / REVEAL_MS) : 0
    const k = ease(t)
    answerLine.style.left = `${X(answer) * k}px`
    ansValue.textContent = revealed ? formatNumber(answer * k, Number.isInteger(answer) ? 0 : 2) + unit : ''
    if (t >= 1) ansValue.textContent = formatNumber(answer) + unit
    doneAnim = t >= 1

    const res = cur?.estimation
    const winners = new Set(doneAnim ? res?.winners ?? [] : [])
    for (const mk of Array.from(marksEl.children) as HTMLElement[]) mk.classList.toggle('is-win', winners.has(mk.dataset.key ?? ''))
    closeCap.textContent = st.quiz.estimation.priceIsRight ? 'Más cerca sin pasarse' : 'Más cerca'
    if (res && doneAnim) {
      const w = res.rows.filter((r) => r.rank === 1)
      closeText.textContent = w.length
        ? `${w.map((r) => targetName(st, targetFromKey(r.key))).join(' y ')} · a ${formatNumber(w[0].diff)}${unit}`
        : 'Todos se pasan'
    } else closeText.textContent = ''

    for (const { slot, plate } of plates) {
      const c = st.contestants.find((x) => x.id === slot)
      const gk = keyForSlot(st, slot)
      const g = cur?.guesses[gk]
      const showG = revealed || !!cur?.showGuesses
      plate.set(c?.name ?? '', g === undefined || !showG ? '' : formatNumber(g), '', '')
      plate.root.classList.toggle('is-ok', winners.has(gk))
    }
  }

  draw(s)
  return { key, root, frames, update: draw, tick: (st) => (st.quiz.current?.phase === 'revealed' && !doneAnim ? draw(st) : undefined) }
}
