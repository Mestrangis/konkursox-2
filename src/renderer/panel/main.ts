import '../ds/tokens.css'
import '../ds/components.css'
import './panel.css'
import { LAYOUT_ORDER, LAYOUTS, STAGE_W } from '../../shared/layouts'
import { contestantOrder } from '../../shared/order'
import { SLOT_IDS, type Action, type AudioLibrary, type CaptureHealth, type DisplayInfo, type GameState } from '../../shared/types'
import { autoReconnect, CaptureFeed } from '../common/feed'
import { h } from '../ds/components'
import { buildScene, drawFrames, sceneKey, type Scene } from '../plato/scenes'
import { AudioEngine } from './audio'
import { createProgramTab } from './program'
import { createQuizTab } from './quiz'
import { createRoscoTab } from './rosco'
import { createCalibration, drawSlotPreview, slotLabel } from './calibrate'

const app = document.getElementById('app') as HTMLDivElement
const konk = window.konk
const send = (a: Action) => void konk.dispatch(a)

let state: GameState
const updaters: ((s: GameState) => void)[] = []
const onState = (fn: (s: GameState) => void) => updaters.push(fn)

// ---------- helpers de UI ----------
const btn = (label: string, onClick: () => void, cls = '') => {
  const b = h('button', `p-btn ${cls}`.trim(), {}, [label])
  b.onclick = onClick
  return b
}
const card = (title: string | Node[], ...children: Node[]) =>
  h('section', 'p-card', {}, [h('h3', 'p-card__title', {}, typeof title === 'string' ? [title] : title), ...children])

/** Input de texto enlazado al estado. No pisa lo que estás escribiendo. */
function textField(label: string, get: (s: GameState) => string, set: (v: string) => Action, attrs: Partial<HTMLInputElement> = {}) {
  const input = h('input', 'p-input')
  Object.assign(input, attrs)
  input.addEventListener('input', () => send(set(input.value)))
  onState((s) => {
    if (document.activeElement !== input) input.value = get(s)
  })
  return label ? h('label', 'p-field', {}, [h('span', '', {}, [label]), input]) : input
}

function check(label: string, get: (s: GameState) => boolean, set: (v: boolean) => Action) {
  const input = h('input')
  input.type = 'checkbox'
  input.onchange = () => send(set(input.checked))
  onState((s) => (input.checked = get(s)))
  return h('label', 'p-check', {}, [input, label])
}

let step = 10
try {
  step = Number(localStorage.getItem('konk.step')) || 10
} catch {
  /* sin almacenamiento */
}

// ---------- captura (panel) ----------
const feed = new CaptureFeed()
feed.onHealth = (health, error) => send({ type: 'setCaptureHealth', who: 'panel', health, error })
autoReconnect(feed, () => state?.cameras.sourceId ?? null)

// ---------- cabecera ----------
const version = h('span', 'p-version')
const displaySelect = h('select', 'p-select')
displaySelect.onchange = () => send({ type: 'setPlato', patch: { displayId: Number(displaySelect.value) } })
let displays: DisplayInfo[] = []

function renderDisplays(): void {
  const current = state?.plato.displayId
  const fallback = displays.find((d) => !d.primary) ?? displays[0]
  const selected = displays.some((d) => d.id === current) ? current : fallback?.id
  displaySelect.replaceChildren(
    ...displays.map((d, i) => {
      const o = h('option', '', {}, [`${i + 1} · ${d.label} (${d.bounds.width}x${d.bounds.height})${d.primary ? ' · principal' : ''}`])
      o.value = String(d.id)
      o.selected = d.id === selected
      return o
    })
  )
}
konk.onDisplays((d) => {
  displays = d
  renderDisplays()
})
void konk.listDisplays().then((d) => {
  displays = d
  renderDisplays()
})

const statusDot = (who: 'plato' | 'panel') => {
  const dot = h('i', 'p-dot')
  onState((s) => {
    const v: CaptureHealth = s.runtime.capture[who]
    dot.className = `p-dot is-${v}`
  })
  return dot
}

