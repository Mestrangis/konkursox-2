// Panel del presentador (design/panel.html): barra En el aire, navegación, pantalla abierta y dock de audio.
import '../ds/tokens.css'
import '../ds/components.css'
import './panel.css'
import type { CueId } from '../../shared/quiz'
import { GAMES, PLANOS, SCENES, type GameId } from '../../shared/scene'
import { effectIndexForKey, isNumpad, soundIndexForKey } from '../../shared/keys'
import type { AudioLibrary, GameState } from '../../shared/types'
import { autoReconnect, CaptureFeed } from '../common/feed'
import { AudioEngine } from './audio'
import { applyTheme } from '../common/theme'
import { createCalibration } from './calibrate'
import { createAirBar, createDock, createNav, createPeopleRow, goScene } from './chrome'
import { createMediaScreen } from './screens/media'
import { LibStore } from './lib'
import { createEstimationScreen } from './screens/estimation'
import { createLibraryScreen } from './screens/library'
import { createCamerasScreen, createContestantsScreen } from './screens/people'
import { createQuizScreen } from './screens/quiz'
import { createRoscoScreen } from './screens/rosco'
import { createSettingsScreen } from './screens/settings'
import { h, typing, type Ctx, type Screen, type ScreenId } from './ui'

const konk = window.konk
// las escenas que pinta el panel (miniatura, vistas previas) son mudas
window.__konkPreview = true
let state: GameState
let audioLib: AudioLibrary = { dir: '', music: [], sfx: [] }
const audio = new AudioEngine()
const lib = new LibStore()
const feed = new CaptureFeed()
feed.onHealth = (health, error) => void konk.dispatch({ type: 'setCaptureHealth', who: 'panel', health, error })
autoReconnect(feed, () => state?.cameras.sourceId ?? null)

let toastTimer = 0
function toast(msg: string): void {
  document.querySelector('.toast')?.remove()
  const t = h('div', 'toast', {}, [msg])
  document.body.append(t)
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => t.remove(), 3200)
}

const calibration = createCalibration(feed, () => state)

const ctx: Ctx = {
  get state() {
    return state
  },
  send: (a) => void konk.dispatch(a),
  audio,
  get audioLib() {
    return audioLib
  },
  async reloadAudio() {
    audioLib = await konk.audioLibrary()
    audio.tracks = audioLib.music
    dock.refreshAudio()
    if (state) screens.ajustes.update(state)
  },
  lib,
  feed,
  cue(id: CueId) {
    if (!state?.audio.autoSounds) return
    const file = state.quiz.sounds[id]
    if (file && audioLib.sfx.includes(file)) audio.playSfx(file, state.quiz.soundVolumes[id] ?? 1)
  },
  go: (id) => go(id),
  openCalibration: () => calibration.open(),
  toast
}

// ---------------------------------------------------------------- pantallas
const screens: Record<ScreenId, Screen> = {
  test: createQuizScreen(ctx, 'test'),
  sino: createQuizScreen(ctx, 'sino'),
  escalera: createQuizScreen(ctx, 'escalera'),
  quien: createQuizScreen(ctx, 'quien'),
  estimacion: createEstimationScreen(ctx),
  rosco: createRoscoScreen(ctx),
  biblioteca: createLibraryScreen(ctx),
  multimedia: createMediaScreen(ctx),
  concursantes: createContestantsScreen(ctx),
  camaras: createCamerasScreen(ctx),
  ajustes: createSettingsScreen(ctx)
}
const SCREEN_IDS = Object.keys(screens) as ScreenId[]
let current: ScreenId = 'test'
try {
  const saved = localStorage.getItem('konk.screen') as ScreenId
  if (SCREEN_IDS.includes(saved)) current = saved
} catch {
  /* sin almacenamiento */
}

const air = createAirBar(ctx)
const people = createPeopleRow(ctx)
const nav = createNav(ctx, (id) => go(id))
const dock = createDock(ctx)
const main = h('main', 'main ui')
const app = h('div', 'app ui', {}, [air.el, people.el, nav.el, main, dock.el])
document.getElementById('app')!.replaceWith(app)
document.body.append(calibration.el)

function go(id: ScreenId): void {
  current = id
  try {
    localStorage.setItem('konk.screen', id)
  } catch {
    /* sin almacenamiento */
  }
  main.replaceChildren(screens[id].el)
  main.scrollTop = 0
  if (state) {
    nav.update(state, current)
    screens[id].update(state)
  }
  screens[id].shown?.()
}

