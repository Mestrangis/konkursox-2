// Piezas comunes del panel (botón con tecla, interruptor, segmentado...) y el contexto compartido.
import type { CueId } from '../../shared/quiz'
import type { GameId } from '../../shared/scene'
import type { Action, AudioLibrary, GameState } from '../../shared/types'
import type { CaptureFeed } from '../common/feed'
import { h, svg } from '../ds/components'
import type { AudioEngine } from './audio'
import type { LibStore } from './lib'

export { h, svg }

export type ScreenId = GameId | 'biblioteca' | 'multimedia' | 'concursantes' | 'camaras' | 'ajustes'

export interface Screen {
  el: HTMLElement
  update(s: GameState): void
  /** teclas de la pantalla (solo cuando está abierta); devuelve true si la ha usado */
  onKey?(e: KeyboardEvent): boolean
  /** al abrir la pantalla */
  shown?(): void
  /** en cada fotograma de la captura (vistas previas de cámara) */
  frame?(s: GameState): void
}

export interface Ctx {
  get state(): GameState
  send(a: Action): void
  audio: AudioEngine
  get audioLib(): AudioLibrary
  reloadAudio(): Promise<void>
  lib: LibStore
  feed: CaptureFeed
  /** sonido automático del juego (respeta el interruptor) */
  cue(id: CueId): void
  go(screen: ScreenId): void
  openCalibration(): void
  toast(msg: string): void
}

/** Botón con su tecla, como en el diseño. */
export function btn(label: string | (Node | string)[], onClick: () => void, cls = 'b', key?: string): HTMLButtonElement {
  const b = h('button', cls, {}, typeof label === 'string' ? [label] : label)
  if (key) b.append(kbd(key))
  b.onclick = (e) => {
    e.preventDefault()
    onClick()
  }
  return b
}

export const kbd = (k: string): HTMLSpanElement => h('span', 'kb', {}, [k])

/** Interruptor. */
export function sw(on: boolean, onClick: () => void, label?: string): HTMLButtonElement {
  const b = h('button', `sw${on ? ' on' : ''}`)
  b.setAttribute('aria-pressed', String(on))
  if (label) b.setAttribute('aria-label', label)
  b.onclick = onClick
  return b
}

/** Control segmentado. */
export function seg<T extends string>(opts: { v: T; t: string; disabled?: boolean }[], cur: T | null, pick: (v: T) => void): HTMLDivElement {
  const el = h('div', 'seg')
  for (const o of opts) {
    const b = h('button', o.v === cur ? 'on' : '', {}, [o.t])
    b.disabled = !!o.disabled
    b.onclick = () => pick(o.v)
    el.append(b)
  }
  return el
}

export function icon(d: string, size = 18, fill = '#8a8a93'): SVGSVGElement {
  return svg('0 0 24 24', { width: size, height: size }, `<path d="${d}" fill="${fill}"></path>`)
}

export const ICONS = {
  test: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  sino: 'M12 2a10 10 0 1 1 0 20zM12 4v16a8 8 0 0 1 0-16z',
  escalera: 'M2 20v-4h5v-5h5V6h5V2h5v18z',
  estimacion: 'M12 3a10 10 0 0 1 10 10h-3a7 7 0 0 0-14 0H2A10 10 0 0 1 12 3zm4.6 4.2 1.4 1.4-4.6 5.1a2 2 0 1 1-1.5-1.3z',
  quien: 'M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-7l-5 4v-4a3 3 0 0 1-3-3z',
  rosco: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  biblioteca: 'M3 3h4v18H3zM9 3h4v18H9zM15.2 4.1l3.9-1 4.6 17.4-3.9 1z',
  concursantes: 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM3 21a9 7 0 0 1 18 0z',
  camaras: 'M3 6h12a2 2 0 0 1 2 2v1.5L22 6v12l-5-3.5V16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  ajustes: 'M5 3h3v6.2a3 3 0 0 1 0 5.6V21H5v-6.2a3 3 0 0 1 0-5.6zM16 3h3v2.2a3 3 0 0 1 0 5.6V21h-3V10.8a3 3 0 0 1 0-5.6z',
  cabecera: 'M12 2l10 10-10 10L2 12z',
  juego: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  marcador: 'M3 13h5v8H3zM9.5 3h5v18h-5zM16 9h5v12h-5z',
  final: 'M8 6h8v15H8zM1 11h6v10H1zM17 14h6v7h-6z',
  multimedia: 'M3 5h18v14H3zM5 17h14l-4.5-6-3.5 4.5-2.5-3zM16 8.5a1.5 1.5 0 1 1 0 .01z',
  caret: 'M7 10l5 5 5-5z',
  play: 'M7 4v16l13-8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  prev: 'M5 4h3v16H5zM20 4v16L9 12z',
  next: 'M16 4h3v16h-3zM4 4v16l11-8z',
  vol: 'M3 9h4l5-5v16l-5-5H3zM15 8a5 5 0 0 1 0 8V8z',
  note: 'M4 3h16v13l-5 5H4zM14 21v-5h6',
  music: 'M9 3h12v13.5a3.5 3.5 0 1 1-2-3.2V7h-8v11.5A3.5 3.5 0 1 1 9 15.3z',
  check: 'M9.5 16.2 4.8 11.5 3.4 12.9l6.1 6.1L21 7.5l-1.4-1.4z',
  image: 'M3 5h18v14H3zM5 17h14l-4.5-6-3.5 4.5-2.5-3z',
  shuffle: 'M16 3h5v5l-1.8-1.8L5.4 20 4 18.6 17.8 4.8zM4 5.4 5.4 4l5 5L9 10.4zM14.6 13.4l1.4-1.4 3.2 3.2L21 13.4V21h-7.6l1.8-1.8z',
  triDown: 'M4 8h16l-8 9z',
  triRight: 'M8 4v16l9-8z'
}

