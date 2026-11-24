// Efectos visuales del plató: capa por encima de la escena (sin tapar la pregunta ni las opciones).
import { effectActive, EFFECTS } from '../../shared/effects'
import type { GameState } from '../../shared/types'

export function createEffects(stage: HTMLElement): { el: HTMLElement; update(s: GameState): void; tick(s: GameState): void } {
  const el = document.createElement('div')
  el.className = 'kfx'
  el.innerHTML =
    '<div class="kfx-vignette"></div>' +
    '<div class="kfx-beams"><i></i><i></i><i></i></div>' +
    '<div class="kfx-flash"></div><div class="kfx-ring"></div>' +
    '<canvas class="kfx-confetti" width="1920" height="1080"></canvas>'
  const canvas = el.querySelector('canvas') as HTMLCanvasElement
  const g = canvas.getContext('2d')!
  let confettiAt = 0
  let parts: { x: number; y: number; vx: number; vy: number; r: number; w: number; h: number; c: string; spin: number }[] = []
  let lastHit = 0

  function startConfetti(): void {
    const colors = ['#f6e6b8', '#e6cb85', '#c9a961', '#fff6dc', '#b8975a', '#f0dca6']
    parts = Array.from({ length: 320 }, () => ({
      x: Math.random() * 1920,
      y: -20 - Math.random() * 700,
      vx: (Math.random() - 0.5) * 4,
      vy: 5 + Math.random() * 5,
      r: Math.random() * Math.PI,
      w: 8 + Math.random() * 10,
      h: 4 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)],
      spin: (Math.random() - 0.5) * 0.3
    }))
    confettiAt = performance.now()
  }

  function drawConfetti(): void {
    g.clearRect(0, 0, 1920, 1080)
    if (!parts.length) return
    const t = (performance.now() - confettiAt) / 1000
    const fade = t > 3.2 ? Math.max(0, 1 - (t - 3.2) / 0.9) : 1
    for (const p of parts) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.12
      p.vx *= 0.99
      p.r += p.spin
      g.save()
      g.globalAlpha = fade
      g.translate(p.x, p.y)
      g.rotate(p.r)
      g.fillStyle = p.c
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)))
      g.restore()
    }
    if (fade <= 0) parts = []
  }

  return {
    el,
    update(s) {
      const now = Date.now()
      // efectos "mantener": clases en el escenario
      for (const e of EFFECTS) if (e.kind === 'hold') stage.classList.toggle(`fxv-${e.id}`, effectActive(s, e.id, now))
      if (s.effects.on.foco && s.effects.focus) stage.dataset.focus = s.effects.focus
      else delete stage.dataset.focus
      // golpes: se disparan una vez por pulsación
      const hit = s.effects.hit
      if (hit && hit.at !== lastHit && now - hit.at < 1500) {
        lastHit = hit.at
        if (hit.id === 'confeti') startConfetti()
        if (hit.id === 'temblor' || hit.id === 'destello') {
          const cls = `fxv-${hit.id}`
          stage.classList.remove(cls)
          void stage.offsetWidth
          stage.classList.add(cls)
          window.setTimeout(() => stage.classList.remove(cls), hit.id === 'temblor' ? 700 : 900)
        }
      }
      // dentro de la escena en el aire (así la pregunta, con su z-index, queda por encima)
      const scenes = stage.querySelectorAll(':scope > .k-stage')
      const target = (scenes[scenes.length - 1] as HTMLElement | undefined) ?? stage
      if (el.parentElement !== target) target.append(el)
    },
    tick() {
      drawConfetti()
    }
  }
}
