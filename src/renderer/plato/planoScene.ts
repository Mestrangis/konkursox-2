// Planos de cámaras: "Cámaras + datos" (cada cámara con sus datos del juego en un rótulo pegado abajo)
// y "Cámaras limpias" (sin marcos, solo el nombre). Siempre recuadros 16:9, nunca tiras verticales.
import { featured169, grid169, pip169 } from '../../shared/arrange'
import type { Box } from '../../shared/layouts'
import { formatPoints, ladderBank } from '../../shared/quiz'
import { remainingMs, roscoStats } from '../../shared/rosco'
import { activePlano, camsLineup } from '../../shared/scene'
import type { GameState, SlotId } from '../../shared/types'
import { camFrame, fitName, h, type CamFrameEl } from '../ds/components'
import { membersOf } from './quizScenes'
import type { Scene } from './scenes'

export const planoKey = (s: GameState): string =>
  `plano:${activePlano(s)}:${camsLineup(s).join(',')}:${s.camsScene.hostMode}:${s.camsScene.corner}:${s.liveGame}:${s.liveGame === 'rosco' ? s.rosco.players.length : ''}`

const nameOf = (s: GameState, slot: SlotId): string => (slot === 'host' ? s.host.name : slot === 'publico' ? 'Público' : (s.contestants.find((c) => c.id === slot)?.name ?? ''))

/** Recuadros 16:9 según cómo salgo yo (igual, destacado o en esquina). */
function boxes(s: GameState, area: Box, gap: number): { slot: SlotId; cam: Box; small: boolean }[] {
  const all = camsLineup(s)
  const withHost = all.includes('host') && all.length > 1
  const others = all.filter((x) => x !== 'host')
  if (s.camsScene.hostMode === 'destacado' && withHost) {
    const g = featured169(others.length, area, gap)
    return [{ slot: 'host', cam: g.host, small: false }, ...others.map((slot, i) => ({ slot, cam: g.rest[i], small: true }))]
  }
  if (s.camsScene.hostMode === 'esquina' && withHost)
    return [...grid169(others.length, area, gap).map((cam, i) => ({ slot: others[i], cam, small: false })), { slot: 'host', cam: pip169(area, s.camsScene.corner, 400), small: true }]
  return grid169(all.length, area, gap).map((cam, i) => ({ slot: all[i], cam, small: false }))
}

/** Datos del juego activo de una persona (null: no tiene; p. ej. el presentador). */
export function slotData(s: GameState, slot: SlotId): string | null {
  if (slot === 'host' || slot === 'publico') return null
  if (s.liveGame === 'rosco' && s.rosco.players.length) {
    const p = s.rosco.players.find((x) => membersOf(s, x.target).includes(slot))
    if (p) {
      const st = roscoStats(p)
      return `✓ ${st.ok}  ✗ ${st.ko}  ·  ${Math.ceil(remainingMs(p, Date.now()) / 1000)} s`
    }
  }
  if (s.liveGame === 'escalera' && s.quiz.ladder.active) {
    const l = s.quiz.ladder
    if (membersOf(s, l.target).includes(slot)) {
      const val = l.levels[Math.min(l.level, l.levels.length - 1)]?.value ?? 0
      return l.outcome
        ? `Final · ${formatPoints(l.outcome.prize)}`
        : `Escalón ${Math.min(l.level + 1, l.levels.length)} · ${formatPoints(val)}  (ganado ${formatPoints(ladderBank(l.levels, l.level))})`
    }
  }
  const c = s.contestants.find((x) => x.id === slot)
  if (!c) return null
  return `${formatPoints(s.layout === 'teams' ? s.teams[c.team].score : c.score)} puntos`
}

export function buildPlanoScene(s: GameState): Scene {
  const key = planoKey(s)
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const clean = activePlano(s) === 'limpio'

  if (clean) {
    root.classList.add('k-stage--clean')
    for (const b of boxes(s, { x: 0, y: 0, w: 1920, h: 1080 }, 8)) {
      const f = camFrame(b.cam, b.slot)
      f.root.classList.add('k-cam--clean')
      frames.set(b.slot, f)
      root.append(f.root, h('div', 'k-cleanname', { left: b.cam.x + 22, top: b.cam.y + b.cam.h - 52, fontSize: b.small ? 20 : 26 }, [nameOf(s, b.slot)]))
    }
    return { key, root, frames, update: () => {} }
  }

  // cámaras + datos: cada uno con un rótulo pequeño pegado abajo (nombre y sus datos)
  const caps: { slot: SlotId; data: HTMLElement }[] = []
  for (const b of boxes(s, { x: 50, y: 40, w: 1820, h: 1000 }, 28)) {
    const f = camFrame(b.cam, b.slot)
    frames.set(b.slot, f)
    const name = h('span', 'k-capname', { fontSize: b.small ? 20 : 26 }, [nameOf(s, b.slot)])
    const data = h('span', 'k-capdata', { fontSize: b.small ? 17 : 22 })
    const capW = Math.min(b.cam.w - 32, b.small ? 340 : 560)
    const cap = h('div', 'k-camcap', { left: b.cam.x + 16, top: b.cam.y + b.cam.h - (b.small ? 62 : 74), width: capW }, [name, data])
    root.append(f.root, cap)
    caps.push({ slot: b.slot, data })
    requestAnimationFrame(() => fitName(name))
  }
  let last = ''
  const update = (st: GameState) => {
    const vals = caps.map((c) => slotData(st, c.slot) ?? '')
    const k = vals.join('|')
    if (k === last) return
    last = k
    caps.forEach((c, i) => {
      c.data.textContent = vals[i]
      c.data.style.display = vals[i] ? '' : 'none'
    })
  }
  update(s)
  return { key, root, frames, update, tick: update }
}
