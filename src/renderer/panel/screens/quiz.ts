// Pantallas de pregunta: Tipo test, Sí o no, Escalera y ¿Quién lo dijo? (design/panel.html: Test turno / todos).
import { quienOptions } from '../../../shared/games'
import { questionKey, type Question } from '../../../shared/questions'
import {
  fiftyFifty,
  formatPoints,
  ladderBank,
  ladderSafe,
  LIFELINES,
  sameTarget,
  targetKey,
  turnTargets,
  type CurrentQuestion,
  type LifelineId,
  type QuizAction,
  type Target
} from '../../../shared/quiz'
import { gameLabel, type QuizGameId } from '../../../shared/scene'
import type { GameState } from '../../../shared/types'
import { btn, h, icon, ICONS, nameOf, seg, type Ctx, type Screen } from '../ui'
import { bankFor, flowSteps, goButton, nextUnused, onAirLabel, questionList, toGame } from './common'

const LETTERS = 'ABCD'

export function createQuizScreen(ctx: Ctx, game: Exclude<QuizGameId, 'estimacion'>): Screen {
  const send = (a: QuizAction) => ctx.send(toGame(game, a))
  const S = () => ctx.state
  const slot = (s: GameState = S()): CurrentQuestion | null => s.quiz.slots[game] ?? null
  const tipo = game
  let selIdx = 0 // "todos responden": concursante seleccionado

  const list = questionList(ctx, tipo, (q, ref) => load(q, ref))
  const go = goButton()
  const header = h('div', 'head')
  const flow = h('div', '', { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' })
  const qpanel = h('div', 'pnl', { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 })
  const marks = h('div')
  const ladderBox = h('div')
  const secondary = h('div', 'secrow')
  const turnRow = h('div', 'secrow')

  const el = h('div', 'screen', {}, [
    header,
    h('div', '', { display: 'flex', gap: 18, minHeight: 0, flex: 1 }, [
      h('div', '', { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }, [flow, turnRow, ladderBox, qpanel, marks, h('span', 'spacer'), go.el, secondary]),
      list.el
    ])
  ])

  // ---------------------------------------------------------------- acciones
  function load(q: Question, ref: string): void {
    const s = S()
    let question = q
    if (q.tipo === 'quien') {
      question = quienOptions(q, s.people.map((p) => p.name))
      if (question.opciones.length < 2 || question.correcta < 0) {
        ctx.toast('Esta frase no tiene opciones suficientes: añade opciones o personas del grupo')
        return
      }
    }
    // sin turno elegido, empieza el primero
    if (!s.quiz.turn && game !== 'escalera') ctx.send({ type: 'quizSetTurn', target: turnTargets(s)[0] ?? null, game })
    ctx.send({ type: 'quizLoad', key: questionKey(ref, q.id), bankFile: ref, question, now: Date.now(), stage: true, game })
    ctx.lib.markUsed(ref, [q.id], true)
    selIdx = 0
  }

  function loadNext(): void {
    const ref = bankFor(ctx, tipo)
    const q = nextUnused(ctx, ref, slot()?.key)
    if (!q || !ref) return ctx.toast('No quedan preguntas sin usar en este banco')
    load(q, ref)
  }

  function showQuestion(): void {
    ctx.send({ type: 'setLiveGame', game, scene: true })
    send({ type: 'quizShowQuestion' })
    ctx.send({ type: 'markPlayed', game })
    ctx.audio.stopSfx()
    ctx.cue('pregunta')
  }

  function pick(i: number): void {
    const cur = slot()
    if (!cur || cur.phase === 'ready' || cur.phase === 'question' || cur.phase === 'revealed') return
    if (i >= cur.question.opciones.length) return
    if (cur.mode === 'all') {
      const targets = turnTargets(S())
      const t = targets[selIdx] ?? targets.find((x) => !(targetKey(x) in cur.answers))
      if (!t) return
      send({ type: 'quizAnswerAll', key: targetKey(t), index: i })
      ctx.cue('respondido')
      // salta al siguiente que no haya respondido
      const answers = { ...cur.answers, [targetKey(t)]: i }
      const next = targets.findIndex((x, j) => j > selIdx && !(targetKey(x) in answers))
      const first = targets.findIndex((x) => !(targetKey(x) in answers))
      selIdx = next >= 0 ? next : first >= 0 ? first : selIdx
      return
    }
    if (cur.hidden.includes(i) || cur.attempts.some((a) => !a.correct && a.pick === i)) return
    ctx.audio.stopLoop()
    ctx.audio.stopSfx()
    send({ type: 'quizPick', index: i, now: Date.now() })
    ctx.cue('marcar')
  }

  function reveal(): void {
    const s = S()
    const cur = slot(s)
    if (!cur) return
    ctx.audio.stopSfx()
    ctx.audio.stopLoop()
    const good = cur.mode === 'all' ? Object.values(cur.answers).some((v) => v === cur.question.correcta) : cur.picked === cur.question.correcta
    send({ type: 'quizReveal', now: Date.now() })
    ctx.cue(good ? 'correcto' : 'error')
  }

  function useLifeline(id: LifelineId): void {
    const s = S()
    const l = s.quiz.ladder
    if (!l.active || l.outcome) return
    const cur = slot(s)
    if (id === '5050' && !l.used[id]) send({ type: 'ladderSetLifeline', id, used: true, hide: cur ? fiftyFifty(cur.question, cur.hidden) : [] })
    else send({ type: 'ladderSetLifeline', id, used: !l.used[id], hide: [] })
  }

  function walkAway(): void {
    const l = S().quiz.ladder
    if (!l.active || l.outcome) return
    if (!confirm(`¿Se planta con ${formatPoints(ladderBank(l.levels, l.level))} puntos?`)) return
    ctx.audio.stopSfx()
    send({ type: 'ladderWalk' })
    ctx.send({ type: 'setLiveGame', game: 'escalera', scene: true })
    ctx.cue('plantarse')
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

  function toggleOptions(): void {
    const cur = slot()
    if (!cur || cur.phase === 'ready' || cur.phase === 'revealed') return
    if (cur.shown > 0) send({ type: 'quizHideOptions' })
    else send({ type: 'quizShowAll', now: Date.now() })
  }

  function setMode(m: 'turn' | 'all' | 'rebound'): void {
    ctx.send({ type: 'quizSetAllMode', allMode: m === 'all' })
    if (m !== 'all') ctx.send({ type: 'quizSetOptions', patch: { rebound: m === 'rebound' } })
    if (slot()) send({ type: 'quizSetMode', mode: m === 'all' ? 'all' : 'turn' })
  }

  /** Qué hace ahora el botón grande. */
  function nextStep(s: GameState): { label: string; after: string; run: (() => void) | null; warm?: boolean; step: number; air: string } {
    const cur = slot(s)
    const ref = bankFor(ctx, tipo)
    const l = s.quiz.ladder
    if (game === 'escalera' && !l.active) {
      const t = s.quiz.turn ?? turnTargets(s)[0]
      return {
        label: `Empezar la escalera con ${nameOf(s, t) || '...'}`,
        after: 'Después: cargar la primera pregunta',
        run: t
          ? () => {
              ctx.send({ type: 'ladderStart', target: t, game: 'escalera' })
              loadNext()
            }
          : null,
        step: 0,
        air: 'nada de la escalera'
      }
    }
    if (game === 'escalera' && l.outcome) {
      if (!l.showResult)
        return {
          label: 'Mostrar la pantalla final',
          after: 'Después: terminar la escalera',
          run: () => {
            ctx.send({ type: 'setLiveGame', game: 'escalera', scene: true })
            send({ type: 'ladderShowResult', show: true })
            ctx.cue(l.outcome!.kind === 'won' ? 'victoria' : l.outcome!.kind === 'walked' ? 'plantarse' : 'caida')
          },
          warm: true,
          step: 3,
          air: 'respuesta revelada'
        }
      return { label: 'Terminar la escalera', after: 'Después: empezar otra', run: () => send({ type: 'ladderStop' }), step: 3, air: 'pantalla final de la escalera' }
    }
    if (!cur)
      return { label: 'Cargar pregunta', after: 'Después: mostrar pregunta', run: ref ? loadNext : null, step: 0, air: 'nada de esta pregunta' }
    switch (cur.phase) {
      case 'ready':
        return { label: 'Mostrar pregunta', after: 'Después: mostrar opciones', run: showQuestion, step: 0, air: 'nada de esta pregunta' }
      case 'question':
        return { label: 'Mostrar opciones', after: 'Después: revelar respuesta', run: () => send({ type: 'quizShowAll', now: Date.now() }), step: 1, air: 'solo la pregunta' }
      case 'options':
      case 'locked': {
        const ready = cur.mode === 'all' ? Object.keys(cur.answers).length > 0 : cur.phase === 'locked'
        const who = cur.mode === 'all' ? 'cada uno' : nameOf(s, cur.target) || 'el concursante'
        return {
          label: ready ? 'Revelar respuesta' : `Esperando respuesta de ${who}`,
          after: ready ? 'Después: siguiente pregunta' : 'Marca la respuesta con A-D',
          run: ready ? reveal : null,
          step: 2,
          air: cur.shown ? (cur.phase === 'locked' ? 'respuesta marcada' : 'pregunta y opciones') : 'solo la pregunta (opciones ocultas)'
        }
      }
      default:
        return { label: 'Siguiente pregunta', after: 'Después: mostrar pregunta', run: ref ? loadNext : null, step: 3, air: 'respuesta revelada' }
    }
  }

  // ---------------------------------------------------------------- pintado
  function update(s: GameState): void {
    const cur = slot(s)
    const ref = bankFor(ctx, tipo)
    const info = ctx.lib.info(ref)
    const qs = ctx.lib.peek(ref)?.preguntas ?? []
    const idx = cur ? qs.findIndex((q) => questionKey(ref ?? '', q.id) === cur.key) : -1
    const all = cur ? cur.mode === 'all' : s.quiz.allMode
    const turnT = cur?.target ?? s.quiz.turn
    const modeCur = all ? 'all' : s.quiz.rebound ? 'rebound' : 'turn'

    // cabecera
    const right: Node[] = []
    if (game !== 'escalera')
      right.push(
        h('span', 'mut', { fontSize: 12 }, ['A quién va']),
        seg(
          [
            { v: 'turn', t: `Turno: ${nameOf(s, turnT) || 'nadie'}` },
            { v: 'all', t: 'Todos responden' },
            { v: 'rebound', t: 'Rebote' }
          ],
          modeCur as 'turn' | 'all' | 'rebound',
          (v) => setMode(v)
        )
      )
    header.replaceChildren(
      h('div', 'title', {}, [
        h('b', '', {}, [gameLabel(game)]),
        h('span', 'mut', { fontSize: 13 }, [`Banco «${info?.nombre ?? '-'}»${idx >= 0 ? ` · pregunta ${idx + 1} de ${qs.length}` : ''}${all && game !== 'escalera' ? ' · todos responden' : ''}`])
      ]),
      h('span', 'spacer'),
      ...right
    )

    const st = nextStep(s)
    flow.replaceChildren(...flowSteps(['Pregunta', 'Opciones', 'Revelar', 'Siguiente'], st.step), h('span', 'spacer'), onAirLabel(s, game, st.air))
    go.set(st.label, st.after, st.run, st.warm)

    // turno (en modo turno)
    turnRow.replaceChildren()
    if (!all && game !== 'escalera') {
      turnRow.append(
        h('span', 'mut', { fontSize: 12 }, ['Turno']),
        ...turnTargets(s).map((t) => {
          const b = btn(nameOf(s, t), () => send({ type: 'quizSetTurn', target: t }), `b sm ghost${sameTarget(t, turnT) ? ' on' : ''}`)
          return b
        }),
        h('span', 'mut', { fontSize: 12 }, [s.quiz.autoRotate ? '· pasa solo al siguiente con cada pregunta' : ''])
      )
    }

    // escalera
    ladderBox.replaceChildren()
    if (game === 'escalera') ladderBox.append(renderLadder(s))

    // pregunta
    qpanel.replaceChildren()
    if (!cur) {
      qpanel.append(h('div', 'mut', { fontSize: 15 }, [ref ? 'Pulsa Espacio para cargar la siguiente pregunta sin usar, o elige una en la lista.' : 'No hay bancos de este juego: créalos en Biblioteca.']))
    } else {
      const q = cur.question
      const failed = new Set(cur.attempts.filter((a) => !a.correct).map((a) => a.pick))
      const revealed = cur.phase === 'revealed'
      const text = q.tipo === 'quien' ? `“${q.enunciado}”` : q.enunciado
      qpanel.append(h('div', 'qtext', {}, [text]))
      if (q.tipo === 'quien') qpanel.append(h('div', 'mut', { fontSize: 13 }, [[`Lo dijo ${q.autor}`, q.fuente, q.fecha, q.hora].filter(Boolean).join(' · ')]))
      const opts = q.opciones.map((o, i) => {
        const who = cur.mode === 'all' ? turnTargets(s).filter((t) => cur.answers[targetKey(t)] === i).map((t) => h('span', 'nm', {}, [nameOf(s, t)])) : []
        const cls = ['op']
        if (i === q.correcta) cls.push('right')
        else if ((revealed && who.length) || failed.has(i)) cls.push('wrong')
        if (cur.phase === 'locked' && cur.picked === i && cur.mode !== 'all') cls.push('picked')
        if (cur.hidden.includes(i)) cls.push('gone')
        if (i >= cur.shown && !revealed) cls.push('hidden')
        return h('div', cls.join(' '), {}, [
          h('span', 'L', {}, [q.tipo === 'sino' ? (i === 0 ? 'S' : 'N') : LETTERS[i]]),
          h('span', 't', {}, [o]),
          ...who,
          ...(i === q.correcta ? [h('span', 'tag ok', {}, [icon(ICONS.check, 16, '#3ecf8e'), 'Correcta · solo tú'])] : [])
        ])
      })
      qpanel.append(h('div', '', { display: 'grid', gridTemplateColumns: `repeat(${q.opciones.length === 2 ? 2 : 2}, minmax(0, 1fr))`, gap: 8 }, opts))
      if (q.nota_presentador) qpanel.append(h('div', 'note', {}, [icon(ICONS.note, 16, '#9a9aa3'), h('span', '', {}, [q.nota_presentador])]))
      if (q.imagen) qpanel.append(h('div', 'mut', { fontSize: 12 }, [`Con imagen: ${q.imagen} ${cur.showImage ? '(se ve en el plató)' : '(oculta)'}`]))
      if (cur.attempts.length && cur.mode !== 'all')
        qpanel.append(
          h(
            'div',
            'mut',
            { fontSize: 12 },
            cur.attempts.map((a) => `${nameOf(s, a.target)}: ${LETTERS[a.pick] ?? '-'} ${a.correct ? 'acierta' : 'falla'}${a.delta ? ` (${a.delta > 0 ? '+' : ''}${a.delta})` : ''}. `)
          )
        )
    }

    // todos responden
    marks.replaceChildren()
    if (cur && cur.mode === 'all') {
      const targets = turnTargets(s)
      if (selIdx >= targets.length) selIdx = 0
      const n = targets.filter((t) => targetKey(t) in cur.answers).length
      const revealed = cur.phase === 'revealed'
      const cards = targets.map((t, ti) => {
        const key = targetKey(t)
        const ans = cur.answers[key]
        const card = h('div', `mark${ti === selIdx && !revealed ? ' sel' : ''}`, {}, [
          h('span', '', { fontWeight: 600, fontSize: 13 }, [nameOf(s, t), ' ', h('span', 'mut', { fontWeight: 400 }, [ans === undefined ? '· esperando' : ''])]),
          h(
            'div',
            '',
            { display: 'flex', gap: 4 },
            cur.question.opciones.map((o, i) => {
              const cls = ['lt']
              if (cur.question.tipo === 'sino') cls.push('wide')
              if (ans === i) cls.push(revealed ? (i === cur.question.correcta ? 'r-ok' : 'r-ko') : 'on')
              const b = h('button', cls.join(' '), {}, [cur.question.tipo === 'sino' ? o.toUpperCase() : LETTERS[i]])
              b.setAttribute('aria-label', `${nameOf(s, t)} marca ${LETTERS[i]}`)
              b.disabled = revealed || cur.phase === 'ready' || cur.phase === 'question' || cur.hidden.includes(i)
              b.onclick = (e) => {
                e.stopPropagation()
                send({ type: 'quizAnswerAll', key, index: ans === i ? null : i })
                if (ans !== i) ctx.cue('respondido')
              }
              return b
            })
          )
        ])
        card.onclick = () => {
          selIdx = ti
          update(S())
        }
        return card
      })
      marks.append(
        h('div', 'pnl', { padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }, [
          h('div', '', { display: 'flex', alignItems: 'center' }, [
            h('span', 'lbl', { flex: 1 }, ['Lo que ha marcado cada uno']),
            h('span', 'mut', { fontSize: 12 }, [`${n} de ${targets.length} han respondido · A-D marca al seleccionado`])
          ]),
          h('div', '', { display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, targets.length)}, minmax(0, 1fr))`, gap: 8 }, cards)
        ])
      )
    }

    // secundarios
    const t = s.quiz.timer
    const left = t.endsAt !== null ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs ?? t.seconds * 1000
    const timerLabel = !t.enabled ? `Temporizador ${t.seconds} s` : t.endsAt !== null ? `Temporizador · quedan ${Math.ceil(left / 1000)} s` : t.remainingMs !== null ? `Temporizador en pausa · ${Math.ceil(left / 1000)} s` : `Temporizador ${t.seconds} s`
    secondary.replaceChildren(
      btn(cur && cur.shown > 0 ? 'Ocultar opciones' : 'Mostrar opciones', toggleOptions, 'b ghost', 'O'),
      (timerBtn = btn(timerLabel, toggleTimer, `b ghost${t.endsAt !== null ? ' on' : ''}`, 'T')),
      ...(game !== 'escalera' ? [btn('Rebote al siguiente', () => ctx.send({ type: 'quizSetOptions', patch: { rebound: !S().quiz.rebound } }), `b ghost${s.quiz.rebound ? ' on' : ''}`, 'R')] : []),
      ...(cur?.question.imagen ? [btn(cur.showImage ? 'Ocultar imagen' : 'Mostrar imagen', () => send({ type: 'quizToggleImage' }), 'b ghost', 'I')] : []),
      ...(cur && !s.quiz.scoring.autoAward && cur.attempts.some((a) => !a.awarded && a.delta) ? [btn('Sumar puntos', () => send({ type: 'quizAward' }), 'b acc', 'P')] : []),
      h('span', 'spacer'),
      btn('Deshacer', () => ctx.send({ type: 'undo', game }), 'b ghost', 'Ctrl Z')
    )
    ;(secondary.lastChild as HTMLButtonElement).disabled = !s.runtime.undo[game]

    list.render(s, cur)
  }

  function renderLadder(s: GameState): HTMLElement {
    const l = s.quiz.ladder
    if (!l.active) {
      const targets = turnTargets(s)
      const turn = s.quiz.turn ?? targets[0]
      return h('div', 'pnl', { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, [
        h('span', 'lbl', {}, ['Escalera para']),
        ...targets.map((t) => btn(nameOf(s, t), () => send({ type: 'quizSetTurn', target: t }), `b sm ghost${sameTarget(t, turn) ? ' on' : ''}`)),
        h('span', 'spacer'),
        h('span', 'mut', { fontSize: 12 }, [`${l.levels.length} escalones · seguros en ${l.levels.map((x, i) => (x.safe ? i + 1 : 0)).filter(Boolean).join(', ') || 'ninguno'} · se cambian en Ajustes`])
      ])
    }
    const val = l.levels[Math.min(l.level, l.levels.length - 1)]?.value ?? 0
    return h('div', 'pnl', { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }, [
      h('div', '', { display: 'flex', flexDirection: 'column' }, [
        h('span', 'lbl', {}, [`Escalón ${Math.min(l.level + 1, l.levels.length)} de ${l.levels.length} · ${nameOf(s, l.target)}`]),
        h('span', '', { fontSize: 22, fontWeight: 800 }, [l.outcome ? `Final: ${formatPoints(l.outcome.prize)}` : `Juega por ${formatPoints(val)}`])
      ]),
      h('span', 'mut', { fontSize: 12 }, [`Ganado ${formatPoints(ladderBank(l.levels, l.level))} · seguro ${formatPoints(ladderSafe(l.levels, l.level))}`]),
      h('span', 'spacer'),
      ...LIFELINES.map((x) => {
        const key = x.id === '5050' ? 'F' : x.id === 'llamada' ? 'L' : 'U'
        const b = btn(x.label, () => useLifeline(x.id), `b sm${l.used[x.id] ? ' on' : ''}`, key)
        b.title = l.used[x.id] ? 'Usado: pulsa para devolverlo' : 'Sin usar'
        if (l.used[x.id]) b.style.textDecoration = 'line-through'
        b.disabled = !!l.outcome
        return b
      }),
      (() => {
        const b = btn('Plantarse', walkAway, 'b sm', 'X')
        b.disabled = !!l.outcome
        return b
      })(),
      btn('−', () => send({ type: 'ladderSetLevel', level: l.level - 1 }), 'b sm ghost'),
      btn('+', () => send({ type: 'ladderSetLevel', level: l.level + 1 }), 'b sm ghost')
    ])
  }

  function onKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.altKey || e.metaKey) return false
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const s = S()
    const cur = slot(s)
    const sino = cur?.question.tipo === 'sino'
    if (k === ' ') {
      nextStep(s).run?.()
    } else if (['a', 'b', 'c', 'd'].includes(k)) {
      pick('abcd'.indexOf(k))
    } else if (sino && (k === 's' || k === 'n')) {
      pick(k === 's' ? 0 : 1)
    } else if (k === 'o') toggleOptions()
    else if (k === 't') toggleTimer()
    else if (k === 'r' && game !== 'escalera') ctx.send({ type: 'quizSetOptions', patch: { rebound: !s.quiz.rebound } })
    else if (k === 'i') send({ type: 'quizToggleImage' })
    else if (k === 'p' && cur && !s.quiz.scoring.autoAward) send({ type: 'quizAward' })
    else if ((k === 'ArrowRight' || k === 'ArrowLeft') && cur?.mode === 'all') {
      const n = turnTargets(s).length
      selIdx = (selIdx + (k === 'ArrowRight' ? 1 : n - 1)) % n
      update(s)
    } else if (game === 'escalera' && k === 'f') useLifeline('5050')
    else if (game === 'escalera' && k === 'l') useLifeline('llamada')
    else if (game === 'escalera' && k === 'u') useLifeline('publico')
    else if (game === 'escalera' && k === 'x') walkAway()
    else return false
    return true
  }

  // el texto del temporizador se actualiza solo (sin repintar la pantalla)
  let timerBtn: HTMLButtonElement | null = null
  setInterval(() => {
    const t = S()?.quiz.timer
    if (!el.isConnected || !timerBtn || !t || t.endsAt === null) return
    timerBtn.firstChild!.textContent = `Temporizador · quedan ${Math.ceil(Math.max(0, t.endsAt - Date.now()) / 1000)} s`
  }, 250)

  return { el, update, onKey }
}

export type { Target }
