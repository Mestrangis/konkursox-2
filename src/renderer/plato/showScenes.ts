// Rótulo de transición entre pruebas (estética de la cabecera) y marcador final (según el diseño).
import { finalStandings, roman, winnerWord, type Gender } from '../../shared/games'
import { contestantOrder } from '../../shared/order'
import { formatPoints } from '../../shared/quiz'
import { activePlayers, gameLabel, playedCount, scoreboardEntries } from '../../shared/show'
import type { ContestantId, GameState, SlotId } from '../../shared/types'
import { bevelBar, camFrame, emblem, h, svg, type CamFrameEl } from '../ds/components'
import { DIAMOND } from './quizScenes'
import type { Scene } from './scenes'

// ---------------------------------------------------------------- transición

export const transitionKey = (s: GameState): string => `transition:${s.show.current}:${s.show.segments[s.show.current ?? -1]?.id ?? ''}`

function ring(size: number, alpha: number, cls = ''): HTMLDivElement {
  return h('div', `k-abs ${cls}`.trim(), {
    left: '50%',
    top: '50%',
    width: size,
    height: size,
    margin: `${-size / 2}px 0 0 ${-size / 2}px`,
    borderRadius: '50%',
    border: `1px solid rgba(214, 186, 120, ${alpha})`
  })
}

export function buildTransitionScene(s: GameState): Scene {
  const key = transitionKey(s)
  const idx = s.show.current ?? 0
  const seg = s.show.segments[idx]
  const kicker = h('div', 'k-trans__kicker')
  const title = h('div', 'k-logo k-logo--hero k-trans__title')
  const sub = h('div', 'k-caption k-caption--muted k-trans__sub')
  const root = h('div', 'k-stage k-stage--cover k-enter k-trans', {}, [
    ring(1500, 0.07, 'k-trans__ring'),
    ring(1100, 0.11, 'k-trans__ring'),
    ring(760, 0.18, 'k-trans__ring'),
    h('div', 'k-abs', { left: '50%', top: '50%', width: 1300, height: 560, margin: '-280px 0 0 -650px', background: 'radial-gradient(ellipse at center, rgba(190,205,240,0.12), transparent 65%)' }),
    h('div', 'k-abs k-trans__line', {
      left: 0,
      right: 0,
      top: 539,
      height: 1,
      background: 'linear-gradient(90deg, transparent 2%, rgba(214,186,120,0.6) 14%, transparent 19%, transparent 81%, rgba(214,186,120,0.6) 86%, transparent 98%)'
    }),
    h('div', 'k-abs k-trans__emblem', { left: 0, right: 0, top: 330, display: 'flex', justifyContent: 'center' }, [emblem(44)]),
    h('div', 'k-abs', { left: 0, right: 0, top: 400, display: 'flex', justifyContent: 'center' }, [kicker]),
    h('div', 'k-abs', { left: 80, right: 80, top: 452, display: 'flex', justifyContent: 'center' }, [title]),
    h('div', 'k-abs k-trans__rule', { left: '50%', top: 640, width: 620, marginLeft: -310, height: 2, background: 'linear-gradient(90deg, transparent, #c9a961 30%, #f1dfab 50%, #c9a961 70%, transparent)' }),
    h('div', 'k-abs', { left: 0, right: 0, top: 672, display: 'flex', justifyContent: 'center' }, [sub])
  ])
  const update = (st: GameState) => {
    const i = st.show.current ?? 0
    const sg = st.show.segments[i]
    kicker.textContent = `Prueba ${i + 1}${st.show.segments.length ? ` de ${st.show.segments.length}` : ''}`
    const name = (sg?.name ?? '').toUpperCase()
    title.textContent = name
    title.style.fontSize = name.length > 22 ? '78px' : name.length > 14 ? '96px' : ''
    const label = sg ? gameLabel(sg.game) : ''
    // si el nombre ya es el del juego, no se repite debajo
    sub.textContent = label.toUpperCase() === name ? '' : label
  }
  void seg
  update(s)
  return { key, root, frames: new Map(), update }
}

// ---------------------------------------------------------------- marcador final

export const finalKey = (s: GameState): string => {
  const { standings, winners } = finalStandings(scoreboardEntries(s))
  return `final:${s.layout}:${standings.map((x) => x.key + x.position).join(',')}:${winners.join(',')}:${contestantOrder(s).join(',')}`
}

/** Concursantes de una entrada del marcador ("c1" o "t0"). */
function slotsOf(s: GameState, key: string): ContestantId[] {
  if (key.startsWith('t')) {
    const team = Number(key.slice(1))
    return contestantOrder(s).filter((id) => s.contestants.find((c) => c.id === id)?.team === team)
  }
  return [key as ContestantId]
}

function programDate(d = new Date()): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `Programa del ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`
}

