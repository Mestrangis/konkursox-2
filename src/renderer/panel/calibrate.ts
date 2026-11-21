// Modo calibración: se ve la ventana de Discord y se dibuja con el ratón un rectángulo por concursante.
// Los rectángulos se guardan en coordenadas relativas (0..1) a la ventana capturada.
import { fitContain, rectFromDrag, sourceRectForFrame, type Point } from '../../shared/crop'
import { frameSizeFor } from '../../shared/layouts'
import { contestantOrder } from '../../shared/state'
import { SLOT_IDS, type CaptureSource, type GameState, type SlotId } from '../../shared/types'
import type { CaptureFeed } from '../common/feed'
import { h } from '../ds/components'

export const SLOT_COLORS: Record<SlotId, string> = {
  c1: '#e6cb85',
  c2: '#7fb0ff',
  c3: '#3fb56e',
  c4: '#f4b552',
  host: '#e07a6f'
}

export function slotLabel(s: GameState, slot: SlotId): { short: string; name: string } {
  if (slot === 'host') return { short: 'P', name: s.host.name || 'Presentador' }
  const i = SLOT_IDS.indexOf(slot)
  return { short: String(i + 1), name: s.contestants.find((c) => c.id === slot)?.name ?? '' }
}

/** Pinta en `canvas` el recorte del slot con el aspecto del marco de la plantilla actual. */
export function drawSlotPreview(canvas: HTMLCanvasElement, feed: CaptureFeed, s: GameState, slot: SlotId, width: number): void {
  const size = frameSizeFor(s.layout === 'logo' ? 'trio' : s.layout, slot, contestantOrder(s))
  const w = Math.round(width)
  const hgt = Math.round((width * size.h) / size.w)
  if (canvas.width !== w || canvas.height !== hgt) {
    canvas.width = w
    canvas.height = hgt
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rel = s.cameras.rects[slot]
  const src = rel && feed.ready ? sourceRectForFrame(rel, feed.width, feed.height, w, hgt) : null
  ctx.clearRect(0, 0, w, hgt)
  if (src) ctx.drawImage(feed.video, src.x, src.y, src.w, src.h, 0, 0, w, hgt)
  else {
    // silueta del diseño
    ctx.fillStyle = '#24314f'
    const sh = hgt * 0.74
    const sw = sh
    const x0 = (w - sw) / 2
    const y0 = hgt - sh
    const k = sw / 200
    ctx.beginPath()
    ctx.arc(x0 + 100 * k, y0 + 70 * k, 40 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x0 + 14 * k, y0 + 200 * k)
    ctx.bezierCurveTo(x0 + 14 * k, y0 + 138 * k, x0 + 58 * k, y0 + 118 * k, x0 + 100 * k, y0 + 118 * k)
    ctx.bezierCurveTo(x0 + 142 * k, y0 + 118 * k, x0 + 186 * k, y0 + 138 * k, x0 + 186 * k, y0 + 200 * k)
    ctx.closePath()
    ctx.fill()
  }
}

export function createCalibration(feed: CaptureFeed, getState: () => GameState) {
  let open = false
  let active: SlotId = 'c1'
  let drag: { a: Point; b: Point } | null = null
  let sources: CaptureSource[] = []

  const sourcesEl = h('div', 'p-cal__sources')
  const canvas = h('canvas')
  const empty = h('div', 'p-cal__empty')
  const wrap = h('div', 'p-cal__canvaswrap', {}, [canvas, empty])
  const slotList = h('div', 'p-col', { gap: 6 })
  const framePreview = h('canvas', 'p-cal__frame')
  const frameCaption = h('div', 'p-muted')
  const clearBtn = h('button', 'p-btn p-btn--sm', {}, ['Borrar recorte'])
  const clearAllBtn = h('button', 'p-btn p-btn--sm p-btn--ko', {}, ['Borrar todos'])
  const refreshBtn = h('button', 'p-btn p-btn--sm', {}, ['Actualizar lista'])
  const closeBtn = h('button', 'p-btn', {}, ['Listo'])
  const sourceName = h('span', 'p-muted')

  const el = h('div', 'p-modal', {}, [
    h('div', 'p-cal', {}, [
      h('div', 'p-cal__head', {}, [
        h('h2', '', {}, ['Calibración de cámaras']),
        sourceName,
        h('span', 'p-spacer'),
        h('span', 'p-muted', {}, ['Elige un concursante y arrastra un rectángulo sobre su cámara. Se adapta solo si mueves o redimensionas Discord.']),
        closeBtn
      ]),
      h('div', 'p-col', { minHeight: 0 }, [h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Ventana']), h('span', 'p-spacer'), refreshBtn]), sourcesEl]),
      wrap,
      h('div', 'p-cal__side', {}, [
        h('span', 'p-label', {}, ['Recortes']),
        slotList,
        h('span', 'p-label', { marginTop: 8 }, ['Así se verá']),
        framePreview,
        frameCaption,
        h('div', 'p-row', {}, [clearBtn, clearAllBtn])
      ])
    ])
  ])

  async function loadSources(): Promise<void> {
    sources = await window.konk.listSources()
    renderSources()
  }

  function renderSources(): void {
    const s = getState()
    sourcesEl.replaceChildren(
      ...sources.map((src) => {
        const b = h('button', 'p-source' + (src.id === s.cameras.sourceId ? ' is-active' : ''))
        if (src.thumbnail) {
          const img = h('img')
          img.src = src.thumbnail
          b.append(img)
        }
        b.append(h('span', '', {}, [src.name]))
        b.title = src.name
        b.onclick = () => void window.konk.dispatch({ type: 'setCameraSource', sourceId: src.id, sourceName: src.name })
        return b
      })
    )
    if (!sources.length) sourcesEl.append(h('div', 'p-muted', {}, ['No hay ventanas. Abre Discord y pulsa "Actualizar lista".']))
  }

  function renderSlots(): void {
    const s = getState()
    slotList.replaceChildren(
      ...SLOT_IDS.map((slot) => {
        const { short, name } = slotLabel(s, slot)
        const has = !!s.cameras.rects[slot]
        const b = h('button', 'p-slotbtn' + (slot === active ? ' is-active' : ''), {}, [
          h('i', '', { background: SLOT_COLORS[slot] }),
          h('span', '', {}, [`${short} · ${name}`]),
          h('small', '', {}, [has ? 'Hecho' : 'Sin recorte'])
        ])
        b.onclick = () => {
          active = slot
          renderSlots()
          draw()
        }
        return b
      })
    )
    const size = frameSizeFor(s.layout === 'logo' ? 'trio' : s.layout, active, contestantOrder(s))
    frameCaption.textContent = `Marco ${size.w} x ${size.h} en la plantilla actual`
  }

  /** Geometría del vídeo dentro del canvas (en px CSS). */
  function videoBox() {
    const w = wrap.clientWidth
    const hh = wrap.clientHeight
    return fitContain(feed.width || 16, feed.height || 9, w, hh)
  }

  function toRel(ev: PointerEvent): Point {
    const r = wrap.getBoundingClientRect()
    const vb = videoBox()
    return { x: (ev.clientX - r.left - vb.x) / vb.w, y: (ev.clientY - r.top - vb.y) / vb.h }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (!feed.ready) return
    canvas.setPointerCapture(ev.pointerId)
    const p = toRel(ev)
    drag = { a: p, b: p }
    draw()
  })
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return
    drag.b = toRel(ev)
    draw()
  })
  canvas.addEventListener('pointerup', (ev) => {
    if (!drag) return
    drag.b = toRel(ev)
    const rect = rectFromDrag(drag.a, drag.b)
    drag = null
    if (rect) {
      const done = active
      void window.konk.dispatch({ type: 'setRect', slot: done, rect })
      // pasa al siguiente slot sin recorte
      const s = getState()
      const next = SLOT_IDS.find((x) => x !== done && !s.cameras.rects[x])
      if (next) active = next
    }
    draw()
  })

  clearBtn.onclick = () => void window.konk.dispatch({ type: 'setRect', slot: active, rect: null })
  clearAllBtn.onclick = () => {
    for (const slot of SLOT_IDS) void window.konk.dispatch({ type: 'setRect', slot, rect: null })
  }
  refreshBtn.onclick = () => void loadSources()
  closeBtn.onclick = () => close()
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') close()
  })

  function draw(): void {
    if (!open) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const hh = wrap.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(hh * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, hh)
    const s = getState()
    if (!feed.ready) {
      empty.textContent = !s.cameras.sourceId
        ? 'Elige la ventana de Discord en la lista de la izquierda.'
        : 'Sin imagen de la ventana. Comprueba que Discord no está minimizado.'
      empty.style.display = ''
      drawSlotPreview(framePreview, feed, s, active, 270)
      return
    }
    empty.style.display = 'none'
    const vb = videoBox()
    ctx.drawImage(feed.video, vb.x, vb.y, vb.w, vb.h)
    ctx.fillStyle = 'rgba(2,5,11,0.35)'
    ctx.fillRect(vb.x, vb.y, vb.w, vb.h)
    const toPx = (r: { x: number; y: number; w: number; h: number }) => ({
      x: vb.x + r.x * vb.w,
      y: vb.y + r.y * vb.h,
      w: r.w * vb.w,
      h: r.h * vb.h
    })
    for (const slot of SLOT_IDS) {
      const rel = s.cameras.rects[slot]
      if (!rel) continue
      const p = toPx(rel)
      // muestra la zona recortada sin oscurecer
      ctx.drawImage(feed.video, rel.x * feed.width, rel.y * feed.height, rel.w * feed.width, rel.h * feed.height, p.x, p.y, p.w, p.h)
      ctx.lineWidth = slot === active ? 3 : 2
      ctx.strokeStyle = SLOT_COLORS[slot]
      ctx.strokeRect(p.x, p.y, p.w, p.h)
      const { short, name } = slotLabel(s, slot)
      ctx.font = '600 16px "Barlow Condensed", sans-serif'
      const label = `${short} · ${name}`.toUpperCase()
      const tw = ctx.measureText(label).width + 12
      ctx.fillStyle = SLOT_COLORS[slot]
      ctx.fillRect(p.x, p.y, tw, 22)
      ctx.fillStyle = '#05080f'
      ctx.fillText(label, p.x + 6, p.y + 16)
    }
    if (drag) {
      const r = rectFromDrag(drag.a, drag.b)
      if (r) {
        const p = toPx(r)
        ctx.setLineDash([8, 6])
        ctx.lineWidth = 2
        ctx.strokeStyle = SLOT_COLORS[active]
        ctx.strokeRect(p.x, p.y, p.w, p.h)
        ctx.setLineDash([])
      }
    }
    drawSlotPreview(framePreview, feed, s, active, 270)
  }

  function openModal(): void {
    open = true
    el.classList.add('is-open')
    renderSlots()
    void loadSources()
    requestAnimationFrame(draw)
  }

  function close(): void {
    open = false
    drag = null
    el.classList.remove('is-open')
  }

  new ResizeObserver(() => draw()).observe(wrap)

  return {
    el,
    open: openModal,
    close,
    get isOpen() {
      return open
    },
    /** Llamar en cada fotograma del feed y en cada cambio de estado. */
    draw,
    update(s: GameState): void {
      if (!open) return
      sourceName.textContent = s.cameras.sourceName ? `Capturando: ${s.cameras.sourceName}` : 'Sin ventana seleccionada'
      renderSlots()
      renderSources()
      draw()
    }
  }
}
