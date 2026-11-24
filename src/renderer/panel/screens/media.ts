// Multimedia: biblioteca de imágenes y vídeos (locales y de YouTube) y control de la escena F9.
import { mediaPosition, type MediaItem } from '../../../shared/scene'
import type { GameState } from '../../../shared/types'
import type { LibMediaItem, MediaLibrary } from '../../../main/multimedia'
import { askConfirm, askText, btn, h, icon, ICONS, kbd, mmss, type Ctx, type Screen } from '../ui'

const fileUrl = (rel: string) => `konk-media://multimedia/${rel.split('/').map(encodeURIComponent).join('/')}`

/** Elemento de la biblioteca -> lo que se manda al plató. */
export function toMediaItem(it: LibMediaItem): MediaItem {
  if (it.kind === 'youtube') return { kind: 'youtube', src: it.src, title: it.title, thumb: it.thumb }
  return { kind: it.kind, src: fileUrl(it.src), title: it.title }
}

export function createMediaScreen(ctx: Ctx): Screen {
  let lib: MediaLibrary = { dir: '', folders: [''], items: [] }
  let folder = ''
  /** sección Música: la música de fondo (misma biblioteca de audio que el reproductor) */
  const MUSIC = '\u0000musica'
  const head = h('div', 'head')
  const controls = h('div')
  const folders = h('nav', 'pnl', { width: 210, flex: 'none', padding: 10, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' })
  const grid = h('div', 'mgrid')
  const yt = h('input', 'inp', { flex: 1 })
  yt.placeholder = 'Pega un enlace de YouTube y pulsa Intro'
  const toolbar = h('div', '', { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' })
  const fillBar = (kids: Node[]) => {
    toolbar.append(...kids)
    return toolbar
  }
  const hint = h('span', 'mut', { fontSize: 12 }, ['Arrastra aquí imágenes y vídeos de tu ordenador. Clic en uno para sacarlo en el plató (escena Multimedia, F9).'])
  const drop = h('div', 'pnl', { flex: 1, minWidth: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }, [
    fillBar([
      btn('Añadir imágenes o vídeos…', async () => {
        const n = await window.konk.mediaChoose(folder)
        if (n) await reload()
      }, 'b'),
      yt,
      btn('Añadir YouTube', () => void addYt(), 'b acc'),
      btn('Abrir la carpeta', () => void window.konk.mediaOpenDir(), 'b ghost')
    ]),
    hint,
    grid
  ])
  const el = h('div', 'screen', {}, [head, controls, h('div', '', { display: 'flex', gap: 14, flex: 1, minHeight: 0 }, [folders, drop])])

  yt.onkeydown = (e) => {
    if (e.key === 'Enter') void addYt()
  }
  drop.ondragover = (e) => {
    e.preventDefault()
    drop.style.boxShadow = '0 0 0 2px #4f7dff'
  }
  drop.ondragleave = () => (drop.style.boxShadow = '')
  drop.ondrop = async (e) => {
    e.preventDefault()
    drop.style.boxShadow = ''
    const paths = [...(e.dataTransfer?.files ?? [])].map((f) => window.konk.pathForFile(f)).filter(Boolean)
    if (folder === MUSIC) {
      const added = await window.konk.audioImport(paths, 'musica')
      await ctx.reloadAudio()
      ctx.toast(added.length ? `Añadidas ${added.length} pistas a la música` : 'Solo se admiten archivos de audio')
      return paintLib()
    }
    const n = await window.konk.mediaImport(paths, folder)
    ctx.toast(n ? `Añadidos ${n} archivos` : 'Solo se admiten imágenes y vídeos')
    await reload()
  }

  async function addYt(): Promise<void> {
    const url = yt.value.trim()
    if (!url) return
    try {
      const r = await window.konk.mediaYoutube(url, folder)
      yt.value = ''
      ctx.toast(r.embeddable ? `Añadido: ${r.title}` : `Añadido, pero «${r.title}» no permite incrustarse: puede que no se vea en el plató`)
      await reload()
    } catch (err) {
      ctx.toast(String((err as Error).message ?? err))
    }
  }

  async function reload(): Promise<void> {
    lib = await window.konk.mediaList()
    if (folder !== MUSIC && !lib.folders.includes(folder)) folder = ''
    paintLib()
  }

  function show(it: LibMediaItem): void {
    ctx.send({ type: 'mediaShow', item: toMediaItem(it), now: Date.now() })
    if (it.kind === 'youtube' && it.embeddable === false) ctx.toast('Ojo: este vídeo de YouTube no permite incrustarse; si no se ve, ábrelo en el navegador')
  }

  function paintLib(): void {
    folders.replaceChildren(
      h('span', 'lbl', { padding: '4px 8px 8px' }, ['Carpetas']),
      ...lib.folders.map((f) => {
        const n = lib.items.filter((x) => x.folder === f).length
        const a = h('a', `tg${f === folder ? ' on' : ''}`, {}, [h('span', '', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [f || 'General']), h('span', 'c', {}, [String(n)])])
        a.onclick = () => {
          folder = f
          paintLib()
        }
        return a
      }),
      (() => {
        const a = h('a', `tg${folder === MUSIC ? ' on' : ''}`, { marginTop: 10 }, [h('span', '', {}, ['Música de fondo']), h('span', 'c', {}, [String(ctx.audioLib.music.length)])])
        a.onclick = () => {
          folder = MUSIC
          paintLib()
        }
        return a
      })(),
      h('span', 'spacer'),
      btn('+ Nueva carpeta', async () => {
        const name = await askText('Carpeta nueva', '', 'Crear', 'Por ejemplo "Fotos del grupo" o "Vídeos de la final"')
        if (!name) return
        try {
          folder = await window.konk.mediaFolder(name)
          await reload()
        } catch (err) {
          ctx.toast(String((err as Error).message ?? err))
        }
      }, 'b ghost')
    )
    if (folder === MUSIC) return paintMusic()
    toolbar.style.display = ''
    hint.style.display = ''
    const cur = ctx.state?.media.item
    const items = lib.items.filter((x) => x.folder === folder)
    grid.replaceChildren(
      ...items.map((it) => {
        const thumb = h('div', 'mthumb')
        if (it.kind === 'image') {
          const img = h('img')
          img.src = fileUrl(it.src)
          img.alt = ''
          img.loading = 'lazy'
          thumb.append(img)
        } else if (it.kind === 'video') {
          const v = h('video')
          v.src = `${fileUrl(it.src)}#t=0.5`
          v.muted = true
          v.preload = 'metadata'
          thumb.append(v)
        } else {
          const img = h('img')
          img.src = it.thumb ?? ''
          img.alt = ''
          thumb.append(img)
        }
        const live = !!cur && cur.kind === it.kind && cur.src === toMediaItem(it).src
        const badge = it.kind === 'youtube' ? 'YouTube' : it.kind === 'video' ? 'Vídeo' : 'Imagen'
        const del = h('button', 'x', { position: 'absolute', right: 6, top: 6, background: 'rgba(0,0,0,0.55)' }, ['×'])
        del.title = 'Borrar (va a la papelera de la carpeta)'
        del.onclick = async (e) => {
          e.stopPropagation()
          if (!(await askConfirm(`¿Borrar «${it.title}»?`, it.kind === 'youtube' ? 'Se quita de la lista.' : 'Se mueve a multimedia\\_papelera (no se pierde).', 'Borrar', true))) return
          await window.konk.mediaDelete(it.id)
          await reload()
        }
        const card = h('div', `mcard${live ? ' live' : ''}`, {}, [
          thumb,
          del,
          h('div', '', { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }, [
            h('span', '', { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [it.title]),
            h('span', it.kind === 'youtube' && it.embeddable === false ? 'nm warn' : 'nm', {}, [it.kind === 'youtube' && it.embeddable === false ? 'No incrustable' : badge])
          ])
        ])
        card.title = live ? 'En pantalla' : 'Clic para sacarlo en el plató'
        card.onclick = () => show(it)
        return card
      })
    )
    if (!items.length) grid.append(h('div', 'mut', { padding: 20, fontSize: 14 }, ['Carpeta vacía: arrastra aquí imágenes o vídeos, o pega un enlace de YouTube.']))
  }

  /** Música de fondo: la lista del reproductor; se añade arrastrando o con el botón. */
  function paintMusic(): void {
    toolbar.style.display = 'none'
    hint.style.display = 'none'
    const music = ctx.audioLib.music
    grid.replaceChildren(
      h('div', '', { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }, [
        btn('Añadir música…', async () => {
          const added = await window.konk.audioChoose('musica')
          await ctx.reloadAudio()
          if (added.length) ctx.toast(`Añadidas ${added.length} pistas`)
          paintLib()
        }, 'b acc'),
        btn('Abrir la carpeta de audio', () => void window.konk.audioOpenDir(), 'b ghost'),
        h('span', 'mut', { fontSize: 12 }, ['Arrastra aquí canciones. Es la misma música que el reproductor de la derecha.'])
      ]),
      ...music.map((m) => {
        const row = h('div', 'pnl', { gridColumn: '1 / -1', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }, [
          h('span', '', { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: ctx.audio.current === m ? 700 : 500 }, [m.replace(/\.[^.]+$/, '')]),
          btn(ctx.audio.current === m && ctx.audio.playing ? 'Sonando' : 'Reproducir', () => void ctx.audio.play(m, true).then(paintMusic), 'b sm ghost')
        ])
        return row
      })
    )
    if (!music.length) grid.append(h('div', 'mut', { padding: 20, fontSize: 14, gridColumn: '1 / -1' }, ['No hay música todavía.']))
  }

  function paintControls(s: GameState): void {
    const m = s.media
    const onAir = s.scene === 'multimedia'
    head.replaceChildren(
      h('div', 'title', {}, [h('b', '', {}, ['Multimedia']), h('span', 'mut', { fontSize: 13 }, ['Imágenes y vídeos a pantalla completa en el plató (escena F9)'])]),
      h('span', 'spacer'),
      onAir
        ? h('span', 'air', { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }, [h('span', 'dotlive', { width: 8, height: 8 }), 'En el aire'])
        : h('span')
    )
    controls.replaceChildren()
    if (!m.item) return
    const isVideo = m.item.kind !== 'image'
    const dur = s.runtime.media.duration
    const pos = mediaPosition(m, Date.now())
    const fill = h('i', '', { width: `${dur ? Math.min(100, (pos / dur) * 100) : 0}%` })
    const seek = h('div', 'seek', { flex: 1 }, [fill])
    seek.onmousedown = (e) => {
      const r = seek.getBoundingClientRect()
      if (dur) ctx.send({ type: 'mediaSeek', t: ((e.clientX - r.left) / r.width) * dur, now: Date.now() })
    }
    const tcur = h('span', 'mut mtime', { fontSize: 12, minWidth: 90 }, [`${mmss(pos)} / ${dur ? mmss(dur) : '--:--'}`])
    const vol = h('input')
    vol.type = 'range'
    vol.min = '0'
    vol.max = '100'
    vol.value = String(Math.round(m.volume * 100))
    vol.style.width = '110px'
    vol.setAttribute('aria-label', 'Volumen del vídeo')
    vol.oninput = () => ctx.send({ type: 'mediaVolume', volume: Number(vol.value) / 100 })
    controls.append(
      h('div', 'pnl', { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: onAir ? '#e5484d' : '' }, [
        h('div', '', { display: 'flex', flexDirection: 'column', minWidth: 160, maxWidth: 300 }, [
          h('span', 'lbl', {}, [onAir ? 'En pantalla' : 'Preparado (oculto)']),
          h('span', '', { fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [m.item.title])
        ]),
        btn(onAir ? 'Ocultar' : 'Mostrar', () => (onAir ? ctx.send({ type: 'mediaHide' }) : ctx.send({ type: 'mediaShow', item: m.item!, now: Date.now() })), onAir ? 'b' : 'b acc', 'F9'),
        ...(isVideo
          ? [
              (() => {
                const b = h('button', 'ib play', { width: 40, height: 40 }, [icon(m.playing ? ICONS.pause : ICONS.play, 18, '#111113')])
                b.title = 'Play / pausa (Espacio)'
                b.onclick = () => togglePlay()
                return b
              })(),
              seek,
              tcur,
              icon(ICONS.vol, 18, '#9a9aa3'),
              vol
            ]
          : [h('span', 'spacer')])
      ])
    )
    if (s.runtime.media.error) controls.append(h('div', 'banner bad', { marginTop: 8 }, [s.runtime.media.error]))
    void kbd
  }

  function togglePlay(): void {
    const m = ctx.state.media
    if (!m.item || m.item.kind === 'image') return
    ctx.send(m.playing ? { type: 'mediaPause', now: Date.now() } : { type: 'mediaPlay', now: Date.now() })
  }

  // barra de progreso en vivo (sin repintar toda la pantalla)
  setInterval(() => {
    const s = ctx.state
    if (!el.isConnected || !s?.media.item || !s.media.playing) return
    const dur = s.runtime.media.duration
    const pos = mediaPosition(s.media, Date.now())
    const fill = controls.querySelector<HTMLElement>('.seek i')
    if (fill && dur) fill.style.width = `${Math.min(100, (pos / dur) * 100)}%`
    const t = controls.querySelector<HTMLElement>('.mtime')
    if (t) t.textContent = `${mmss(pos)} / ${dur ? mmss(dur) : '--:--'}`
  }, 250)

  let lastItem = ''
  return {
    el,
    update(s: GameState) {
      paintControls(s)
      const k = `${s.media.item?.src}|${s.scene}`
      if (k !== lastItem) {
        lastItem = k
        paintLib()
      }
    },
    shown: () => void reload(),
    onKey(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false
      if (e.key === ' ') {
        togglePlay()
        return true
      }
      return false
    }
  }
}
