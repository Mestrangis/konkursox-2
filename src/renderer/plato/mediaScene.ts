// Escena Multimedia: imagen, vídeo o YouTube a pantalla completa dentro de un marco con la estética del plató.
import { mediaPosition, type MediaItem } from '../../shared/scene'
import type { GameState } from '../../shared/types'
import { bevelBar, h } from '../ds/components'
import type { Scene } from './scenes'

export const mediaKey = (s: GameState): string => `media:${s.media.item?.kind ?? ''}:${s.media.item?.src ?? ''}`

const report = (duration?: number, error?: string | null) => void window.konk.dispatch({ type: 'mediaReport', duration, error })

export function mediaUrl(item: MediaItem): string {
  return item.kind === 'youtube' ? `https://www.youtube-nocookie.com/embed/${item.src}` : item.src
}

export function buildMediaScene(s: GameState): Scene {
  const key = mediaKey(s)
  const item = s.media.item
  const root = h('div', 'k-stage k-enter')
  const hasTitle = !!item && item.kind !== 'image'
  const box = { x: 80, y: 48, w: 1760, h: hasTitle ? 850 : 984 }
  const frame = h('div', 'k-media', { left: box.x, top: box.y, width: box.w, height: box.h })
  root.append(frame)
  const title = h('span', 'k-name', { fontSize: 30 })
  if (hasTitle) root.append(h('div', 'k-track', { top: 963 }), bevelBar({ box: { x: 360, y: 928, w: 1200, h: 70 }, c: 30, center: true }, [title]))

  // en el panel (miniatura y vistas previas) la escena es muda y sin YouTube
  const preview = !!window.__konkPreview
  let video: HTMLVideoElement | null = null
  let iframe: HTMLIFrameElement | null = null
  let ytCmd: ((func: string, args?: unknown[]) => void) | null = null
  let lastSeek = ''
  let lastPlaying: boolean | null = null
  let lastVolume = -1

  if (item?.kind === 'image') {
    const img = h('img')
    img.src = item.src
    img.alt = ''
    frame.append(img)
  } else if (item && preview && item.kind === 'youtube') {
    const img = h('img')
    img.src = item.thumb ?? `https://i.ytimg.com/vi/${item.src}/hqdefault.jpg`
    img.alt = ''
    frame.append(img)
  } else if (item?.kind === 'video') {
    video = h('video')
    video.muted = preview
    video.src = item.src
    video.preload = 'auto'
    video.playsInline = true
    if (!preview) {
      video.addEventListener('loadedmetadata', () => report(video!.duration))
      video.addEventListener('error', () => report(undefined, 'No se puede reproducir este vídeo (formato no compatible)'))
    }
    frame.append(video)
  } else if (item?.kind === 'youtube') {
    iframe = h('iframe')
    iframe.src = `https://www.youtube-nocookie.com/embed/${item.src}?enablejsapi=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1`
    iframe.allow = 'autoplay; encrypted-media'
    iframe.setAttribute('frameborder', '0')
    frame.append(iframe)
    const cmd = (func: string, args: unknown[] = []) => iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    const onMsg = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow) return
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (d.event === 'onError')
          report(undefined, Number(d.info) === 101 || Number(d.info) === 150 ? 'Este vídeo no permite incrustarse: ábrelo en el navegador' : `YouTube no puede reproducir este vídeo (error ${d.info})`)
        if (d.event === 'infoDelivery' && d.info?.duration) report(d.info.duration)
        if (d.event === 'onReady' || (d.event === 'infoDelivery' && lastPlaying === null)) sync(window.__konkMediaState!)
      } catch {
        /* mensajes de otros */
      }
    }
    window.addEventListener('message', onMsg)
    iframe.addEventListener('load', () => {
      iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'konk' }), '*')
      lastPlaying = null
      lastSeek = ''
      lastVolume = -1
      setTimeout(() => sync(window.__konkMediaState!), 400)
    })
    ytCmd = cmd
  }
  if (!item) frame.append(h('div', 'k-media__empty', {}, ['Nada que mostrar']))

  function sync(st: GameState): void {
    if (!preview) window.__konkMediaState = st
    const m = st.media
    const pos = mediaPosition(m, Date.now())
    const seekKey = `${m.at}|${m.since}`
    if (video) {
      video.volume = m.volume
      if (Math.abs(video.currentTime - pos) > 0.6 || seekKey !== lastSeek) {
        if (Number.isFinite(pos)) video.currentTime = Math.min(pos, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : pos)
        lastSeek = seekKey
      }
      if (m.playing && video.paused && st.scene === 'multimedia') void video.play().catch(() => undefined)
      if ((!m.playing || st.scene !== 'multimedia') && !video.paused) video.pause()
    }
    if (iframe && ytCmd) {
      if (seekKey !== lastSeek) {
        ytCmd('seekTo', [pos, true])
        lastSeek = seekKey
      }
      const play = m.playing && st.scene === 'multimedia'
      if (play !== lastPlaying) {
        ytCmd(play ? 'playVideo' : 'pauseVideo')
        lastPlaying = play
      }
      if (m.volume !== lastVolume) {
        ytCmd('setVolume', [Math.round(m.volume * 100)])
        lastVolume = m.volume
      }
    }
    title.textContent = st.media.item?.title ?? ''
  }

  sync(s)
  return {
    key,
    root,
    frames: new Map(),
    update: sync,
    dispose: () => {
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
      if (iframe) iframe.src = 'about:blank'
    }
  }
}

declare global {
  interface Window {
    __konkMediaState?: GameState
    /** lo pone el panel: sus escenas son vistas previas (sin sonido) */
    __konkPreview?: boolean
  }
}
