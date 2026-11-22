// Ajustes: plató, audio y sonidos del juego, puntuación, reloj, escalera, estimación, personas, rótulo y actualizaciones.
import { CUES, DEFAULT_LIFELINES, defaultLevels, LIFELINE_ICONS, MAX_LIFELINES, type LifelineDef } from '../../../shared/quiz'
import { lifelineIcon } from '../../ds/lifeline'
import { newId, playedCount, type Person } from '../../../shared/scene'
import type { DisplayInfo, GameState } from '../../../shared/types'
import { askConfirm, btn, editableArea, h, seg, sw, type Ctx, type Screen } from '../ui'

export function createSettingsScreen(ctx: Ctx): Screen {
  const el = h('div', 'screen')
  let displays: DisplayInfo[] = []
  void window.konk.listDisplays().then((d) => {
    displays = d
    key = ''
    if (el.isConnected) update(ctx.state)
  })
  window.konk.onDisplays((d) => {
    displays = d
    key = ''
    if (el.isConnected) update(ctx.state)
  })
  let key = ''

  const card = (title: string, ...children: Node[]) => h('section', 'pnl', { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }, [h('span', 'lbl', {}, [title]), ...children])
  const row = (...children: Node[]) => h('div', '', { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, children)
  const num = (value: number, set: (v: number) => void, width = 90) => {
    const i = h('input', 'inp', { width, textAlign: 'right' })
    i.value = String(value)
    i.inputMode = 'decimal'
    i.onchange = () => {
      const v = Number(i.value.replace(',', '.'))
      if (Number.isFinite(v)) set(v)
    }
    return i
  }
  const text = (value: string, set: (v: string) => void, placeholder = '') => {
    const i = h('input', 'inp')
    i.value = value
    i.placeholder = placeholder
    i.oninput = () => set(i.value)
    return i
  }
  /** Comodines de la escalera: nombre, icono (propio o imagen) y qué hacen. */
  const lifelinesCard = (s: GameState) => {
    const list = s.quiz.lifelines
    const save = (next: LifelineDef[]) => ctx.send({ type: 'ladderSetLifelines', lifelines: next })
    const patch = (i: number, p: Partial<LifelineDef>) => save(list.map((l, j) => (j === i ? { ...l, ...p } : l)))
    const rows = list.map((l, i) => {
      const name = h('input', 'inp', { width: 150 })
      name.value = l.name
      name.onchange = () => name.value.trim() && patch(i, { name: name.value.trim() })
      const iconSel = h('select', 'inp', { width: 150 })
      for (const [k, v] of Object.entries(LIFELINE_ICONS)) iconSel.append(new Option(v.label, k))
      iconSel.append(new Option('Imagen propia…', '__img'))
      if (l.icon.startsWith('img:')) iconSel.append(new Option(`Imagen: ${l.icon.slice(4)}`, l.icon))
      iconSel.value = l.icon
      iconSel.onchange = async () => {
        if (iconSel.value !== '__img') return patch(i, { icon: iconSel.value })
        const file = await window.konk.libChooseImage()
        if (file) patch(i, { icon: `img:${file}` })
        else iconSel.value = l.icon
      }
      const kind = h('select', 'inp', { width: 190 })
      kind.append(new Option('50:50 automático', 'fifty'), new Option('Solo marcar como usado', 'mark'))
      kind.value = l.kind
      kind.onchange = () => patch(i, { kind: kind.value as LifelineDef['kind'] })
      const prev = h('span', '', { width: 44, height: 30, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 15, background: '#0d1530', boxShadow: '0 0 0 1px #8a6d32' }, [lifelineIcon(l, 18, '#e6cb85')])
      return row(h('span', 'nm', {}, [String(i + 1)]), prev, name, iconSel, kind, btn('Quitar', () => save(list.filter((_, j) => j !== i)), 'b sm ghost'))
    })
    return card(
      'Comodines de la escalera',
      h('span', 'mut', { fontSize: 12 }, [`Hasta ${MAX_LIFELINES}. Se usan con las teclas 1-${MAX_LIFELINES} en la escalera; el plató se adapta al número.`]),
      ...rows,
      row(
        btn('Añadir comodín', () => save([...list, { id: newId(), name: 'Comodín', icon: 'estrella', kind: 'mark' }]), 'b sm', undefined),
        btn('Volver a los de por defecto', () => save(DEFAULT_LIFELINES.map((l) => ({ ...l }))), 'b sm ghost')
      )
    )
  }
  const toggle = (label: string, on: boolean, flip: () => void) => h('span', '', { display: 'flex', alignItems: 'center', gap: 10 }, [sw(on, flip, label), label])

  const area = editableArea(el, () => build(ctx.state))
  function update(s: GameState): void {
    const k = JSON.stringify([s.plato, s.audio, s.quiz.scoring, s.quiz.timer.seconds, s.quiz.lifelines, s.quiz.autoRotate, s.quiz.ladder.levels, s.quiz.ladder.awardToScore, s.quiz.estimation, s.quiz.sounds, s.people, s.lowerThird, s.host, s.show, s.runtime.update, s.runtime.appVersion, ctx.audioLib, displays.length])
    const changed = k !== key
    key = k
    area.refresh(changed)
  }

  function build(s: GameState): void {
    const send = ctx.send

    // plató
    const disp = h('select', 'inp', { width: 'auto', minWidth: 280 })
    const fallback = displays.find((d) => !d.primary) ?? displays[0]
    const sel = displays.some((d) => d.id === s.plato.displayId) ? s.plato.displayId : fallback?.id
    displays.forEach((d, i) => {
      const o = h('option', '', {}, [`${i + 1} · ${d.label} (${d.bounds.width}x${d.bounds.height})${d.primary ? ' · principal' : ''}`])
      o.value = String(d.id)
      o.selected = d.id === sel
      disp.append(o)
    })
    disp.onchange = () => send({ type: 'setPlato', patch: { displayId: Number(disp.value) } })

    // sonidos del juego
    const sfx = ctx.audioLib.sfx
    const cueSel = CUES.map((c) => {
      const v = s.quiz.sounds[c.id]
      const sl = h('select', 'inp')
      const opts = ['', ...sfx]
      if (v && !sfx.includes(v)) opts.push(v)
      for (const f of opts) {
        const o = h('option', '', {}, [f ? (sfx.includes(f) ? f : `${f} (no está)`) : '(ninguno)'])
        o.value = f
        o.selected = f === (v ?? '')
        sl.append(o)
      }
      sl.onchange = () => send({ type: 'quizSetSound', cue: c.id, file: sl.value || null })
      return h('label', 'field', {}, [h('span', 'fl', {}, [c.label]), sl])
    })

    // escalera
    const levels = s.quiz.ladder.levels
    const levelRows = levels
      .map((lv, i) => {
        const v = num(lv.value, (val) => send({ type: 'ladderSetLevels', levels: ctx.state.quiz.ladder.levels.map((x, j) => (j === i ? { ...x, value: val } : x)) }), 120)
        return row(
          h('span', 'mut', { width: 26, textAlign: 'right', fontWeight: 700 }, [String(i + 1)]),
          v,
          toggle('Seguro', lv.safe, () => send({ type: 'ladderSetLevels', levels: ctx.state.quiz.ladder.levels.map((x, j) => (j === i ? { ...x, safe: !x.safe } : x)) }))
        )
      })
      .reverse()

    // personas del grupo
    const setPeople = (people: Person[]) => send({ type: 'setPeople', people })
    const peopleRows = s.people.map((p) => {
      const img = h('img', '', { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', background: '#26262b', flex: 'none' })
      img.alt = ''
      if (p.photo) img.src = `konk-media://personas/${encodeURIComponent(p.photo)}`
      return row(
        img,
        text(p.name, (v) => setPeople(ctx.state.people.map((x) => (x.id === p.id ? { ...x, name: v } : x)))),
        btn(p.photo ? 'Cambiar foto' : 'Foto', async () => {
          const file = await window.konk.choosePhoto(p.name)
          if (file) setPeople(ctx.state.people.map((x) => (x.id === p.id ? { ...x, photo: file } : x)))
        }, 'b sm ghost'),
        btn('Quitar', () => setPeople(ctx.state.people.filter((x) => x.id !== p.id)), 'b sm ghost danger')
      )
    })
    const newPerson = h('input', 'inp', { flex: 1 })
    newPerson.placeholder = 'Nombre'
    const addPerson = () => {
      const name = newPerson.value.trim()
      if (!name) return
      setPeople([...ctx.state.people, { id: newId(), name }])
    }
    newPerson.onkeydown = (e) => e.key === 'Enter' && addPerson()

    const u = s.runtime.update
    const upText: Record<string, string> = {
      disabled: 'Modo desarrollo (sin actualizaciones)',
      checking: 'Buscando actualización…',
      none: 'Versión al día',
      available: `Descargando la versión ${u.version ?? ''}…`,
      downloading: `Descargando ${u.percent ?? 0}%`,
      ready: `La versión ${u.version ?? ''} está lista: se instala al cerrar`,
      error: `Error al buscar actualizaciones: ${u.message ?? ''}`
    }
    const n = playedCount(s)

    el.replaceChildren(
      h('div', 'head', {}, [h('div', 'title', {}, [h('b', '', {}, ['Ajustes']), h('span', 'mut', { fontSize: 13 }, ['Se guardan solos'])])]),
      h('div', '', { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14, alignItems: 'start' }, [
        card(
          'Plató',
          row(h('span', 'fl', {}, ['Monitor']), disp),
          row(toggle('En ventana (para pruebas)', s.plato.windowed, () => send({ type: 'setPlato', patch: { windowed: !ctx.state.plato.windowed } }))),
          row(btn('Mostrar el plató', () => void window.konk.showPlato(), 'b'), btn('Ocultar el plató', () => send({ type: 'setPlato', patch: { visible: false } }), 'b ghost')),
          row(btn('Cámaras: elegir ventana y calibrar', () => ctx.openCalibration(), 'b'))
        ),
        card(
          'Juegos jugados',
          row(
            h('span', '', { fontSize: 22, fontWeight: 800 }, [String(n)]),
            h('span', 'mut', { fontSize: 13 }, [`${n === 1 ? 'prueba jugada' : 'pruebas jugadas'} (cuentan para el marcador final)`]),
            h('span', 'spacer'),
            btn('−', () => send({ type: 'playedAdjust', delta: -1 }), 'pm'),
            btn('+', () => send({ type: 'playedAdjust', delta: 1 }), 'pm')
          ),
          row(btn('Empezar programa nuevo (poner a 0)', async () => (await askConfirm('¿Poner a cero las pruebas jugadas?', '', 'Poner a 0', true)) && send({ type: 'playedReset' }), 'b ghost'))
        ),
        card(
          'Audio',
          row(h('span', 'mut', { fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [ctx.audioLib.dir])),
          row(
            btn('Abrir la carpeta', () => void window.konk.audioOpenDir(), 'b sm'),
            btn('Cambiar…', async () => {
              await window.konk.audioChooseDir()
              await ctx.reloadAudio()
            }, 'b sm ghost'),
            btn('Recargar', () => void ctx.reloadAudio(), 'b sm ghost')
          ),
          row(h('span', 'fl', {}, ['Volumen de efectos']), num(Math.round(s.audio.sfxVolume * 100), (v) => send({ type: 'setAudio', patch: { sfxVolume: Math.max(0, Math.min(100, v)) / 100 } }), 70), h('span', 'mut', {}, ['%'])),
          row(h('span', 'fl', {}, ['Fundido de la música']), num(s.audio.fadeSeconds, (v) => send({ type: 'setAudio', patch: { fadeSeconds: Math.max(0, Math.min(10, v)) } }), 70), h('span', 'mut', {}, ['s']))
        ),
        card(
          'Sonidos automáticos del juego',
          row(toggle('Activados', s.audio.autoSounds, () => send({ type: 'setAudio', patch: { autoSounds: !ctx.state.audio.autoSounds } }))),
          h('div', '', { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }, cueSel)
        ),
        card(
          'Puntuación y turnos',
          row(h('span', 'fl', {}, ['Puntos por acierto']), num(s.quiz.scoring.pointsCorrect, (v) => send({ type: 'quizSetScoring', patch: { pointsCorrect: v } }))),
          row(
            toggle('Fallar resta', s.quiz.scoring.penalize, () => send({ type: 'quizSetScoring', patch: { penalize: !ctx.state.quiz.scoring.penalize } })),
            num(s.quiz.scoring.pointsWrong, (v) => send({ type: 'quizSetScoring', patch: { pointsWrong: Math.abs(v) } }), 70)
          ),
          row(toggle('Sumar los puntos al revelar', s.quiz.scoring.autoAward, () => send({ type: 'quizSetScoring', patch: { autoAward: !ctx.state.quiz.scoring.autoAward } }))),
          row(toggle('El turno pasa solo al siguiente con cada pregunta', s.quiz.autoRotate, () => send({ type: 'quizSetOptions', patch: { autoRotate: !ctx.state.quiz.autoRotate } }))),
          row(
            h('span', 'fl', {}, ['Duración del temporizador']),
            num(s.quiz.timer.seconds, (v) => send({ type: 'timerConfig', patch: { seconds: v } }), 70),
            h('span', 'mut', {}, ['s · se muestra y se arranca desde cada juego (T / Y)'])
          )
        ),
        card(
          'Estimación',
          row(toggle('Precio justo (gana el más cercano sin pasarse)', s.quiz.estimation.priceIsRight, () => send({ type: 'quizSetEstimation', patch: { priceIsRight: !ctx.state.quiz.estimation.priceIsRight } }))),
          row(
            seg(
              [
                { v: 'closest', t: 'Solo el más cercano' },
                { v: 'ranked', t: 'Escalonado por cercanía' }
              ],
              s.quiz.estimation.mode,
              (v) => send({ type: 'quizSetEstimation', patch: { mode: v } })
            )
          ),
          row(
            h('span', 'fl', {}, ['Puntos por puesto']),
            (() => {
              const i = h('input', 'inp', { width: 160 })
              i.value = s.quiz.estimation.ranked.join(', ')
              i.onchange = () => send({ type: 'quizSetEstimation', patch: { ranked: i.value.split(/[,;\s]+/).map(Number).filter(Number.isFinite) } })
              return i
            })(),
            h('span', 'mut', { fontSize: 12 }, ['1º, 2º, 3º...'])
          )
        ),
        card(
          'Escalera',
          row(toggle('Sumar el premio final a los puntos', s.quiz.ladder.awardToScore, () => send({ type: 'ladderSetAward', awardToScore: !ctx.state.quiz.ladder.awardToScore }))),
          row(
            btn('Añadir escalón', () => send({ type: 'ladderSetLevels', levels: [...levels, { value: (levels[levels.length - 1]?.value ?? 50) * 2, safe: false }] }), 'b sm'),
            btn('Quitar el último', () => send({ type: 'ladderSetLevels', levels: levels.slice(0, -1) }), 'b sm ghost'),
            btn('15 por defecto', () => send({ type: 'ladderSetLevels', levels: defaultLevels() }), 'b sm ghost')
          ),
          h('div', '', { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflow: 'auto' }, levelRows)
        ),
        lifelinesCard(s),
        card(
          'Personas del grupo',
          h('span', 'mut', { fontSize: 12 }, ['Rellenan las opciones de "¿Quién lo dijo?" (y servirán para otros juegos).']),
          ...peopleRows,
          row(newPerson, btn('Añadir', addPerson, 'b sm acc'))
        ),
        card(
          'Rótulo inferior y presentador',
          row(toggle('Rótulo visible', s.lowerThird.visible, () => send({ type: 'setLowerThird', patch: { visible: !ctx.state.lowerThird.visible } }))),
          h('label', 'field', {}, [h('span', 'fl', {}, ['Antetítulo']), text(s.lowerThird.kicker, (v) => send({ type: 'setLowerThird', patch: { kicker: v } }))]),
          h('label', 'field', {}, [h('span', 'fl', {}, ['Título']), text(s.lowerThird.title, (v) => send({ type: 'setLowerThird', patch: { title: v } }))]),
          h('label', 'field', {}, [h('span', 'fl', {}, ['Texto de la derecha']), text(s.lowerThird.right, (v) => send({ type: 'setLowerThird', patch: { right: v } }))]),
          row(
            h('label', 'field', { flex: 1 }, [h('span', 'fl', {}, ['Presentador']), text(s.host.name, (v) => send({ type: 'setHost', patch: { name: v } }))]),
            h('label', 'field', { flex: 1 }, [h('span', 'fl', {}, ['Etiqueta']), text(s.host.label, (v) => send({ type: 'setHost', patch: { label: v } }))])
          )
        ),
        card(
          'Actualizaciones',
          row(h('span', '', { fontWeight: 600 }, [`Versión ${s.runtime.appVersion}`]), h('span', 'mut', { fontSize: 12 }, [upText[u.state] ?? ''])),
          row(
            btn('Buscar ahora', () => void window.konk.checkUpdate(), 'b sm'),
            ...(u.state === 'ready' ? [btn('Reiniciar y actualizar', () => void window.konk.installUpdate(), 'b sm acc')] : [])
          )
        )
      ])
    )
  }

  return { el, update, shown: () => build(ctx.state) }
}
