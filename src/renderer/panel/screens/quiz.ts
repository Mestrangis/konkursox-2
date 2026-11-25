// Pantallas de pregunta: Tipo test, Sí o no, Escalera y ¿Quién lo dijo? (design/panel.html: Test turno / todos).
import { quienOptions } from '../../../shared/games'
import { isPlayable, questionKey, type Question } from '../../../shared/questions'
import {
  fiftyFifty,
  formatPoints,
  ladderBank,
  ladderSafe,
  LIFELINE_ICONS,
  lastMiss,
  sameTarget,
  targetKey,
  turnTargets,
  type CurrentQuestion,
  type QuizAction,
  type Target
} from '../../../shared/quiz'
import { gameLabel, type QuizGameId } from '../../../shared/scene'
import type { GameState } from '../../../shared/types'
import { askConfirm, btn, h, icon, ICONS, kbd, nameOf, sw, type Ctx, type Screen } from '../ui'
import { airBadge, askSaveFix, bankFor, flowSteps, goButton, nextUnused, onAirLabel, questionList, timerControls, toGame } from './common'
import { editLadderPlan, planQuestion } from './ladderPlan'
import { lifelineIcon } from '../../ds/lifeline'

const LETTERS = 'ABCD'

export function createQuizScreen(ctx: Ctx, game: Exclude<QuizGameId, 'estimacion'>): Screen {
  const send = (a: QuizAction) => ctx.send(toGame(game, a))
  const S = () => ctx.state
  const slot = (s: GameState = S()): CurrentQuestion | null => s.quiz.slots[game] ?? null
  const tipo = game
  let selIdx = 0 // "todos responden": concursante seleccionado

  const list = questionList(ctx, tipo, (q, ref) => load(q, ref))
  const planCol = h('div', 'pnl qlist')
  const go = goButton()
  const showAllBtn = btn('Mostrar todas', () => send({ type: 'quizShowAll', now: Date.now() }), 'b ghost')
  showAllBtn.title = 'Mostrar todas las opciones a la vez'
  const goRow = h('div', '', { display: 'flex', gap: 8, alignItems: 'stretch' }, [go.el, showAllBtn])
  go.el.style.flex = '1'
  const timer = timerControls(ctx)
  const header = h('div', 'head')
  const flow = h('div', '', {
    display: 'flex',
    gap: 18,
    alignItems: 'center',
    flexWrap: 'wrap'
  })
  const qpanel = h('div', 'pnl', {
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14
  })
  const marks = h('div')
  const missRow = h('div')
  const ladderBox = h('div')
  const secondary = h('div', 'secrow')
  const turnRow = h('div', 'secrow')

  void turnRow
  const el = h('div', 'screen gscreen', {}, [
    header,
    h('div', 'gbody', {}, [
      h('div', 'gcol', {}, [h('div', 'gscroll', {}, [flow, ladderBox, qpanel, missRow, marks]), h('div', 'gfoot', {}, [goRow, secondary])]),
      game === 'escalera' ? planCol : list.el
    ])
  ])

  // ---------------------------------------------------------------- acciones
  function load(q: Question, ref: string): void {
    const s = S()
    let question = q
    if (q.tipo === 'quien') {
      question = quienOptions(
        q,
        s.people.map((p) => p.name)
      )
      if (question.opciones.length < 2 || question.correcta < 0) {
        ctx.toast('Esta frase no tiene opciones suficientes: añade opciones o personas del grupo')
        return
      }
    }
    // sin turno elegido, empieza el primero
    if (!s.quiz.turn && game !== 'escalera')
      ctx.send({
        type: 'quizSetTurn',
        target: turnTargets(s)[0] ?? null,
        game
      })
    // no se marca como usada hasta revelarla
    ctx.send({
      type: 'quizLoad',
      key: questionKey(ref, q.id),
      bankFile: ref,
      question,
      now: Date.now(),
      stage: true,
      game
    })
    selIdx = 0
  }

  function loadNext(): void {
    const ref = bankFor(ctx, tipo)
    if (game === 'escalera') {
      const l = S().quiz.ladder
      const pick = l.plan[l.level]
      const q = pick ? planQuestion(ctx, pick) : null
      if (!pick || !q || !isPlayable(q)) {
        ctx.toast(`La escalera no tiene pregunta para el escalón ${l.level + 1}: prepárala en "Preguntas de la escalera"`)
        return void editLadderPlan(ctx)
      }
      return load(q, pick.ref)
    }
    const q = nextUnused(ctx, ref, slot()?.key)
    if (!q || !ref) return ctx.toast('No quedan preguntas sin usar en este banco')
    load(q, ref)
  }

  function showNext(): void {
    send({ type: 'quizShowNext', now: Date.now() })
    ctx.cue('opcion')
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
    // se marca como usada al revelarla (y se guarda en el banco)
    ctx.lib.markUsed(cur.bankFile, [cur.question.id], true)
    ctx.cue(good ? 'correcto' : 'error')
  }

  /** Cambiar en directo la opción correcta (antes o después de revelar) y ofrecer guardarlo en el banco. */
  function changeCorrect(i: number): void {
    const cur = slot()
    if (!cur || i === cur.question.correcta) return
    send({ type: 'quizSetCorrect', index: i })
    const text = cur.question.opciones[i]
    void askSaveFix(ctx, cur, (q) =>
      q.tipo === 'quien'
        ? { ...q, autor: text }
        : {
            ...q,
            correcta: q.opciones.indexOf(text) >= 0 ? q.opciones.indexOf(text) : i
          }
    )
  }

  function secondChance(): void {
    if (!lastMiss(slot())) return
    ctx.audio.stopSfx()
    send({ type: 'quizSecondChance', now: Date.now() })
  }
  function forgiveMiss(key?: string): void {
    const cur = slot()
    if (!cur) return
    if (key === undefined && !lastMiss(cur)) return
    ctx.audio.stopSfx()
    send({ type: 'quizForgive', now: Date.now(), key })
    if (!S().quiz.bribe.enabled) ctx.cue('correcto')
  }

  function useLifeline(id: string): void {
    const s = S()
    const l = s.quiz.ladder
    if (!l.active || l.outcome) return
    const cur = slot(s)
    const def = s.quiz.lifelines.find((x) => x.id === id)
    if (!def) return
    if (def.kind === 'fifty' && !l.used[id])
      send({
        type: 'ladderSetLifeline',
        id,
        used: true,
        hide: cur ? fiftyFifty(cur.question, cur.hidden) : []
      })
    else send({ type: 'ladderSetLifeline', id, used: !l.used[id], hide: [] })
  }

  async function walkAway(): Promise<void> {
    const l = S().quiz.ladder
    if (!l.active || l.outcome) return
    if (!(await askConfirm(`¿Se planta con ${formatPoints(ladderBank(l.levels, l.level))} puntos?`, '', 'Se planta'))) return
    ctx.audio.stopSfx()
    send({ type: 'ladderWalk' })
    ctx.send({ type: 'setLiveGame', game: 'escalera', scene: true })
    ctx.cue('plantarse')
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
  function nextStep(s: GameState): {
    label: string
    after: string
    run: (() => void) | null
    warm?: boolean
    step: number
    air: string
  } {
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
          step: 4,
          air: 'respuesta revelada'
        }
      return {
        label: 'Terminar la escalera',
        after: 'Después: empezar otra',
        run: () => send({ type: 'ladderStop' }),
        step: 4,
        air: 'pantalla final de la escalera'
      }
    }
    if (!cur)
      return {
        label: 'Cargar pregunta',
        after: 'Después: mostrar pregunta',
        run: ref ? loadNext : null,
        step: 0,
        air: 'nada de esta pregunta'
      }
    switch (cur.phase) {
      case 'ready':
        return {
          label: 'Mostrar pregunta',
          after: 'Después: mostrar opciones',
          run: showQuestion,
          step: 0,
          air: 'nada de esta pregunta'
        }
      case 'question':
        return {
          label: `Mostrar opción ${optName(cur, 0)}`,
          after: 'Una a una con Espacio · o "Mostrar todas"',
          run: () => showNext(),
          step: 1,
          air: 'solo la pregunta'
        }
      case 'options': {
        const n = cur.question.opciones.length
        if (cur.shown < n)
          return {
            label: `Mostrar opción ${optName(cur, cur.shown)}`,
            after: `Van ${cur.shown} de ${n} · ya puedes marcar las que se ven`,
            run: () => showNext(),
            step: 1,
            air: `pregunta y ${cur.shown} de ${n} opciones`
          }
        if (cur.mode === 'all') {
          const n = Object.keys(cur.answers).length
          return {
            label: n ? 'Revelar respuesta' : 'Marca lo que dice cada uno',
            after: n ? `Han respondido ${n} de ${turnTargets(s).length} · después: siguiente` : 'A-D marca al seleccionado y salta al siguiente',
            run: n ? reveal : null,
            step: n ? 3 : 2,
            air: n ? 'opciones; cada placa dice que ya ha respondido' : 'pregunta y opciones'
          }
        }
        const who = nameOf(s, cur.target) || 'el concursante'
        return {
          label: `Marca la respuesta de ${who}`,
          after: 'A-D o clic en la opción: queda en naranja hasta revelar',
          run: null,
          step: 2,
          air: cur.shown ? 'pregunta y opciones' : 'solo la pregunta (opciones ocultas)'
        }
      }
      case 'rebound': {
        const to = nameOf(s, cur.reboundTo ?? null) || 'el siguiente'
        return {
          label: `Rebote a ${to}`,
          after: 'Sin desvelar la correcta · o perdona el fallo con G / H',
          run: () => send({ type: 'quizRebound' }),
          step: 2,
          air: 'opciones con la fallada tachada'
        }
      }
      case 'locked':
        return {
          label: 'Revelar respuesta',
          after: `Marcada la ${cur.question.tipo === 'sino' ? cur.question.opciones[cur.picked ?? 0] : LETTERS[cur.picked ?? 0]} · puedes cambiarla antes de revelar`,
          run: reveal,
          step: 3,
          air: 'respuesta marcada en naranja'
        }
      default:
        return {
          label: 'Siguiente pregunta',
          after: 'Después: mostrar pregunta',
          run: ref ? loadNext : null,
          step: 4,
          air: 'respuesta revelada'
        }
    }
  }

  /** Letra (o Sí / No) de la opción i. */
  function optName(cur: CurrentQuestion, i: number): string {
    return cur.question.tipo === 'sino' ? (cur.question.opciones[i] ?? '') : (LETTERS[i] ?? '')
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
    // con un solo concursante no hay a quién elegir
    const single = turnTargets(s).length <= 1
    if (game !== 'escalera') {
      // turno: un botón por concursante + "Todos"; al lado, el rebote
      const targets = turnTargets(s)
      const turnSeg = h('div', 'seg', {}, [
        ...targets.map((t) => {
          const on = !all && sameTarget(t, turnT)
          const b = h('button', on ? 'on' : '', {}, [nameOf(s, t)])
          b.title = `Responde ${nameOf(s, t)}`
          b.disabled = single
          b.onclick = () => {
            if (S().quiz.allMode || slot()?.mode === 'all') setMode(S().quiz.rebound ? 'rebound' : 'turn')
            send({ type: 'quizSetTurn', target: t })
          }
          return b
        }),
        (() => {
          const b = h('button', all ? 'on' : '', {}, ['Todos'])
          b.title = 'Todos responden a la vez'
          b.disabled = single
          b.onclick = () => setMode('all')
          return b
        })()
      ])
      const reb = h(
        'span',
        '',
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12.5,
          opacity: single || all ? 0.45 : 1
        },
        [
          sw(
            s.quiz.rebound,
            () =>
              !single &&
              ctx.send({
                type: 'quizSetOptions',
                patch: { rebound: !S().quiz.rebound }
              }),
            'Rebote al fallar'
          ),
          'Rebote'
        ]
      )
      reb.title = 'Si falla, el botón principal ofrece "Rebote a…" al siguiente sin desvelar la correcta'
      right.push(turnSeg, reb)
      void modeCur
    }
    header.replaceChildren(
      h('div', 'title', {}, [
        h('b', '', { display: 'flex', alignItems: 'center', gap: 10 }, [gameLabel(game), airBadge(ctx, s, game)]),
        h('span', 'mut', { fontSize: 13 }, [
          game === 'escalera'
            ? `${s.quiz.ladder.plan.length} preguntas preparadas (de ${new Set(s.quiz.ladder.plan.map((p) => p.ref)).size} bancos)`
            : `Banco «${info?.nombre ?? '-'}»${idx >= 0 ? ` · pregunta ${idx + 1} de ${qs.length}` : ''}${all ? ' · todos responden' : ''}`
        ])
      ]),
      h('span', 'spacer'),
      ...right
    )

    const st = nextStep(s)
    flow.replaceChildren(...flowSteps(['Pregunta', 'Opciones', 'Marcar', 'Revelar', 'Siguiente'], st.step), h('span', 'spacer'), onAirLabel(s, game, st.air))
    go.set(st.label, st.after, st.run, st.warm)
    showAllBtn.style.display = cur && (cur.phase === 'question' || cur.phase === 'options') && cur.shown < cur.question.opciones.length ? '' : 'none'

    // turno (en modo turno)
    turnRow.replaceChildren()
    if (false) {
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
      qpanel.append(
        h('div', 'mut', { fontSize: 15 }, [ref ? 'Pulsa Espacio para cargar la siguiente pregunta sin usar, o elige una en la lista.' : 'No hay bancos de este juego: créalos en Biblioteca.'])
      )
    } else {
      const q = cur.question
      const failed = new Set(cur.attempts.filter((a) => !a.correct).map((a) => a.pick))
      const revealed = cur.phase === 'revealed'
      const text = q.tipo === 'quien' ? `“${q.enunciado}”` : q.enunciado
      qpanel.append(h('div', 'qtext', {}, [text]))
      if (q.tipo === 'quien') qpanel.append(h('div', 'mut', { fontSize: 13 }, [[`Lo dijo ${q.autor}`, q.fuente, q.fecha, q.hora].filter(Boolean).join(' · ')]))
      const opts = q.opciones.map((o, i) => {
        const who =
          cur.mode === 'all'
            ? turnTargets(s)
                .filter((t) => cur.answers[targetKey(t)] === i)
                .map((t) => h('span', 'nm', {}, [nameOf(s, t)]))
            : []
        const cls = ['op']
        if (i === q.correcta) cls.push('right')
        else if ((revealed && who.length) || failed.has(i)) cls.push('wrong')
        if (cur.phase === 'locked' && cur.picked === i && cur.mode !== 'all') cls.push('picked')
        if (cur.hidden.includes(i)) cls.push('gone')
        if (i >= cur.shown && !revealed) cls.push('hidden')
        const card = h(
          'div',
          cls.join(' '),
          {
            cursor: cur.phase === 'options' || cur.phase === 'locked' ? 'pointer' : 'default'
          },
          [
            h('span', 'L', {}, [q.tipo === 'sino' ? (i === 0 ? 'S' : 'N') : LETTERS[i]]),
            h('span', 't', {}, [o]),
            ...who,
            ...(cur.phase === 'locked' && cur.picked === i && cur.mode !== 'all' ? [h('span', 'tag', { color: '#f4b552' }, ['Marcada'])] : []),
            ...(i === q.correcta ? [h('span', 'tag ok', {}, [icon(ICONS.check, 16, '#3ecf8e'), 'Correcta · solo tú'])] : [])
          ]
        )
        card.title = (cur.phase === 'options' || cur.phase === 'locked' ? 'Clic para marcar esta respuesta · ' : '') + 'Clic derecho: hacer que esta sea la correcta'
        card.oncontextmenu = (e) => {
          e.preventDefault()
          changeCorrect(i)
        }
        if (i !== q.correcta) {
          const mk = h('button', 'mkc', {}, ['Hacer correcta'])
          mk.title = 'Cambiar la respuesta correcta (también después de revelar)'
          mk.onclick = (e) => {
            e.stopPropagation()
            changeCorrect(i)
          }
          card.append(mk)
        }
        card.onclick = () => {
          if (cur.phase === 'locked' && cur.picked === i && cur.mode !== 'all') send({ type: 'quizUnpick' })
          else pick(i)
        }
        return card
      })
      qpanel.append(
        h(
          'div',
          '',
          {
            display: 'grid',
            gridTemplateColumns: `repeat(${q.opciones.length === 2 ? 2 : 2}, minmax(0, 1fr))`,
            gap: 8
          },
          opts
        )
      )
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

    // fallos que se pueden perdonar
    missRow.replaceChildren()
    const miss = lastMiss(cur)
    const failedAll = cur && cur.mode === 'all' && cur.phase === 'revealed' ? cur.attempts.filter((a) => !a.correct && !a.forgiven) : []
    if (cur && (miss || failedAll.length)) {
      const inLadder = cur.ladderLevel !== null
      const L = (pk: number) => (cur.question.tipo === 'sino' ? (cur.question.opciones[pk] ?? '') : (LETTERS[pk] ?? ''))
      missRow.append(
        h('div', 'pnl missrow', {}, [
          h('span', '', { fontWeight: 700 }, [miss ? `Ha fallado ${nameOf(s, miss.target)} (${L(miss.pick)})` : `Han fallado: ${failedAll.map((a) => nameOf(s, a.target)).join(', ')}`]),
          ...(miss
            ? [btn('Segunda oportunidad', secondChance, 'b sm', 'G'), btn(inLadder ? 'Seguir igualmente (sube)' : 'Seguir igualmente', () => forgiveMiss(), 'b sm', 'H')]
            : failedAll.map((a) => btn(`Dar por buena a ${nameOf(s, a.target)}`, () => forgiveMiss(a.target ? targetKey(a.target) : undefined), 'b sm'))),
          h('span', 'spacer'),
          ...(inLadder
            ? []
            : [
                h(
                  'span',
                  '',
                  {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12
                  },
                  [
                    sw(
                      s.quiz.forgiveScores,
                      () =>
                        ctx.send({
                          type: 'quizSetForgive',
                          patch: { forgiveScores: !S().quiz.forgiveScores }
                        }),
                      'Seguir igualmente suma los puntos'
                    ),
                    'Suma puntos'
                  ]
                )
              ]),
          h('span', '', { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }, [
            sw(
              s.quiz.bribe.enabled,
              () =>
                ctx.send({
                  type: 'quizSetForgive',
                  patch: { bribe: !S().quiz.bribe.enabled }
                }),
              'Rótulo de soborno'
            ),
            'Soborno'
          ])
        ])
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
                send({
                  type: 'quizAnswerAll',
                  key,
                  index: ans === i ? null : i
                })
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
        h(
          'div',
          'pnl',
          {
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          },
          [
            h('div', '', { display: 'flex', alignItems: 'center' }, [
              h('span', 'lbl', { flex: 1 }, ['Lo que ha marcado cada uno']),
              h('span', 'mut', { fontSize: 12 }, [`${n} de ${targets.length} han respondido · A-D marca al seleccionado`])
            ]),
            h(
              'div',
              '',
              {
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(4, targets.length)}, minmax(0, 1fr))`,
                gap: 8
              },
              cards
            )
          ]
        )
      )
    }

    // secundarios
    secondary.replaceChildren(
      btn(cur && cur.shown > 0 ? 'Ocultar opciones' : 'Mostrar opciones', toggleOptions, 'b ghost', 'O'),
      timer.el,

      ...(cur?.question.imagen
        ? [
            btn(cur.showImage ? 'Ocultar imagen' : 'Mostrar imagen', () => send({ type: 'quizToggleImage' }), 'b ghost', 'I'),
            btn(
              'Imagen a Multimedia',
              () =>
                ctx.send({
                  type: 'mediaShow',
                  item: {
                    kind: 'image',
                    src: `konk-media://imagenes/${encodeURIComponent(cur.question.imagen!)}`,
                    title: cur.question.enunciado
                  },
                  now: Date.now()
                }),
              'b ghost'
            )
          ]
        : []),
      ...(cur && !s.quiz.scoring.autoAward && cur.attempts.some((a) => !a.awarded && a.delta) ? [btn('Sumar puntos', () => send({ type: 'quizAward' }), 'b acc', 'P')] : []),
      h('span', 'spacer'),
      btn('Deshacer', () => ctx.send({ type: 'undo', game }), 'b ghost', 'Ctrl Z')
    )
    ;(secondary.lastChild as HTMLButtonElement).disabled = !s.runtime.undo[game]

    timer.update(s)
    if (game === 'escalera') renderPlan(s, cur)
    else list.render(s, cur)
  }

  /** Columna derecha de la escalera: sus preguntas en orden. */
  function renderPlan(s: GameState, cur: CurrentQuestion | null): void {
    const l = s.quiz.ladder
    const items = h('div', 'items')
    l.plan.forEach((pk, i) => {
      const q = planQuestion(ctx, pk)
      const isCur = !!cur && cur.key === questionKey(pk.ref, pk.id)
      const it = h('div', `ql${isCur ? ' cur' : q?.usada ? ' used' : ''}`, {}, [h('span', 'n', {}, [String(i + 1)]), h('span', 'qx', {}, [q?.enunciado ?? '(pregunta borrada)'])])
      it.title = 'Cargar esta pregunta'
      it.onclick = () => q && load(q, pk.ref)
      items.append(it)
    })
    if (!l.plan.length)
      items.append(h('div', 'mut', { padding: 10, fontSize: 13 }, ['Sin preguntas. Prepáralas con el botón de arriba: de cualquier banco de test o sí o no, o un banco de escalera guardado.']))
    planCol.replaceChildren(
      h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [h('span', 'lbl', { flex: 1 }, [`Preguntas de la escalera · ${l.plan.length}/${l.levels.length}`])]),
      btn('Preparar preguntas…', () => void editLadderPlan(ctx), 'b sm acc'),
      items,
      h('span', 'mut', { fontSize: 11 }, ['Escalón 1 arriba. Pulsa una para cargarla.'])
    )
  }

  function renderLadder(s: GameState): HTMLElement {
    const l = s.quiz.ladder
    if (!l.active) {
      const targets = turnTargets(s)
      const turn = s.quiz.turn ?? targets[0]
      return h(
        'div',
        'pnl',
        {
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap'
        },
        [
          h('span', 'lbl', {}, ['Escalera para']),
          ...targets.map((t) => btn(nameOf(s, t), () => send({ type: 'quizSetTurn', target: t }), `b sm ghost${sameTarget(t, turn) ? ' on' : ''}`)),
          h('span', 'spacer'),
          h('span', 'mut', { fontSize: 12 }, [
            `${l.levels.length} escalones · seguros en ${
              l.levels
                .map((x, i) => (x.safe ? i + 1 : 0))
                .filter(Boolean)
                .join(', ') || 'ninguno'
            } · se cambian en Ajustes`
          ])
        ]
      )
    }
    const val = l.levels[Math.min(l.level, l.levels.length - 1)]?.value ?? 0
    // escalón y lo que se juega en grande; comodines como botones grandes con icono; −/+ discretos
    const lifes = s.quiz.lifelines.map((x, i) => {
      const used = !!l.used[x.id]
      const b = h('button', `lfb${used ? ' used' : ''}`, {}, [
        // los iconos de texto (50:50) ya dicen el nombre
        ...(LIFELINE_ICONS[x.icon]?.text ? [] : [h('span', 'lfi', {}, [lifelineIcon(x, 22, used ? '#6b6b73' : '#f0dca6')])]),
        h('span', '', {}, [x.name]),
        kbd(String(i + 1))
      ])
      b.title = used ? 'Usado: pulsa para devolverlo' : `Usar ${x.name} (${i + 1})`
      b.onclick = () => useLifeline(x.id)
      b.disabled = !!l.outcome
      return b
    })
    const walk = h('button', 'lfb walk', {}, [h('span', '', {}, ['Plantarse']), kbd('X')])
    walk.onclick = () => void walkAway()
    walk.disabled = !!l.outcome
    const minus = btn('−', () => send({ type: 'ladderSetLevel', level: l.level - 1 }), 'mini')
    minus.title = 'Bajar un escalón (corregir)'
    const plus = btn('+', () => send({ type: 'ladderSetLevel', level: l.level + 1 }), 'mini')
    plus.title = 'Subir un escalón (corregir)'
    return h('div', 'pnl ladderbox', {}, [
      h('div', 'lstep', {}, [
        h('span', 'lbl', {}, [`${nameOf(s, l.target)}`]),
        h('div', '', { display: 'flex', alignItems: 'baseline', gap: 8 }, [
          h('span', 'lnum', {}, [`Escalón ${Math.min(l.level + 1, l.levels.length)}`]),
          h('span', 'mut', { fontSize: 13 }, [`de ${l.levels.length}`]),
          h('span', '', { display: 'inline-flex', gap: 2, marginLeft: 4 }, [minus, plus])
        ]),
        h('span', 'lprize', {}, [l.outcome ? `Final: ${formatPoints(l.outcome.prize)}` : `Juega por ${formatPoints(val)}`]),
        h('span', 'mut', { fontSize: 12 }, [`Ganado ${formatPoints(ladderBank(l.levels, l.level))} · seguro ${formatPoints(ladderSafe(l.levels, l.level))}`])
      ]),
      h('div', 'lfrow', {}, [...lifes, walk])
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
    } else if (k === 'Backspace' && cur?.phase === 'locked') send({ type: 'quizUnpick' })
    else if (k === 'g') secondChance()
    else if (k === 'h') forgiveMiss()
    else if (k === 'o') toggleOptions()
    else if (k === 't') timer.toggleShow()
    else if (k === 'y') timer.togglePlay()
    else if (k === 'r' && game !== 'escalera') ctx.send({ type: 'quizSetOptions', patch: { rebound: !s.quiz.rebound } })
    else if (k === 'i') send({ type: 'quizToggleImage' })
    else if (k === 'p' && cur && !s.quiz.scoring.autoAward) send({ type: 'quizAward' })
    else if ((k === 'ArrowRight' || k === 'ArrowLeft') && cur?.mode === 'all') {
      const n = turnTargets(s).length
      selIdx = (selIdx + (k === 'ArrowRight' ? 1 : n - 1)) % n
      update(s)
    } else if (game === 'escalera' && /^[1-5]$/.test(k) && s.quiz.lifelines[Number(k) - 1]) useLifeline(s.quiz.lifelines[Number(k) - 1].id)
    else if (game === 'escalera' && k === 'x') void walkAway()
    else return false
    return true
  }

  return { el, update, onKey }
}

export type { Target }