const updateBtn = btn('Buscar actualización', () => void konk.checkUpdate(), 'p-btn--sm')
onState((s) => {
  const u = s.runtime.update
  const map: Record<string, string> = {
    disabled: 'Modo desarrollo',
    checking: 'Buscando actualización',
    none: 'Versión al día',
    available: `Descargando v${u.version ?? ''}`,
    downloading: `Descargando ${u.percent ?? 0}%`,
    ready: `v${u.version ?? ''} lista`,
    error: 'Error al actualizar'
  }
  updateBtn.textContent = map[u.state] ?? ''
  updateBtn.title = u.message ?? ''
  updateBtn.disabled = u.state === 'disabled' || u.state === 'checking' || u.state === 'downloading'
})

const showPlatoBtn = btn('Mostrar plató', () => void konk.showPlato(), 'p-btn--sm')
const hidePlatoBtn = btn('Ocultar', () => send({ type: 'setPlato', patch: { visible: false } }), 'p-btn--sm')

app.append(
  h('header', 'p-top', {}, [
    h('span', 'k-logo', {}, ['KONKURSOX']),
    version,
    h('span', 'p-sep'),
    h('span', 'p-label', {}, ['Monitor del plató']),
    displaySelect,
    check('En ventana', (s) => s.plato.windowed, (v) => ({ type: 'setPlato', patch: { windowed: v } })),
    showPlatoBtn,
    hidePlatoBtn,
    h('span', 'p-spacer'),
    h('span', 'p-status', {}, [statusDot('plato'), 'Cámaras plató']),
    h('span', 'p-status', {}, [statusDot('panel'), 'Cámaras panel']),
    h('span', 'p-sep'),
    updateBtn
  ])
)
onState((s) => (version.textContent = `v${s.runtime.appVersion}`))

// ---------- avisos ----------
const calibration = createCalibration(feed, () => state)
const alertText = h('span')
const captureAlert = h('div', 'p-alert', {}, [
  h('strong', '', {}, ['Captura perdida']),
  alertText,
  h('span', 'p-spacer'),
  btn('Reconectar', () => void reconnect(), 'p-btn--sm'),
  btn('Recalibrar', () => calibration.open(), 'p-btn--sm')
])
onState((s) => {
  const { plato, panel, error } = s.runtime.capture
  const lost = !!s.cameras.sourceId && (plato === 'lost' || panel === 'lost')
  captureAlert.classList.toggle('is-on', lost)
  alertText.textContent = error || 'Discord está minimizado o cerrado. Los marcos muestran la silueta.'
})
const updateText = h('span')
const updateAlert = h('div', 'p-alert p-alert--update', {}, [
  h('strong', '', {}, ['Actualización lista']),
  updateText,
  h('span', 'p-spacer'),
  btn('Reiniciar y actualizar', () => void konk.installUpdate(), 'p-btn--sm p-btn--ok')
])
onState((s) => {
  const u = s.runtime.update
  updateAlert.classList.toggle('is-on', u.state === 'ready')
  updateText.textContent = `La versión ${u.version ?? ''} se instalará al cerrar, o ahora si reinicias (mejor fuera de directo).`
})
app.append(captureAlert, updateAlert)

async function reconnect(): Promise<void> {
  await konk.resolveSource()
  send({ type: 'restartCapture' })
}

// ---------- columna 1: plató ----------
const layoutBtns = LAYOUT_ORDER.map((id) => {
  const b = btn(LAYOUTS[id].label, () => send({ type: 'setLayout', layout: id }))
  onState((s) => b.classList.toggle('is-active', s.layout === id))
  return b
})

const previewStage = h('div', 'p-preview__stage')
const preview = h('div', 'p-preview', {}, [previewStage])
new ResizeObserver(() => {
  previewStage.style.transform = `scale(${preview.clientWidth / STAGE_W})`
}).observe(preview)
let scene: Scene | null = null
onState((s) => {
  const key = sceneKey(s)
  if (!scene || scene.key !== key) {
    scene = buildScene(s)
    scene.root.classList.remove('k-enter')
    previewStage.replaceChildren(scene.root)
  } else scene.update(s)
  drawFrames(feed, scene, s.cameras.rects)
})

