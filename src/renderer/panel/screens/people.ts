// Concursantes (design/panel.html) y Escena Cámaras (design/panel.html).
import { sourceRectForFrame } from '../../../shared/crop'
import { CONTESTANT_IDS, SLOT_IDS, type ContestantId, type GameState, type SlotId } from '../../../shared/types'
import { activeContestants, camOf, camsLineup, playersInGame } from '../../../shared/scene'
import { formatPoints } from '../../../shared/quiz'
import { buildCamsScene } from '../../plato/camsScene'
import { drawFrames, type Scene } from '../../plato/scenes'
import { btn, editableArea, h, seg, silhouette, sw, type Ctx, type Screen } from '../ui'

const camLabel = (slot: SlotId) => (slot === 'host' ? 'Cámara 5' : `Cámara ${CONTESTANT_IDS.indexOf(slot as ContestantId) + 1}`)

/** Estado de la señal de un recuadro de cámara. */
function camState(s: GameState, cam: SlotId): { ok: boolean; text: string } {
  if (!s.cameras.sourceId) return { ok: false, text: 'Sin ventana de Discord elegida' }
  if (!s.cameras.rects[cam]) return { ok: false, text: 'Sin recuadro: calíbrala' }
  if (s.runtime.capture.panel === 'lost' || s.runtime.capture.plato === 'lost') return { ok: false, text: 'Sin señal ahora' }
  return { ok: true, text: 'Con señal' }
}

/** Miniatura con el recorte en vivo de una cámara. */
function camThumb(ctx: Ctx, s: GameState, cam: SlotId, small = false): HTMLElement {
  const th = h('div', `th${small ? ' small' : ''}`, {}, [silhouette()])
  const canvas = h('canvas')
  th.append(canvas)
  const rel = s.cameras.rects[cam]
  const draw = () => {
    if (!th.isConnected) return
    const f = ctx.feed
    const w = small ? 112 : 144
    const hh = small ? 72 : 92
    canvas.width = w
    canvas.height = hh
    const src = rel && f.ready ? sourceRectForFrame(rel, f.width, f.height, w, hh) : null
    const c2 = canvas.getContext('2d')
    if (!c2) return
    c2.clearRect(0, 0, w, hh)
    if (src) c2.drawImage(f.video, src.x, src.y, src.w, src.h, 0, 0, w, hh)
  }
  requestAnimationFrame(draw)
  thumbs.add(draw)
  return th
}
const thumbs = new Set<() => void>()
setInterval(() => {
  for (const d of thumbs) d()
}, 200)

// ---------------------------------------------------------------- Concursantes