/** Silueta del diseño (miniaturas de cámara). */
export const silhouette = (): SVGSVGElement =>
  svg('0 0 200 200', {}, '<circle cx="100" cy="70" r="40"></circle><path d="M14 200 C14 138 58 118 100 118 C142 118 186 138 186 200 Z"></path>')

/** ¿El foco está en un campo de texto? (entonces no se disparan atajos) */
export function typing(e: Event): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  if (t.isContentEditable) return true
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type
    return !['checkbox', 'radio', 'range', 'button'].includes(type)
  }
  return false
}

/** Menú contextual sencillo (clic derecho). */
export function contextMenu(x: number, y: number, items: (HTMLElement | { label: string; run: () => void } | null)[]): void {
  document.querySelector('.ctx')?.remove()
  const menu = h('div', 'ctx ui')
  for (const it of items) {
    if (!it) menu.append(h('hr'))
    else if (it instanceof HTMLElement) menu.append(it)
    else {
      const b = h('button', '', {}, [it.label])
      b.onclick = () => {
        menu.remove()
        it.run()
      }
      menu.append(b)
    }
  }
  document.body.append(menu)
  const r = menu.getBoundingClientRect()
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`
  const close = (e: Event) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove()
      window.removeEventListener('mousedown', close, true)
    }
  }
  setTimeout(() => window.addEventListener('mousedown', close, true))
}

/** Nombre de un concursante o equipo. */
export function nameOf(s: GameState, t: { kind: 'contestant'; id: string } | { kind: 'team'; index: 0 | 1 } | null | undefined): string {
  if (!t) return ''
  if (t.kind === 'team') return s.teams[t.index].name
  return s.contestants.find((c) => c.id === t.id)?.name ?? ''
}

/** Formatea segundos como m:ss. */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Repinta una pantalla con campos de texto sin quitarte el foco: mientras escribes dentro,
 * el repintado se aplaza hasta que sales del campo.
 */
export function editableArea(el: HTMLElement, rebuild: () => void): { refresh(changed: boolean): void } {
  let dirty = false
  el.addEventListener('focusout', () =>
    setTimeout(() => {
      if (dirty && !el.contains(document.activeElement)) {
        dirty = false
        rebuild()
      }
    }, 200)
  )
  return {
    refresh(changed) {
      if (!changed) return
      if (el.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('input, textarea, select')) {
        dirty = true
        return
      }
      dirty = false
      rebuild()
    }
  }
}

// ---------------------------------------------------------------- diálogos propios
// (Electron no admite prompt(); y confirm() bloquea la ventana: mejor diálogos del panel)

function dialogBox(build: (close: (v: unknown) => void) => HTMLElement[]): Promise<unknown> {
  return new Promise((resolve) => {
    document.querySelector('.dlg-back')?.remove()
    const back = h('div', 'dlg-back ui')
    const box = h('div', 'dlg pnl')
    const close = (v: unknown) => {
      back.remove()
      window.removeEventListener('keydown', onKey, true)
      resolve(v)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        close(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    box.append(...build(close))
    back.append(box)
    back.onmousedown = (e) => {
      if (e.target === back) close(null)
    }
    document.body.append(back)
    requestAnimationFrame(() => (box.querySelector('input, textarea') as HTMLElement | null)?.focus())
  })
}

/** Pide un texto. Devuelve null si se cancela. */
export function askText(title: string, value = '', okLabel = 'Aceptar', hint?: string): Promise<string | null> {
  return dialogBox((close) => {
    const input = h('input', 'inp')
    input.value = value
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        close(input.value.trim() || null)
      }
    }
    requestAnimationFrame(() => input.select())
    return [
      h('b', '', { fontSize: 16 }, [title]),
      ...(hint ? [h('span', 'mut', { fontSize: 12 }, [hint])] : []),
      input,
      h('div', 'dlg-actions', {}, [btn('Cancelar', () => close(null), 'b ghost'), btn(okLabel, () => close(input.value.trim() || null), 'b acc')])
    ]
  }) as Promise<string | null>
}

/** Pide confirmación. */
export function askConfirm(title: string, text = '', okLabel = 'Sí', danger = false): Promise<boolean> {
  return dialogBox((close) => {
    const ok = btn(okLabel, () => close(true), danger ? 'b danger-solid' : 'b acc')
    requestAnimationFrame(() => ok.focus())
    return [
      h('b', '', { fontSize: 16 }, [title]),
      ...(text ? [h('span', 'mut', { fontSize: 13, lineHeight: '1.4' }, [text])] : []),
      h('div', 'dlg-actions', {}, [btn('Cancelar', () => close(false), 'b ghost'), ok])
    ]
  }).then((v) => v === true)
}

/** Diálogo con contenido libre (se cierra con el botón o con Esc). */
export function openDialog(title: string, content: (close: () => void) => HTMLElement[], width = 560): Promise<void> {
  return dialogBox((close) => {
    const els = content(() => close(null))
    requestAnimationFrame(() => {
      const box = document.querySelector('.dlg') as HTMLElement | null
      if (box) box.style.width = `${width}px`
    })
    return [h('div', '', { display: 'flex', alignItems: 'center' }, [h('b', '', { fontSize: 16, flex: 1 }, [title]), btn('Cerrar', () => close(null), 'b ghost sm')]), ...els]
  }).then(() => undefined)
}