const previewCard = card('Vista previa del plató', preview)
const previewSlot1 = h('div', 'p-slot', {}, [previewCard])
const previewSlot2 = h('div', 'p-slot')
const col1 = h('div', 'p-col', {}, [
  card('Plantilla del plató', h('div', 'p-layouts', {}, layoutBtns)),
  previewSlot1,
  card(
    'Rótulo inferior',
    h('div', 'p-col', { gap: 8 }, [
      check('Visible', (s) => s.lowerThird.visible, (v) => ({ type: 'setLowerThird', patch: { visible: v } })),
      textField('Antetítulo', (s) => s.lowerThird.kicker, (v) => ({ type: 'setLowerThird', patch: { kicker: v } })),
      textField('Título', (s) => s.lowerThird.title, (v) => ({ type: 'setLowerThird', patch: { title: v } })),
      textField('Texto derecha', (s) => s.lowerThird.right, (v) => ({ type: 'setLowerThird', patch: { right: v } }))
    ])
  ),
  card(
    'Presentador',
    h('div', 'p-col', { gap: 8 }, [
      h('div', 'p-grid2', {}, [
        textField('Nombre', (s) => s.host.name, (v) => ({ type: 'setHost', patch: { name: v } })),
        textField('Etiqueta', (s) => s.host.label, (v) => ({ type: 'setHost', patch: { label: v } }))
      ]),
      h('span', 'p-muted', {}, ['Caja lateral (plantilla 1 + presentador)']),
      h('div', 'p-grid2', {}, [
        textField('Rótulo 1', (s) => s.sideInfo.label1, (v) => ({ type: 'setSideInfo', patch: { label1: v } })),
        textField('Valor 1', (s) => s.sideInfo.value1, (v) => ({ type: 'setSideInfo', patch: { value1: v } })),
        textField('Rótulo 2', (s) => s.sideInfo.label2, (v) => ({ type: 'setSideInfo', patch: { label2: v } })),
        textField('Valor 2', (s) => s.sideInfo.value2, (v) => ({ type: 'setSideInfo', patch: { value2: v } }))
      ])
    ])
  )
])

// ---------- columna 2: concursantes y equipos ----------
const stepBtns = [1, 5, 10, 50, 100].map((n) => {
  const b = btn(String(n), () => {
    step = n
    try {
      localStorage.setItem('konk.step', String(n))
    } catch {
      /* sin almacenamiento */
    }
    stepBtns.forEach((x) => x.classList.toggle('is-active', x === b))
  }, 'p-btn--sm')
  b.classList.toggle('is-active', n === step)
  return b
})

function scoreControl(get: (s: GameState) => number, add: (d: number) => Action, set: (v: number) => Action) {
  const input = h('input', 'p-input')
  input.inputMode = 'numeric'
  input.addEventListener('change', () => {
    const v = Number(input.value.replace(',', '.'))
    if (Number.isFinite(v)) send(set(v))
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
  })
  onState((s) => {
    if (document.activeElement !== input) input.value = String(get(s))
  })
  return h('div', 'p-score', {}, [btn('−', () => send(add(-step)), 'p-btn--icon'), input, btn('+', () => send(add(step)), 'p-btn--icon p-btn--ok')])
}

const contestantRows = state0Rows()
function state0Rows(): HTMLElement[] {
  return (['c1', 'c2', 'c3', 'c4'] as const).map((id, i) => {
    const teamBtns = ([0, 1] as const).map((t) => {
      const b = btn('', () => send({ type: 'setContestant', id, patch: { team: t } }), 'p-btn--sm')
      onState((s) => {
        b.textContent = s.teams[t].name
        b.classList.toggle('is-active', s.contestants[i].team === t)
      })
      return b
    })
    const genderBtns = ([
      ['m', 'Chico'],
      ['f', 'Chica']
    ] as const).map(([g, label]) => {
      const b = btn(label, () => send({ type: 'setGender', id, gender: state.contestants[i].gender === g ? null : g }), 'p-btn--sm')
      onState((s) => b.classList.toggle('is-active', s.contestants[i].gender === g))
      return b
    })
    const row = h('div', 'p-contestant', {}, [
      h('span', 'p-num', {}, [String(i + 1)]),
      textField('', (s) => s.contestants[i].name, (v) => ({ type: 'setContestant', id, patch: { name: v } }), { placeholder: 'Nombre' }),
      scoreControl(
        (s) => s.contestants[i].score,
        (d) => ({ type: 'addScore', id, delta: d }),
        (v) => ({ type: 'setScore', id, value: v })
      ),
      h('div', 'p-teamsel', {}, [h('span', 'p-label', {}, ['Equipo']), ...teamBtns, h('span', 'p-spacer', { flex: 1 }), ...genderBtns])
    ])
    onState((s) => {
      const visible = s.layout !== 'logo' && contestantOrder(s).slice(0, LAYOUTS[s.layout].count).includes(id)
      row.classList.toggle('is-hidden', !visible)
      row.title = visible ? 'En pantalla' : 'No aparece en la plantilla actual'
    })
    return row
  })
}