export function buildFinalScene(s: GameState): Scene {
  const key = finalKey(s)
  const frames = new Map<SlotId, CamFrameEl>()
  const extra: { slot: SlotId; frame: CamFrameEl }[] = []
  const root = h('div', 'k-stage k-enter')
  const isTeam = s.layout === 'teams'
  const { standings, winners } = finalStandings(scoreboardEntries(s))

  // cabecera "Ganador/a de la noche"
  const caption = h('span', 'k-caption', { fontSize: 26, letterSpacing: '0.34em', color: '#e6cb85', whiteSpace: 'nowrap' })
  root.append(
    h('div', 'k-headline', { left: 100, top: 40, width: 1100 }, [
      h('span', 'k-headline__line', { background: 'linear-gradient(90deg, transparent, #c9a961)' }),
      svg('0 0 10 10', { width: 18, height: 18 }, DIAMOND),
      caption,
      svg('0 0 10 10', { width: 18, height: 18 }, DIAMOND),
      h('span', 'k-headline__line', { background: 'linear-gradient(90deg, #c9a961, transparent)' })
    ])
  )

  // cámara(s) del ganador
  const winSlots = winners.flatMap((k) => slotsOf(s, k)).slice(0, 4)
  const n = Math.max(1, winSlots.length)
  const gap = 12
  const w = (1100 - gap * (n - 1)) / n
  winSlots.forEach((slot, i) => {
    const f = camFrame({ x: Math.round(100 + i * (w + gap)), y: 100, w: Math.round(w), h: 700 }, slot)
    f.root.classList.add('is-winner')
    frames.set(slot, f)
    root.append(f.root)
  })
  const winName = h('span', 'k-name', { fontSize: 44, letterSpacing: '0.12em' })
  const winPts = h('span', 'k-score', { fontSize: 48 })
  root.append(bevelBar({ box: { x: 250, y: 760, w: 800, h: 84 }, c: 34 }, [winName, winPts]))

  // clasificación
  root.append(h('div', 'k-caption', { position: 'absolute', left: 1260, top: 40, width: 560, textAlign: 'center', fontSize: 22 }, ['Clasificación final']))
  const rows = standings.slice(0, 4).map((st, i) => {
    const y = 82 + i * 180
    const row = h('div', 'k-rank' + (st.position === 1 ? ' is-first' : ''), { left: 1260, top: y, width: 560, height: 166 })
    const pos = h('span', 'k-rank__pos', {}, [roman(st.position)])
    const nm = h('span', 'k-name', { fontSize: 32, flex: 1 })
    const pts = h('span', 'k-score', { fontSize: 40, marginLeft: 0 })
    row.append(pos, h('span', '', { width: 190, flex: 'none' }), nm, pts)
    root.append(row)
    // cámaras pequeñas (posicionadas sobre la fila)
    const slots = slotsOf(s, st.key).slice(0, 2)
    const cw = slots.length === 2 ? 92 : 190
    slots.forEach((slot, j) => {
      const f = camFrame({ x: 1260 + 18 + 46 + 22 + j * (cw + 6), y: y + 19, w: cw, h: 128 }, slot)
      f.root.classList.add('k-cam--small')
      if (frames.has(slot)) extra.push({ slot, frame: f })
      else frames.set(slot, f)
      root.append(f.root)
    })
    return { key: st.key, nm, pts }
  })

  // pie
  const date = h('span', 'k-caption k-caption--muted')
  const stats = h('span', 'k-caption k-caption--muted')
  root.append(
    h('div', 'k-track', { top: 968 }),
    bevelBar({ box: { x: 100, y: 920, w: 1720, h: 98 }, c: 40, center: true }, [date, h('span', 'k-lower__sep'), h('span', 'k-logo', { fontSize: 40 }, ['KONKURSOX']), h('span', 'k-lower__sep'), stats], { gap: 32 })
  )

  const update = (st: GameState) => {
    const res = finalStandings(scoreboardEntries(st))
    const byKey = new Map(res.standings.map((x) => [x.key, x]))
    const genders: Gender[] = res.winners.flatMap((k) => (k.startsWith('t') ? [] : [st.contestants.find((c) => c.id === k)?.gender ?? null]))
    caption.textContent = `${winnerWord(genders, isTeam)} de la noche`
    const ws = res.winners.map((k) => byKey.get(k)!)
    winName.textContent = ws.map((x) => x.name).join(' y ')
    winName.style.fontSize = winName.textContent.length > 24 ? '32px' : ''
    winPts.textContent = formatPoints(ws[0]?.score ?? 0)
    for (const r of rows) {
      const x = byKey.get(r.key)
      if (!x) continue
      // en la clasificación basta el nombre de pila (como en el diseño); los equipos, completos
      r.nm.textContent = isTeam ? x.name : x.name.trim().split(/s+/)[0]
      r.nm.style.fontSize = r.nm.textContent.length > 10 ? '26px' : ''
      r.pts.textContent = formatPoints(x.score)
    }
    date.textContent = programDate()
    const pruebas = playedCount(st)
    const players = isTeam ? `2 equipos` : `${activePlayers(st)} concursantes`
    stats.textContent = `${pruebas} ${pruebas === 1 ? 'prueba' : 'pruebas'} · ${players}`
  }
  update(s)
  return { key, root, frames, extraFrames: extra, update }
}
