import '../ds/tokens.css'
import '../ds/components.css'
import './plato.css'
import { STAGE_H, STAGE_W } from '../../shared/layouts'
import type { GameState } from '../../shared/types'
import { autoReconnect, CaptureFeed } from '../common/feed'
import { buildScene, drawFrames, sceneKey, type Scene } from './scenes'
import { applyTheme } from '../common/theme'
import { createEffects } from './effects'

const stageEl = document.getElementById('stage') as HTMLDivElement

// Escalado del lienzo 1920x1080 a la ventana (letterbox centrado).
function fit(): void {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  const x = (window.innerWidth - STAGE_W * s) / 2
  const y = (window.innerHeight - STAGE_H * s) / 2
  stageEl.style.transform = `translate(${x}px, ${y}px) scale(${s})`
}
window.addEventListener('resize', fit)
fit()

let state: GameState
const effects = createEffects(stageEl)
let scene: Scene | null = null
let epoch = -1
const feed = new CaptureFeed()

feed.onHealth = (health, error) => {
  void window.konk.dispatch({ type: 'setCaptureHealth', who: 'plato', health, error })
  if (health !== 'ok' && state) drawFrames(feed, scene, state)
}
feed.onFrame = () => state && drawFrames(feed, scene, state)
autoReconnect(feed, () => state?.cameras.sourceId ?? null)

function render(s: GameState): void {
  const prev = state
  state = s
  applyTheme(s.plato.theme)
  queueMicrotask(() => effects.update(s))
  const key = sceneKey(s)
  if (!scene || scene.key !== key) {
    const next = buildScene(s)
    const old = scene
    scene = next
    // transición: corte (al instante) o fundido
    const cut = s.camsScene.transition === 'cut'
    if (cut) next.root.classList.remove('k-enter')
    stageEl.append(next.root)
    drawFrames(feed, scene, s)
    if (old) {
      old.dispose?.()
      if (cut) old.root.remove()
      else window.setTimeout(() => old.root.remove(), 500)
    }
  } else {
    scene.update(s)
    if (prev && (prev.cameras.rects !== s.cameras.rects || prev.contestants !== s.contestants || prev.host !== s.host)) drawFrames(feed, scene, s)
  }
  if (feed.currentSource !== s.cameras.sourceId || epoch !== s.runtime.captureEpoch) {
    epoch = s.runtime.captureEpoch
    void feed.start(s.cameras.sourceId)
  }
}

// rótulo "SOBORNO ACEPTADO" (3,5 s) al perdonar un fallo con el soborno activado
const bribe = document.createElement('div')
bribe.className = 'k-bribe'
bribe.innerHTML = '<span class="k-bribe__kicker">Fallo perdonado</span><span class="k-bribe__title">Soborno aceptado</span>'
stageEl.append(bribe)
let bribeShown = false

// temporizador y otras animaciones por fotograma
const loop = () => {
  if (scene?.tick && state) scene.tick(state)
  effects.tick(state)
  const at = state?.quiz.bribe.at
  const show = !!at && Date.now() - at < 3500 && Date.now() >= at
  if (show !== bribeShown) {
    bribeShown = show
    bribe.classList.toggle('is-on', show)
    // siempre por encima de la escena
    stageEl.append(bribe)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

window.konk.onState(render)
void window.konk.getState().then(render)