const teamRows = ([0, 1] as const).map((t) =>
  h('div', 'p-contestant', {}, [
    h('span', 'p-num', {}, [t === 0 ? 'I' : 'D']),
    textField('', (s) => s.teams[t].name, (v) => ({ type: 'setTeam', index: t, patch: { name: v } }), { placeholder: 'Nombre del equipo' }),
    scoreControl(
      (s) => s.teams[t].score,
      (d) => ({ type: 'addTeamScore', index: t, delta: d }),
      (v) => ({ type: 'setTeamScore', index: t, value: v })
    )
  ])
)

const resetBtn = btn(
  'Poner a cero',
  () => {
    if (confirm('¿Poner a cero los puntos de todos los concursantes y equipos?')) send({ type: 'resetScores' })
  },
  'p-btn--sm p-btn--ko'
)

const col2 = h('div', 'p-col', {}, [
  card(
    [document.createTextNode('Concursantes')],
    h('div', 'p-row', { marginBottom: 6 }, [h('span', 'p-label', {}, ['Paso']), ...stepBtns, h('span', 'p-spacer', { flex: 1 }), resetBtn]),
    ...contestantRows
  ),
  card('Equipos (2 contra 2)', ...teamRows, h('p', 'p-muted', { margin: '6px 0 0' }, ['Los puntos de equipo se muestran en la plantilla de equipos. Asigna cada concursante a su equipo arriba.']))
])

// ---------- columna 3: cámaras y audio ----------
const camSource = h('span', 'p-muted')
const thumbs = SLOT_IDS.map((slot) => {
  const canvas = h('canvas')
  const label = h('span')
  onState((s) => {
    const { short, name } = slotLabel(s, slot)
    label.textContent = `${short} · ${name}`
  })
  return { slot, canvas, el: h('div', 'p-thumb', {}, [canvas, label]) }
})
function drawThumbs(): void {
  if (!state) return
  for (const t of thumbs) drawSlotPreview(t.canvas, feed, state, t.slot, 120)
}
onState((s) => {
  camSource.textContent = s.cameras.sourceName ? `Ventana: ${s.cameras.sourceName}` : 'Sin ventana seleccionada'
  drawThumbs()
})

const camCard = card(
  'Cámaras desde Discord',
  h('div', 'p-col', { gap: 10 }, [
    h('div', 'p-row', {}, [camSource]),
    h('div', 'p-row', {}, [btn('Calibrar cámaras', () => calibration.open(), 'p-btn--sm'), btn('Reconectar', () => void reconnect(), 'p-btn--sm')]),
    h('div', 'p-thumbs', {}, thumbs.map((t) => t.el))
  ])
)

// Audio
const audio = new AudioEngine()
let library: AudioLibrary = { dir: '', music: [], sfx: [] }
const musicList = h('div', 'p-tracks')
const sfxGrid = h('div', 'p-sfx')
const progressBar = h('i')
const nowPlaying = h('span', 'p-muted', {}, ['Sin música'])
const dirLabel = h('span', 'p-muted', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 })

function renderLibrary(): void {
  dirLabel.textContent = library.dir
  dirLabel.title = library.dir
  musicList.replaceChildren(
    ...library.music.map((f) => {
      const b = h('button', 'p-track' + (audio.playing === f ? ' is-playing' : ''), {}, [h('span', '', {}, [f.replace(/\.[^.]+$/, '')])])
      b.title = f
      b.onclick = () => void (audio.playing === f ? audio.stopMusic() : audio.playMusic(f))
      return b
    })
  )
  if (!library.music.length) musicList.append(h('span', 'p-muted', {}, ['Mete canciones en la subcarpeta "musica".']))
  sfxGrid.replaceChildren(
    ...library.sfx.map((f) => {
      const b = btn(f.replace(/\.[^.]+$/, ''), () => audio.playSfx(f), 'p-btn--sm')
      b.title = f
      return b
    })
  )
  if (!library.sfx.length) sfxGrid.append(h('span', 'p-muted', {}, ['Mete sonidos en la subcarpeta "efectos".']))
  nowPlaying.textContent = audio.playing ? `Sonando: ${audio.playing.replace(/\.[^.]+$/, '')}` : 'Sin música'
}
audio.onChange = renderLibrary

