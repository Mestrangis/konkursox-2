// Barra "En el aire", navegación y dock de marcador/música/efectos (design/panel.html: componentes).
import { formatPoints } from '../../shared/quiz'
import { activeContestants, currentPlano, currentTurn, gameLabel, GAMES, hasLiveGame, hasPublico, playedCount, PLANOS, SCENES } from '../../shared/scene'
import type { Corner, HostMode } from '../../shared/arrange'
import { targetMembers } from '../../shared/order'
import { NUMPAD_LAYOUT, soundKeyLabel } from '../../shared/keys'
import { EFFECTS, type EffectId } from '../../shared/effects'
import { turnSlots } from '../plato/quizScenes'
import { mediaNav } from './screens/media'
import { openPairing } from './remote'
import type { GameState, SlotId } from '../../shared/types'
import { buildScene, drawFrames, sceneKey, type Scene } from '../plato/scenes'
import { askConfirm, askText, btn, contextMenu, h, icon, ICONS, kbd, mmss, sw, type Ctx, type ScreenId } from './ui'

// ---------------------------------------------------------------- barra En el aire

/** Pone una escena en el aire. Multimedia (F9) alterna: muestra lo último o vuelve a la escena anterior. */
export function goScene(ctx: Ctx, id: (typeof SCENES)[number]['id']): void {
  const s = ctx.state
  if (id !== 'multimedia') return ctx.send({ type: 'setScene', scene: id })
  if (s.scene === 'multimedia') return ctx.send({ type: 'mediaHide' })
  if (s.media.item) return ctx.send({ type: 'mediaShow', item: s.media.item, now: Date.now() })
  ctx.toast('Elige primero qué mostrar en Multimedia')
  ctx.go('multimedia')
}

