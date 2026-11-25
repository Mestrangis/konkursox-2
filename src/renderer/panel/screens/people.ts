// Concursantes (design/panel.html) y Escena Cámaras (design/panel.html).
import { sourceRectForFrame } from '../../../shared/crop'
import { CONTESTANT_IDS, SLOT_IDS, type ContestantId, type GameState, type SlotId } from '../../../shared/types'
import { activeContestants, camOf, camsLineup, playersInGame } from '../../../shared/scene'
import { formatPoints } from '../../../shared/quiz'
import { buildScene, sceneKey } from '../../plato/scenes'
import { PLANOS, type CamsPlano } from '../../../shared/scene'
import { LAYOUTS } from '../../../shared/layouts'
import { drawFrames, type Scene } from '../../plato/scenes'
import { askConfirm, btn, editableArea, h, seg, silhouette, sw, type Ctx, type Screen } from '../ui'

const camLabel = (slot: SlotId) => (slot === 'host' ? 'Cámara 5' : slot === 'publico' ? 'Cámara Público' : `Cámara ${CONTESTANT_IDS.indexOf(slot as ContestantId) + 1}`)

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
      team.onchange = () =>
        ctx.send({
          type: 'setContestant',
          id,
          patch: { team: Number(team.value) as 0 | 1 }
        })
      const pts = h('input', 'inp', { textAlign: 'right', fontWeight: 700 })
      pts.value = String(c.score)
      pts.inputMode = 'numeric'
      pts.setAttribute('aria-label', `Puntos de ${c.name}`)
      pts.onchange = () => {
        const v = Number(pts.value)
        if (Number.isFinite(v)) ctx.send({ type: 'setScore', id, value: v })
      }
      const x = h('button', 'x', {}, ['×'])
      x.setAttribute('aria-label', `Quitar a ${c.name}`)
      x.disabled = n <= 1 || teams
      x.onclick = async () => (await askConfirm(`¿Quitar a ${c.name}?`, 'Los de detrás suben un puesto.', 'Quitar', true)) && ctx.send({ type: 'removeContestant', id })
      return h('div', 'rowc', {}, [
        h('span', 'mut', { fontWeight: 700 }, [String(i + 1)]),
        name,
        seg(
          [
            { v: 'm', t: 'Chico' },
            { v: 'f', t: 'Chica' }
          ],
          c.gender,
          (v) =>
            ctx.send({
              type: 'setGender',
              id,
              gender: c.gender === v ? null : v
            })
        ),
        team,
        pts,
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
        h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [
          name,
          h('span', 'spacer'),
          h('span', 'mut', { fontSize: 12 }, ['Total']),
          dec,
          h(
            'span',
            '',
            {
              fontSize: 22,
              fontWeight: 800,
              minWidth: 60,
              textAlign: 'center'
            },
            [formatPoints(s.teams[t].score)]
          ),
          inc
        ]),
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
            { v: 'teams', t: '2 contra 2' }
          ],
          teams ? 'teams' : 'ind',
          (v) => ctx.send({ type: 'setFormat', teams: v === 'teams' })
        ),
        btn('Poner todos a 0', async () => (await askConfirm('¿Poner a cero los puntos?', 'De todos los concursantes y equipos.', 'Poner a 0', true)) && ctx.send({ type: 'resetScores' }), 'b')
      ]),
      h('div', 'pnl', { overflowX: 'auto' }, [
        h('div', '', { minWidth: 900 }, [
          h(
            'div',
            'rowc hd',
            {},
            ['#', 'Nombre', 'Chico / chica', 'Equipo', 'Puntos', ''].map((t) => h('span', '', {}, [t]))
          ),
          ...rows,
          h(
            'div',
            '',
            {
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px'
            },
            [
              (() => {
                const b = btn('+ Añadir concursante', () => ctx.send({ type: 'setPlayers', count: n + 1 }), 'b ghost')
                b.disabled = n >= 4 || teams
                return b
              })(),
              h('span', 'mut', { fontSize: 12 }, [n >= 4 ? 'Ya hay 4, el máximo' : teams ? '' : `${n} de 4`]),
              h('span', 'spacer'),
              ...(noSignal.length ? [h('span', 'warn', { fontSize: 12 }, [`La cámara de ${noSignal.map((c) => c.name).join(', ')} no da señal ahora mismo`])] : []),
              (() => {
                const a = h('a', '', { fontSize: 13 }, ['Cámaras de cada uno'])
                a.onclick = () => ctx.go('camaras')
                return a
              })()
            ]
          )
        ])
      ]),
      ...(teams ? [h('div', '', { display: 'flex', gap: 12, flexWrap: 'wrap' }, [teamCard(0), teamCard(1)])] : []),
      h(
        'div',
        'pnl',
        {
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        },
        [h('span', '', { fontWeight: 600 }, ['Presentador']), hostName, h('span', 'mut', { fontSize: 12 }, ['No suma puntos'])]
      )
    )
  }
  return { el: body, update, shown: () => build(ctx.state) }
}

// ---------------------------------------------------------------- Escena Cámaras

