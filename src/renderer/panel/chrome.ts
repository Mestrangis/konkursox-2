// Barra "En el aire", navegación y dock de marcador/música/efectos (design/panel.html: componentes).
import { formatPoints } from '../../shared/quiz'
import { activeContestants, currentTurn, gameLabel, GAMES, hasPublico, playedCount, PLANOS, SCENES } from '../../shared/scene'
import type { Corner, HostMode } from '../../shared/arrange'
import { targetMembers } from '../../shared/order'
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
  const gameName = h('span', '', { fontSize: 10, fontWeight: 600, opacity: 0.85, maxWidth: 104, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  const scenes = SCENES.map((sc) => {
    const label = h('span', '', {}, [sc.label])
    const b = h('button', 'sc', {}, [kbd(sc.key), icon(ICONS[sc.id as keyof typeof ICONS], 22, '#9a9aa3'), label])
    b.onclick = () => goScene(ctx, sc.id)
    b.title = sc.id === 'multimedia' ? 'Mostrar / ocultar lo elegido en Multimedia (F9)' : `Poner "${sc.label}" en el aire (${sc.key})`
    if (sc.id === 'juego') {
      // desplegable: elegir qué juego sale en la escena Juego
      label.style.display = 'flex'
      label.style.flexDirection = 'column'
      label.style.alignItems = 'center'
      label.append(gameName)
      const caret = h('span', 'sc-caret', {}, [icon(ICONS.caret, 16, '#ececef')])
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

  const clock = h('span', '', { fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', cursor: 'pointer' })
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

  const el = h('div', 'airbar ui', {}, [
    h('div', '', { display: 'flex', flexDirection: 'column', gap: 6, width: 72 }, [
      h('span', 'lbl air', { display: 'flex', alignItems: 'center', gap: 6 }, [
        h('span', '', { width: 8, height: 8, borderRadius: '50%', background: '#ff5a5f', boxShadow: '0 0 8px #ff5a5f' }),
        'En el aire'
      ]),
      h('span', 'mut', { fontSize: 11, lineHeight: 1.3 }, ['Cambiar de escena no borra el juego'])
    ]),
    h('div', '', { display: 'flex', gap: 8 }, scenes.map((x) => x.b)),
    h('span', 'spacer'),
    thumb,
    h('div', '', { display: 'flex', flexDirection: 'column', gap: 4, width: 190 }, [clock, date, played])
  ])

  return {
    el,
    update(s: GameState): void {
      for (const x of scenes) {
        x.b.classList.toggle('live', s.scene === x.id)
        x.b.setAttribute('aria-pressed', String(s.scene === x.id))
      }
      gameName.textContent = gameLabel(s.liveGame)
      const n = playedCount(s)
      played.textContent = `${n} ${n === 1 ? 'prueba jugada' : 'pruebas jugadas'} · ${gameLabel(s.liveGame)}`
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
    h('span', 'mut', { fontSize: 11, padding: '8px 10px 0', lineHeight: 1.4 }, ['Navegar no cambia lo que sale en el plató.'])
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
  const trackName = h('div', '', { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
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
  vol.oninput = () => ctx.send({ type: 'setAudio', patch: { musicVolume: Number(vol.value) / 100 } })
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
  const fxGrid = h('div', '', { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 })
  let hit = -1
  let hitTimer = 0
  const fire = (i: number) => {
    const f = ctx.state.audio.fx[i]
    if (!f?.file || !ctx.audioLib.sfx.includes(f.file)) {
      ctx.toast(`"${f?.label ?? 'Efecto'}" no tiene sonido: clic derecho para elegirlo`)
      return
    }
    const el = ctx.audio.playSfx(f.file)
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
    fxGrid.replaceChildren(
      ...fx.map((f, i) => {
        const ok = !!f.file && ctx.audioLib.sfx.includes(f.file)
        const b = h('button', `fx${hit === i ? ' hit' : ''}${ok ? '' : ' empty'}`, {}, [kbd(String(i + 1)), f.label])
        b.title = ok ? `${f.file} · Ctrl+${i + 1} · clic derecho para cambiarlo` : 'Sin sonido · clic derecho para elegirlo'
        b.onclick = () => fire(i)
        b.oncontextmenu = (e) => {
          e.preventDefault()
          contextMenu(e.clientX, e.clientY, [
            h('span', 'lbl', {}, [`Sonido de "${f.label}"`]),
            ...ctx.audioLib.sfx.map((file) => ({ label: (file === f.file ? '● ' : '') + file, run: () => ctx.send({ type: 'setFx', index: i, patch: { file } }) })),
            null,
            {
              label: 'Cambiar el nombre…',
              run: async () => {
                const label = await askText('Nombre del botón', f.label)
                if (label) ctx.send({ type: 'setFx', index: i, patch: { label } })
              }
            },
            { label: 'Quitar el sonido', run: () => ctx.send({ type: 'setFx', index: i, patch: { file: null } }) },
            { label: 'Abrir la carpeta de efectos', run: () => void window.konk.audioOpenDir() }
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

  const autoBox = h('span')
  const el = h('aside', 'dock ui', {}, [
    h('div', 'sec', {}, [h('div', '', { display: 'flex', alignItems: 'center', gap: 6 }, [h('span', 'lbl', { flex: 1 }, ['Marcador']), h('span', 'mut', { fontSize: 12 }, ['Paso']), steps]), players]),
    h('div', 'sec', { gap: 10 }, [
      h('span', 'lbl', {}, ['Música']),
      h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [
        h('div', '', { width: 40, height: 40, borderRadius: 6, background: '#26314d', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }, [icon(ICONS.music, 18, '#8fb0ff')]),
        h('div', '', { flex: 1, minWidth: 0 }, [trackName, trackSub])
      ]),
      h('div', '', { display: 'flex', flexDirection: 'column', gap: 4 }, [seek, h('div', 'mut', { display: 'flex', justifyContent: 'space-between', fontSize: 11 }, [tCur, tDur])]),
      h('div', '', { display: 'flex', alignItems: 'center', gap: 6 }, [prevBtn, playBtn, nextBtn, h('span', 'spacer'), loopBtn, fadeBtn]),
      h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [icon(ICONS.vol, 18, '#9a9aa3'), vol]),
      tracks
    ]),
    h('div', 'sec', { borderBottom: 0 }, [h('span', 'lbl', {}, ['Efectos']), fxGrid]),
    h('span', 'spacer'),
    h('div', '', { padding: '12px 14px', borderTop: '1px solid #2a2a2f', display: 'flex', alignItems: 'center', gap: 10 }, [
      h('div', '', { flex: 1 }, [h('div', '', { fontWeight: 600, fontSize: 13 }, ['Sonidos automáticos del juego']), h('div', 'mut', { fontSize: 11 }, ['Correcto y error suenan solos al revelar'])]),
      autoBox
    ])
  ])
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

  return {
    el,
    fire,
    refreshAudio(): void {
      renderTracks()
      renderFx()
      renderPlayer()
    },
    update(s: GameState): void {
      // marcador
      const turn = new Set(targetMembers(s, currentTurn(s)))
      const rows =
        s.layout === 'teams'
          ? s.teams.map((t, i) => ({ name: t.name, score: t.score, turn: currentTurn(s)?.kind === 'team' && (currentTurn(s) as { index: number }).index === i, add: (d: number) => ctx.send({ type: 'addTeamScore', index: i as 0 | 1, delta: d }) }))
          : activeContestants(s).map((id) => {
              const c = s.contestants.find((x) => x.id === id)!
              return { name: c.name, score: c.score, turn: turn.has(id), add: (d: number) => ctx.send({ type: 'addScore', id, delta: d }) }
            })
      players.replaceChildren(
        ...rows.map((r) => {
          const dec = h('button', 'pm', {}, ['−'])
          dec.onclick = () => r.add(-step)
          dec.setAttribute('aria-label', `Restar a ${r.name}`)
          const inc = h('button', 'pm', {}, ['+'])
          inc.onclick = () => r.add(step)
          inc.setAttribute('aria-label', `Sumar a ${r.name}`)
          return h('div', 'pl', {}, [
            h('span', '', { width: 6, height: 6, borderRadius: '50%', background: r.turn ? '#4f7dff' : 'transparent', flex: 'none' }),
            h('span', '', { flex: 1, fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [
              r.name,
              ...(r.turn ? [h('span', 'mut', { fontWeight: 400, fontSize: 12 }, ['  · turno'])] : [])
            ]),
            dec,
            h('span', '', { width: 62, textAlign: 'center', fontSize: 20, fontWeight: 700 }, [formatPoints(r.score)]),
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
      autoBox.replaceChildren(sw(s.audio.autoSounds, () => ctx.send({ type: 'setAudio', patch: { autoSounds: !ctx.state.audio.autoSounds } }), 'Sonidos automáticos'))
      renderFx()
    }
  }
}

// ---------------------------------------------------------------- fila "Quién sale" (siempre visible)

export function createPeopleRow(ctx: Ctx) {
  // cómo salgo yo: igual, destacado o en una esquina (un desplegable para que quepa en la fila)
  const hostSelect = (s: GameState) => {
    const sel = h('select', 'inp', { height: 32, width: 168, flex: 'none', fontSize: 13, padding: '0 6px' })
    sel.title = 'Cómo sale el presentador en Cámaras y Juego'
    const opts: [string, string][] = [
      ['igual', 'Yo: igual'],
      ['destacado', 'Yo: destacado'],
      ['esquina:tl', 'Yo: esquina ↖'],
      ['esquina:tr', 'Yo: esquina ↗'],
      ['esquina:bl', 'Yo: esquina ↙'],
      ['esquina:br', 'Yo: esquina ↘']
    ]
    for (const [v, t] of opts) sel.append(new Option(t, v))
    sel.value = s.camsScene.hostMode === 'esquina' ? `esquina:${s.camsScene.corner}` : s.camsScene.hostMode
    sel.onchange = () => {
      const [mode, corner] = sel.value.split(':') as [HostMode, Corner | undefined]
      ctx.send({ type: 'camsSet', patch: corner ? { hostMode: mode, corner } : { hostMode: mode } })
      // destacado o en esquina implica que salgo
      if (mode !== 'igual' && !ctx.state.camsScene.on.host) ctx.send({ type: 'camsToggle', slot: 'host' })
    }
    return sel
  }
  const el = h('div', 'peoplerow ui')
  let key = ''
  return {
    el,
    update(s: GameState): void {
      // la cámara del público aparece si está calibrada
      const people: SlotId[] = ['host', ...activeContestants(s), ...(hasPublico(s) ? (['publico'] as SlotId[]) : [])]
      const k = JSON.stringify([s.camsScene.on, s.camsScene.preset, s.camsScene.hostMode, s.camsScene.corner, s.camsScene.template, s.camsScene.plano, s.lowerThird.visible, s.scene, people, s.host.name, s.contestants.map((c) => c.name)])
      if (k === key) return
      key = k
      const chipOf = (on: boolean, label: string, title: string, run: () => void) => {
        const chip = h('button', `pchip${on ? ' on' : ''}`, {}, [h('span', `sw${on ? ' on' : ''}`, { pointerEvents: 'none' }), label])
        chip.setAttribute('aria-pressed', String(on))
        chip.title = title
        chip.onclick = run
        return chip
      }
      const row1 = h('div', 'prow')
      const row2 = h('div', 'prow')
      el.replaceChildren(row1, row2)
      row2.append(
        h('span', 'lbl', { flex: 'none', width: 74 }, ['Plano']),
        ...PLANOS.map((pl) => btn(pl.label, () => ctx.send({ type: 'camsSet', patch: { plano: pl.id } }), `b sm ghost${s.camsScene.plano === pl.id ? ' on' : ''}`, pl.key)),
        h('span', 'mut', { fontSize: 11, flex: 'none' }, [s.camsScene.plano === 'juego' ? '' : 'en la escena Juego']),
        chipOf(s.lowerThird.visible, 'Rótulo inferior', 'Mostrar u ocultar el texto de abajo del plató', () => ctx.send({ type: 'setLowerThird', patch: { visible: !ctx.state.lowerThird.visible } })),
        h('span', 'spacer'),
        ...([
          ['yo', 'Solo yo', 'F6'],
          ['turno', 'El del turno', 'F7'],
          ['todos', 'Todos', 'F8']
        ] as const).map(([v, t, key2]) => btn(t, () => ctx.send({ type: 'camsPreset', preset: v }), `b sm ghost${s.camsScene.preset === v ? ' on' : ''}`, key2))
      )
      row1.append(
        h('span', 'lbl', { flex: 'none', width: 74 }, ['Quién sale']),
        ...people.map((slot) => {
          const on = !!s.camsScene.on[slot]
          const name = slot === 'host' ? `${s.host.name} (yo)` : slot === 'publico' ? 'Público' : s.contestants.find((c) => c.id === slot)?.name ?? slot
          const chip = h('button', `pchip${on ? ' on' : ''}`, {}, [h('span', `sw${on ? ' on' : ''}`, { pointerEvents: 'none' }), name])
          chip.setAttribute('aria-pressed', String(on))
          chip.title = on ? `Quitar a ${name} del plató` : `Sacar a ${name} en el plató`
          chip.onclick = () => ctx.send({ type: 'camsToggle', slot })
          return chip
        }),
        hostSelect(s),
        ...(s.camsScene.template && s.scene === 'camaras' ? [h('span', 'nm warn', { flex: 'none' }, ['Plantilla fija'])] : [])
      )
      void chipOf
    }
  }
}
