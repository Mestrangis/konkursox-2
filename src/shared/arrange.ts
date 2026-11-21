// Cómo se reparte el plató según cómo sale el presentador (igual, destacado o en una esquina).
import type { Box } from './layouts'
import type { SlotId } from './types'

export type HostMode = 'igual' | 'destacado' | 'esquina'
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export interface Placed {
  slot: SlotId
  cam: Box
  /** recuadro pequeño superpuesto (presentador en esquina) */
  pip?: boolean
  /** recuadro más pequeño que el principal (concursantes con el presentador destacado) */
  small?: boolean
}

/** Presentador destacado: él grande en su sitio, los demás más pequeños a los lados. null si no aplica. */
export function arrangeFeatured(lineup: SlotId[], area: Box, gap = 40): Placed[] | null {
  const hi = lineup.indexOf('host')
  if (hi < 0 || lineup.length < 2) return null
  const left = lineup.slice(0, hi)
  const right = lineup.slice(hi + 1)
  const n = left.length + right.length
  const hostW = Math.round(area.w * (n === 1 ? 0.56 : n === 2 ? 0.46 : 0.38))
  // todos los pequeños del mismo ancho, aunque un lado tenga más que el otro
  const w = (area.w - hostW - gap * n) / n
  const smallH = Math.round(area.h * 0.72)
  const out: Placed[] = []
  let x = area.x
  const side = (items: SlotId[]) => {
    for (const slot of items) {
      out.push({ slot, cam: { x: Math.round(x), y: area.y + area.h - smallH, w: Math.round(w), h: smallH }, small: true })
      x += w + gap
    }
  }
  if (left.length) side(left)
  out.push({ slot: 'host', cam: { x: Math.round(x), y: area.y, w: hostW, h: area.h } })
  x += hostW + gap
  if (right.length) side(right)
  return out
}

/** Recuadro del presentador superpuesto en una esquina del área de cámaras. */
export function pipBox(area: Box, corner: Corner): Box {
  const w = 360
  const h = Math.min(260, Math.round(area.h * 0.42))
  const m = 24
  return {
    x: corner === 'tl' || corner === 'bl' ? area.x + m : area.x + area.w - w - m,
    y: corner === 'tl' || corner === 'tr' ? area.y + m : area.y + area.h - h - m,
    w,
    h
  }
}
