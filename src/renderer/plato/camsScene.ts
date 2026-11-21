// Escena Cámaras: 1 a 5 personas repartidas por el plató (presentador en medio si hay concursantes a ambos lados).
import { formatPoints } from '../../shared/quiz'
import { camsLineup, camsTemplate } from '../../shared/scene'
import { arrangeFeatured, pipBox } from '../../shared/arrange'
import { LAYOUTS, type Box } from '../../shared/layouts'
import { contestantOrder } from '../../shared/order'
import type { GameState, SlotId } from '../../shared/types'
import { camFrame, lowerThird, namePlate, versus, type CamFrameEl, type NamePlateEl } from '../ds/components'
import { h } from '../ds/components'
import { turnSlots } from './quizScenes'
import type { Scene } from './scenes'

export const camsKey = (s: GameState): string => {
  const t = camsTemplate(s)
  if (t) return `cams:tpl:${t}:${contestantOrder(s).join(',')}`
  return `cams:${camsLineup(s).join(',')}:${s.camsScene.hostMode}:${s.camsScene.corner}`
}

interface Spot {
  slot: SlotId
  cam: Box
  plate: Box
  c: number
  nameSize: number
}

const AREA: Box = { x: 100, y: 56, w: 1720, h: 790 }

/** Dónde va cada persona: plantilla fija, presentador destacado o en esquina, o reparto igual. */
function spots(s: GameState): Spot[] {
  const t = camsTemplate(s)
  if (t) return LAYOUTS[t].slots(contestantOrder(s)).map((x) => ({ slot: x.slot, cam: x.cam, plate: x.bar, c: x.bar.c, nameSize: x.nameSize ?? 30 }))
  const all = camsLineup(s)
  const mode = s.camsScene.hostMode
  const equal = (ids: SlotId[]): Spot[] =>
    camsGeometry(ids.length).map((g, i) => ({ slot: ids[i], cam: { x: g.x, y: 56, w: g.w, h: 790 }, plate: { x: g.x + (g.w - g.plateW) / 2, y: 818, w: g.plateW, h: 58 }, c: 24, nameSize: g.nameSize }))
  if (mode === 'destacado') {
    const placed = arrangeFeatured(all, AREA)
    if (placed)
      return placed.map((p) => {
        const pw = Math.min(p.small ? 440 : 700, p.cam.w - 50)
        return { slot: p.slot, cam: p.cam, plate: { x: p.cam.x + (p.cam.w - pw) / 2, y: p.cam.y + p.cam.h - 28, w: pw, h: p.small ? 50 : 58 }, c: p.small ? 20 : 24, nameSize: p.small ? 24 : 30 }
      })
  }
  if (mode === 'esquina' && all.includes('host') && all.length > 1) {
    const b = pipBox(AREA, s.camsScene.corner)
    return [...equal(all.filter((x) => x !== 'host')), { slot: 'host', cam: b, plate: { x: b.x + 30, y: b.y + b.h - 24, w: b.w - 60, h: 44 }, c: 18, nameSize: 20 }]
  }
  return equal(all)
}

/** Geometría de N recuadros en el lienzo 1920x1080 (misma estética que las plantillas del diseño). */
export function camsGeometry(n: number): { x: number; w: number; plateW: number; nameSize: number }[] {
  if (n <= 0) return []
  const gap = 40
  const w = n === 1 ? 1100 : n === 2 ? 840 : Math.floor((1720 - gap * (n - 1)) / n)
  const total = n * w + (n - 1) * gap
  const x0 = Math.round((1920 - total) / 2)
  const plateW = Math.min(700, w - (n >= 4 ? 52 : 66))
  const nameSize = n <= 2 ? 30 : n === 3 ? 28 : n === 4 ? 26 : 24
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), w, plateW, nameSize }))
}

export function buildCamsScene(s: GameState): Scene {
  const key = camsKey(s)
  const frames = new Map<SlotId, CamFrameEl>()
  const plates = new Map<SlotId, NamePlateEl>()
  const root = h('div', 'k-stage k-enter')
  const placed = spots(s)
  if (camsTemplate(s) === 'teams') root.append(versus())
  for (const g of placed) {
    const slot = g.slot
    const f = camFrame(g.cam, slot)
    frames.set(slot, f)
    const plate = namePlate({ box: g.plate, c: g.c, nameSize: g.nameSize, tag: slot === 'host' && g.plate.h >= 56 ? s.host.label || ' ' : undefined })
    plates.set(slot, plate)
    root.append(f.root, plate.root)
  }
  if (!placed.length) root.classList.add('k-stage--cover')
  const lower = lowerThird()
  root.append(lower.root)

  const update = (st: GameState) => {
    const turn = turnSlots(st)
    for (const [slot, f] of frames) f.root.classList.toggle('is-turn', turn.has(slot))
    for (const [slot, plate] of plates) {
      plate.root.style.display = st.camsScene.names ? '' : 'none'
      if (slot === 'host') {
        plate.setName(st.host.name)
        const tag = plate.root.querySelector('.k-caption')
        if (tag) tag.textContent = st.host.label
        continue
      }
      const c = st.contestants.find((x) => x.id === slot)
      plate.setName(c?.name ?? '')
      const score = st.layout === 'teams' && c ? st.teams[c.team].score : c?.score ?? 0
      plate.setScore(st.camsScene.scores ? formatPoints(score) : null)
    }
    const lt = st.lowerThird
    lower.set(lt.kicker, lt.title, lt.right, lt.visible)
  }
  update(s)
  return { key, root, frames, update }
}