export function createAirBar(ctx: Ctx) {
  const gameName = h('span', 'sc-game')
  const scenes = SCENES.map((sc) => {
    const label = h('span', '', {}, [sc.label])
    const b = h('button', 'sc', {}, [kbd(sc.key), icon(ICONS[sc.id as keyof typeof ICONS], 17, '#9a9aa3'), label])
    // el botón Cámaras abre su pantalla (F2 la pone en el aire sin cambiar de pantalla)
    b.onclick = () => (sc.id === 'camaras' ? ctx.go('camaras') : goScene(ctx, sc.id))
    b.title =
      sc.id === 'camaras'
        ? 'Abrir la pantalla Cámaras (F2 la pone en el aire)'
        : sc.id === 'multimedia'
          ? 'Mostrar / ocultar lo elegido en Multimedia (F9)'
          : `Poner "${sc.label}" en el aire (${sc.key})`
    if (sc.id === 'juego') {
      // desplegable: elegir qué juego sale en la escena Juego
      label.append(gameName)
      const caret = h('span', 'sc-caret', {}, [icon(ICONS.caret, 14, '#ececef')])
      caret.title = 'Elegir qué juego sale en el aire'
      caret.onclick = (e) => {
        e.stopPropagation()
        const r = b.getBoundingClientRect()
        contextMenu(r.left, r.bottom + 4, [
          h('span', 'lbl', {}, ['Juego en el aire']),
          ...GAMES.map((g) => ({
            label: (ctx.state.liveGame === g.id ? '● ' : '') + g.label,
            run: () => ctx.send({ type: 'setLiveGame', game: g.id, scene: true })
          }))
        ])
      }
      b.append(caret)
    }
    return { id: sc.id, b }
  })
  // miniatura en vivo del plató
  const stage = h('div', 'stage')
  const thumb = h('div', 'thumb', {}, [stage, h('span', 'tag', {}, ['PLATÓ'])])
  thumb.title = 'Lo que se ve ahora en el plató (clic: ventana del plató)'
  thumb.onclick = () => void window.konk.showPlato()
  let scene: Scene | null = null

  const clock = h('span', '', {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums'
  })
  clock.title = 'Reloj del programa (clic para ponerlo a cero)'
  const date = h('span', 'mut', { fontSize: 12 })
  const played = h('span', 'mut', { fontSize: 12 })
  const today = new Date().toISOString().slice(0, 10)
  let start = Date.now()
  try {
    const saved = JSON.parse(localStorage.getItem('konk.clock') ?? 'null')
    if (saved?.day === today && typeof saved.start === 'number') start = saved.start
    else localStorage.setItem('konk.clock', JSON.stringify({ day: today, start }))
  } catch {
    /* sin almacenamiento */
  }
  clock.onclick = async () => {
    if (!(await askConfirm('¿Poner el reloj del programa a cero?'))) return
    start = Date.now()
    try {
      localStorage.setItem('konk.clock', JSON.stringify({ day: today, start }))
    } catch {
      /* sin almacenamiento */
    }
  }
  setInterval(() => {
    const t = Math.floor((Date.now() - start) / 1000)
    clock.textContent = `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }, 500)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const d = new Date()
  date.textContent = `Programa del ${d.getDate()} ${months[d.getMonth()]}`

  // mando (móvil): estado y emparejar
  const mandoDot = h('span', 'mdot')
  const mando = h('button', 'mandob', {}, [mandoDot, 'Mando'])
  mando.onclick = () => void openPairing(ctx)
  const onAir = h('span', 'onair', {}, [h('span', 'dotlive'), 'AIRE'])
  onAir.title = 'Escena en el aire. Cambiar de escena no borra nada del juego.'
  const el = h('div', 'airbar ui', {}, [
    onAir,
    h(
      'div',
      '',
      { display: 'flex', gap: 6, minWidth: 0 },
      scenes.map((x) => x.b)
    ),
    h('span', 'spacer'),
    mando,
    thumb,
    h(
      'div',
      '',
      {
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: 118,
        lineHeight: 1.15
      },
      [clock, played]
    )
  ])
  void date

  return {
    el,
    update(s: GameState): void {
      for (const x of scenes) {
        x.b.classList.toggle('live', s.scene === x.id)
        x.b.setAttribute('aria-pressed', String(s.scene === x.id))
      }
      gameName.textContent = gameLabel(s.liveGame)
      const r = s.runtime.remote
      mandoDot.style.background = r.connected ? '#3ecf8e' : r.status === 'ready' ? '#e8a23a' : r.status === 'error' ? '#e5484d' : '#55555d'
      mando.title = r.connected ? `Mando conectado${r.connected > 1 ? ` (${r.connected})` : ''}` : r.status === 'ready' ? 'Mando: listo para emparejar (QR)' : r.status === 'error' ? `Mando sin conexión: ${r.error ?? ''}` : r.status === 'off' ? 'Mando: falta la clave de Ably (Ajustes → Programa)' : 'Mando: conectando…'
      mando.classList.toggle('on', r.connected > 0)
      const n = playedCount(s)
      played.textContent = `${n} ${n === 1 ? 'prueba' : 'pruebas'} · ${gameLabel(s.liveGame)}`
      played.title = `${date.textContent} · ${n} ${n === 1 ? 'prueba jugada' : 'pruebas jugadas'} · juego en el aire: ${gameLabel(s.liveGame)}`
      const key = sceneKey(s)
      if (!scene || scene.key !== key) {
        scene = buildScene(s)
        scene.root.classList.remove('k-enter')
        stage.replaceChildren(scene.root)
      } else scene.update(s)
      drawFrames(ctx.feed, scene, s)
    },
    frame(s: GameState): void {
      drawFrames(ctx.feed, scene, s)
      if (scene?.tick) scene.tick(s)
    }
  }
}

// ---------------------------------------------------------------- navegación

export function createNav(ctx: Ctx, onGo: (id: ScreenId) => void) {
  const item = (id: ScreenId, label: string) => {
    const a = h('button', 'nv', {}, [icon(ICONS[id as keyof typeof ICONS]), h('span', '', {}, [label])])
    a.onclick = () => onGo(id)
    return { id, a }
  }
  const games = GAMES.map((g) => item(g.id, g.label))
  const tools = [item('biblioteca', 'Biblioteca'), item('multimedia', 'Multimedia'), item('concursantes', 'Concursantes'), item('camaras', 'Cámaras')]
  const settings = item('ajustes', 'Ajustes')
  const el = h('nav', 'nav ui', {}, [
    h('span', 'lbl', { padding: '4px 10px 8px' }, ['Juegos']),
    ...games.map((x) => x.a),
    h('div', '', { height: 1, background: '#2a2a2f', margin: '12px 4px' }),
    ...tools.map((x) => x.a),
    h('span', 'spacer'),
    settings.a,
    h('span')
  ])
  el.setAttribute('aria-label', 'Secciones')
  return {
    el,
    update(s: GameState, active: ScreenId): void {
      for (const x of [...games, ...tools, settings]) {
        x.a.classList.toggle('on', x.id === active)
        x.a.querySelector('.dot, .warnd')?.remove()
      }
      const live = games.find((x) => x.id === s.liveGame)
      live?.a.append(h('span', 'dot', {}, ['AIRE']))
      const cam = tools.find((x) => x.id === 'camaras')!
      if (s.cameras.sourceId && (s.runtime.capture.plato === 'lost' || s.runtime.capture.panel === 'lost')) cam.a.append(h('span', 'warnd'))
      void ctx
    }
  }
}

// ---------------------------------------------------------------- dock: marcador, música, efectos

export function createDock(ctx: Ctx) {
  let step = 10
  try {
    step = Number(localStorage.getItem('konk.step')) || 10
  } catch {
    /* sin almacenamiento */
  }
  const steps = h('span', '', { display: 'flex', gap: 4 })
  const players = h('div', '', { display: 'flex', flexDirection: 'column' })
  const renderSteps = () =>
    steps.replaceChildren(
      ...[10, 50, 100].map((v) => {
        const c = h('button', `chip${v === step ? ' on' : ''}`, {}, [String(v)])
        c.onclick = () => {
          step = v
          try {
            localStorage.setItem('konk.step', String(v))
          } catch {
            /* sin almacenamiento */
          }
          renderSteps()
        }
        return c
      })
    )
  renderSteps()

  // música
  const trackName = h('div', '', {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  })
  const trackSub = h('div', 'mut', { fontSize: 12 })
  const fill = h('i', '', { width: '0%' })
  const knob = h('b', '', { left: '0%' })
  const seek = h('div', 'seek', {}, [fill, knob])
  const tCur = h('span')
  const tDur = h('span')
  const playIco = h('span')
  // mientras arrastras solo se mueve la barra y el tiempo; al soltar se salta
  let dragFrac: number | null = null
  seek.onmousedown = (e) => {
    e.preventDefault()
    const r = seek.getBoundingClientRect()
    const frac = (ev: MouseEvent) => Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width))
    dragFrac = frac(e)
    renderPlayer()
    const move = (ev: MouseEvent) => {
      dragFrac = frac(ev)
      renderPlayer()
    }
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      dragFrac = null
      ctx.audio.seek(frac(ev))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const playBtn = h('button', 'ib play', {}, [playIco])
  playBtn.onclick = () => ctx.audio.toggle()
  playBtn.title = 'Play / pausa (Ctrl+Espacio)'
  const prevBtn = h('button', 'ib', {}, [icon(ICONS.prev, 18, '#ececef')])
  prevBtn.onclick = () => ctx.audio.prev()
  prevBtn.title = 'Anterior'
  const nextBtn = h('button', 'ib', {}, [icon(ICONS.next, 18, '#ececef')])
  nextBtn.onclick = () => ctx.audio.next()
  nextBtn.title = 'Siguiente'
  const fadeBtn = btn('', () => void ctx.audio.fade(), 'b sm')
  const loopBtn = h('button', 'chip')
  loopBtn.onclick = () => ctx.send({ type: 'setAudio', patch: { loop: !ctx.state.audio.loop } })
  const vol = h('input')
  vol.type = 'range'
  vol.min = '0'
  vol.max = '100'
  vol.setAttribute('aria-label', 'Volumen de la música')
  vol.style.flex = '1'
  vol.oninput = () =>
    ctx.send({
      type: 'setAudio',
      patch: { musicVolume: Number(vol.value) / 100 }
    })
  const tracks = h('div', 'tracks')
  tracks.title = 'Arrastra aquí canciones para añadirlas a la carpeta de música'
  // arrastrar archivos a la lista los añade
  tracks.ondragover = (e) => {
    e.preventDefault()
    tracks.classList.add('over')
  }
  tracks.ondragleave = () => tracks.classList.remove('over')
  tracks.ondrop = async (e) => {
    e.preventDefault()
    tracks.classList.remove('over')
    const paths = [...(e.dataTransfer?.files ?? [])].map((f) => window.konk.pathForFile(f)).filter(Boolean)
    const added = await window.konk.audioImport(paths, 'musica')
    await ctx.reloadAudio()
    ctx.toast(added.length ? `Añadidas ${added.length} pistas a la música` : 'Ningún archivo de audio reconocido')
  }

  // efectos
  const fxGrid = h('div', '', {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 6
  })
  let hit = -1
  let hitTimer = 0
  const fire = (i: number) => {
    const f = ctx.state.audio.fx[i]
    if (!f?.file || !ctx.audioLib.sfx.includes(f.file)) {
      ctx.toast(`"${f?.label ?? 'Efecto'}" no tiene sonido: clic derecho para elegirlo`)
      return
    }
    const el = ctx.audio.playSfx(f.file, f.volume ?? 1)
    hit = i
    renderFx()
    clearTimeout(hitTimer)
    el.addEventListener('ended', () => {
      if (hit === i) {
        hit = -1
        renderFx()
      }
    })
    hitTimer = window.setTimeout(() => {
      hit = -1
      renderFx()
    }, 4000)
  }
  function renderFx(): void {
    const fx = ctx.state.audio.fx
    // misma disposición que el teclado numérico: 7 8 9 / 4 5 6 / 1 2 3
    fxGrid.replaceChildren(
      ...NUMPAD_LAYOUT.filter((i) => fx[i]).map((i) => {
        const f = fx[i]
        const ok = !!f.file && ctx.audioLib.sfx.includes(f.file)
        const b = h('button', `fx${hit === i ? ' hit' : ''}${ok ? '' : ' empty'}`, {}, [kbd(soundKeyLabel(i)), f.label])
        b.title = ok ? `${f.file} · ${soundKeyLabel(i)} (Bloq Num) o Ctrl+${i + 1} · clic derecho para cambiarlo` : 'Sin sonido · clic derecho para elegirlo'
        b.onclick = () => fire(i)
        b.oncontextmenu = (e) => {
          e.preventDefault()
          contextMenu(e.clientX, e.clientY, [
            h('span', 'lbl', {}, [`Sonido de "${f.label}"`]),
            ...ctx.audioLib.sfx.map((file) => ({
              label: (file === f.file ? '● ' : '') + file,
              run: () => ctx.send({ type: 'setFx', index: i, patch: { file } })
            })),
            null,
            {
              label: 'Cambiar el nombre…',
              run: async () => {
                const label = await askText('Nombre del botón', f.label)
                if (label) ctx.send({ type: 'setFx', index: i, patch: { label } })
              }
            },
            {
              label: 'Quitar el sonido',
              run: () => ctx.send({ type: 'setFx', index: i, patch: { file: null } })
            },
            {
              label: 'Abrir la carpeta de efectos',
              run: () => void window.konk.audioOpenDir()
            }
          ])
        }
        return b
      })
    )
  }
  fxGrid.ondragover = (e) => e.preventDefault()
  fxGrid.ondrop = async (e) => {
    e.preventDefault()
    const paths = [...(e.dataTransfer?.files ?? [])].map((f) => window.konk.pathForFile(f)).filter(Boolean)
    const added = await window.konk.audioImport(paths, 'efectos')
    await ctx.reloadAudio()
    ctx.toast(added.length ? `Añadidos ${added.length} efectos: asígnalos con clic derecho` : 'Ningún archivo de audio reconocido')
  }

  // efectos visuales del plató (Alt+1..9)
  const effGrid = h('div', '', {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 6
  })
  const playEffectSound = (id: EffectId) => {
    const s = ctx.state
    const file = s.effects.sounds[id]
    // el latido suena en bucle mientras dura (lo lleva el panel en cada cambio de estado)
    if (id === 'latido' || !file || !ctx.audioLib.sfx.includes(file)) return
    ctx.audio.playSfx(file, s.effects.volumes[id] ?? 1)
  }
  const people = (s: GameState): SlotId[] => ['host', ...activeContestants(s), ...(hasPublico(s) ? (['publico'] as SlotId[]) : [])]
  const personName = (s: GameState, slot: SlotId) => (slot === 'host' ? s.host.name : slot === 'publico' ? 'Público' : (s.contestants.find((c) => c.id === slot)?.name ?? slot))
  /** Dispara un efecto. "Foco en uno" pregunta a quién (con teclado, al del turno). */
  const fireEffect = (i: number, ev?: MouseEvent) => {
    const e = EFFECTS[i]
    if (!e) return
    const s = ctx.state
    if (e.id === 'foco' && !s.effects.on.foco) {
      const go = (slot: SlotId) => {
        ctx.send({
          type: 'fxvToggle',
          id: 'foco',
          now: Date.now(),
          focus: slot
        })
        playEffectSound('foco')
      }
      if (ev) {
        contextMenu(ev.clientX, ev.clientY, [
          h('span', 'lbl', {}, ['Foco en…']),
          ...people(s).map((slot) => ({
            label: personName(s, slot),
            run: () => go(slot)
          }))
        ])
        return
      }
      const turn = [...turnSlots(s)][0] ?? activeContestants(s)[0]
      if (turn) go(turn)
      return
    }
    const turningOn = e.kind === 'hit' || !s.effects.on[e.id]
    ctx.send({ type: 'fxvToggle', id: e.id, now: Date.now() })
    if (turningOn) playEffectSound(e.id)
  }
  function renderEffects(s: GameState): void {
    effGrid.replaceChildren(
      ...EFFECTS.map((e, i) => {
        const on = e.kind === 'hold' && !!s.effects.on[e.id]
        const label = e.id === 'foco' && on && s.effects.focus ? `Foco: ${personName(s, s.effects.focus)}` : e.label
        const b = h('button', `fx eff${on ? ' on' : ''}`, {}, [kbd(`Alt ${i + 1}`), label])
        b.title = `${e.hint} · ${e.kind === 'hold' ? 'se queda hasta volver a pulsar' : 'golpe'} · Alt+${i + 1}`
        b.onclick = (ev) => fireEffect(i, ev)
        return b
      }),
      (() => {
        const b = h('button', 'fx eff', {}, ['Quitar todos'])
        b.title = 'Apaga todos los efectos que se mantienen'
        b.onclick = () => ctx.send({ type: 'fxvClear' })
        return b
      })()
    )
  }

  const autoBox = h('span')
  // pestañas: Sonidos | Efectos | Música (siempre a la vista, sin desplazar)
  type Tab = 'sonidos' | 'efectos' | 'musica'
  let tab: Tab = 'sonidos'
  try {
    const t = localStorage.getItem('konk.dockTab') as Tab
    if (t === 'sonidos' || t === 'efectos' || t === 'musica') tab = t
  } catch {
    /* sin almacenamiento */
  }
  const tabBar = h('div', 'dtabs')
  const panes: Record<Tab, HTMLElement> = {
    sonidos: h('div', 'dpane', {}, [
      fxGrid,
      h('div', '', { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }, [autoBox, h('span', '', { fontSize: 12.5, fontWeight: 600 }, ['Sonidos automáticos del juego'])])
    ]),
    efectos: h('div', 'dpane', {}, [effGrid]),
    musica: h('div', 'dpane', { gap: 10 }, [
      h('div', '', { minWidth: 0 }, [trackName, trackSub]),
      h('div', '', { display: 'flex', flexDirection: 'column', gap: 3 }, [seek, h('div', 'mut', { display: 'flex', justifyContent: 'space-between', fontSize: 11 }, [tCur, tDur])]),
      h('div', '', { display: 'flex', alignItems: 'center', gap: 6 }, [prevBtn, playBtn, nextBtn, h('span', 'spacer'), loopBtn, fadeBtn]),
      h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [icon(ICONS.vol, 16, '#9a9aa3'), vol]),
      btn(
        'Lista de música (Multimedia)',
        () => {
          mediaNav.music = true
          ctx.go('multimedia')
        },
        'b sm ghost'
      )
    ])
  }
  const paintTabs = () => {
    tabBar.replaceChildren(
      ...(['sonidos', 'efectos', 'musica'] as Tab[]).map((t) => {
        const b = h('button', tab === t ? 'on' : '', {}, [t === 'sonidos' ? 'Sonidos' : t === 'efectos' ? 'Efectos' : 'Música'])
        b.title = t === 'sonidos' ? 'Botonera (Num1-9 o Ctrl+1..9)' : t === 'efectos' ? 'Efectos visuales del plató (Alt+1..9)' : 'Música de fondo (Ctrl+Espacio, Ctrl+F)'
        b.onclick = () => {
          tab = t
          try {
            localStorage.setItem('konk.dockTab', t)
          } catch {
            /* sin almacenamiento */
          }
          paintTabs()
        }
        return b
      })
    )
    for (const [t, el2] of Object.entries(panes)) el2.style.display = t === tab ? '' : 'none'
  }
  paintTabs()
  // arrastrar canciones a la pestaña Música las añade
  panes.musica.ondragover = (e) => e.preventDefault()
  panes.musica.ondrop = (e) => tracks.ondrop?.(e)
  const el = h('aside', 'dock ui', {}, [
    h('div', 'sec dscore', {}, [h('div', '', { display: 'flex', alignItems: 'center', gap: 6 }, [h('span', 'lbl', { flex: 1 }, ['Marcador']), steps]), players]),
    tabBar,
    panes.sonidos,
    panes.efectos,
    panes.musica
  ])
  void tracks
  el.setAttribute('aria-label', 'Marcador y audio')

  function renderTracks(): void {
    const lib = ctx.audioLib
    tracks.replaceChildren(
      ...lib.music.map((f) => {
        const on = ctx.audio.current === f
        const t = h('div', `tr${on ? ' on' : ''}`, {}, [h('span', 't', {}, [f.replace(/\.[^.]+$/, '')]), h('span', 'd', {}, [on ? (ctx.audio.playing ? 'Sonando' : 'En pausa') : ''])])
        t.title = f
        t.onclick = () => (on ? ctx.audio.toggle() : void ctx.audio.play(f))
        return t
      })
    )
    if (!lib.music.length) tracks.append(h('div', 'mut', { fontSize: 12, padding: 8 }, ['Arrastra canciones aquí o mételas en la carpeta musica.']))
  }

  function renderPlayer(): void {
    const a = ctx.audio
    trackName.textContent = a.current ? a.current.replace(/\.[^.]+$/, '') : 'Sin música'
    trackSub.textContent = a.current ? `${a.playing ? 'Sonando' : 'En pausa'}${ctx.state.audio.loop ? ' · bucle' : ''}` : `${ctx.audioLib.music.length} pistas en la carpeta`
    playIco.replaceChildren(icon(a.playing ? ICONS.pause : ICONS.play, 20, '#111113'))
    const p = a.position
    const cur = dragFrac !== null && p.duration ? dragFrac * p.duration : p.current
    const k = p.duration ? (cur / p.duration) * 100 : 0
    fill.style.width = `${k}%`
    knob.style.left = `${k}%`
    tCur.textContent = mmss(cur)
    tDur.textContent = mmss(p.duration)
  }
  ctx.audio.onChange = () => {
    renderPlayer()
    renderTracks()
  }
  setInterval(renderPlayer, 250)

  let effKey = ''
  return {
    el,
    fire,
    fireEffect: (i: number) => fireEffect(i),
    refreshAudio(): void {
      renderTracks()
      renderFx()
      renderPlayer()
    },
    update(s: GameState): void {
      const ek = JSON.stringify([s.effects.on, s.effects.focus, s.contestants.map((c) => c.name)])
      if (ek !== effKey) {
        effKey = ek
        renderEffects(s)
      }
      // latido: su sonido en bucle mientras está puesto
      const lat = s.effects.sounds.latido
      if (s.effects.on.latido && lat && ctx.audioLib.sfx.includes(lat)) ctx.audio.playLoop(lat, 'latido', s.effects.volumes.latido ?? 1)
      else ctx.audio.stopLoop('latido')
      // marcador
      const turn = new Set(targetMembers(s, currentTurn(s)))
      const rows =
        s.layout === 'teams'
          ? s.teams.map((t, i) => ({
              name: t.name,
              score: t.score,
              turn: currentTurn(s)?.kind === 'team' && (currentTurn(s) as { index: number }).index === i,
              add: (d: number) => ctx.send({ type: 'addTeamScore', index: i as 0 | 1, delta: d })
            }))
          : activeContestants(s).map((id) => {
              const c = s.contestants.find((x) => x.id === id)!
              return {
                name: c.name,
                score: c.score,
                turn: turn.has(id),
                add: (d: number) => ctx.send({ type: 'addScore', id, delta: d })
              }
            })
      players.replaceChildren(
        ...rows.map((r) => {
          const dec = h('button', 'pm', {}, ['−'])
          dec.onclick = () => r.add(-step)
          dec.setAttribute('aria-label', `Restar a ${r.name}`)
          const inc = h('button', 'pm', {}, ['+'])
          inc.onclick = () => r.add(step)
          inc.setAttribute('aria-label', `Sumar a ${r.name}`)
          // nombre completo: si es largo, letra más pequeña y hasta dos líneas
          const long = r.name.length > 16
          const nm = h('span', 'plname', { fontSize: long ? 12.5 : 14 }, [r.name])
          nm.title = r.turn ? `${r.name} · tiene el turno` : r.name
          return h('div', 'pl', {}, [
            h('span', '', {
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: r.turn ? '#4f7dff' : 'transparent',
              flex: 'none'
            }),
            nm,
            dec,
            h('span', '', { width: 54, textAlign: 'center', fontSize: 19, fontWeight: 700 }, [formatPoints(r.score)]),
            inc
          ])
        })
      )
      // audio
      ctx.audio.fadeSeconds = s.audio.fadeSeconds
      ctx.audio.sfxVolume = s.audio.sfxVolume
      if (ctx.audio.musicVolume !== s.audio.musicVolume) ctx.audio.setVolume(s.audio.musicVolume)
      if (ctx.audio.loop !== s.audio.loop) ctx.audio.setLoop(s.audio.loop)
      if (document.activeElement !== vol) vol.value = String(Math.round(s.audio.musicVolume * 100))
      loopBtn.textContent = 'Bucle'
      loopBtn.classList.toggle('on', s.audio.loop)
      fadeBtn.firstChild!.textContent = `Fundido ${s.audio.fadeSeconds} s`
      fadeBtn.title = 'Fundido de la música (Ctrl+F)'
      autoBox.replaceChildren(
        sw(
          s.audio.autoSounds,
          () =>
            ctx.send({
              type: 'setAudio',
              patch: { autoSounds: !ctx.state.audio.autoSounds }
            }),
          'Sonidos automáticos'
        )
      )
      renderFx()
    }
  }
}

// ---------------------------------------------------------------- fila "Quién sale" (siempre visible)

export function createPeopleRow(ctx: Ctx) {
  // cómo salgo yo: menú dentro de mi interruptor
  const hostMenu = (e: MouseEvent) => {
    e.stopPropagation()
    const s = ctx.state
    const set = (mode: HostMode, corner?: Corner) => {
      ctx.send({
        type: 'camsSet',
        patch: corner ? { hostMode: mode, corner } : { hostMode: mode }
      })
      // destacado o en esquina implica que salgo
      if (mode !== 'igual' && !ctx.state.camsScene.on.host) ctx.send({ type: 'camsToggle', slot: 'host' })
    }
    const cur = s.camsScene.hostMode === 'esquina' ? `esquina:${s.camsScene.corner}` : s.camsScene.hostMode
    const opt = (v: string, label: string, run: () => void) => ({
      label: (cur === v ? '● ' : '') + label,
      run
    })
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    contextMenu(r.left, r.bottom + 4, [
      h('span', 'lbl', {}, ['Cómo salgo yo']),
      opt('igual', 'Igual que los demás', () => set('igual')),
      opt('destacado', 'Destacado (grande)', () => set('destacado')),
      opt('esquina:tl', 'En esquina ↖', () => set('esquina', 'tl')),
      opt('esquina:tr', 'En esquina ↗', () => set('esquina', 'tr')),
      opt('esquina:bl', 'En esquina ↙', () => set('esquina', 'bl')),
      opt('esquina:br', 'En esquina ↘', () => set('esquina', 'br'))
    ])
  }
  const MODE: Record<string, string> = {
    igual: '',
    destacado: 'destacado',
    'esquina:tl': '↖',
    'esquina:tr': '↗',
    'esquina:bl': '↙',
    'esquina:br': '↘'
  }
  const el = h('div', 'peoplerow ui')
  let key = ''
  return {
    el,
    update(s: GameState): void {
      // la cámara del público aparece si está calibrada
      const people: SlotId[] = ['host', ...activeContestants(s), ...(hasPublico(s) ? (['publico'] as SlotId[]) : [])]
      const live = hasLiveGame(s)
      const k = JSON.stringify([
        s.camsScene.on,
        s.camsScene.preset,
        s.camsScene.hostMode,
        s.camsScene.corner,
        s.camsScene.template,
        s.camsScene.camsPlano,
        s.lowerThird.visible,
        s.scene,
        live,
        people,
        s.host.name,
        s.contestants.map((c) => c.name)
      ])
      if (k === key) return
      key = k
      const plano = currentPlano(s)
      const chip = (on: boolean, label: (Node | string)[], title: string, run: () => void, cls = '') => {
        const c = h('button', `pchip${on ? ' on' : ''}${cls ? ' ' + cls : ''}`, {}, [h('span', `sw${on ? ' on' : ''}`, { pointerEvents: 'none' }), ...label])
        c.setAttribute('aria-pressed', String(on))
        c.title = title
        c.onclick = run
        return c
      }
      const mode = MODE[s.camsScene.hostMode === 'esquina' ? `esquina:${s.camsScene.corner}` : s.camsScene.hostMode]
      el.replaceChildren(
        // quién sale
        ...people.map((slot) => {
          const on = !!s.camsScene.on[slot]
          const name = slot === 'host' ? s.host.name : slot === 'publico' ? 'Público' : (s.contestants.find((c) => c.id === slot)?.name ?? slot)
          if (slot !== 'host') return chip(on, [name], on ? `Quitar a ${name} del plató` : `Sacar a ${name} en el plató`, () => ctx.send({ type: 'camsToggle', slot }))
          const caret = h('span', 'pcaret', {}, [mode ? h('span', 'pmode', {}, [mode]) : '', icon(ICONS.caret, 14, '#c9c9d0')])
          caret.title = 'Cómo salgo yo: igual, destacado o en una esquina'
          caret.onclick = hostMenu
          return chip(on, [name, caret], `Yo (${name}): ${on ? 'salgo' : 'no salgo'} en el plató · ▾ para elegir cómo`, () => ctx.send({ type: 'camsToggle', slot }), 'host')
        }),
        ...(s.camsScene.template && s.scene === 'camaras' ? [h('span', 'nm warn', { flex: 'none' }, ['Plantilla fija'])] : []),
        h('span', 'psep'),
        // plano: un solo selector (Ctrl+F1..F4)
        h(
          'div',
          'seg pseg',
          {},
          PLANOS.map((pl) => {
            const b = h('button', plano === pl.id ? 'on' : '', {}, [pl.short])
            b.title = `${pl.label} (${pl.key})${(pl.id === 'juego' || pl.id === 'sincam') && !live ? ' · no hay juego en el aire' : pl.id === 'datos' ? ' · datos del juego activo (o el marcador)' : ''}`
            b.disabled = (pl.id === 'juego' || pl.id === 'sincam') && !live
            b.onclick = () => ctx.send({ type: 'setPlano', plano: pl.id })
            return b
          })
        ),
        chip(s.lowerThird.visible, ['Rótulo'], 'Mostrar u ocultar el rótulo inferior del plató', () =>
          ctx.send({
            type: 'setLowerThird',
            patch: { visible: !ctx.state.lowerThird.visible }
          })
        ),
        h('span', 'spacer'),
        ...(
          [
            ['yo', 'Solo yo', 'F6'],
            ['turno', 'Turno', 'F7'],
            ['todos', 'Todos', 'F8']
          ] as const
        ).map(([v, t, key2]) => {
          const b = btn(t, () => ctx.send({ type: 'camsPreset', preset: v }), `b sm ghost${s.camsScene.preset === v ? ' on' : ''}`, key2)
          b.title = v === 'yo' ? 'Solo salgo yo' : v === 'turno' ? 'Solo el del turno' : 'Todos los concursantes'
          return b
        })
      )
    }
  }
}
