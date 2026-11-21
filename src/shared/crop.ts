// Lógica pura de recorte de cámaras. Sin dependencias de DOM: se testea con vitest.
import type { RelRect } from './types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

/** Tamaño mínimo (relativo) de un rectángulo de calibración válido. */
export const MIN_REL_SIZE = 0.01

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Convierte dos puntos de arrastre (en coordenadas relativas 0..1, pueden salirse)
 * en un rectángulo relativo normalizado y recortado al área de la ventana.
 * Devuelve null si el resultado es demasiado pequeño (un clic sin arrastrar).
 */
export function rectFromDrag(a: Point, b: Point): RelRect | null {
  const x1 = clamp(Math.min(a.x, b.x), 0, 1)
  const y1 = clamp(Math.min(a.y, b.y), 0, 1)
  const x2 = clamp(Math.max(a.x, b.x), 0, 1)
  const y2 = clamp(Math.max(a.y, b.y), 0, 1)
  const w = x2 - x1
  const h = y2 - y1
  if (w < MIN_REL_SIZE || h < MIN_REL_SIZE) return null
  return { x: x1, y: y1, w, h }
}

/** Asegura que un RelRect guardado sigue dentro de 0..1 (p. ej. tras editar el JSON a mano). */
export function sanitizeRel(r: RelRect | null | undefined): RelRect | null {
  if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite)) return null
  return rectFromDrag({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h })
}

/** Relativo (0..1) -> píxeles del vídeo capturado. */
export function relToPx(r: RelRect, videoW: number, videoH: number): Rect {
  return { x: r.x * videoW, y: r.y * videoH, w: r.w * videoW, h: r.h * videoH }
}

/** Píxeles del vídeo -> relativo (0..1). */
export function pxToRel(r: Rect, videoW: number, videoH: number): RelRect {
  return { x: r.x / videoW, y: r.y / videoH, w: r.w / videoW, h: r.h / videoH }
}

/**
 * Equivalente a `object-fit: cover` aplicado a un recorte:
 * dado el recorte calibrado (en píxeles del vídeo) y el tamaño del marco destino,
 * devuelve la sub-región del vídeo que hay que pintar para llenar el marco
 * sin deformar. Se queda siempre dentro del recorte y se centra en `focus`
 * (0..1 dentro del recorte; por defecto el centro = la cara si el recorte está centrado en ella).
 */
export function coverSource(crop: Rect, frameW: number, frameH: number, focus: Point = { x: 0.5, y: 0.5 }): Rect | null {
  if (crop.w <= 0 || crop.h <= 0 || frameW <= 0 || frameH <= 0) return null
  const target = frameW / frameH
  const aspect = crop.w / crop.h
  let w = crop.w
  let h = crop.h
  if (aspect > target) w = crop.h * target // recorte más ancho que el marco: se pierden lados
  else h = crop.w / target // recorte más alto que el marco: se pierde arriba/abajo
  const x = crop.x + clamp(focus.x * crop.w - w / 2, 0, crop.w - w)
  const y = crop.y + clamp(focus.y * crop.h - h / 2, 0, crop.h - h)
  return { x, y, w, h }
}

/** Atajo: RelRect + tamaño de vídeo + tamaño de marco -> región fuente en píxeles. */
export function sourceRectForFrame(rel: RelRect, videoW: number, videoH: number, frameW: number, frameH: number): Rect | null {
  if (videoW <= 0 || videoH <= 0) return null
  const safe = sanitizeRel(rel)
  if (!safe) return null
  return coverSource(relToPx(safe, videoW, videoH), frameW, frameH)
}

/** `object-fit: contain`: dónde cae un contenido srcW x srcH dentro de una caja boxW x boxH. */
export function fitContain(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: boxW, h: boxH }
  const s = Math.min(boxW / srcW, boxH / srcH)
  const w = srcW * s
  const h = srcH * s
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}
