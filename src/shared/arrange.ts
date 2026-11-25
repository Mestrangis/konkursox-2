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

/** Filas de la rejilla de cámaras: 1-2 en una fila, 3-4 en dos (2+1, 2+2), 5 = 3+2, 6 = 3+3, 7-8 = 4+3 / 4+4. */
export function gridRows(n: number): number[] {
  if (n <= 0) return []
  if (n <= 2) return [n]
  if (n <= 4) return [2, n - 2]
  if (n <= 6) return [3, n - 3]
  return [4, n - 4]
}

/**
 * Recuadros 16:9 (la proporción de la cámara) repartidos en el área: nunca tiras verticales.
 * Todas del mismo tamaño, filas centradas y el bloque centrado en vertical.
 */
export function grid169(n: number, area: Box, gap = 24): Box[] {
  const rows = gridRows(n)
  if (!rows.length) return []
  const cols = Math.max(...rows)
  const wByW = (area.w - gap * (cols - 1)) / cols
  const wByH = ((area.h - gap * (rows.length - 1)) / rows.length) * (16 / 9)
  const w = Math.floor(Math.min(wByW, wByH))
  const hh = Math.round((w * 9) / 16)
  const totalH = rows.length * hh + gap * (rows.length - 1)
  let y = area.y + Math.round((area.h - totalH) / 2)
  const out: Box[] = []
  for (const k of rows) {
    const rowW = k * w + gap * (k - 1)
    let x = area.x + Math.round((area.w - rowW) / 2)
    for (let i = 0; i < k; i++) {
      out.push({ x, y, w, h: hh })
      x += w + gap
    }
    y += hh + gap
  }
  return out
}

/** Presentador destacado en 16:9: yo grande a la izquierda y los demás en rejilla a la derecha. */
export function featured169(others: number, area: Box, gap = 24): { host: Box; rest: Box[] } {
  if (!others) return { host: grid169(1, area, gap)[0], rest: [] }
  const hostW = Math.round(area.w * 0.6)
  const host = grid169(1, { x: area.x, y: area.y, w: hostW, h: area.h }, gap)[0]
  const restArea = { x: area.x + hostW + gap, y: area.y, w: area.w - hostW - gap, h: area.h }
  // a la derecha, en columna (1 por fila) hasta 3; si hay más, dos columnas
  const cols = others <= 3 ? 1 : 2
  const rowsN = Math.ceil(others / cols)
  const w = Math.floor(Math.min((restArea.w - gap * (cols - 1)) / cols, ((restArea.h - gap * (rowsN - 1)) / rowsN) * (16 / 9)))
  const hh = Math.round((w * 9) / 16)
  const totalH = rowsN * hh + gap * (rowsN - 1)
  const rest: Box[] = []
  for (let i = 0; i < others; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const inRow = Math.min(cols, others - r * cols)
    const rowW = inRow * w + gap * (inRow - 1)
    rest.push({ x: restArea.x + Math.round((restArea.w - rowW) / 2) + c * (w + gap), y: restArea.y + Math.round((restArea.h - totalH) / 2) + r * (hh + gap), w, h: hh })
  }
  return { host, rest }
}

/** Presentador pequeño en una esquina (16:9). */
export function pip169(area: Box, corner: Corner, w = 400): Box {
  const hh = Math.round((w * 9) / 16)
  const m = 24
  return {
    x: corner === 'tl' || corner === 'bl' ? area.x + m : area.x + area.w - w - m,
    y: corner === 'tl' || corner === 'tr' ? area.y + m : area.y + area.h - hh - m,
    w,
    h: hh
  }
}
