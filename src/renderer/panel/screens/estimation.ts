// Estimación (design/panel.html: "Juego · Estimación").
import { formatNumber } from '../../../shared/games'
import { parseNumber, questionKey, type Question } from '../../../shared/questions'
import { targetKey, turnTargets, type CurrentQuestion, type QuizAction } from '../../../shared/quiz'
import type { GameState } from '../../../shared/types'
import { btn, h, icon, ICONS, nameOf, type Ctx, type Screen } from '../ui'
import { bankFor, flowSteps, goButton, nextUnused, onAirLabel, questionList, toGame } from './common'

export function createEstimationScreen(ctx: Ctx): Screen {
  const game = 'estimacion' as const
  const send = (a: QuizAction) => ctx.send(toGame(game, a))
  const S = () => ctx.state
  const slot = (s: GameState = S()): CurrentQuestion | null => s.quiz.slots[game] ?? null

  const list = questionList(ctx, game, (q, ref) => load(q, ref))
  const go = goButton()
  const header = h('div', 'head')
  const flow = h('div', '', { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' })
  const qpanel = h('div', 'pnl', { padding: '18px 20px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' })
  const grid = h('div', '', { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 })
  const secondary = h('div', 'secrow')
  const el = h('div', 'screen', {}, [
    header,
    h('div', '', { display: 'flex', gap: 18, minHeight: 0, flex: 1 }, [
      h('div', '', { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }, [flow, qpanel, grid, h('span', 'spacer'), secondary, go.el]),
      list.el
    ])
  ])

  // entradas persistentes (no se pierde lo que escribes al repintar)
  let gridKey = ''
  const inputs = new Map<string, { input: HTMLInputElement; info: HTMLElement; card: HTMLElement }>()

  function load(q: Question, ref: string): void {
    ctx.send({ type: 'quizLoad', key: questionKey(ref, q.id), bankFile: ref, question: q, now: Date.now(), stage: true, game })
    ctx.lib.markUsed(ref, [q.id], true)
  }
  function loadNext(): void {
    const ref = bankFor(ctx, game)
    const q = nextUnused(ctx, ref, slot()?.key)
    if (!q || !ref) return ctx.toast('No quedan preguntas sin usar en este banco')
    load(q, ref)
  }
  function showQuestion(): void {
    ctx.send({ type: 'setLiveGame', game, scene: true })
    send({ type: 'quizShowQuestion' })
    ctx.send({ type: 'markPlayed', game })
    ctx.cue('pregunta')
  }
  function reveal(): void {
    ctx.audio.stopSfx()
    ctx.audio.stopLoop()
    send({ type: 'quizReveal', now: Date.now() })
    ctx.cue('estimacion')
  }
  function toggleTimer(): void {
    const t = S().quiz.timer
    if (!t.enabled) {
      ctx.send({ type: 'timerConfig', patch: { enabled: true } })
      ctx.send({ type: 'timerStart', now: Date.now() })
      return
    }
    ctx.send(t.endsAt !== null ? { type: 'timerPause', now: Date.now() } : { type: 'timerStart', now: Date.now() })
  }
  const toggleGuesses = () => {
    const cur = slot()
    if (cur) send({ type: 'quizShowGuesses', show: !cur.showGuesses })
  }

  function nextStep(s: GameState): { label: string; after: string; run: (() => void) | null; step: number; air: string } {
    const cur = slot(s)
    const ref = bankFor(ctx, game)
    if (!cur) return { label: 'Cargar pregunta', after: 'Después: mostrar pregunta', run: ref ? loadNext : null, step: 0, air: 'nada de esta pregunta' }
    if (cur.phase === 'ready') return { label: 'Mostrar pregunta', after: 'Después: anotar cifras y revelar', run: showQuestion, step: 0, air: 'nada de esta pregunta' }
    if (cur.phase !== 'revealed') {
      const n = Object.keys(cur.guesses).length
      return {
        label: n ? 'Revelar respuesta' : 'Anota la cifra de cada uno',
        after: s.quiz.scoring.autoAward ? 'Después: siguiente pregunta (los puntos se suman solos)' : 'Después: sumar puntos',
        run: n ? reveal : null,
        step: 1,
        air: cur.showGuesses ? 'pregunta y cifras' : 'pregunta y cifras ocultas'
      }
    }
    const pending = cur.attempts.filter((a) => !a.awarded && a.delta)
    if (pending.length) {
      const names = pending.map((a) => nameOf(s, a.target)).join(' y ')
      return { label: `Sumar ${pending[0].delta} a ${names}`, after: 'Después: siguiente pregunta', run: () => send({ type: 'quizAward' }), step: 2, air: 'respuesta revelada' }
    }
    return { label: 'Siguiente pregunta', after: 'Después: mostrar pregunta', run: ref ? loadNext : null, step: 3, air: 'puntos sumados' }
  }

  function renderGrid(s: GameState, cur: CurrentQuestion | null): void {
    const targets = turnTargets(s)
    const key = `${cur?.key ?? ''}|${targets.map(targetKey).join(',')}`
    if (key !== gridKey) {
      gridKey = key
      inputs.clear()
      grid.replaceChildren(
        ...targets.map((t, idx) => {
          const k = targetKey(t)
          const input = h('input', 'inp big')
          input.inputMode = 'decimal'
          input.placeholder = 'Escribe su cifra'
          input.id = `est-${k}`
          const commit = () => send({ type: 'quizGuess', key: k, value: parseNumber(input.value) })
          input.onchange = commit
          input.onkeydown = (e) => {
            if (e.key === 'Enter') {
              commit()
              const next = targets[idx + 1]
              if (next) inputs.get(targetKey(next))?.input.focus()
              else input.blur()
            }
          }
          const info = h('span', '', { fontSize: 12, fontWeight: 600 })
          const label = h('label', '', { fontWeight: 600, fontSize: 15 }, [nameOf(s, t)])
          label.setAttribute('for', input.id)
          const card = h('div', 'pc', {}, [h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [label, h('span', 'spacer'), info]), input])
          inputs.set(k, { input, info, card })
          return card
        })
      )
    }
    const revealed = cur?.phase === 'revealed'
    const res = cur?.estimation
    const unit = cur?.question.unidad ? ` ${cur.question.unidad}` : ''
    for (const [k, x] of inputs) {
      const v = cur?.guesses[k]
      if (document.activeElement !== x.input) x.input.value = v === undefined ? '' : formatNumber(v)
      x.input.disabled = !cur || revealed
      const row = res?.rows.find((r) => r.key === k)
      const best = !!res?.winners.includes(k)
      x.card.classList.toggle('best', revealed && best)
      x.info.textContent = revealed
        ? row
          ? `${best ? 'Más cerca · a ' : row.rank === null ? 'Se pasa · a ' : 'A '}${formatNumber(row.diff)}${unit}`
          : 'Sin cifra'
        : v === undefined
          ? 'Esperando'
          : 'Anotada'
      x.info.style.color = revealed && best ? '#3ecf8e' : v === undefined ? '#e8a23a' : '#9a9aa3'
    }
  }

  function update(s: GameState): void {
    const cur = slot(s)
    const ref = bankFor(ctx, game)
    const info = ctx.lib.info(ref)
    const qs = ctx.lib.peek(ref)?.preguntas ?? []
    const idx = cur ? qs.findIndex((q) => questionKey(ref ?? '', q.id) === cur.key) : -1
    const est = s.quiz.estimation
    header.replaceChildren(
      h('div', 'title', {}, [
        h('b', '', {}, ['Estimación']),
        h('span', 'mut', { fontSize: 13 }, [`Banco «${info?.nombre ?? '-'}»${idx >= 0 ? ` · pregunta ${idx + 1} de ${qs.length}` : ''} · todos responden${est.priceIsRight ? ' · precio justo' : ''}`])
      ]),
      h('span', 'spacer')
    )
    const st = nextStep(s)
    flow.replaceChildren(...flowSteps(['Pregunta', 'Revelar', 'Puntos', 'Siguiente'], st.step), h('span', 'spacer'), onAirLabel(s, game, st.air))
    go.set(st.label, st.after, st.run)

    qpanel.replaceChildren()
    if (!cur) qpanel.append(h('div', 'mut', { fontSize: 15 }, [ref ? 'Pulsa Espacio para cargar la siguiente pregunta sin usar, o elige una en la lista.' : 'No hay bancos de estimación: créalos en Biblioteca.']))
    else {
      const q = cur.question
      qpanel.append(
        h('div', 'qtext', { flex: '1 1 420px' }, [q.enunciado]),
        h('div', 'answerbox', {}, [
          h('span', 'lbl ok', {}, ['Respuesta · solo tú']),
          h('span', '', { fontSize: 36, fontWeight: 800 }, [`${formatNumber(q.valor ?? 0)}${q.unidad ? ' ' + q.unidad : ''}`]),
          ...(q.nota_presentador ? [h('span', 'mut', { fontSize: 12, maxWidth: 320 }, [q.nota_presentador])] : [])
        ])
      )
    }
    renderGrid(s, cur)

    const t = s.quiz.timer
    const left = t.endsAt !== null ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs ?? t.seconds * 1000
    secondary.replaceChildren(
      btn(cur?.showGuesses ? 'Ocultar cifras en el plató' : 'Mostrar cifras en el plató', toggleGuesses, `b${cur?.showGuesses ? ' on' : ''}`, 'C'),
      (timerBtn = btn(t.endsAt !== null ? `Temporizador · quedan ${Math.ceil(left / 1000)} s` : `Temporizador ${t.seconds} s`, toggleTimer, `b ghost${t.endsAt !== null ? ' on' : ''}`, 'T')),
      h('span', 'spacer'),
      btn('Deshacer', () => ctx.send({ type: 'undo', game }), 'b ghost', 'Ctrl Z')
    )
    ;(secondary.lastChild as HTMLButtonElement).disabled = !s.runtime.undo[game]
    list.render(s, cur)
    void icon
    void ICONS
  }

  function onKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.altKey || e.metaKey) return false
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (k === ' ') nextStep(S()).run?.()
    else if (k === 'c') toggleGuesses()
    else if (k === 't') toggleTimer()
    else return false
    return true
  }

  let timerBtn: HTMLButtonElement | null = null
  setInterval(() => {
    const t = S()?.quiz.timer
    if (!el.isConnected || !timerBtn || !t || t.endsAt === null) return
    timerBtn.firstChild!.textContent = `Temporizador · quedan ${Math.ceil(Math.max(0, t.endsAt - Date.now()) / 1000)} s`
  }, 250)

  return { el, update, onKey }
}