async function loadLibrary(): Promise<void> {
  library = await konk.audioLibrary()
  renderLibrary()
  quizTab.refreshSounds()
}

function slider(label: string, min: number, max: number, stepV: number, get: (s: GameState) => number, set: (v: number) => void, fmt: (v: number) => string) {
  const input = h('input', 'p-range')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(stepV)
  const val = h('span', 'p-muted')
  input.oninput = () => {
    set(Number(input.value))
    val.textContent = fmt(Number(input.value))
  }
  onState((s) => {
    if (document.activeElement !== input) input.value = String(get(s))
    val.textContent = fmt(get(s))
  })
  return h('label', 'p-field', {}, [h('span', '', {}, [label, ' ', val]), input])
}

onState((s) => {
  audio.fadeSeconds = s.audio.fadeSeconds
  audio.sfxVolume = s.audio.sfxVolume
  if (audio.musicVolume !== s.audio.musicVolume) audio.setMusicVolume(s.audio.musicVolume)
})

const loopCheck = h('input')
loopCheck.type = 'checkbox'
loopCheck.checked = true
loopCheck.onchange = () => audio.setLoop(loopCheck.checked)

const audioCard = card(
  'Audio',
  h('div', 'p-col', { gap: 10 }, [
    h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Música']), h('span', 'p-spacer', { flex: 1 }), h('label', 'p-check', {}, [loopCheck, 'En bucle']), btn('Parar música', () => void audio.stopMusic(), 'p-btn--sm')]),
    nowPlaying,
    h('div', 'p-progress', {}, [progressBar]),
    musicList,
    h('div', 'p-row', {}, [h('span', 'p-label', {}, ['Efectos']), h('span', 'p-spacer', { flex: 1 }), btn('Cortar efectos', () => audio.stopSfx(), 'p-btn--sm')]),
    sfxGrid,
    h('div', 'p-sliders', {}, [
      slider('Música', 0, 1, 0.01, (s) => s.audio.musicVolume, (v) => send({ type: 'setAudio', patch: { musicVolume: v } }), (v) => `${Math.round(v * 100)}%`),
      slider('Efectos', 0, 1, 0.01, (s) => s.audio.sfxVolume, (v) => send({ type: 'setAudio', patch: { sfxVolume: v } }), (v) => `${Math.round(v * 100)}%`),
      slider('Fundido', 0, 6, 0.1, (s) => s.audio.fadeSeconds, (v) => send({ type: 'setAudio', patch: { fadeSeconds: v } }), (v) => `${v.toFixed(1)} s`)
    ]),
    h('div', 'p-row', {}, [
      dirLabel,
      btn('Abrir carpeta', () => void konk.audioOpenDir(), 'p-btn--sm'),
      btn('Cambiar', async () => {
        library = await konk.audioChooseDir()
        renderLibrary()
      }, 'p-btn--sm'),
      btn('Recargar', () => void loadLibrary(), 'p-btn--sm')
    ])
  ])
)

setInterval(() => {
  const p = audio.progress
  progressBar.style.width = p.duration ? `${(p.current / p.duration) * 100}%` : '0'
}, 250)

const col3 = h('div', 'p-col', {}, [camCard, audioCard])

const quizTab = createQuizTab({
  send: (a) => send(a),
  getState: () => state,
  audio,
  getSfx: () => library.sfx,
  previewSlot: previewSlot2
})
const platoMain = h('main', 'p-main', {}, [col1, col2, col3])

// ---------- pestañas ----------
const previewSlot3 = h('div', 'p-slot')
const previewSlot4 = h('div', 'p-slot')
const programTab = createProgramTab({ send: (a) => send(a), getState: () => state, audio, getSfx: () => library.sfx, getMusic: () => library.music, previewSlot: previewSlot3 })
const roscoTab = createRoscoTab({ send: (a) => send(a), getState: () => state, audio, getSfx: () => library.sfx, previewSlot: previewSlot4 })

