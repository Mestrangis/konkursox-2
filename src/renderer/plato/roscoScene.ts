// El rosco (según design/KONKURSOX 2.html): letras en círculo alrededor de la cámara del concursante en turno.
import { remainingMs, roscoStats, roscoWinners, type RoscoPlayer } from '../../shared/rosco'
import { ROSCO_ALPHABET } from '../../shared/questions'
import type { GameState, SlotId } from '../../shared/types'
import { bevelBar, camFrame, h, type CamFrameEl } from '../ds/components'
import { membersOf, targetName } from './quizScenes'
import type { Scene } from './scenes'

export function roscoKey(s: GameState): string {
  const r = s.rosco
  const p = r.players[r.turn]
  return `rosco:${r.players.length}:${r.turn}:${p ? membersOf(s, p.target).join(',') : ''}:${p?.letters.length ?? 0}:${s.camsScene.on.host ? 'h' : ''}`
}

const secs = (p: RoscoPlayer | undefined) => (p ? Math.ceil(remainingMs(p, Date.now()) / 1000) : 0)

export function buildRoscoScene(s: GameState): Scene {
  const key = roscoKey(s)
  const frames = new Map<SlotId, CamFrameEl>()
  const root = h('div', 'k-stage k-enter')
  const r = s.rosco
  const player = r.players[r.turn]

  root.append(h('div', 'k-abs', { left: 190, top: 30, width: 820, height: 820, borderRadius: '50%', border: '1px solid rgba(201,169,97,0.16)' }))
  const members = player ? membersOf(s, player.target) : []
  members.slice(0, 2).forEach((slot, i) => {
    // un concursante: cámara redonda; un equipo: dos medias lunas
    const box = members.length === 2 ? { x: 320 + i * 280, y: 160, w: 280, h: 560 } : { x: 320, y: 160, w: 560, h: 560 }
    const f = camFrame(box, slot)
    f.root.style.borderRadius = members.length === 2 ? (i === 0 ? '280px 0 0 280px' : '0 280px 280px 0') : '50%'
    frames.set(slot, f)
    root.append(f.root)
  })

  // letras
  const letters = player?.letters ?? []
  const N = letters.length || ROSCO_ALPHABET.length
  const letterEls = letters.map((l, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N
    const el = h('div', 'k-lt', { left: Math.round(600 + 374 * Math.cos(a)), top: Math.round(440 + 374 * Math.sin(a)) }, [l.letra])
    root.append(el)
    return el
  })

  // columna derecha
  const name = h('span', 'k-name', { fontSize: 34 })
  root.append(bevelBar({ box: { x: 1150, y: 70, w: 670, h: 64 }, c: 26, center: true }, [name]))
  const time = h('span', 'k-rosco__time')
  const timeCap = h('span', 'k-caption k-caption--muted', {}, ['segundos'])
  // el presentador, si sale (fila "Quién sale"), a la izquierda del reloj
  const withHost = s.camsScene.on.host
  if (withHost) {
    const f = camFrame({ x: 1150, y: 170, w: 320, h: 400 }, 'host')
    frames.set('host', f)
    root.append(f.root)
  }
  root.append(h('div', 'k-infobox', { left: withHost ? 1490 : 1150, top: 170, width: withHost ? 330 : 670, height: 400, gap: 0 }, [h('span', 'k-caption', {}, ['Tiempo']), time, timeCap]))
  const counter = (label: string, color: string) => {
    const v = h('span', 'k-rosco__count')
    return { v, el: h('div', 'k-rosco__box', {}, [v, h('span', 'k-rosco__cnt', {}, [h('span', 'k-rosco__dot', { background: color }), label])]) }
  }
  const cOk = counter('Aciertos', '#3fb56e')
  const cKo = counter('Fallos', '#d4483b')
  const cPend = counter('Pendientes', '#57627a')
  root.append(h('div', 'k-rosco__counters', { left: 1150, top: 600, width: 670 }, [cOk.el, cKo.el, cPend.el]))

  // rival (2 jugadores)
  const otherName = h('span', 'k-name', { fontSize: 24 })
  const otherInfo = h('span', 'k-caption', { marginLeft: 'auto', fontSize: 18, color: 'var(--k-gold-400)' })
  const other = bevelBar({ box: { x: 1150, y: 790, w: 670, h: 54 }, c: 22 }, [h('span', 'k-caption k-caption--muted', { fontSize: 15 }, ['Rival']), otherName, otherInfo])
  root.append(other)

  // definición
  const lead = h('span', 'k-caption', { fontSize: 18 })
  const big = h('span', 'k-rosco__letter')
  const def = h('span', 'k-question', { fontSize: 42 })
  root.append(h('div', 'k-track', { top: 960 }), bevelBar({ box: { x: 100, y: 900, w: 1720, h: 120 }, c: 48 }, [h('span', 'k-rosco__lead', {}, [lead, big]), def], { gap: 30 }))

  const update = (st: GameState) => {
    const ro = st.rosco
    const p = ro.players[ro.turn]
    if (!p) return
    p.letters.forEach((l, i) => {
      const el = letterEls[i]
      if (!el) return
      const isCur = i === p.current && !p.done && !ro.finished
      el.className = `k-lt k-lt--${isCur ? 'cur' : l.status}`
    })
    name.textContent = targetName(st, p.target)
    const st2 = roscoStats(p)
    cOk.v.textContent = String(st2.ok)
    cKo.v.textContent = String(st2.ko)
    cPend.v.textContent = String(st2.pending)
    time.textContent = String(secs(p))
    timeCap.textContent = p.timeUp ? 'tiempo agotado' : 'segundos'

    const o = ro.players.length === 2 ? ro.players[1 - ro.turn] : null
    other.style.display = o ? '' : 'none'
    if (o) {
      const os = roscoStats(o)
      otherName.textContent = targetName(st, o.target)
      otherInfo.textContent = `${os.ok} ${os.ok === 1 ? 'acierto' : 'aciertos'} · ${secs(o)} s${o.done ? ' · terminado' : ''}`
    }

    if (ro.finished) {
      const w = roscoWinners(ro)
      lead.textContent = 'Fin'
      big.textContent = ''
      big.style.display = 'none'
      const names = w.map((i) => targetName(st, ro.players[i].target))
      const best = roscoStats(ro.players[w[0]])
      def.textContent =
        ro.players.length === 1
          ? `${names[0]} termina el rosco con ${best.ok} ${best.ok === 1 ? 'acierto' : 'aciertos'}`
          : w.length > 1
            ? `Empate a ${best.ok} aciertos y ${best.ko} fallos`
            : `Gana ${names[0]} con ${best.ok} ${best.ok === 1 ? 'acierto' : 'aciertos'}`
    } else if (p.timeUp) {
      lead.textContent = ''
      big.textContent = ''
      big.style.display = 'none'
      def.textContent = `Tiempo agotado para ${targetName(st, p.target)}`
    } else {
      const l = p.letters[p.current]
      big.style.display = ''
      lead.textContent = l?.modo === 'contiene' ? 'Contiene la' : 'Con la'
      big.textContent = l?.letra ?? ''
      def.textContent = l?.definicion ?? ''
    }
  }
  update(s)
  return {
    key,
    root,
    frames,
    update,
    tick: (st) => {
      const p = st.rosco.players[st.rosco.turn]
      if (p) time.textContent = String(secs(p))
      const o = st.rosco.players.length === 2 ? st.rosco.players[1 - st.rosco.turn] : null
      if (o && o.endsAt !== null) update(st)
    }
  }
}
