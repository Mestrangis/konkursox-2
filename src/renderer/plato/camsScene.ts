// Escena Cámaras: 1 a 5 personas repartidas por el plató (presentador en medio si hay concursantes a ambos lados).
import { formatPoints } from '../../shared/quiz'
import { camsLineup, camsTemplate } from '../../shared/scene'
import { featured169, grid169, pip169 } from '../../shared/arrange'
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

export interface Spot {
  slot: SlotId
  cam: Box
  plate: Box
  c: number
  nameSize: number
}

const AREA: Box = { x: 100, y: 56, w: 1720, h: 790 }

/** Dónde va cada persona: plantilla fija, presentador destacado o en esquina, o reparto igual. */
/** Placa de nombre encima del borde inferior del recuadro (tamaño según el recuadro). */
function plateFor(slot: SlotId, cam: Box): Spot {
  const small = cam.w < 520
  const pw = Math.min(small ? 360 : 640, cam.w - 40)
  const ph = small ? 46 : 56
  return { slot, cam, plate: { x: cam.x + (cam.w - pw) / 2, y: cam.y + cam.h - Math.round(ph / 2), w: pw, h: ph }, c: small ? 18 : 24, nameSize: small ? 22 : 30 }
}

/** Recuadros de "Cámaras con marcos": plantilla fija del diseño o rejilla 16:9 (la proporción de la cámara). */
export function camsSpots(s: GameState, area: Box = AREA): Spot[] {
  const t = camsTemplate(s)
  if (t) return LAYOUTS[t].slots(contestantOrder(s)).map((x) => ({ slot: x.slot, cam: x.cam, plate: x.bar, c: x.bar.c, nameSize: x.nameSize ?? 30 }))
  const all = camsLineup(s)
  const mode = s.camsScene.hostMode
  const withHost = all.includes('host') && all.length > 1
  const others = all.filter((x) => x !== 'host')
  if (mode === 'destacado' && withHost) {
    const g = featured169(others.length, area, 56)
    return [plateFor('host', g.host), ...others.map((slot, i) => plateFor(slot, g.rest[i]))]
  }
  if (mode === 'esquina' && withHost) {
    return [...grid169(others.length, area, 56).map((b, i) => plateFor(others[i], b)), plateFor('host', pip169(area, s.camsScene.corner, 380))]
  }
  return grid169(all.length, area, 56).map((b, i) => plateFor(all[i], b))
}
const spots = (s: GameState): Spot[] => camsSpots(s)

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
      if (slot === 'publico') {
        plate.setName('Público')
        plate.setScore(null)
        continue
      }
      if (slot === 'host') {
        plate.setName(st.host.name)
        const tag = plate.root.querySelector('.k-caption')
        if (tag) tag.textContent = st.host.label
        continue
      }
      const c = st.contestants.find((x) => x.id === slot)
      plate.setName(c?.name ?? '')
      const score = st.layout === 'teams' && c ? st.teams[c.team].score : (c?.score ?? 0)
      plate.setScore(st.camsScene.scores ? formatPoints(score) : null)
    }
    const lt = st.lowerThird
    lower.set(lt.kicker, lt.title, lt.right, lt.visible)
  }
  update(s)
  return { key, root, frames, update }
}