// ---------- pestañas ----------
type Tab = 'plato' | 'program' | 'quiz' | 'rosco'
const TABS: Tab[] = ['plato', 'program', 'quiz', 'rosco']
let tab: Tab = 'plato'
try {
  const saved = localStorage.getItem('konk.tab') as Tab
  if (TABS.includes(saved)) tab = saved
} catch {
  /* sin almacenamiento */
}
const tabEls: Record<Tab, { btn: HTMLButtonElement; el: HTMLElement; slot: HTMLElement }> = {
  plato: { btn: btn('Plató y cámaras', () => setTab('plato'), 'p-tab'), el: platoMain, slot: previewSlot1 },
  program: { btn: btn('Programa', () => setTab('program'), 'p-tab'), el: programTab.el, slot: previewSlot3 },
  quiz: { btn: btn('Preguntas', () => setTab('quiz'), 'p-tab'), el: quizTab.el, slot: previewSlot2 },
  rosco: { btn: btn('Rosco', () => setTab('rosco'), 'p-tab'), el: roscoTab.el, slot: previewSlot4 }
}
function setTab(t: Tab): void {
  tab = t
  try {
    localStorage.setItem('konk.tab', t)
  } catch {
    /* sin almacenamiento */
  }
  for (const k of TABS) {
    tabEls[k].el.style.display = k === t ? '' : 'none'
    tabEls[k].btn.classList.toggle('is-active', k === t)
  }
  tabEls[t].slot.append(previewCard)
  previewStage.style.transform = `scale(${preview.clientWidth / STAGE_W})`
}
const viewBadge = h('span', 'p-phase')
const VIEW_LABEL: Record<string, string> = {
  plato: 'plantilla',
  quiz: 'pregunta',
  result: 'final de la escalera',
  rosco: 'rosco',
  transition: 'rótulo de prueba',
  final: 'marcador final'
}
onState((s) => {
  const v = s.view === 'quiz' && !s.quiz.current ? 'plato' : s.view === 'rosco' && !s.rosco.players.length ? 'plato' : s.view
  viewBadge.textContent = `En el plató: ${VIEW_LABEL[v] ?? v}`
})
const toPlato = btn('Plantilla', () => send({ type: 'setView', view: 'plato' }), 'p-btn--sm')
app.append(
  h('nav', 'p-tabs', {}, [...TABS.map((t) => tabEls[t].btn), h('span', 'p-spacer', { flex: 1 }), viewBadge, toPlato]),
  platoMain,
  programTab.el,
  quizTab.el,
  roscoTab.el,
  calibration.el
)
setTab(tab)

window.addEventListener('keydown', (e) => {
  if (calibration.isOpen || !state) return
  // el rosco tiene sus propias teclas mientras está en el plató o en su pestaña
  if (state.rosco.active && !state.rosco.finished && (state.view === 'rosco' || tab === 'rosco')) {
    if (roscoTab.onKey(e)) return
  }
  quizTab.onKey(e)
})

// temporizador de la vista previa
const tickLoop = () => {
  if (scene?.tick && state) scene.tick(state)
  requestAnimationFrame(tickLoop)
}
requestAnimationFrame(tickLoop)

// ---------- fotogramas ----------
let lastThumbs = 0
feed.onFrame = () => {
  if (!state) return
  drawFrames(feed, scene, state.cameras.rects)
  if (calibration.isOpen) calibration.draw()
  const now = performance.now()
  if (now - lastThumbs > 100) {
    lastThumbs = now
    drawThumbs()
  }
}

// ---------- ciclo de estado ----------
let epoch = -1
function render(s: GameState): void {
  state = s
  for (const u of updaters) u(s)
  calibration.update(s)
  quizTab.update()
  programTab.update()
  roscoTab.update()
  renderDisplays()
  if (feed.currentSource !== s.cameras.sourceId || epoch !== s.runtime.captureEpoch) {
    epoch = s.runtime.captureEpoch
    void feed.start(s.cameras.sourceId)
  }
}

konk.onState(render)
void konk.getState().then(async (s) => {
  render(s)
  void loadLibrary()
  void quizTab.loadBanks()
  void programTab.load()
  void roscoTab.load()
  // Primera vez: preselecciona la ventana de Discord si existe.
  if (!s.cameras.sourceId) {
    const list = await konk.listSources()
    const discord = list.find((x) => /discord/i.test(x.name))
    if (discord) send({ type: 'setCameraSource', sourceId: discord.id, sourceName: discord.name })
  }
})
