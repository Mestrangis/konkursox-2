import '../ds/tokens.css'
import '../ds/components.css'
import './plato.css'
import { STAGE_H, STAGE_W } from '../../shared/layouts'
import type { GameState } from '../../shared/types'
import { autoReconnect, CaptureFeed } from '../common/feed'
import { buildScene, drawFrames, sceneKey, type Scene } from './scenes'

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
let scene: Scene | null = null
const feed = new CaptureFeed()

feed.onHealth = (health, error) => {
  void window.konk.dispatch({ type: 'setCaptureHealth', who: 'plato', health, error })
  if (health !== 'ok') drawFrames(feed, scene, state?.cameras.rects ?? {})
}
feed.onFrame = () => drawFrames(feed, scene, state.cameras.rects)
autoReconnect(feed, () => state?.cameras.sourceId ?? null)

function render(s: GameState): void {
  const prev = state
  state = s
  const key = sceneKey(s)
  if (!scene || scene.key !== key) {
    const next = buildScene(s)
    const old = scene
    scene = next
    stageEl.append(next.root)
    drawFrames(feed, scene, s.cameras.rects)
    // Fundido: la escena nueva entra por encima y la vieja se retira al terminar.
    if (old) window.setTimeout(() => old.root.remove(), 500)
  } else {
    scene.update(s)
    if (prev && prev.cameras.rects !== s.cameras.rects) drawFrames(feed, scene, s.cameras.rects)
  }
  if (feed.currentSource !== s.cameras.sourceId || epoch !== s.runtime.captureEpoch) {
    epoch = s.runtime.captureEpoch
    void feed.start(s.cameras.sourceId)
  }
}
let epoch = -1

window.konk.onState(render)
void window.konk.getState().then(render)
