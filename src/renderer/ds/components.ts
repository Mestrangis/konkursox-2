// Componentes reutilizables del plató. Devuelven elementos DOM posicionados en px de diseño (1920x1080).
import type { Box } from '../../shared/layouts'

type Attrs = Record<string, string | number | undefined>

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  style?: Partial<Record<string, string | number>>,
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (style) applyStyle(el, style)
  for (const c of children) el.append(c)
  return el
}

/** Propiedades CSS cuyos números no llevan unidad. */
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom'])

export function applyStyle(el: HTMLElement, style: Partial<Record<string, string | number>>): void {
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined) continue
    const val = typeof v === 'number' && !k.startsWith('--') && !UNITLESS.has(k) ? `${v}px` : String(v)
    if (k.startsWith('--')) el.style.setProperty(k, val)
    else el.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), val)
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function svg(viewBox: string, attrs: Attrs, inner: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg')
  el.setAttribute('viewBox', viewBox)
  el.setAttribute('aria-hidden', 'true')
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v))
  el.innerHTML = inner
  return el
}

const boxStyle = (b: Box) => ({ left: b.x, top: b.y, width: b.w, height: b.h })

/** Silueta del diseño (cuando no hay cámara). */
export function silhouette(): SVGSVGElement {
  return svg(
    '0 0 200 200',
    { class: 'k-cam__sil' },
    '<circle cx="100" cy="70" r="40"></circle><path d="M14 200 C14 138 58 118 100 118 C142 118 186 138 186 200 Z"></path>'
  )
}

export interface CamFrameEl {
  root: HTMLDivElement
  canvas: HTMLCanvasElement
  setLive(live: boolean): void
}

/** Marco de cámara con bisel dorado, viñeta y silueta de reserva. El canvas recibe el recorte de Discord. */
export function camFrame(box: Box, slot: string): CamFrameEl {
  const canvas = h('canvas', 'k-cam__feed')
  canvas.width = box.w
  canvas.height = box.h
  const root = h('div', 'k-cam', boxStyle(box), [silhouette(), canvas])
  root.dataset.slot = slot
  return {
    root,
    canvas,
    setLive: (live) => root.classList.toggle('is-live', live)
  }
}

export interface BarOpts {
  box: Box
  c: number
  center?: boolean
  state?: 'ok' | 'ko' | 'locked' | 'dim'
}

/** Barra biselada genérica (base de placas, rótulos y opciones). */
export function bevelBar(o: BarOpts, children: (Node | string)[] = [], innerStyle?: Record<string, string | number>): HTMLDivElement {
  const inner = h('div', 'k-bar__in', innerStyle, children)
  const cls = ['k-bar', o.center ? 'k-bar--center' : '', o.state === 'locked' ? 'is-locked' : o.state ? `is-${o.state}` : '']
  return h('div', cls.filter(Boolean).join(' '), { ...boxStyle(o.box), '--c': `${o.c}px` }, [inner])
}

export interface NamePlateEl {
  root: HTMLDivElement
  setName(name: string): void
  setScore(score: number | string | null): void
}

/** Placa de nombre con puntos (o etiqueta a la derecha, p. ej. "Presentador"). */
/**
 * El nombre cabe siempre en su placa: primero baja la letra (hasta ~55 %) y, si aún no cabe,
 * pasa a dos líneas. Nunca "CONC…".
 */
export function fitName(el: HTMLElement): void {
  const run = () => {
    if (!el.isConnected) return
    const base = Number(el.dataset.base || (el.dataset.base = String(parseFloat(getComputedStyle(el).fontSize) || 30)))
    el.style.whiteSpace = 'nowrap'
    el.style.lineHeight = ''
    el.style.fontSize = `${base}px`
    let size = base
    while (el.scrollWidth > el.clientWidth + 1 && size > base * 0.55) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      el.style.whiteSpace = 'normal'
      el.style.lineHeight = '1.02'
      el.style.fontSize = `${Math.max(size, base * 0.6)}px`
    }
  }
  requestAnimationFrame(run)
}

