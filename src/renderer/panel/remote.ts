// Mando (móvil): el panel ejecuta sus comandos con la misma lógica que el teclado y le publica el estado.
import QRCode from 'qrcode'
import { isPlayable } from '../../shared/questions'
import { acceptRemote, buildSnapshot, cmdToActions, snapKey, type RemoteCmd, type RemoteEnvelope } from '../../shared/remote'
import type { GameId, SceneId } from '../../shared/scene'
import type { GameState } from '../../shared/types'
import { bankFor, orderedQuestions, setBankFor } from './screens/common'
import { planQuestion } from './screens/ladderPlan'
import { btn, h, openDialog, sw, type Ctx, type Screen, type ScreenId } from './ui'

interface Deps {
  ctx: Ctx
  screens: Record<ScreenId, Screen>
  dock: { fire(i: number): void; fireEffect(i: number): void }
  goScene(id: SceneId): void
}

/** Evento de teclado falso para reutilizar las teclas de cada pantalla. */
function fakeKey(key: string): KeyboardEvent {
  return {
    key,
    code: key === ' ' ? 'Space' : key === 'Tab' ? 'Tab' : '',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() {},
    target: document.body
  } as unknown as KeyboardEvent
}

export function initRemote(d: Deps): { render(s: GameState): void; openDialog(): void } {
  const { ctx } = d
  let rev = 0
  let lastLocalAt = 0
  let lastSent = ''
  let timer = 0
  // lo que haces tú en el panel manda sobre el mando
  for (const ev of ['keydown', 'mousedown']) window.addEventListener(ev, (e) => e.isTrusted && (lastLocalAt = Date.now()), true)

  const tipoOf = (g: GameId) => g
  function extras(s: GameState) {
    const g = s.liveGame
    const scr = d.screens[g]
    scr.update(s)
    const go = scr.goInfo?.(s) ?? { label: '', after: '', enabled: false }
    const pos = ctx.audio.position
    let bank = null
    if (g !== 'rosco') {
      const ref = g === 'escalera' ? null : bankFor(ctx, tipoOf(g))
      const info = ctx.lib.info(ref)
      const qs = ref ? (ctx.lib.peek(ref)?.preguntas ?? []) : []
      const cur = s.quiz.slots[g]
      bank = {
        ref,
        name: g === 'escalera' ? 'Escalera' : (info?.nombre ?? ''),
        index: cur ? qs.findIndex((q) => `${ref}::${q.id}` === cur.key) : -1,
        count: g === 'escalera' ? s.quiz.ladder.plan.length : qs.length
      }
    }
    return {
      rev,
      go,
      music: {
        track: ctx.audio.current ? ctx.audio.current.replace(/\.[^.]+$/, '') : null,
        playing: ctx.audio.playing,
        current: Math.round(pos.current),
        duration: Math.round(pos.duration),
        volume: s.audio.musicVolume
      },
      fx: s.audio.fx.map((f) => f.label),
      bank
    }
  }

  // la música, mientras suena, solo se reenvía si salta (otra posición): el mando la cuenta en local
  let musicAnchor = 0
  let lastPubAt = 0
  /** Publica el estado si ha cambiado (o siempre, si se pide). Solo con un mando conectado. */
  function publish(force = false): void {
    const s = ctx.state
    if (!s || s.runtime.remote.status !== 'ready') return
    if (!force && s.runtime.remote.connected < 1) return
    const snap = buildSnapshot(s, extras(s))
    const k = snapKey(snap)
    const anchor = snap.music.playing ? Date.now() - ctx.audio.position.current * 1000 : 0
    const jumped = snap.music.playing && Math.abs(anchor - musicAnchor) > 2000
    if (!force && k === lastSent && !jumped) return
    lastSent = k
    musicAnchor = anchor
    lastPubAt = Date.now()
    window.konk.remotePublish(snap)
  }
  // los cambios muy seguidos se juntan: como mucho un envío cada 300 ms (unos 3 por segundo)
  const MIN_GAP = 300
  const schedule = () => {
    if (timer) return
    timer = window.setTimeout(
      () => {
        timer = 0
        publish()
      },
      Math.max(120, MIN_GAP - (Date.now() - lastPubAt))
    )
  }
  // comprobación periódica (barata: no manda nada si no ha cambiado; detecta saltos de la música)
  setInterval(() => publish(), 5000)
  const prevOnChange = ctx.audio.onChange
  ctx.audio.onChange = () => {
    prevOnChange?.()
    schedule()
  }

  /** Lista de preguntas para "Elegir pregunta". */
  function sendBank(refWanted?: string): void {
    const s = ctx.state
    const g = s.liveGame
    if (g === 'rosco') return window.konk.remoteBank({ game: g, ref: null, banks: [], items: [] })
    if (g === 'escalera') {
      const cur = s.quiz.slots.escalera
      const items = s.quiz.ladder.plan.map((pk, i) => {
        const q = planQuestion(ctx, pk)
        return { ref: pk.ref, id: pk.id, n: i + 1, t: (q?.enunciado ?? '(borrada)').slice(0, 140), used: !!q?.usada, cur: !!cur && cur.key === `${pk.ref}::${pk.id}` }
      })
      return window.konk.remoteBank({ game: g, ref: null, banks: [], items })
    }
    if (refWanted) setBankFor(g, refWanted)
    const ref = bankFor(ctx, g)
    const go = () => {
      const cur = s.quiz.slots[g]
      const items = orderedQuestions(ctx, ref)
        .filter(isPlayable)
        .map((q, i) => ({ ref, id: q.id, n: i + 1, t: q.enunciado.slice(0, 140), used: !!q.usada, cur: !!cur && cur.key === `${ref}::${q.id}` }))
      const banks = ctx.lib.banksOf(g).map((b) => ({ ref: b.ref, name: b.nombre, count: b.count, used: b.used }))
      window.konk.remoteBank({ game: g, ref, banks, items })
    }
    if (ref && !ctx.lib.peek(ref)) void ctx.lib.get(ref).then(go)
    else go()
  }

  function run(cmd: RemoteCmd): void {
    const s = ctx.state
    if (cmd.t === 'hello') return publish(true)
    if (cmd.t === 'bank') return sendBank(cmd.ref)
    const acts = cmdToActions(cmd, s)
    if (acts) {
      for (const a of acts) ctx.send(a)
      return
    }
    const g = s.liveGame
    const scr = d.screens[g]
    // la pantalla del juego se pone al día antes de usar sus teclas (aunque no esté abierta en el panel)
    scr.update(s)
    const key = (k: string) => scr.onKey?.(fakeKey(k))
    switch (cmd.t) {
      case 'go':
        key(' ')
        break
      case 'pick':
        key('abcd'[cmd.i] ?? '')
        break
      case 'unpick':
        key('Backspace')
        break
      case 'secondChance':
        key('g')
        break
      case 'forgive':
        key('h')
        break
      case 'lifeline':
        key(String(cmd.i + 1))
        break
      case 'walk':
        // la confirmación se hace en el mando (mantener pulsado 1 s)
        ctx.send({ type: 'ladderWalk', game: 'escalera' })
        ctx.send({ type: 'setLiveGame', game: 'escalera', scene: true })
        ctx.cue('plantarse')
        break
      case 'scene':
        d.goScene(cmd.id)
        break
      case 'sound':
        d.dock.fire(cmd.i)
        break
      case 'effect':
        d.dock.fireEffect(cmd.i)
        break
      case 'music':
        if (cmd.op === 'toggle') ctx.audio.toggle()
        else if (cmd.op === 'next') ctx.audio.next()
        else if (cmd.op === 'prev') ctx.audio.prev()
        else if (cmd.op === 'fade') void ctx.audio.fade()
        else if (cmd.op === 'vol' && typeof cmd.v === 'number') ctx.send({ type: 'setAudio', patch: { musicVolume: Math.max(0, Math.min(1, cmd.v)) } })
        break
      case 'rosco':
        key(cmd.op === 'ok' ? 'a' : cmd.op === 'ko' ? 'f' : cmd.op === 'pasa' ? ' ' : cmd.op === 'clock' ? 'p' : 'Tab')
        break
      case 'load':
        scr.remoteLoad?.(cmd.ref, cmd.id)
        setTimeout(() => sendBank(), 300)
        break
    }
    schedule()
  }

  window.konk.onRemoteCmd((env) => {
    const e = env as RemoteEnvelope
    if (!e || !e.cmd) return
    if (!acceptRemote(e.cmd, e.rev ?? 0, rev, lastLocalAt, Date.now())) {
      // ha chocado con algo que acabas de hacer en el panel: manda el panel; el mando se pone al día
      publish(true)
      return
    }
    try {
      run(e.cmd)
    } catch (err) {
      console.error('[mando]', err)
    }
  })

  return {
    render(s: GameState) {
      rev++
      void s
      schedule()
    },
    openDialog: () => void openPairing(ctx)
  }
}

