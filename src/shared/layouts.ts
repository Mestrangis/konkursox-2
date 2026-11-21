// Geometría de cada plantilla de plató, sacada 1:1 de design/KONKURSOX 2.html (lienzo 1920x1080).
import type { ContestantId, LayoutId, SlotId } from './types'

export const STAGE_W = 1920
export const STAGE_H = 1080

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface CamSlot {
  slot: SlotId
  cam: Box
  bar: Box & { c: number }
  nameSize?: number
  /** Placa centrada sin puntos (equipos) */
  nameOnly?: boolean
}

export interface LayoutDef {
  id: LayoutId
  label: string
  /** número de concursantes visibles */
  count: number
  slots: (contestantOrder: ContestantId[]) => CamSlot[]
}

const bar = (x: number, y: number, w: number, h: number, c: number) => ({ x, y, w, h, c })

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  logo: { id: 'logo', label: 'Cabecera', count: 0, slots: () => [] },
  solo: {
    id: 'solo',
    label: '1 + presentador',
    count: 1,
    slots: (o) => [
      { slot: o[0], cam: { x: 100, y: 56, w: 1220, h: 790 }, bar: bar(360, 818, 700, 58, 24) },
      { slot: 'host', cam: { x: 1380, y: 56, w: 440, h: 300 }, bar: bar(1420, 330, 360, 48, 20), nameSize: 24 }
    ]
  },
  duo: {
    id: 'duo',
    label: '2 concursantes',
    count: 2,
    slots: (o) =>
      [100, 980].map((x, i) => ({
        slot: o[i],
        cam: { x, y: 56, w: 840, h: 790 },
        bar: bar(x + 120, 818, 600, 58, 24)
      }))
  },
  trio: {
    id: 'trio',
    label: '3 concursantes',
    count: 3,
    slots: (o) =>
      [100, 687, 1274].map((x, i) => ({
        slot: o[i],
        cam: { x, y: 56, w: 546, h: 790 },
        bar: bar(x + 33, 818, 480, 58, 24),
        nameSize: 28
      }))
  },
  quad: {
    id: 'quad',
    label: '4 concursantes',
    count: 4,
    slots: (o) =>
      [100, 539, 978, 1417].map((x, i) => ({
        slot: o[i],
        cam: { x, y: 56, w: 403, h: 790 },
        bar: bar(x + 26, 818, 351, 58, 24),
        nameSize: 26
      }))
  },
  teams: {
    id: 'teams',
    label: 'Equipos 2 contra 2',
    count: 4,
    slots: (o) =>
      [100, 500, 1040, 1440].map((x, i) => ({
        slot: o[i],
        cam: { x, y: 140, w: 380, h: 600 },
        bar: bar(x + 30, 714, 320, 52, 22),
        nameSize: 26,
        nameOnly: true
      }))
  }
}

export const LAYOUT_ORDER: LayoutId[] = ['logo', 'solo', 'duo', 'trio', 'quad', 'teams']

/** Tamaño del marco que ocupará cada slot en la plantilla actual (para la previsualización de calibración). */
export function frameSizeFor(layout: LayoutId, slot: SlotId, order: ContestantId[]): { w: number; h: number } {
  const found = LAYOUTS[layout].slots(order).find((s) => s.slot === slot)
  if (found) return { w: found.cam.w, h: found.cam.h }
  return slot === 'host' ? { w: 440, h: 300 } : { w: 546, h: 790 }
}