export function namePlate(o: BarOpts & { nameSize?: number; tag?: string; nameOnly?: boolean }): NamePlateEl {
  const name = h('span', 'k-name', o.nameSize ? { fontSize: o.nameSize } : undefined)
  const children: Node[] = [name]
  let score: HTMLSpanElement | null = null
  if (o.tag) children.push(h('span', 'k-caption', { marginLeft: 'auto', fontSize: 15 }, [o.tag]))
  else if (!o.nameOnly) {
    score = h('span', 'k-score')
    children.push(score)
  }
  const root = bevelBar({ ...o, center: o.nameOnly || o.center }, children)
  let last: string | null = null
  return {
    root,
    setName: (n) => {
      if (name.textContent === n) return
      name.textContent = n
      fitName(name)
    },
    setScore: (s) => {
      if (!score) return
      const txt = s === null ? '' : String(s)
      if (txt === last) return
      const bump = last !== null
      last = txt
      score.textContent = txt
      if (bump) {
        score.classList.remove('k-bump')
        void score.offsetWidth
        score.classList.add('k-bump')
      }
    }
  }
}

/** Cabecera de equipo (barra centrada con el nombre en mayúsculas espaciadas). */
export function teamHeader(box: Box): { root: HTMLDivElement; setName(n: string): void } {
  const label = h('span', 'k-name', { fontSize: 32, letterSpacing: '0.18em' })
  const root = bevelBar({ box, c: 26, center: true }, [label])
  return { root, setName: (n) => void (label.textContent = n) }
}

/** Puntos de equipo grandes bajo las cámaras. */
export function teamScore(box: Box): { root: HTMLDivElement; setScore(v: number): void } {
  const value = h('span', 'k-teamscore__value')
  const root = h('div', 'k-teamscore', { left: box.x, top: box.y, width: box.w }, [h('span', 'k-caption', {}, ['Puntos']), value])
  let last: string | null = null
  return {
    root,
    setScore: (v) => {
      const t = String(v)
      if (t === last) return
      const bump = last !== null
      last = t
      value.textContent = t
      if (bump) {
        value.classList.remove('k-bump')
        void value.offsetWidth
        value.classList.add('k-bump')
      }
    }
  }
}

/** Rombo VS con líneas verticales (equipos 2 contra 2). */
export function versus(cx = 960, cy = 420): DocumentFragment {
  const f = document.createDocumentFragment()
  f.append(
    h('div', 'k-vs__line', { left: cx - 1, top: 150, height: 200, background: 'linear-gradient(180deg, transparent, rgba(201,169,97,.5))' }),
    h('div', 'k-vs__line', { left: cx - 1, top: 490, height: 240, background: 'linear-gradient(180deg, rgba(201,169,97,.5), transparent)' }),
    h('div', 'k-vs__diamond', { left: cx - 40, top: cy - 40 }),
    h('div', 'k-vs__label', { left: cx - 80, top: cy - 40, width: 160, height: 80 }, ['VS'])
  )
  return f
}

export interface LowerThirdEl {
  root: DocumentFragment
  bar: HTMLDivElement
  track: HTMLDivElement
  set(kicker: string, title: string, right: string, visible: boolean): void
}

