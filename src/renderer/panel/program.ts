// Pestaña "Programa": escaleta de pruebas, marcador final y personas del grupo.
import type { BankInfo, QuestionType } from '../../shared/questions'
import type { CueId } from '../../shared/quiz'
import { defaultConfig, GAME_KINDS, gameLabel, newId, playedCount, type GameKind, type Person, type Segment, type ShowAction } from '../../shared/show'
import type { Action, GameState } from '../../shared/types'
import { h } from '../ds/components'
import type { AudioEngine } from './audio'

interface Ctx {
  send(a: Action): void
  getState(): GameState
  audio: AudioEngine
  getSfx(): string[]
  getMusic(): string[]
  previewSlot: HTMLElement
}

const btn = (label: string, onClick: () => void, cls = '') => {
  const b = h('button', `p-btn ${cls}`.trim(), {}, [label])
  b.onclick = onClick
  return b
}
const card = (title: string, ...children: Node[]) => h('section', 'p-card', {}, [h('h3', 'p-card__title', {}, [title]), ...children])

/** Tipos de pregunta que admite cada juego (para filtrar bancos). */
const BANK_TYPES: Record<GameKind, QuestionType[]> = {
  test: ['test'],
  sino: ['sino'],
  quien: ['quien'],
  estimacion: ['estimacion'],
  rosco: ['rosco'],
  escalera: ['test', 'sino'],
  libre: []
}