export function createCamerasScreen(ctx: Ctx): Screen {
  type Tab = 'sale' | 'asignacion' | 'calibracion'
  let tab: Tab = 'sale'
  const stage = h('div', 'stage')
  const badge = h('span', 'badge')
  const preview = h('div', 'preview', {}, [stage, badge])
  const options = h('div', 'pnl', {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  })
  const people = h('div', '', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  })
  const head = h('div', 'head')
  const tabs = h('div', 'tabs')
  const paneSale = h('div', '', { display: 'flex', gap: 16, minHeight: 0 }, [
    h(
      'div',
      '',
      {
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      },
      [preview, options]
    ),
    h(
      'div',
      '',
      {
        flex: '0 0 250px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      },
      [people]
    )
  ])
  const paneAsig = h('div', '', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  })
  const paneCal = h('div', '', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  })
  const el = h('div', 'screen', {}, [head, tabs, paneSale, paneAsig, paneCal])
  new ResizeObserver(() => (stage.style.transform = `scale(${preview.clientWidth / 1920})`)).observe(preview)
  let scene: Scene | null = null
  let asigKey = ''

  function paintTabs(): void {
    tabs.replaceChildren(
      ...(
        [
          ['sale', 'Quién sale'],
          ['asignacion', 'Asignación'],
          ['calibracion', 'Calibración']
        ] as const
      ).map(([t, label]) => {
        const b = h('button', tab === t ? 'on' : '', {}, [label])
        b.onclick = () => {
          tab = t
          asigKey = ''
          update(ctx.state)
        }
        return b
      })
    )
    paneSale.style.display = tab === 'sale' ? 'flex' : 'none'
    paneAsig.style.display = tab === 'asignacion' ? 'flex' : 'none'
    paneCal.style.display = tab === 'calibracion' ? 'flex' : 'none'
  }

  function update(s: GameState): void {
    const live = s.scene === 'camaras'
    head.replaceChildren(
      h('div', 'title', {}, [
        h('b', '', { display: 'flex', alignItems: 'center', gap: 10 }, [
          'Cámaras',
          live
            ? h(
                'span',
                'air',
                {
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                },
                [h('span', 'dotlive'), 'EN EL AIRE']
              )
            : btn('Poner en el aire', () => ctx.send({ type: 'setScene', scene: 'camaras' }), 'b sm acc', 'F2')
        ])
      ])
    )
    paintTabs()
    if (tab === 'sale') paintSale(s)
    else if (tab === 'asignacion') paintAsig(s)
    else paintCal(s)
  }

  // ---- Quién sale: vista previa, plano, distribución y personas
  function paintSale(s: GameState): void {
    const live = s.scene === 'camaras'
    preview.classList.toggle('live', live)
    badge.textContent = live ? 'EN EL AIRE' : 'VISTA PREVIA'
    badge.classList.toggle('off', !live)
    const ps: GameState = { ...s, scene: 'camaras' }
    const k = sceneKey(ps)
    if (!scene || scene.key !== k) {
      scene = buildScene(ps)
      scene.root.classList.remove('k-enter')
      stage.replaceChildren(scene.root)
    } else scene.update(ps)
    drawFrames(ctx.feed, scene, ps)
    if (!camsLineup(s).length)
      stage.append(
        h(
          'div',
          '',
          {
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9a9aa3',
            fontSize: 40
          },
          ['Nadie seleccionado']
        )
      )
    const row = (label: string, ...kids: Node[]) =>
      h('div', '', { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, [h('span', 'mut', { fontSize: 12, width: 84 }, [label]), ...kids])
    options.replaceChildren(
      row(
        'Plano',
        seg(
          PLANOS.filter((p) => p.id !== 'juego').map((pl) => ({
            v: pl.id as CamsPlano,
            t: pl.label
          })),
          s.camsScene.camsPlano,
          (v) => ctx.send({ type: 'camsSet', patch: { camsPlano: v } })
        )
      ),
      row(
        'Distribución',
        seg(
          [
            { v: 'auto', t: 'Automática' },
            ...(['solo', 'duo', 'trio', 'quad'] as const).map((id) => ({
              v: id,
              t: id === 'solo' ? '1 + yo' : String(LAYOUTS[id].count),
              disabled: activeContestants(s).length < LAYOUTS[id].count
            })),
            ...(s.layout === 'teams' ? [{ v: 'teams' as const, t: '2 contra 2' }] : [])
          ],
          s.camsScene.template ?? 'auto',
          (v) =>
            ctx.send({
              type: 'camsSet',
              patch: { template: v === 'auto' ? null : v }
            })
        )
      ),
      row(
        'Rótulos',
        h('span', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
          sw(
            s.camsScene.names,
            () =>
              ctx.send({
                type: 'camsSet',
                patch: { names: !ctx.state.camsScene.names }
              }),
            'Mostrar nombres'
          ),
          'Nombres'
        ]),
        h('span', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
          sw(
            s.camsScene.scores,
            () =>
              ctx.send({
                type: 'camsSet',
                patch: { scores: !ctx.state.camsScene.scores }
              }),
            'Mostrar puntos'
          ),
          'Puntos'
        ]),
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
    )
    thumbs.clear()
    const list: SlotId[] = ['host', ...activeContestants(s), ...(s.cameras.rects.publico ? (['publico'] as SlotId[]) : [])]
    people.replaceChildren(
      ...list.map((slot) => {
        const on = !!s.camsScene.on[slot]
        const cam = camOf(s, slot)
        const st = camState(s, cam)
        const name = slot === 'host' ? s.host.name : slot === 'publico' ? 'Público' : s.contestants.find((c) => c.id === slot)!.name
        return h('div', `cr${on ? ' on' : ''}`, {}, [
          camThumb(ctx, s, cam),
          h('div', '', { flex: 1, minWidth: 0 }, [
            h('div', '', { fontWeight: 600 }, [name]),
            h('div', '', { fontSize: 12, color: st.ok ? '#9a9aa3' : '#e8a23a' }, [`${camLabel(cam)}${st.ok ? '' : ' · ' + st.text.toLowerCase()}`])
          ]),
          sw(on, () => ctx.send({ type: 'camsToggle', slot }), `Mostrar a ${name}`)
        ])
      })
    )
  }

  // ---- Asignación: qué recuadro es de quién
  function paintAsig(s: GameState): void {
    const k = JSON.stringify([s.contestants.map((c) => [c.id, c.name, c.cam]), s.host, s.cameras.rects, s.layout, s.runtime.capture])
    if (k === asigKey || paneAsig.contains(document.activeElement)) return
    asigKey = k
    thumbs.clear()
    const camSel = (cur: SlotId, onPick: (v: SlotId) => void) => {
      const sel = h('select', 'inp', { width: 230 })
      for (const c of SLOT_IDS) {
        const o = h('option', '', {}, [`${camLabel(c)}${s.cameras.rects[c] ? '' : ' · sin recuadro'}`])
        o.value = c
        o.selected = c === cur
        sel.append(o)
      }
      sel.onchange = () => onPick(sel.value as SlotId)
      return sel
    }
    const rowOf = (name: string, role: string, cam: SlotId, pick: (v: SlotId) => void) => {
      const st = camState(s, cam)
      return h(
        'div',
        'pnl',
        {
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 14
        },
        [
          camThumb(ctx, s, cam, true),
          h('div', '', { flex: 1, minWidth: 0 }, [h('div', '', { fontWeight: 600 }, [name]), h('div', 'mut', { fontSize: 12 }, [role])]),
          h('span', '', { fontSize: 12, color: st.ok ? '#3ecf8e' : '#e8a23a' }, [st.text]),
          camSel(cam, pick)
        ]
      )
    }
    paneAsig.replaceChildren(
      h('span', 'mut', { fontSize: 12 }, ['Cada persona sale con el recuadro de Discord que elijas aquí.']),
      rowOf(s.host.name, 'Presentador', s.host.cam, (v) => ctx.send({ type: 'setContestantCam', id: 'host', cam: v })),
      ...activeContestants(s).map((id) => {
        const c = s.contestants.find((x) => x.id === id)!
        return rowOf(c.name, 'Concursante', c.cam, (v) => ctx.send({ type: 'setContestantCam', id, cam: v }))
      })
    )
  }

  // ---- Calibración: ventana de Discord y recuadros
  function paintCal(s: GameState): void {
    const cap = s.runtime.capture
    const lost = !!s.cameras.sourceId && (cap.plato === 'lost' || cap.panel === 'lost')
    paneCal.replaceChildren(
      ...(lost ? [h('div', 'banner bad', {}, [h('b', '', {}, ['Captura perdida. ']), cap.error || 'Discord está minimizado o cerrado: los marcos muestran la silueta.'])] : []),
      h(
        'div',
        'pnl',
        {
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        },
        [
          h('div', '', { flex: 1, minWidth: 0 }, [
            h('div', '', { fontWeight: 600 }, ['Ventana de Discord']),
            h(
              'div',
              'mut',
              {
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              },
              [s.cameras.sourceName ?? 'Sin elegir']
            )
          ]),
          btn('Elegir ventana y calibrar recuadros', () => ctx.openCalibration(), 'b acc'),
          btn(
            'Reconectar',
            async () => {
              await window.konk.resolveSource()
              ctx.send({ type: 'restartCapture' })
            },
            'b ghost'
          )
        ]
      ),
      h(
        'div',
        'pnl',
        {
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8
        },
        [
          ...SLOT_IDS.map((c) =>
            h('div', '', { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }, [
              h('span', '', {
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: s.cameras.rects[c] ? '#3ecf8e' : '#55555d',
                flex: 'none'
              }),
              `${camLabel(c)}${c === 'publico' ? ' (opcional)' : ''}: ${s.cameras.rects[c] ? 'con recuadro' : 'sin recuadro'}`
            ])
          )
        ]
      )
    )
  }

  return {
    el,
    update,
    shown: () => {
      asigKey = ''
      update(ctx.state)
    },
    frame: (s: GameState) => tab === 'sale' && drawFrames(ctx.feed, scene, { ...s, scene: 'camaras' })
  }
}