/** Rótulo inferior con logo, prueba y texto a la derecha. */
export function lowerThird(): LowerThirdEl {
  const kicker = h('span', 'k-caption', { fontSize: 17 })
  const title = h('span', 'k-lower__title')
  const right = h('span', 'k-caption k-caption--muted', { marginLeft: 'auto', whiteSpace: 'nowrap' })
  const bar = bevelBar(
    { box: { x: 100, y: 920, w: 1720, h: 98 }, c: 40 },
    [h('span', 'k-logo', { fontSize: 36 }, ['KONKURSOX']), h('span', 'k-lower__sep'), h('div', 'k-lower__titles', {}, [kicker, title]), right],
    { gap: 32 }
  )
  const track = h('div', 'k-track', { top: 968 })
  const root = document.createDocumentFragment()
  root.append(track, bar)
  return {
    root,
    bar,
    track,
    set: (k, t, r, visible) => {
      kicker.textContent = k
      title.textContent = t
      right.textContent = r
      bar.style.display = visible ? '' : 'none'
      track.style.display = visible ? '' : 'none'
    }
  }
}

/** Caja informativa lateral (premio en juego / pregunta x de y). */
export function infoBox(box: Box): { root: HTMLDivElement; set(l1: string, v1: string, l2: string, v2: string): void } {
  const l1 = h('span', 'k-caption')
  const v1 = h('span', 'k-infobox__big')
  const l2 = h('span', 'k-caption k-caption--muted')
  const v2 = h('span', 'k-infobox__mid')
  const root = h('div', 'k-infobox', { left: box.x, top: box.y, width: box.w, height: box.h }, [l1, v1, h('div', 'k-infobox__rule'), l2, v2])
  return {
    root,
    set: (a, b, c, d) => {
      l1.textContent = a
      v1.textContent = b
      l2.textContent = c
      v2.textContent = d
    }
  }
}

/** Barra de pregunta (ancho completo). */
export function questionBar(text: string, box: Box = { x: 100, y: 700, w: 1720, h: 104 }): HTMLDivElement {
  return bevelBar({ box, c: 44, center: true }, [h('span', 'k-question', {}, [text])])
}

/** Opción de respuesta A-D. */
export function answerOption(key: string, text: string, box: Box, state?: BarOpts['state']): HTMLDivElement {
  return bevelBar({ box, c: 34, state }, [h('span', 'k-key k-answer', {}, [`${key}:`]), h('span', 'k-answer', {}, [text])])
}

/** Rejilla 2x2 de opciones A-D según el diseño. */
export function answerGrid(options: string[], states: (BarOpts['state'] | undefined)[] = []): DocumentFragment {
  const f = document.createDocumentFragment()
  f.append(h('div', 'k-track', { top: 866 }), h('div', 'k-track', { top: 960 }))
  options.slice(0, 4).forEach((t, i) => {
    f.append(answerOption('ABCD'[i], t, { x: i % 2 ? 970 : 100, y: i < 2 ? 828 : 922, w: 850, h: 78 }, states[i]))
  })
  return f
}

/** Temporizador circular (progress 0..1). */
export function timer(x: number, y: number, value: number, progress: number): HTMLDivElement {
  const len = 2 * Math.PI * 52
  const ring = svg(
    '0 0 120 120',
    { width: 120, height: 120 },
    `<circle cx="60" cy="60" r="52" fill="none" stroke="rgba(201,169,97,0.18)" stroke-width="5"></circle>` +
      `<circle cx="60" cy="60" r="52" fill="none" style="stroke:var(--k-gold-400)" stroke-width="5" stroke-dasharray="${len.toFixed(0)}" stroke-dashoffset="${(len * (1 - progress)).toFixed(0)}" transform="rotate(-90 60 60)" stroke-linecap="round"></circle>`
  )
  return h('div', 'k-timer', { left: x, top: y }, [ring, h('div', 'k-timer__value', {}, [String(value)])])
}

/** Emblema rombo dorado de la cabecera. */
export function emblem(size = 44): SVGSVGElement {
  return svg(
    '0 0 44 44',
    { width: size, height: size },
    '<path d="M22 2 L42 22 L22 42 L2 22 Z" fill="none" style="stroke:var(--k-gold-500)" stroke-width="1.5"></path><path d="M22 12 L32 22 L22 32 L12 22 Z" style="fill:var(--k-gold-500)"></path>'
  )
}
