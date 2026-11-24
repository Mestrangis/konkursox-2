// Planos de la escena Juego: "Cámaras + datos" (cámaras grandes y un widget con los datos del juego)
// y "Cámaras limpias" (a pantalla completa, sin marcos, solo el nombre).
import { formatPoints } from '../../shared/quiz'
import { ladderBank } from '../../shared/quiz'
import { remainingMs, roscoPoints, roscoStats } from '../../shared/rosco'
import { activeContestants, activePlano, camsLineup } from '../../shared/scene'
import type { Box } from '../../shared/layouts'
import type { GameState, SlotId } from '../../shared/types'
import { camFrame, h, namePlate, type CamFrameEl, type NamePlateEl } from '../ds/components'
import { arrangeFeatured, pipBox } from '../../shared/arrange'
import { camsGeometry } from './camsScene'
import { targetName } from './quizScenes'
import type { Scene } from './scenes'

export const planoKey = (s: GameState): string =>
  `plano:${activePlano(s)}:${camsLineup(s).join(',')}:${s.camsScene.hostMode}:${s.camsScene.corner}:${s.liveGame}`

const nameOf = (s: GameState, slot: SlotId): string =>
  slot === 'host' ? s.host.name : slot === 'publico' ? 'Público' : s.contestants.find((c) => c.id === slot)?.name ?? ''

/** Rejilla a pantalla completa: 1 la llena, 2 mitad y mitad, 3 en tercios, 4+ en dos filas. */
function cleanBoxes(n: number): Box[] {
  if (n <= 0) return []
  const rows = n <= 3 ? 1 : 2
  const out: Box[] = []
  let i = 0
  for (let r = 0; r < rows; r++) {
    const inRow = rows === 1 ? n : r === 0 ? Math.ceil(n / 2) : Math.floor(n / 2)
    const w = 1920 / inRow
    const hgt = 1080 / rows
    for (let c = 0; c < inRow && i < n; c++, i++) out.push({ x: Math.round(c * w), y: Math.round(r * hgt), w: Math.round(w), h: Math.round(hgt) })
  }
  return out
}

/** Texto del widget de datos según el juego en el aire. */
function dataLines(s: GameState): { title: string; rows: [string, string][] } {
  if (s.liveGame === 'rosco' && s.rosco.players.length) {
    const pts = roscoPoints(s.rosco)
    return {
      title: 'Rosco',
      rows: s.rosco.players.map((p, i) => {
        const st = roscoStats(p)
        const secs = Math.ceil(remainingMs(p, Date.now()) / 1000)
        return [targetName(s, p.target), `${st.ok} aciertos · ${st.ko} fallos · ${secs} s · ${formatPoints(pts[i])} pts`]
      })
    }
  }
  if (s.liveGame === 'escalera' && s.quiz.ladder.active) {
    const l = s.quiz.ladder
    const left = s.quiz.lifelines.filter((x) => !l.used[x.id]).map((x) => x.name)
    return {
      title: `Escalera · ${targetName(s, l.target)}`,
      rows: [
        ['Escalón', `${Math.min(l.level + 1, l.levels.length)} de ${l.levels.length}`],
        ['Puntos', formatPoints(l.outcome ? l.outcome.prize : ladderBank(l.levels, l.level))],
        ['Comodines', left.length ? left.join(', ') : 'ninguno']
      ]
    }
  }
  if (s.layout === 'teams') return { title: 'Marcador', rows: s.teams.map((t) => [t.name, formatPoints(t.score)]) }
  const ids = new Set(activeContestants(s))
  return { title: 'Marcador', rows: s.contestants.filter((c) => ids.has(c.id)).map((c) => [c.name, formatPoints(c.score)]) }
}

export function buildPlanoScene(s: GameState): Scene {
  const key = planoKey(s)
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const lineup = camsLineup(s)
  const clean = activePlano(s) === 'limpio'

  if (clean) {
    root.classList.add('k-stage--clean')
    cleanBoxes(lineup.length).forEach((b, i) => {
      const slot = lineup[i]
      const f = camFrame(b, slot)
      f.root.classList.add('k-cam--clean')
      frames.set(slot, f)
      root.append(f.root, h('div', 'k-cleanname', { left: b.x + 24, top: b.y + b.h - 58 }, [nameOf(s, slot)]))
    })
    return { key, root, frames, update: () => {} }
  }

  // cámaras + datos: casi toda la pantalla son las cámaras (respeta cómo salgo yo)
  const area: Box = { x: 60, y: 40, w: 1800, h: 860 }
  let boxes: { slot: SlotId; cam: Box; small?: boolean }[]
  const featured = s.camsScene.hostMode === 'destacado' ? arrangeFeatured(lineup, area) : null
  if (featured) boxes = featured
  else {
    const rest = s.camsScene.hostMode === 'esquina' && lineup.length > 1 ? lineup.filter((x) => x !== 'host') : lineup
    const n = rest.length
    const gap = 30
    const w = n ? (area.w - gap * (n - 1)) / n : 0
    boxes = rest.map((slot, i) => ({ slot, cam: { x: Math.round(area.x + i * (w + gap)), y: area.y, w: Math.round(w), h: area.h } }))
    if (rest.length !== lineup.length) boxes.push({ slot: 'host', cam: pipBox(area, s.camsScene.corner), small: true })
  }
  void camsGeometry
  const plates: NamePlateEl[] = []
  for (const b of boxes) {
    const f = camFrame(b.cam, b.slot)
    frames.set(b.slot, f)
    const pw = Math.min(b.small ? 300 : 520, b.cam.w - 40)
    const plate = namePlate({ box: { x: b.cam.x + (b.cam.w - pw) / 2, y: b.cam.y + b.cam.h - 30, w: pw, h: b.small ? 44 : 54 }, c: 20, nameSize: b.small ? 20 : 26, nameOnly: true })
    plate.setName(nameOf(s, b.slot))
    plates.push(plate)
    root.append(f.root, plate.root)
  }

  // widget pequeño y sin fondo con los datos del juego
  const title = h('span', 'k-data__title')
  const rows = h('div', 'k-data__rows')
  const widget = h('div', 'k-data', { left: 60, top: 930, width: 1800 }, [title, rows])
  root.append(widget)
  let last = ''
  const update = (st: GameState) => {
    const d = dataLines(st)
    const k = JSON.stringify(d)
    if (k === last) return
    last = k
    title.textContent = d.title
    rows.replaceChildren(...d.rows.map(([a, b]) => h('span', 'k-data__row', {}, [h('b', '', {}, [a]), ` ${b}`])))
  }
  update(s)
  return { key, root, frames, update, tick: update }
}