export function createContestantsScreen(ctx: Ctx): Screen {
  const body = h('div', 'screen')
  let key = ''
  const area = editableArea(body, () => build(ctx.state))
  function update(s: GameState): void {
    const k = JSON.stringify([s.layout, s.contestants, s.teams, s.host, s.cameras.rects, s.runtime.capture, s.cameras.sourceId])
    const changed = k !== key
    key = k
    area.refresh(changed)
  }
  function build(s: GameState): void {
    thumbs.clear()
    const teams = s.layout === 'teams'
    const n = playersInGame(s)
    const camOptions = (cur: SlotId, onPick: (v: SlotId) => void) => {
      const sel = h('select', 'inp', { flex: 1, minWidth: 0 })
      for (const c of SLOT_IDS) {
        const o = h('option', '', {}, [`${camLabel(c)}${s.cameras.rects[c] ? '' : ' · sin recuadro'}`])
        o.value = c
        o.selected = c === cur
        sel.append(o)
      }
      sel.onchange = () => onPick(sel.value as SlotId)
      return sel
    }
    const rows = CONTESTANT_IDS.slice(0, n).map((id, i) => {
      const c = s.contestants.find((x) => x.id === id)!
      const name = h('input', 'inp')
      name.value = c.name
      name.setAttribute('aria-label', `Nombre del concursante ${i + 1}`)
      name.oninput = () => ctx.send({ type: 'setContestant', id, patch: { name: name.value } })
      const team = h('select', 'inp', { opacity: teams ? 1 : 0.45 })
      team.disabled = !teams
      for (const t of [0, 1] as const) {
        const o = h('option', '', {}, [teams ? s.teams[t].name : 'Sin equipo'])
        o.value = String(t)
        o.selected = c.team === t
        team.append(o)
      }
      team.onchange = () => ctx.send({ type: 'setContestant', id, patch: { team: Number(team.value) as 0 | 1 } })
      const pts = h('input', 'inp', { textAlign: 'right', fontWeight: 700 })
      pts.value = String(c.score)
      pts.inputMode = 'numeric'
      pts.setAttribute('aria-label', `Puntos de ${c.name}`)
      pts.onchange = () => {
        const v = Number(pts.value)
        if (Number.isFinite(v)) ctx.send({ type: 'setScore', id, value: v })
      }
      const cst = camState(s, c.cam)
      const x = h('button', 'x', {}, ['×'])
      x.setAttribute('aria-label', `Quitar a ${c.name}`)
      x.disabled = n <= 1 || teams
      x.onclick = () => confirm(`¿Quitar a ${c.name}? Los de detrás suben un puesto.`) && ctx.send({ type: 'removeContestant', id })
      return h('div', 'rowc', {}, [
        h('span', 'mut', { fontWeight: 700 }, [String(i + 1)]),
        name,
        seg(
          [
            { v: 'm', t: 'Chico' },
            { v: 'f', t: 'Chica' }
          ],
          c.gender,
          (v) => ctx.send({ type: 'setGender', id, gender: c.gender === v ? null : v })
        ),
        team,
        pts,
        h('div', '', { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }, [
          camThumb(ctx, s, c.cam, true),
          camOptions(c.cam, (v) => ctx.send({ type: 'setContestantCam', id, cam: v })),
          h('span', '', { width: 8, height: 8, flex: 'none', borderRadius: '50%', background: cst.ok ? '#3ecf8e' : '#e8a23a' }, [])
        ]),
        x
      ])
    })
    const noSignal = CONTESTANT_IDS.slice(0, n)
      .map((id) => s.contestants.find((c) => c.id === id)!)
      .filter((c) => !camState(s, c.cam).ok)
    const teamCard = (t: 0 | 1) => {
      const name = h('input', 'inp', { fontWeight: 700, maxWidth: 220 })
      name.value = s.teams[t].name
      name.setAttribute('aria-label', `Nombre del equipo ${t + 1}`)
      name.oninput = () => ctx.send({ type: 'setTeam', index: t, patch: { name: name.value } })
      const dec = btn('−', () => ctx.send({ type: 'addTeamScore', index: t, delta: -10 }), 'pm')
      const inc = btn('+', () => ctx.send({ type: 'addTeamScore', index: t, delta: 10 }), 'pm')
      return h('div', 'pnl tc', {}, [
        h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [name, h('span', 'spacer'), h('span', 'mut', { fontSize: 12 }, ['Total']), dec, h('span', '', { fontSize: 22, fontWeight: 800, minWidth: 60, textAlign: 'center' }, [formatPoints(s.teams[t].score)]), inc]),
        ...activeContestants(s)
          .map((id) => s.contestants.find((c) => c.id === id)!)
          .filter((c) => c.team === t)
          .map((c) => h('div', 'mem', {}, [c.name, h('span', 'mut', { marginLeft: 'auto', fontSize: 12 }, [formatPoints(c.score)])]))
      ])
    }
    const hostName = h('input', 'inp', { maxWidth: 200 })
    hostName.value = s.host.name
    hostName.oninput = () => ctx.send({ type: 'setHost', patch: { name: hostName.value } })
    body.replaceChildren(
      h('div', 'head', {}, [
        h('div', 'title', {}, [h('b', '', {}, ['Concursantes']), h('span', 'mut', { fontSize: 13 }, ['Hasta 4 · los puntos de aquí son los mismos que los del marcador'])]),
        h('span', 'spacer'),
        seg(
          [
            { v: 'ind', t: 'Individual' },
            { v: 'teams', t: 'Equipos 2 contra 2' }
          ],
          teams ? 'teams' : 'ind',
          (v) => ctx.send({ type: 'setFormat', teams: v === 'teams' })
        ),
        btn('Poner todos a 0', () => confirm('¿Poner a cero los puntos de todos los concursantes y equipos?') && ctx.send({ type: 'resetScores' }), 'b')
      ]),
      h('div', 'pnl', { overflowX: 'auto' }, [
        h('div', '', { minWidth: 900 }, [
          h('div', 'rowc hd', {}, ['#', 'Nombre', 'Chico / chica', 'Equipo', 'Puntos', 'Cámara', ''].map((t) => h('span', '', {}, [t]))),
          ...rows,
          h('div', '', { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }, [
            (() => {
              const b = btn('+ Añadir concursante', () => ctx.send({ type: 'setPlayers', count: n + 1 }), 'b ghost')
              b.disabled = n >= 4 || teams
              return b
            })(),
            h('span', 'mut', { fontSize: 12 }, [n >= 4 ? 'Ya hay 4, el máximo' : teams ? '' : `${n} de 4`]),
            h('span', 'spacer'),
            ...(noSignal.length ? [h('span', 'warn', { fontSize: 12 }, [`La cámara de ${noSignal.map((c) => c.name).join(', ')} no da señal ahora mismo`])] : []),
            (() => {
              const a = h('a', '', { fontSize: 13 }, ['Revisar recuadros'])
              a.onclick = () => ctx.openCalibration()
              return a
            })()
          ])
        ])
      ]),
      ...(teams ? [h('div', '', { display: 'flex', gap: 12, flexWrap: 'wrap' }, [teamCard(0), teamCard(1)])] : []),
      h('div', 'pnl', { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, [
        camThumb(ctx, s, s.host.cam, true),
        hostName,
        h('div', '', { flex: 1 }, [h('div', '', { fontWeight: 600 }, ['Presentador']), h('div', 'mut', { fontSize: 12 }, ['No suma puntos · sale en la escena Cámaras si lo activas'])]),
        (() => {
          const sel = camOptions(s.host.cam, (v) => ctx.send({ type: 'setContestantCam', id: 'host', cam: v }))
          sel.style.width = '260px'
          sel.style.flex = 'none'
          return sel
        })()
      ])
    )
  }
  return { el: body, update, shown: () => build(ctx.state) }
}

