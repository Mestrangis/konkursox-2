import { describe, expect, it } from 'vitest'
import { coverSource, fitContain, pxToRel, rectFromDrag, relToPx, sanitizeRel, sourceRectForFrame } from '../src/shared/crop'

const close = (a: object, b: object) => {
  for (const [k, v] of Object.entries(b)) expect((a as Record<string, number>)[k]).toBeCloseTo(v as number, 6)
}

describe('rectFromDrag', () => {
  it('normaliza arrastres en cualquier dirección', () => {
    close(rectFromDrag({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.1 })!, { x: 0.2, y: 0.1, w: 0.4, h: 0.6 })
  })
  it('recorta a los límites de la ventana', () => {
    close(rectFromDrag({ x: -0.2, y: 0.5 }, { x: 0.3, y: 1.4 })!, { x: 0, y: 0.5, w: 0.3, h: 0.5 })
  })
  it('ignora clics sin arrastre', () => {
    expect(rectFromDrag({ x: 0.5, y: 0.5 }, { x: 0.503, y: 0.6 })).toBeNull()
  })
})

describe('sanitizeRel', () => {
  it('rechaza valores no numéricos', () => {
    expect(sanitizeRel({ x: NaN, y: 0, w: 1, h: 1 })).toBeNull()
    expect(sanitizeRel(null)).toBeNull()
  })
  it('recorta rectángulos que se salen', () => {
    close(sanitizeRel({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 })!, { x: 0.8, y: 0.8, w: 0.2, h: 0.2 })
  })
})

describe('relativo <-> píxeles', () => {
  it('es reversible', () => {
    const rel = { x: 0.25, y: 0.1, w: 0.5, h: 0.3 }
    const px = relToPx(rel, 1920, 1080)
    close(px, { x: 480, y: 108, w: 960, h: 324 })
    close(pxToRel(px, 1920, 1080), rel)
  })
  it('mover/redimensionar la ventana mantiene el mismo encuadre relativo', () => {
    const rel = { x: 0.5, y: 0.5, w: 0.25, h: 0.25 }
    close(relToPx(rel, 1280, 720), { x: 640, y: 360, w: 320, h: 180 })
    close(relToPx(rel, 2560, 1440), { x: 1280, y: 720, w: 640, h: 360 })
  })
})

describe('coverSource (object-fit: cover dentro del recorte)', () => {
  it('recorte 16:9 en marco vertical: recorta los lados y centra', () => {
    // recorte 640x360 -> marco 403x790 (aspecto 0.51)
    const src = coverSource({ x: 100, y: 50, w: 640, h: 360 }, 403, 790)!
    expect(src.h).toBeCloseTo(360)
    expect(src.w).toBeCloseTo(360 * (403 / 790))
    expect(src.y).toBeCloseTo(50)
    // centrado horizontal dentro del recorte
    expect(src.x + src.w / 2).toBeCloseTo(100 + 320)
  })
  it('recorte vertical en marco apaisado: recorta arriba/abajo y centra', () => {
    const src = coverSource({ x: 0, y: 0, w: 300, h: 600 }, 440, 300)!
    expect(src.w).toBeCloseTo(300)
    expect(src.h).toBeCloseTo(300 / (440 / 300))
    expect(src.y + src.h / 2).toBeCloseTo(300)
  })
  it('mismo aspecto: usa el recorte entero', () => {
    close(coverSource({ x: 10, y: 20, w: 840, h: 790 }, 840, 790)!, { x: 10, y: 20, w: 840, h: 790 })
  })
  it('el resultado siempre tiene el aspecto del marco y cabe en el recorte', () => {
    const crops = [
      { x: 0, y: 0, w: 1920, h: 1080 },
      { x: 37, y: 91, w: 123, h: 456 },
      { x: 500, y: 300, w: 777, h: 222 }
    ]
    const frames: [number, number][] = [
      [1220, 790],
      [840, 790],
      [546, 790],
      [403, 790],
      [380, 600],
      [440, 300]
    ]
    for (const c of crops)
      for (const [fw, fh] of frames) {
        const s = coverSource(c, fw, fh)!
        expect(s.w / s.h).toBeCloseTo(fw / fh, 6)
        expect(s.x).toBeGreaterThanOrEqual(c.x - 1e-9)
        expect(s.y).toBeGreaterThanOrEqual(c.y - 1e-9)
        expect(s.x + s.w).toBeLessThanOrEqual(c.x + c.w + 1e-9)
        expect(s.y + s.h).toBeLessThanOrEqual(c.y + c.h + 1e-9)
      }
  })
  it('respeta el punto de foco sin salirse del recorte', () => {
    const c = { x: 0, y: 0, w: 1600, h: 900 }
    const left = coverSource(c, 900, 900, { x: 0, y: 0.5 })!
    expect(left.x).toBe(0)
    const right = coverSource(c, 900, 900, { x: 1, y: 0.5 })!
    expect(right.x + right.w).toBeCloseTo(1600)
  })
  it('devuelve null con tamaños inválidos', () => {
    expect(coverSource({ x: 0, y: 0, w: 0, h: 10 }, 100, 100)).toBeNull()
    expect(coverSource({ x: 0, y: 0, w: 10, h: 10 }, 0, 100)).toBeNull()
  })
})

describe('sourceRectForFrame', () => {
  it('combina relativo + vídeo + marco', () => {
    const s = sourceRectForFrame({ x: 0.5, y: 0, w: 0.5, h: 0.5 }, 1920, 1080, 960, 540)!
    close(s, { x: 960, y: 0, w: 960, h: 540 })
  })
  it('sin vídeo todavía devuelve null', () => {
    expect(sourceRectForFrame({ x: 0, y: 0, w: 1, h: 1 }, 0, 0, 100, 100)).toBeNull()
  })
})

describe('fitContain', () => {
  it('centra con bandas', () => {
    close(fitContain(1920, 1080, 1000, 1000), { x: 0, y: 218.75, w: 1000, h: 562.5 })
    close(fitContain(1080, 1920, 1000, 1000), { x: 218.75, y: 0, w: 562.5, h: 1000 })
  })
})
