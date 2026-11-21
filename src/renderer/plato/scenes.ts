// Escenas del plató (cabecera y plantillas 1/2/3/4/equipos). Compartidas por el plató y la vista previa del panel.
import { sourceRectForFrame } from '../../shared/crop'
import { LAYOUTS } from '../../shared/layouts'
import { contestantOrder } from '../../shared/order'
import type { GameState, SlotId } from '../../shared/types'
import type { CaptureFeed } from '../common/feed'
import { buildQuizScene, quizSceneKey, turnSlots } from './quizScenes'
import {
  camFrame,
  emblem,
  h,
  infoBox,
  lowerThird,
  namePlate,
  teamHeader,
  teamScore,
  versus,
  type CamFrameEl,
  type NamePlateEl
} from '../ds/components'

export interface Scene {
  key: string
  root: HTMLDivElement
  frames: Map<SlotId, CamFrameEl>
  update(s: GameState): void
  /** animaciones por fotograma (temporizador) */
  tick?(s: GameState): void
}

/** ¿El plató muestra la escena de preguntas? */
export const showsQuiz = (s: GameState): boolean => (s.view === 'quiz' && !!s.quiz.current) || (s.view === 'result' && !!s.quiz.ladder.outcome)

export const sceneKey = (s: GameState): string => (showsQuiz(s) ? quizSceneKey(s) : `${s.layout}:${contestantOrder(s).join(',')}`)

function coverScene(): HTMLDivElement {
  const ring = (size: number, alpha: number) =>
    h('div', 'k-abs', {
      left: '50%',
      top: '50%',
      width: size,
      height: size,
      margin: `${-size / 2}px 0 0 ${-size / 2}px`,
      borderRadius: '50%',
      border: `1px solid rgba(214, 186, 120, ${alpha})`
    })
  return h('div', 'k-stage k-stage--cover', {}, [
    ring(1500, 0.07),
    ring(1100, 0.11),
    ring(760, 0.18),
    ring(740, 0.08),
    h('div', 'k-abs', {
      left: '50%',
      top: '50%',
      width: 1200,
      height: 520,
      margin: '-260px 0 0 -600px',
      background: 'radial-gradient(ellipse at center, rgba(190, 205, 240, 0.12), transparent 65%)'
    }),
    h('div', 'k-abs', {
      left: 0,
      right: 0,
      top: 539,
      height: 1,
      background:
        'linear-gradient(90deg, transparent 2%, rgba(214, 186, 120, 0.6) 14%, transparent 19%, transparent 81%, rgba(214, 186, 120, 0.6) 86%, transparent 98%)'
    }),
    h('div', 'k-abs', { left: 0, right: 0, top: 404, display: 'flex', justifyContent: 'center' }, [emblem(44)]),
    h('div', 'k-abs', { left: 0, right: 0, top: 470, display: 'flex', justifyContent: 'center' }, [
      h('div', 'k-logo k-logo--hero', { fontSize: 132, lineHeight: '140px' }, ['KONKURSOX'])
    ]),
    h('div', 'k-abs', {
      left: '50%',
      top: 646,
      width: 520,
      marginLeft: -260,
      height: 2,
      background: 'linear-gradient(90deg, transparent, #c9a961 30%, #f1dfab 50%, #c9a961 70%, transparent)'
    })
  ])
}

export function buildScene(s: GameState): Scene {
  if (showsQuiz(s)) return buildQuizScene(s)
  const key = sceneKey(s)
  const frames = new Map<SlotId, CamFrameEl>()
  if (s.layout === 'logo') {
    const root = coverScene()
    root.classList.add('k-enter')
    return { key, root, frames, update: () => {} }
  }

  const def = LAYOUTS[s.layout]
  const order = contestantOrder(s)
  const root = h('div', 'k-stage k-enter')
  const plates = new Map<SlotId, NamePlateEl>()

  for (const slot of def.slots(order)) {
    const frame = camFrame(slot.cam, slot.slot)
    frames.set(slot.slot, frame)
    const plate = namePlate({
      box: slot.bar,
      c: slot.bar.c,
      nameSize: slot.nameSize,
      nameOnly: slot.nameOnly,
      tag: slot.slot === 'host' ? s.host.label || ' ' : undefined
    })
    plates.set(slot.slot, plate)
    root.append(frame.root, plate.root)
  }

  let hostTag: HTMLElement | null = null
  if (s.layout === 'solo') hostTag = plates.get('host')?.root.querySelector('.k-caption') ?? null

  let info: ReturnType<typeof infoBox> | null = null
  if (s.layout === 'solo') {
    info = infoBox({ x: 1380, y: 420, w: 440, h: 426 })
    root.append(info.root)
  }

  let headers: ReturnType<typeof teamHeader>[] = []
  let scores: ReturnType<typeof teamScore>[] = []
  if (s.layout === 'teams') {
    headers = [teamHeader({ x: 100, y: 44, w: 780, h: 62 }), teamHeader({ x: 1040, y: 44, w: 780, h: 62 })]
    scores = [teamScore({ x: 100, y: 796, w: 780, h: 92 }), teamScore({ x: 1040, y: 796, w: 780, h: 92 })]
    root.append(...headers.map((x) => x.root), versus(), ...scores.map((x) => x.root))
  }

  const lower = lowerThird()
  root.append(lower.root)

  const update = (st: GameState) => {
    const turn = turnSlots(st)
    for (const [slot, f] of frames) f.root.classList.toggle('is-turn', turn.has(slot))
    for (const [slot, plate] of plates) {
      if (slot === 'host') {
        plate.setName(st.host.name)
        if (hostTag) hostTag.textContent = st.host.label
        continue
      }
      const c = st.contestants.find((x) => x.id === slot)
      if (!c) continue
      plate.setName(c.name)
      plate.setScore(c.score)
    }
    headers.forEach((hd, i) => hd.setName(st.teams[i].name))
    scores.forEach((sc, i) => sc.setScore(st.teams[i].score))
    info?.set(st.sideInfo.label1, st.sideInfo.value1, st.sideInfo.label2, st.sideInfo.value2)
    const lt = st.lowerThird
    lower.set(lt.kicker, lt.title, lt.right, lt.visible)
  }
  update(s)
  return { key, root, frames, update }
}

/** Pinta en cada marco su recorte del vídeo de Discord (object-fit: cover centrado en el recorte). */
export function drawFrames(feed: CaptureFeed | null, scene: Scene | null, rects: GameState['cameras']['rects']): void {
  if (!scene) return
  const ok = !!feed && feed.ready
  for (const [slot, frame] of scene.frames) {
    const rel = rects[slot]
    if (!ok || !rel) {
      frame.setLive(false)
      continue
    }
    const { canvas } = frame
    const src = sourceRectForFrame(rel, feed!.width, feed!.height, canvas.width, canvas.height)
    if (!src) {
      frame.setLive(false)
      continue
    }
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) continue
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(feed!.video, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height)
    frame.setLive(true)
  }
}
