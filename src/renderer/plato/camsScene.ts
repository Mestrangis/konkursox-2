// Escena Cámaras: 1 a 5 personas repartidas por el plató (presentador en medio si hay concursantes a ambos lados).
import { formatPoints } from '../../shared/quiz'
import { camsLineup } from '../../shared/scene'
import type { GameState, SlotId } from '../../shared/types'
import { camFrame, lowerThird, namePlate, type CamFrameEl, type NamePlateEl } from '../ds/components'
import { h } from '../ds/components'
import { turnSlots } from './quizScenes'
import type { Scene } from './scenes'

export const camsKey = (s: GameState): string => `cams:${camsLineup(s).join(',')}`

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
  const lineup = camsLineup(s)
  const frames = new Map<SlotId, CamFrameEl>()
  const plates = new Map<SlotId, NamePlateEl>()
  const root = h('div', 'k-stage k-enter')
  camsGeometry(lineup.length).forEach((g, i) => {
    const slot = lineup[i]
    const f = camFrame({ x: g.x, y: 56, w: g.w, h: 790 }, slot)
    frames.set(slot, f)
    const plate = namePlate({
      box: { x: g.x + (g.w - g.plateW) / 2, y: 818, w: g.plateW, h: 58 },
      c: 24,
      nameSize: g.nameSize,
      tag: slot === 'host' ? s.host.label || ' ' : undefined
    })
    plates.set(slot, plate)
    root.append(f.root, plate.root)
  })
  if (!lineup.length) root.classList.add('k-stage--cover')
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