// ---------------------------------------------------------------- estado
let epoch = -1
let lastBribe: number | null = null
function render(s: GameState): void {
  applyTheme(s.plato.theme)
  // sonido del soborno (sale el rótulo en el plató)
  if (s.quiz.bribe.at && s.quiz.bribe.at !== lastBribe && state) ctx.cue('soborno')
  lastBribe = s.quiz.bribe.at
  state = s
  air.update(s)
  people.update(s)
  nav.update(s, current)
  dock.update(s)
  screens[current].update(s)
  calibration.update(s)
  if (feed.currentSource !== s.cameras.sourceId || epoch !== s.runtime.captureEpoch) {
    epoch = s.runtime.captureEpoch
    void feed.start(s.cameras.sourceId)
  }
}

feed.onFrame = () => {
  if (!state) return
  air.frame(state)
  screens[current].frame?.(state)
  if (calibration.isOpen) calibration.draw()
}

let timerEndedAt: number | null = null
// tic-tac del temporizador (sonido automático)
setInterval(() => {
  if (!state) return
  const t = state.quiz.timer
  const running = t.enabled && t.endsAt !== null && t.endsAt > Date.now()
  const file = state.quiz.sounds.reloj
  if (running && state.audio.autoSounds && file && audioLib.sfx.includes(file)) audio.playLoop(file, 'reloj', state.quiz.soundVolumes.reloj ?? 1)
  else audio.stopLoop('reloj')
  // el temporizador llega a 0: "tiempo agotado" una vez
  const ended = t.endsAt !== null && t.endsAt <= Date.now()
  if (ended && timerEndedAt !== t.endsAt) {
    timerEndedAt = t.endsAt
    ctx.cue('tiempo')
  }
}, 200)

// animaciones de la miniatura (temporizador, revelado de estimación)
const tick = () => {
  if (state) air.frame(state)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// ---------------------------------------------------------------- atajos
const isGame = (id: ScreenId): id is GameId => GAMES.some((g) => g.id === id)

window.addEventListener('keydown', (e) => {
  if (calibration.isOpen || !state) return
  if (document.querySelector('.dlg-back')) return
  if (document.querySelector('.ctx')) {
    if (e.key === 'Escape') document.querySelector('.ctx')?.remove()
    return
  }
  const k = e.key
  // las teclas de función funcionan siempre, aunque el foco esté en un campo
  const fkey = /^F\d+$/.test(k)
  if (typing(e) && !fkey) return
  // la barra espaciadora no debe "pulsar" el botón que tenga el foco
  if (k === ' ' && (e.target as HTMLElement)?.tagName === 'BUTTON') (e.target as HTMLElement).blur()
  let done = true
  const sound = soundIndexForKey(e)
  const effect = effectIndexForKey(e)
  const sc = SCENES.find((x) => x.key === k)
  if (sc && !e.ctrlKey && !e.altKey) goScene(ctx, sc.id)
  // plano: Ctrl+F1 Juego · F2 Cámaras con marcos · F3 Cámaras + datos · F4 Cámaras limpias
  else if (e.ctrlKey && /^F[1-4]$/.test(k)) ctx.send({ type: 'setPlano', plano: PLANOS[Number(k[1]) - 1].id })
  else if (k === 'F6') ctx.send({ type: 'camsPreset', preset: 'yo' })
  else if (k === 'F7') ctx.send({ type: 'camsPreset', preset: 'turno' })
  else if (k === 'F8') ctx.send({ type: 'camsPreset', preset: 'todos' })
  else if (sound !== null) dock.fire(sound)
  else if (effect !== null) dock.fireEffect(effect)
  // el resto del teclado numérico no dispara teclas de los juegos
  else if (isNumpad(e) && /^[0-9]$/.test(k)) done = true
  else if (e.ctrlKey && (k === ' ' || e.code === 'Space')) audio.toggle()
  else if (e.ctrlKey && k.toLowerCase() === 'f') void audio.fade()
  else if (e.ctrlKey && k.toLowerCase() === 'z') ctx.send({ type: 'undo', game: isGame(current) ? current : state.liveGame })
  else done = !!screens[current].onKey?.(e)
  if (done) e.preventDefault()
})
// los atajos de función no recargan la ventana
window.addEventListener('keyup', (e) => {
  if (/^F\d+$/.test(e.key)) e.preventDefault()
})

// ---------------------------------------------------------------- arranque
lib.onChange(() => state && screens[current].update(state))
konk.onState(render)
void (async () => {
  const s = await konk.getState()
  render(s)
  go(current)
  await lib.refresh()
  // carga los bancos elegidos de cada juego
  for (const b of lib.list) void lib.get(b.ref)
  await ctx.reloadAudio()
  // primera vez: preselecciona la ventana de Discord si existe
  if (!s.cameras.sourceId) {
    const list = await konk.listSources()
    const discord = list.find((x) => /discord/i.test(x.name))
    if (discord) ctx.send({ type: 'setCameraSource', sourceId: discord.id, sourceName: discord.name })
  }
})()
