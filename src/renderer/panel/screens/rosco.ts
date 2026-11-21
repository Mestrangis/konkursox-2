// Rosco (design/panel.html: "Juego · Rosco · 2 concursantes").
import { ROSCO_ALPHABET } from '../../../shared/questions'
import { sameTarget, turnTargets, type Target } from '../../../shared/quiz'
import { buildLetters, remainingMs, roscoPoints, roscoStats, roscoWinners, type RoscoAction, type RoscoPlayer } from '../../../shared/rosco'
import type { GameState } from '../../../shared/types'
import { btn, h, kbd, mmss, nameOf, type Ctx, type Screen } from '../ui'
import { flowSteps, goButton, onAirLabel } from './common'

export function createRoscoScreen(ctx: Ctx): Screen {
  const S = () => ctx.state
  const r = (a: RoscoAction) => ctx.send(a)
  let players: (Target | null)[] = [null, null]

  const header = h('div', 'head')
  const body = h('div', 'screen', { minHeight: 0, gap: 14 })
  const el = h('div', 'screen', {}, [header, body])

  // ---------------------------------------------------------------- acciones
  function mark(res: 'ok' | 'ko' | 'pasa'): void {
    const s = S()
    if (!s.rosco.active || s.rosco.finished) return
    r({ type: 'roscoMark', result: res, now: Date.now() })
    ctx.cue(res === 'ok' ? 'correcto' : res === 'ko' ? 'error' : 'pasapalabra')
  }
  function toggleClock(): void {
    const s = S()
    const p = s.rosco.players[s.rosco.turn]
    if (!s.rosco.active || !p || p.done) return
    r({ type: 'roscoClock', run: p.endsAt === null, now: Date.now() })
  }
  function swap(): void {
    const s = S()
    if (s.rosco.players.length === 2 && !s.rosco.finished) {
      r({ type: 'roscoSetTurn', turn: 1 - s.rosco.turn, now: Date.now() })
      r({ type: 'roscoClock', run: true, now: Date.now() + 1 })
    }
  }

  async function start(): Promise<void> {
    const s = S()
    const chosen = players.filter(Boolean) as Target[]
    if (!chosen.length) return ctx.toast('Elige al menos un concursante')
    const refs = [s.rosco.bankFile, s.rosco.bankFile2]
    const built = []
    for (let i = 0; i < Math.min(2, chosen.length); i++) {
      const ref = refs[i] ?? refs[0]
      if (!ref) return ctx.toast('Elige el banco de cada concursante')
      const bank = await ctx.lib.get(ref)
      const letters = buildLetters(bank.preguntas.filter((q) => q.enunciado && q.respuesta))
      if (!letters.length) return ctx.toast(`El rosco «${bank.nombre}» no tiene letras completas`)
      built.push({ target: chosen[i], letters })
    }
    if (s.rosco.active && !s.rosco.finished && !confirm('Hay un rosco en marcha. ¿Empezar otro?')) return
    r({ type: 'roscoStart', players: built, now: Date.now() })
    ctx.send({ type: 'setLiveGame', game: 'rosco', scene: true })
    ctx.send({ type: 'markPlayed', game: 'rosco' })
    ctx.cue('pregunta')
  }

  // fin de tiempo (aunque la pantalla no esté abierta)
  setInterval(() => {
    const s = S()
    if (!s || !s.rosco.active || s.rosco.finished) return
    const p = s.rosco.players[s.rosco.turn]
    if (p && p.endsAt !== null && remainingMs(p, Date.now()) <= 0) {
      r({ type: 'roscoTimeUp', now: Date.now() })
      ctx.cue('error')
    }
    // solo los relojes: repintar todo cada 250 ms se comería los clics
    if (el.isConnected)
      for (const t of Array.from(el.querySelectorAll<HTMLElement>('.rtime'))) {
        const pl = s.rosco.players[Number(t.dataset.i)]
        if (pl) t.textContent = mmss(remainingMs(pl, Date.now()) / 1000)
      }
  }, 250)

  // ---------------------------------------------------------------- pintado
  function ring(p: RoscoPlayer, isTurn: boolean, index: number): HTMLElement {
    const box = h('div', '', { position: 'relative', width: 200, height: 200, flex: 'none' })
    const N = p.letters.length || 27
    p.letters.forEach((l, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / N
      const cur = i === p.current && !p.done
      box.append(h('span', `ld s-${cur ? 'cur' : l.status}`, { left: Math.round(100 + 88 * Math.cos(a)), top: Math.round(100 + 88 * Math.sin(a)) }, [l.letra]))
    })
    box.append(
      h('div', '', { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }, [
        (() => {
          const t = h('span', 'rtime', { fontSize: 34, fontWeight: 800 }, [mmss(remainingMs(p, Date.now()) / 1000)])
          t.dataset.i = String(index)
          return t
        })(),
        h('span', 'mut', { fontSize: 11 }, [p.done ? 'terminado' : p.endsAt !== null ? 'corriendo' : 'en pausa'])
      ])
    )
    void isTurn
    return box
  }

  function setup(s: GameState): void {
    const banks = ctx.lib.banksOf('rosco')
    const bankSel = (i: 0 | 1) => {
      const cur = i === 0 ? s.rosco.bankFile : s.rosco.bankFile2
      const sel = h('select', 'inp')
      sel.append(h('option', '', {}, [i === 1 ? '(el mismo que el primero)' : banks.length ? 'Elige un rosco' : 'No hay roscos: créalos en Biblioteca']))
      ;(sel.firstChild as HTMLOptionElement).value = ''
      for (const b of banks) {
        const o = h('option', '', {}, [`${b.nombre} · ${b.letters ?? 0}/27 letras`])
        o.value = b.ref
        o.selected = b.ref === cur
        sel.append(o)
      }
      sel.onchange = () => r({ type: 'roscoConfig', patch: i === 0 ? { bankFile: sel.value || null } : { bankFile2: sel.value || null } })
      return sel
    }
    if (!s.rosco.bankFile && banks[0]) r({ type: 'roscoConfig', patch: { bankFile: banks[0].ref, bankFile2: banks[1]?.ref ?? null } })
    const targets = turnTargets(s)
    if (!players[0] || !targets.some((t) => sameTarget(t, players[0]))) players[0] = targets[0] ?? null
    if (players[1] && !targets.some((t) => sameTarget(t, players[1]))) players[1] = null
    const who = (i: 0 | 1) => {
      const sel = h('select', 'inp')
      if (i === 1) sel.append(h('option', '', {}, ['Nadie (rosco en solitario)']))
      targets.forEach((t, j) => {
        const o = h('option', '', {}, [nameOf(s, t)])
        o.value = String(j)
        o.selected = !!players[i] && sameTarget(players[i], t)
        sel.append(o)
      })
      if (i === 1) (sel.firstChild as HTMLOptionElement).value = ''
      sel.onchange = () => {
        players[i] = sel.value === '' ? null : targets[Number(sel.value)]
        update(S())
      }
      return sel
    }
    const num = (label: string, v: number, set: (n: number) => void) => {
      const i = h('input', 'inp', { width: 110 })
      i.value = String(v)
      i.inputMode = 'numeric'
      i.onchange = () => {
        const n = Number(i.value)
        if (Number.isFinite(n)) set(n)
      }
      return h('label', 'field', {}, [h('span', 'fl', {}, [label]), i])
    }
    const go = goButton()
    go.set(`Empezar el rosco${players[1] ? ' a dos' : ''}`, `${s.rosco.seconds} s cada uno · el reloj arranca al empezar`, players[0] ? () => void start() : null)
    const last = s.rosco.finished ? result(s) : null
    body.replaceChildren(
      ...(last ? [last] : []),
      h('div', 'pnl', { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }, [
        h('span', 'lbl', {}, ['Preparar el rosco']),
        h('div', '', { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, [
          h('label', 'field', {}, [h('span', 'fl', {}, ['Concursante 1']), who(0)]),
          h('label', 'field', {}, [h('span', 'fl', {}, ['Rosco del concursante 1']), bankSel(0)]),
          h('label', 'field', {}, [h('span', 'fl', {}, ['Concursante 2 (se alternan)']), who(1)]),
          h('label', 'field', {}, [h('span', 'fl', {}, ['Rosco del concursante 2']), bankSel(1)])
        ]),
        h('div', '', { display: 'flex', gap: 12, flexWrap: 'wrap' }, [
          num('Segundos por concursante', s.rosco.seconds, (n) => r({ type: 'roscoConfig', patch: { seconds: Math.max(10, Math.round(n)) } })),
          num('Puntos por acierto', s.rosco.pointsPerHit, (n) => r({ type: 'roscoConfig', patch: { pointsPerHit: n } })),
          num('Bote por completarlo (0 = sin bote)', s.rosco.jackpot, (n) => r({ type: 'roscoConfig', patch: { jackpot: Math.max(0, n) } }))
        ]),
        h('span', 'mut', { fontSize: 12 }, ['Cada concursante juega su propio rosco. Si eliges el mismo para los dos, tendrán las mismas definiciones.'])
      ]),
      h('span', 'spacer'),
      go.el
    )
    goRun = players[0] ? () => void start() : null
  }

  function result(s: GameState): HTMLElement {
    const ro = s.rosco
    const w = roscoWinners(ro)
    const pts = roscoPoints(ro)
    return h('div', 'pnl', { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }, [
      h('span', 'lbl ok', {}, [`Rosco terminado${ro.awarded ? ' · puntos sumados' : ''}`]),
      ...ro.players.map((p, i) => {
        const st = roscoStats(p)
        return h('div', '', { fontSize: 15 }, [
          h('b', '', {}, [nameOf(s, p.target)]),
          ` · ${st.ok} aciertos · ${st.ko} fallos · ${pts[i]} puntos${w.includes(i) && ro.players.length > 1 ? ' · GANA' : ''}`
        ])
      })
    ])
  }

  let goRun: (() => void) | null = null

  function update(s: GameState): void {
    const ro = s.rosco
    const p = ro.players[ro.turn]
    const live = ro.active && !!p && !ro.finished
    header.replaceChildren(
      h('div', 'title', {}, [
        h('b', '', {}, ['Rosco']),
        h('span', 'mut', { fontSize: 13 }, [
          live
            ? `Banco «${ctx.lib.info(ro.bankFile)?.nombre ?? '-'}»${ro.players.length === 2 ? ` y «${ctx.lib.info(ro.bankFile2 ?? ro.bankFile)?.nombre ?? '-'}»` : ''} · ${ro.players.length} ${ro.players.length === 1 ? 'concursante' : 'concursantes'} · ${ro.seconds} s cada uno`
            : 'Prepara el rosco y pulsa Espacio para empezar'
        ])
      ]),
      h('span', 'spacer'),
      ...(live
        ? [
            h('span', '', { display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', borderRadius: 8, background: '#26314d', fontWeight: 600 }, [
              h('span', '', { width: 8, height: 8, borderRadius: '50%', background: '#8fb0ff' }),
              `Turno de ${nameOf(s, p.target)}`
            ]),
            ...(ro.players.length === 2 ? [btn('Cambiar turno', swap, 'b', 'Tab')] : [])
          ]
        : [])
    )
    if (!live) {
      if (!body.contains(document.activeElement)) setup(s)
      return
    }
    goRun = null
    const cards = ro.players.map((pl, i) => {
      const st = roscoStats(pl)
      const isTurn = i === ro.turn
      return h('div', `rc ${isTurn ? 'turn' : 'wait'}`, {}, [
        ring(pl, isTurn, i),
        h('div', '', { display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }, [
          h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
            h('span', '', { fontSize: 18, fontWeight: 700 }, [nameOf(s, pl.target)]),
            ...(isTurn ? [h('span', '', { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 7px', borderRadius: 4, background: '#4f7dff' }, ['TURNO'])] : [])
          ]),
          h('div', '', { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }, [
            h('div', '', {}, [h('div', 'ok', { fontSize: 26, fontWeight: 800 }, [String(st.ok)]), h('div', 'mut', { fontSize: 11 }, ['Aciertos'])]),
            h('div', '', {}, [h('div', '', { fontSize: 26, fontWeight: 800, color: '#ff8a3d' }, [String(st.ko)]), h('div', 'mut', { fontSize: 11 }, ['Fallos'])]),
            h('div', '', {}, [h('div', '', { fontSize: 26, fontWeight: 800 }, [String(st.pending)]), h('div', 'mut', { fontSize: 11 }, ['Quedan'])])
          ])
        ])
      ])
    })
    const l = p.letters[p.current]
    const def = h('div', 'pnl', { padding: '20px 22px', display: 'flex', gap: 22, alignItems: 'stretch' }, [
      h('div', '', { width: 104, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, background: '#111113' }, [
        h('span', 'mut', { fontSize: 12 }, [l?.modo === 'contiene' ? 'Contiene la' : 'Empieza por']),
        h('span', '', { fontSize: 64, fontWeight: 800, lineHeight: 1 }, [l?.letra ?? ''])
      ]),
      h('div', '', { flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }, [
        h('div', '', { fontSize: 24, fontWeight: 600, lineHeight: 1.35 }, [l?.definicion ?? '']),
        h('div', '', { display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }, [
          h('span', 'lbl', {}, ['Respuesta']),
          h('span', 'ok', { fontSize: 44, fontWeight: 800, letterSpacing: '0.02em' }, [(l?.respuesta ?? '').toUpperCase()]),
          h('span', 'mut', { fontSize: 12 }, [l?.status === 'pasa' ? 'Solo la ves tú · pasada en la vuelta anterior' : 'Solo la ves tú'])
        ])
      ])
    ])
    const big = (cls: string, label: string, key: string, run: () => void) => {
      const b = h('button', `big3 ${cls}`, {}, [h('span', '', {}, [label]), kbd(key)])
      b.onclick = run
      b.disabled = p.done
      return b
    }
    const clockBtn = btn(p.endsAt !== null ? 'Pausar reloj' : 'Seguir reloj', toggleClock, 'b ghost', 'P')
    const undoBtn = btn('Corregir la última letra', () => ctx.send({ type: 'undo', game: 'rosco' }), 'b ghost', 'Ctrl Z')
    undoBtn.disabled = !s.runtime.undo.rosco
    body.replaceChildren(
      h('div', '', { display: 'flex', justifyContent: 'flex-end' }, [onAirLabel(s, 'rosco', 'el rosco')]),
      h('div', '', { display: 'flex', gap: 12 }, cards),
      def,
      h('div', '', { display: 'flex', gap: 10 }, [big('ac', 'Acierto', 'A', () => mark('ok')), big('fa', 'Fallo', 'F', () => mark('ko')), big('pa', 'Pasapalabra', 'Espacio', () => mark('pasa'))]),
      h('div', 'secrow', {}, [
        clockBtn,
        undoBtn,
        btn('Terminar el rosco', () => confirm('¿Dar el rosco por terminado y sumar los puntos?') && r({ type: 'roscoFinish' }), 'b ghost'),
        h('span', 'spacer'),
        h('span', 'mut', { fontSize: 12 }, [ro.players.length === 2 ? 'Fallo y Pasapalabra pasan el turno al otro concursante' : 'Fallo y Pasapalabra paran el reloj: sigue con P'])
      ])
    )
    void ROSCO_ALPHABET
    void flowSteps
  }

  function onKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.altKey || e.metaKey) return false
    const s = S()
    const live = s.rosco.active && !s.rosco.finished
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (!live) {
      if (k === ' ' && goRun) {
        goRun()
        return true
      }
      return false
    }
    if (k === 'a') mark('ok')
    else if (k === 'f') mark('ko')
    else if (k === ' ') mark('pasa')
    else if (k === 'p') toggleClock()
    else if (k === 'Tab') swap()
    else return false
    return true
  }

  return { el, update, onKey }
}