export function createProgramTab(ctx: Ctx) {
  const { send, audio } = ctx
  const S = () => ctx.getState()
  let banks: BankInfo[] = []
  let editing: string | null = null
  let saved: { file: string; title: string; count: number }[] = []

  function cue(id: CueId): void {
    const file = S().quiz.sounds[id]
    if (file && ctx.getSfx().includes(file)) audio.playSfx(file)
  }

  const setSegments = (segments: Segment[]) => send({ type: 'showSet', patch: { segments } } as ShowAction)
  const updateSeg = (id: string, patch: Partial<Segment>) =>
    setSegments(S().show.segments.map((s) => (s.id === id ? { ...s, ...patch, config: { ...s.config, ...(patch.config ?? {}) } } : s)))

  // ---------------------------------------------------------------- escaleta
  const titleInput = h('input', 'p-input')
  titleInput.placeholder = 'Nombre de la escaleta (p. ej. Programa 1)'
  titleInput.oninput = () => send({ type: 'showSet', patch: { title: titleInput.value } })
  const list = h('div', 'p-seglist')
  const editor = h('div', 'p-col', { gap: 8 })
  const savedSelect = h('select', 'p-select', { flex: 1, width: 'auto' })

  async function loadSaved(): Promise<void> {
    saved = await window.konk.listShows()
    savedSelect.replaceChildren(
      h('option', '', {}, [saved.length ? 'Escaletas guardadas...' : 'No hay escaletas guardadas']),
      ...saved.map((x) => {
        const o = h('option', '', {}, [`${x.title} (${x.count} pruebas)`])
        o.value = x.file
        return o
      })
    )
  }

  function addSegment(game: GameKind): void {
    const segs = S().show.segments
    const seg: Segment = { id: newId(), name: gameLabel(game), game, bankFile: null, config: defaultConfig() }
    const b = banks.find((x) => x.tipos.some((t) => BANK_TYPES[game].includes(t)))
    if (b) seg.bankFile = b.file
    setSegments([...segs, seg])
    editing = seg.id
  }

  function startSegment(i: number): void {
    const s = S()
    const seg = s.show.segments[i]
    if (!seg) return
    audio.stopSfx()
    audio.stopLoop()
    send({ type: 'showStart', index: i })
    if (seg.config.music && ctx.getMusic().includes(seg.config.music)) void audio.playMusic(seg.config.music)
    else cue('transicion')
  }

  /** Del rótulo de transición al juego. */
  function goToGame(): void {
    const s = S()
    const seg = s.show.segments[s.show.current ?? -1]
    void audio.stopMusic()
    if (!seg) return send({ type: 'setView', view: 'plato' })
    if (seg.game === 'rosco' && s.rosco.active) send({ type: 'setView', view: 'rosco' })
    else if (s.quiz.current && seg.game !== 'rosco') send({ type: 'setView', view: 'quiz' })
    else send({ type: 'setView', view: 'plato' })
  }

  function renderList(): void {
    const s = S()
    const segs = s.show.segments
    list.replaceChildren(
      ...segs.map((seg, i) => {
        const played = s.show.played.includes(seg.id)
        const current = s.show.current === i
        const row = h('div', 'p-seg' + (current ? ' is-current' : '') + (played ? ' is-played' : '') + (editing === seg.id ? ' is-editing' : ''))
        const up = btn('Subir', () => {
          if (i === 0) return
          const a = [...segs]
          ;[a[i - 1], a[i]] = [a[i], a[i - 1]]
          setSegments(a)
        }, 'p-btn--sm')
        up.disabled = i === 0
        const down = btn('Bajar', () => {
          if (i === segs.length - 1) return
          const a = [...segs]
          ;[a[i + 1], a[i]] = [a[i], a[i + 1]]
          setSegments(a)
        }, 'p-btn--sm')
        down.disabled = i === segs.length - 1
        row.append(
          h('span', 'p-num', {}, [String(i + 1)]),
          h('div', 'p-seg__main', {}, [
            h('strong', '', {}, [seg.name || '(sin nombre)']),
            h('span', 'p-muted', {}, [`${gameLabel(seg.game)}${seg.bankFile ? ' · ' + (banks.find((b) => b.file === seg.bankFile)?.nombre ?? seg.bankFile) : ''}${played ? ' · jugada' : ''}`])
          ]),
          btn(current ? 'En curso' : 'Empezar', () => startSegment(i), `p-btn--sm ${current ? 'is-active' : 'p-btn--ok'}`),
          btn('Editar', () => {
            editing = editing === seg.id ? null : seg.id
            renderList()
            renderEditor()
          }, 'p-btn--sm'),
          up,
          down,
          btn('Quitar', () => {
            if (confirm(`¿Quitar "${seg.name}" de la escaleta?`)) setSegments(segs.filter((x) => x.id !== seg.id))
          }, 'p-btn--sm p-btn--ko')
        )
        return row
      })
    )
    if (!segs.length) list.append(h('div', 'p-muted', { padding: 8 }, ['Escaleta vacía. Añade pruebas abajo; también puedes jugar suelto desde las pestañas Preguntas y Rosco.']))
  }

  function field(label: string, el: HTMLElement): HTMLElement {
    return h('label', 'p-field', {}, [h('span', '', {}, [label]), el])
  }
  function numInput(value: number, onChange: (v: number) => void, width = 80): HTMLInputElement {
    const i = h('input', 'p-input', { width, textAlign: 'center' })
    i.value = String(value)
    i.onchange = () => {
      const v = Number(i.value.replace(',', '.'))
      if (Number.isFinite(v)) onChange(v)
    }
    return i
  }
  function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const i = h('input')
    i.type = 'checkbox'
    i.checked = value
    i.onchange = () => onChange(i.checked)
    return h('label', 'p-check', {}, [i, label])
  }

  function renderEditor(): void {
    const s = S()
    const seg = s.show.segments.find((x) => x.id === editing)
    if (editor.contains(document.activeElement)) return
    editor.replaceChildren()
    if (!seg) return
    const c = seg.config
    const set = (config: Partial<Segment['config']>) => updateSeg(seg.id, { config: config as Segment['config'] })

    const name = h('input', 'p-input')
    name.value = seg.name
    name.onchange = () => updateSeg(seg.id, { name: name.value })
    const game = h('select', 'p-select')
    for (const g of GAME_KINDS) {
      const o = h('option', '', {}, [g.label])
      o.value = g.id
      o.selected = g.id === seg.game
      game.append(o)
    }
    game.onchange = () => updateSeg(seg.id, { game: game.value as GameKind })
    const bank = h('select', 'p-select')
    const okBanks = banks.filter((b) => b.tipos.some((t) => BANK_TYPES[seg.game].includes(t)))
    bank.append(h('option', '', {}, ['(el que esté elegido)']))
    for (const b of okBanks) {
      const o = h('option', '', {}, [`${b.nombre} (${b.count})`])
      o.value = b.file
      o.selected = b.file === seg.bankFile
      bank.append(o)
    }
    bank.onchange = () => updateSeg(seg.id, { bankFile: bank.value || null })
    const music = h('select', 'p-select')
    music.append(h('option', '', {}, ['(efecto "Rótulo de prueba")']))
    for (const m of ctx.getMusic()) {
      const o = h('option', '', {}, [m])
      o.value = m
      o.selected = m === c.music
      music.append(o)
    }
    music.onchange = () => set({ music: music.value || null })

    editor.append(
      h('div', 'p-grid2', {}, [field('Nombre visible', name), field('Juego', game)]),
      h('div', 'p-grid2', {}, [field('Banco', bank), field('Música del rótulo', music)])
    )
    const isQuiz = ['test', 'sino', 'quien', 'estimacion'].includes(seg.game)
    if (isQuiz) {
      const mode = h('select', 'p-select', { width: 'auto' })
      for (const [v, l] of [
        ['turn', 'Por turnos'],
        ['all', 'Todos responden']
      ] as const) {
        const o = h('option', '', {}, [l])
        o.value = v
        o.selected = c.mode === v
        mode.append(o)
      }
      mode.onchange = () => set({ mode: mode.value as 'turn' | 'all' })
      editor.append(
        h('div', 'p-row', {}, [
          ...(seg.game !== 'estimacion' ? [mode] : []),
          h('span', 'p-label', {}, ['Acierto']),
          numInput(c.pointsCorrect, (v) => set({ pointsCorrect: v })),
          ...(seg.game !== 'estimacion'
            ? [checkbox('Fallar resta', c.penalize, (v) => set({ penalize: v })), numInput(c.pointsWrong, (v) => set({ pointsWrong: Math.abs(v) }), 60)]
            : [])
        ]),
        h('div', 'p-row', {}, [
          h('span', 'p-label', {}, ['Reloj (s, 0 = sin reloj)']),
          numInput(c.timerSeconds, (v) => set({ timerSeconds: Math.max(0, Math.round(v)) })),
          ...(seg.game !== 'estimacion' ? [checkbox('Rebote', c.rebound, (v) => set({ rebound: v }))] : [])
        ])
      )
      if (seg.game === 'estimacion') {
        const ranked = h('input', 'p-input', { width: 140 })
        ranked.value = c.ranked.join(', ')
        ranked.onchange = () => set({ ranked: ranked.value.split(/[,;\s]+/).map(Number).filter(Number.isFinite) })
        const em = h('select', 'p-select', { width: 'auto' })
        for (const [v, l] of [
          ['closest', 'Solo el más cercano'],
          ['ranked', 'Escalonado por cercanía']
        ] as const) {
          const o = h('option', '', {}, [l])
          o.value = v
          o.selected = c.estimationMode === v
          em.append(o)
        }
        em.onchange = () => set({ estimationMode: em.value as 'closest' | 'ranked' })
        editor.append(h('div', 'p-row', {}, [checkbox('Precio justo (sin pasarse)', c.priceIsRight, (v) => set({ priceIsRight: v })), em, h('span', 'p-label', {}, ['Puntos por puesto']), ranked]))
      }
    }
    if (seg.game === 'rosco') {
      editor.append(
        h('div', 'p-row', {}, [
          h('span', 'p-label', {}, ['Segundos']),
          numInput(c.roscoSeconds, (v) => set({ roscoSeconds: Math.max(10, Math.round(v)) })),
          h('span', 'p-label', {}, ['Puntos por acierto']),
          numInput(c.roscoPoints, (v) => set({ roscoPoints: v })),
          h('span', 'p-label', {}, ['Bote (0 = sin bote)']),
          numInput(c.jackpot, (v) => set({ jackpot: Math.max(0, v) }))
        ])
      )
    }
    editor.append(h('div', 'p-row', {}, [btn('Cerrar edición', () => ((editing = null), renderList(), renderEditor()), 'p-btn--sm')]))
  }

  const addSelect = h('select', 'p-select', { width: 'auto' })
  for (const g of GAME_KINDS) {
    const o = h('option', '', {}, [g.label])
    o.value = g.id
    addSelect.append(o)
  }

  const runInfo = h('div', 'p-ladderstat')
  const bGo = btn('Ir al juego', goToGame, 'p-btn--sm p-btn--ok')
  const bNextSeg = btn('Siguiente prueba', () => {
    const s = S()
    const next = (s.show.current ?? -1) + 1
    if (next < s.show.segments.length) startSegment(next)
  }, 'p-btn--sm')
  const bAgain = btn('Repetir rótulo', () => {
    const s = S()
    if (s.show.current !== null) startSegment(s.show.current)
  }, 'p-btn--sm')

  const showCard = card(
    'Escaleta del programa',
    h('div', 'p-col', { gap: 8 }, [
      titleInput,
      h('div', 'p-row', {}, [
        savedSelect,
        btn('Cargar', async () => {
          if (!savedSelect.value || savedSelect.selectedIndex === 0) return
          if (S().show.segments.length && !confirm('¿Sustituir la escaleta actual por la guardada?')) return
          const sh = await window.konk.loadShow(savedSelect.value)
          send({ type: 'showLoad', show: sh })
        }, 'p-btn--sm'),
        btn('Guardar', async () => {
          const s = S()
          const title = s.show.title.trim() || prompt('Nombre de la escaleta', 'Programa') || ''
          if (!title) return
          if (!s.show.title.trim()) send({ type: 'showSet', patch: { title } })
          await window.konk.saveShow(title, s.show.segments)
          await loadSaved()
        }, 'p-btn--sm'),
        btn('Borrar', async () => {
          if (!savedSelect.value || savedSelect.selectedIndex === 0) return
          if (!confirm('¿Borrar la escaleta guardada seleccionada? No se puede deshacer.')) return
          await window.konk.deleteShow(savedSelect.value)
          await loadSaved()
        }, 'p-btn--sm p-btn--ko'),
        btn('Carpeta', () => void window.konk.openShowsDir(), 'p-btn--sm')
      ]),
      list,
      editor,
      h('div', 'p-row', {}, [addSelect, btn('Añadir prueba', () => addSegment(addSelect.value as GameKind), 'p-btn--sm p-btn--ok')])
    ])
  )

  const runCard = card(
    'En directo',
    h('div', 'p-col', { gap: 8 }, [
      runInfo,
      h('div', 'p-row', {}, [bGo, bNextSeg, bAgain]),
      h('div', 'p-row', {}, [
        btn('Reiniciar jugadas', () => {
          if (confirm('¿Marcar todas las pruebas como no jugadas?')) send({ type: 'showResetPlayed' })
        }, 'p-btn--sm p-btn--ko')
      ])
    ])
  )

  // ---------------------------------------------------------------- marcador final
  const extra = h('input', 'p-input', { width: 70, textAlign: 'center' })
  extra.onchange = () => {
    const v = Number(extra.value)
    if (Number.isFinite(v)) send({ type: 'showSet', patch: { extraPlayed: Math.max(0, Math.round(v)) } })
  }
  const finalInfo = h('span', 'p-muted')
  const finalCard = card(
    'Marcador final',
    h('div', 'p-col', { gap: 8 }, [
      h('div', 'p-row', {}, [
        btn('Mostrar marcador final', () => {
          audio.stopSfx()
          audio.stopLoop()
          send({ type: 'setView', view: 'final' })
          cue('ganador')
        }, 'p-btn--sm p-btn--ok'),
        btn('Volver a la plantilla', () => send({ type: 'setView', view: 'plato' }), 'p-btn--sm')
      ]),
      h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Pruebas sueltas a sumar']), extra, finalInfo]),
      h('span', 'p-muted', {}, ['El ganador sale con "Ganador" o "Ganadora" según lo que marques en cada concursante (pestaña Plató). Con equipos, "Ganadores" y el nombre del equipo.'])
    ])
  )

  // ---------------------------------------------------------------- personas del grupo
  const peopleList = h('div', 'p-col', { gap: 6 })
  const setPeople = (people: Person[]) => send({ type: 'setPeople', people } as ShowAction)
  function renderPeople(): void {
    if (peopleList.contains(document.activeElement)) return
    const people = S().people
    peopleList.replaceChildren(
      ...people.map((p) => {
        const name = h('input', 'p-input')
        name.value = p.name
        name.onchange = () => setPeople(S().people.map((x) => (x.id === p.id ? { ...x, name: name.value } : x)))
        const img = h('img', 'p-person__img')
        img.alt = ''
        if (p.photo) img.src = `konk-media://personas/${encodeURIComponent(p.photo)}`
        else img.style.visibility = 'hidden'
        return h('div', 'p-row p-person', {}, [
          img,
          name,
          btn(p.photo ? 'Cambiar foto' : 'Foto', async () => {
            const file = await window.konk.choosePhoto(p.name)
            if (file) setPeople(S().people.map((x) => (x.id === p.id ? { ...x, photo: file } : x)))
          }, 'p-btn--sm'),
          btn('Quitar', () => setPeople(S().people.filter((x) => x.id !== p.id)), 'p-btn--sm p-btn--ko')
        ])
      })
    )
    if (!people.length) peopleList.append(h('span', 'p-muted', {}, ['Añade a los amigos: se usan para rellenar las opciones de "¿Quién lo dijo?".']))
  }
  const newPerson = h('input', 'p-input', { flex: 1 })
  newPerson.placeholder = 'Nombre'
  const addPerson = () => {
    const name = newPerson.value.trim()
    if (!name) return
    setPeople([...S().people, { id: newId(), name }])
    newPerson.value = ''
  }
  newPerson.onkeydown = (e) => {
    if (e.key === 'Enter') addPerson()
  }
  const peopleCard = card('Personas del grupo', h('div', 'p-col', { gap: 8 }, [peopleList, h('div', 'p-row', {}, [newPerson, btn('Añadir', addPerson, 'p-btn--sm p-btn--ok')])]))

  const el = h('main', 'p-main p-program', {}, [h('div', 'p-col', {}, [showCard]), h('div', 'p-col', {}, [ctx.previewSlot, runCard, finalCard]), h('div', 'p-col', {}, [peopleCard])])

  return {
    el,
    async load(): Promise<void> {
      banks = await window.konk.listBanks()
      await loadSaved()
    },
    update(): void {
      const s = S()
      if (document.activeElement !== titleInput) titleInput.value = s.show.title
      renderList()
      renderEditor()
      renderPeople()
      const seg = s.show.segments[s.show.current ?? -1]
      runInfo.replaceChildren(
        h('div', '', {}, [h('span', 'p-label', {}, ['Prueba en curso']), ' ', seg ? `${(s.show.current ?? 0) + 1}. ${seg.name} (${gameLabel(seg.game)})` : 'ninguna']),
        h('div', '', {}, [h('span', 'p-label', {}, ['Jugadas']), ` ${s.show.played.length} de ${s.show.segments.length}`])
      )
      bGo.disabled = !seg
      bAgain.disabled = !seg
      bNextSeg.disabled = (s.show.current ?? -1) + 1 >= s.show.segments.length
      if (document.activeElement !== extra) extra.value = String(s.show.extraPlayed)
      finalInfo.textContent = `Total en el marcador: ${playedCount(s)} pruebas`
    },
    async refreshBanks(): Promise<void> {
      banks = await window.konk.listBanks()
    }
  }
}