// ---------------------------------------------------------------- emparejar (QR)

export async function openPairing(ctx: Ctx): Promise<void> {
  const info = await window.konk.remoteInfo()
  const img = h('img', '', { width: 260, height: 260, borderRadius: 10, background: '#fff', display: 'block' })
  img.alt = 'Código QR del mando'
  const status = h('div', '', { fontSize: 13, fontWeight: 600 })
  const qrBox = h('div', '', { display: 'flex', justifyContent: 'center', padding: 8 }, [img])
  let lastLink = ''
  const paint = async () => {
    const s = ctx.state
    const r = s.runtime.remote
    status.replaceChildren(
      h('span', '', {
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        marginRight: 8,
        background: r.connected ? '#3ecf8e' : r.status === 'ready' ? '#e8a23a' : r.status === 'error' ? '#e5484d' : '#55555d'
      }),
      !info.hasKey
        ? 'Falta la clave de Ably (Ajustes → Programa)'
        : r.status === 'error'
          ? `Sin conexión: ${r.error ?? ''}`
          : r.connected
            ? `Mando conectado${r.connected > 1 ? ` (${r.connected})` : ''}`
            : r.status === 'ready'
              ? 'Listo: escanea el QR con el móvil'
              : 'Conectando…'
    )
    if (r.link && r.link !== lastLink) {
      lastLink = r.link
      img.src = await QRCode.toDataURL(r.link, { margin: 1, width: 520, errorCorrectionLevel: 'M', color: { dark: '#111113', light: '#ffffff' } })
    }
    qrBox.style.opacity = r.link ? '1' : '0.25'
  }
  void paint()
  const tick = window.setInterval(() => void paint(), 600)
  await openDialog(
    'Mando (móvil)',
    (close) => [
      h('span', 'mut', { fontSize: 13 }, ['Escanea el QR con la cámara del móvil: se abre la app del mando ya emparejada con esta partida.']),
      qrBox,
      status,
      h('div', '', { display: 'flex', gap: 8, flexWrap: 'wrap' }, [
        btn(
          'Copiar enlace',
          async () => {
            const l = ctx.state.runtime.remote.link
            if (!l) return ctx.toast('Aún no hay enlace')
            await navigator.clipboard.writeText(l)
            ctx.toast('Enlace copiado')
          },
          'b'
        ),
        btn(
          'Desconectar mando',
          async () => {
            await window.konk.remoteDisconnect()
            ctx.toast('Mando desconectado: hay un QR nuevo')
          },
          'b ghost'
        ),
        h('span', '', { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginLeft: 'auto' }, [
          sw(!!ctx.state.plato.showQr, () => ctx.send({ type: 'setPlato', patch: { showQr: !ctx.state.plato.showQr } }), 'QR en el plató'),
          'QR en la cabecera del plató'
        ])
      ]),
      h('div', 'dlg-actions', {}, [btn('Cerrar', close, 'b')])
    ],
    470
  )
  clearInterval(tick)
}