// ---------------------------------------------------------------- Escena Cámaras

export function createCamerasScreen(ctx: Ctx): Screen {
  const stage = h('div', 'stage')
  const badge = h('span', 'badge')
  const preview = h('div', 'preview', {}, [stage, badge])
  const shortcuts = h('div', '', { display: 'flex', gap: 8 })
  const options = h('div', 'pnl', { padding: '12px 14px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' })
  const people = h('div', '', { display: 'flex', flexDirection: 'column', gap: 8 })
  const capture = h('div', 'p-col')
  const head = h('div', 'head')
  const el = h('div', 'screen', {}, [
    head,
    h('div', '', { display: 'flex', gap: 18, flexWrap: 'wrap', flex: 1, minHeight: 0 }, [
      h('div', '', { flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }, [preview, shortcuts, options, capture]),
      h('div', '', { flex: '1 1 300px', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8 }, [h('span', 'lbl', {}, ['Quién sale']), people])
    ])
  ])
  new ResizeObserver(() => (stage.style.transform = `scale(${preview.clientWidth / 1920})`)).observe(preview)
  let scene: Scene | null = null

  function update(s: GameState): void {
    const live = s.scene === 'camaras'
    head.replaceChildren(
      h('div', 'title', {}, [h('b', '', {}, ['Escena Cámaras']), h('span', 'mut', { fontSize: 13 }, ['Elige quién sale en el plató cuando está la escena Cámaras (F2)'])]),
      h('span', 'spacer'),
      live
        ? h('span', 'air', { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }, [h('span', 'dotlive', { width: 8, height: 8 }), 'En el aire: los cambios se ven al momento'])
        : btn('Poner en el aire', () => ctx.send({ type: 'setScene', scene: 'camaras' }), 'b acc', 'F2')
    )
    preview.classList.toggle('live', live)
    badge.textContent = live ? 'VISTA PREVIA · EN EL AIRE' : 'VISTA PREVIA'
    badge.classList.toggle('off', !live)
    // vista previa de la escena (aunque no esté en el aire)
    const k = `cams:${camsLineup(s).join(',')}`
    if (!scene || scene.key !== k) {
      scene = buildCamsScene(s)
      scene.root.classList.remove('k-enter')
      stage.replaceChildren(scene.root)
    } else scene.update(s)
    drawFrames(ctx.feed, scene, s)
    if (!camsLineup(s).length) stage.append(h('div', '', { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9aa3', fontSize: 40 }, ['Nadie seleccionado: el plató mostrará solo el fondo']))

    shortcuts.replaceChildren(
      ...([
        ['yo', 'Solo yo', 'F6'],
        ['turno', 'Solo el del turno', 'F7'],
        ['todos', 'Todos', 'F8']
      ] as const).map(([v, t, key]) => btn(t, () => ctx.send({ type: 'camsPreset', preset: v }), `sc3${s.camsScene.preset === v ? ' on' : ''}`, key))
    )
    options.replaceChildren(
      h('span', '', { display: 'flex', alignItems: 'center', gap: 10 }, ['Nombres', sw(s.camsScene.names, () => ctx.send({ type: 'camsSet', patch: { names: !ctx.state.camsScene.names } }), 'Mostrar nombres')]),
      h('span', '', { display: 'flex', alignItems: 'center', gap: 10 }, ['Puntos', sw(s.camsScene.scores, () => ctx.send({ type: 'camsSet', patch: { scores: !ctx.state.camsScene.scores } }), 'Mostrar puntos')]),
      h('span', 'spacer'),
      h('span', 'mut', { fontSize: 12 }, ['Transición']),
      seg(
        [
          { v: 'cut', t: 'Corte' },
          { v: 'fade', t: 'Fundido' }
        ],
        s.camsScene.transition,
        (v) => ctx.send({ type: 'camsSet', patch: { transition: v } })
      )
    )
    thumbs.clear()
    const list: SlotId[] = ['host', ...activeContestants(s)]
    people.replaceChildren(
      ...list.map((slot) => {
        const on = !!s.camsScene.on[slot]
        const cam = camOf(s, slot)
        const st = camState(s, cam)
        const name = slot === 'host' ? s.host.name : s.contestants.find((c) => c.id === slot)!.name
        const status = slot === 'host' ? `Presentador · ${camLabel(cam)}` : `${camLabel(cam)}${st.ok ? '' : ' · ' + st.text.toLowerCase()}`
        return h('div', `cr${on ? ' on' : ''}`, {}, [
          camThumb(ctx, s, cam),
          h('div', '', { flex: 1, minWidth: 0 }, [h('div', '', { fontWeight: 600 }, [name]), h('div', '', { fontSize: 12, color: st.ok ? '#9a9aa3' : '#e8a23a' }, [status])]),
          sw(on, () => ctx.send({ type: 'camsToggle', slot }), `Mostrar a ${name}`)
        ])
      }),
      (() => {
        const a = h('a', '', { fontSize: 13, marginTop: 4 }, ['Cambiar qué cámara corresponde a cada uno'])
        a.onclick = () => ctx.go('concursantes')
        return a
      })()
    )
    const cap = s.runtime.capture
    const lost = !!s.cameras.sourceId && (cap.plato === 'lost' || cap.panel === 'lost')
    capture.replaceChildren(
      ...(lost ? [h('div', 'banner bad', {}, [h('b', '', {}, ['Captura perdida.']), cap.error || 'Discord está minimizado o cerrado: los marcos muestran la silueta.'])] : []),
      h('div', 'pnl', { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, [
        h('div', '', { flex: 1, minWidth: 0 }, [
          h('div', '', { fontWeight: 600 }, ['Ventana de Discord']),
          h('div', 'mut', { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [s.cameras.sourceName ?? 'Sin elegir'])
        ]),
        btn('Calibrar recuadros', () => ctx.openCalibration(), 'b'),
        btn('Reconectar', async () => {
          await window.konk.resolveSource()
          ctx.send({ type: 'restartCapture' })
        }, 'b ghost')
      ])
    )
  }
  return {
    el,
    update,
    shown: () => update(ctx.state),
    frame: (s: GameState) => drawFrames(ctx.feed, scene, s)
  }
}

