// KONKURSOX · Mando. El programa (portátil) es la única fuente de verdad: aquí solo se pinta su
// instantánea y se mandan comandos. Conexión por Ably con un token que solo vale para el canal de la partida.
'use strict'

// ---------------------------------------------------------------- utilidades
function h(tag, cls, style, kids) {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (style) for (const [k, v] of Object.entries(style)) el.style[k] = typeof v === 'number' && !/^(opacity|zIndex|fontWeight|flex|lineHeight)$/.test(k) ? v + 'px' : v
  for (const k of kids || []) if (k !== null && k !== undefined && k !== false) el.append(k)
  return el
}
const add = (el, ...kids) => el.append(...kids.filter((k) => k !== null && k !== undefined && k !== false))
const SVGNS = 'http://www.w3.org/2000/svg'
function icon(d, size, fill, vb) {
  const s = document.createElementNS(SVGNS, 'svg')
  s.setAttribute('width', size)
  s.setAttribute('height', size)
  s.setAttribute('viewBox', vb || '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(SVGNS, 'path')
  p.setAttribute('d', d)
  p.setAttribute('fill', fill || '#9a9aa3')
  s.append(p)
  return s
}
const fmt = (n) => (n === null || n === undefined || !isFinite(n) ? '—' : Math.round(n).toLocaleString('es-ES'))
const mmss = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : String(t)
}
const buzz = (ms) => {
  try {
    navigator.vibrate && navigator.vibrate(ms || 12)
  } catch (e) {
    /* sin vibración */
  }
}
function tap(el, fn, strong) {
  el.addEventListener('click', (e) => {
    e.preventDefault()
    if (el.disabled) return
    buzz(strong ? 22 : 10)
    fn(e)
  })
  return el
}
/** Pulsación larga (para "cambiar correcta" y el plano). */
function longPress(el, fn) {
  let t = 0
  let fired = false
  const start = () => {
    fired = false
    t = setTimeout(() => {
      fired = true
      buzz(30)
      fn()
    }, 550)
  }
  const stop = () => clearTimeout(t)
  el.addEventListener('pointerdown', start)
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointerleave', stop)
  el.addEventListener('pointercancel', stop)
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  el.addEventListener(
    'click',
    (e) => {
      if (fired) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    },
    true
  )
  return el
}
let toastTimer = 0
function toast(msg) {
  document.querySelector('.toast')?.remove()
  const t = h('div', 'toast ui', null, [msg])
  document.body.append(t)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.remove(), 2600)
}

const I = {
  play: 'M7 4v16l13-8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  prev: 'M5 4h3v16H5zM20 4v16L9 12z',
  next: 'M16 4h3v16h-3zM4 4v16l11-8z',
  person: 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM3 21a9 7 0 0 1 18 0z',
  music: 'M9 3h12v13.5a3.5 3.5 0 1 1-2-3.2V7h-8v11.5A3.5 3.5 0 1 1 9 15.3z',
  vol: 'M3 9h4l5-5v16l-5-5H3zM15 8a5 5 0 0 1 0 8z',
  caret: 'M4 8h16l-8 9z',
  shuffle: 'M16 3h5v5l-1.8-1.8L5.4 20 4 18.6 17.8 4.8zM4 5.4 5.4 4l5 5L9 10.4zM14.6 13.4l1.4-1.4 3.2 3.2L21 13.4V21h-7.6l1.8-1.8z',
  quote: 'M0 20V11C0 4.5 3.5.8 10 0v4C6.8 4.8 5.3 6.8 5.2 10H10v10zm16 0V11c0-6.5 3.5-10.2 10-11v4c-3.2.8-4.7 2.8-4.8 6H26v10z'
}
const SCENES = [
  ['cabecera', 'Cabecera', 'M12 2l10 10-10 10L2 12z'],
  ['camaras', 'Cámaras', 'M3 6h12a2 2 0 0 1 2 2v1.5L22 6v12l-5-3.5V16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
  ['juego', 'Juego', 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z'],
  ['marcador', 'Marcador', 'M3 13h5v8H3zM9.5 3h5v18h-5zM16 9h5v12h-5z'],
  ['final', 'Clasif.', 'M8 6h8v15H8zM1 11h6v10H1zM17 14h6v7h-6z'],
  ['multimedia', 'Media', 'M2 4h20v16H2zM9 8v8l7-4z']
]
const TABS = [
  ['juego', 'Juego', 'M7 4v16l13-8z'],
  ['preguntas', 'Preguntas', 'M3 4h4v4H3zM9 5h12v2H9zM3 10h4v4H3zM9 11h12v2H9zM3 16h4v4H3zM9 17h12v2H9z'],
  ['sonidos', 'Sonidos', 'M3 9h4l5-5v16l-5-5H3zM15 8a5 5 0 0 1 0 8zM17 4.5a9 9 0 0 1 0 15v-2.3a7 7 0 0 0 0-10.4z'],
  ['marcador', 'Marcador', 'M3 13h5v8H3zM9.5 3h5v18h-5zM16 9h5v12h-5z']
]
const PLANOS = [
  ['juego', 'Juego'],
  ['marcos', 'Cámaras con marcos'],
  ['datos', 'Cámaras + datos'],
  ['limpio', 'Cámaras limpias'],
  ['sincam', 'Sin cámaras']
]
const GAMES = [
  ['test', 'Tipo test'],
  ['sino', 'Sí o no'],
  ['escalera', 'Escalera'],
  ['estimacion', 'Estimación'],
  ['quien', '¿Quién lo dijo?'],
  ['rosco', 'Rosco']
]
const gameLabel = (g) => (GAMES.find((x) => x[0] === g) || ['', g])[1]
const L = 'ABCD'

// ---------------------------------------------------------------- estado local
const S = {
  pair: null, // { c, t, exp, at }
  conn: 'off', // off | connecting | connected | failed
  connErr: '',
  snap: null,
  offset: 0, // reloj del programa - reloj del móvil
  snapAt: 0,
  bank: null,
  tab: 'juego',
  sheet: null, // función que pinta la hoja abierta
  step: 10,
  sndTab: 'sonidos',
  hit: -1,
  qSel: null,
  search: '',
  hideUsed: false,
  estSel: 0,
  estBuf: {},
  bye: false
}
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k))
    } catch (e) {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch (e) {
      /* sin almacenamiento */
    }
  }
}
const deviceId =
  store.get('konk.device') ||
  (() => {
    const id = Math.random().toString(36).slice(2, 10)
    store.set('konk.device', id)
    return id
  })()

// ---------------------------------------------------------------- emparejar (enlace del QR) y conexión
function readPairFromUrl() {
  const q = new URLSearchParams(location.hash.slice(1))
  const c = q.get('c')
  const t = q.get('t')
  if (c && t) {
    S.pair = { c, t, at: Date.now() }
    store.set('konk.pair', S.pair)
    // el token no se queda a la vista en la barra de direcciones
    history.replaceState(null, '', location.pathname + location.search)
    return true
  }
  return false
}

let rt = null
let ch = null
function connect() {
  if (!S.pair || !window.Ably) return
  disconnect()
  S.conn = 'connecting'
  S.connErr = ''
  S.bye = false
  render()
  rt = new Ably.Realtime({
    clientId: 'mando',
    echoMessages: false,
    authCallback: (_p, cb) => cb(null, S.pair.t)
  })
  rt.connection.on((st) => {
    if (st.current === 'connected') {
      S.conn = 'connected'
      ch.presence.enter({ device: deviceId }).catch(() => {})
      ch.publish('hello', { device: deviceId }).catch(() => {})
      keepAwake()
    } else if (st.current === 'failed' || st.current === 'suspended') {
      S.conn = 'failed'
      const code = st.reason && st.reason.code
      S.connErr = code === 40142 || code === 40171 || code === 40101 ? 'El enlace ha caducado: vuelve a escanear el QR del portátil.' : (st.reason && st.reason.message) || 'Sin conexión'
    } else if (st.current === 'disconnected' || st.current === 'connecting') S.conn = 'connecting'
    render()
  })
  ch = rt.channels.get(S.pair.c)
  ch.subscribe('state', (m) => {
    S.snap = m.data
    S.snapAt = Date.now()
    S.offset = m.data.now - Date.now()
    render()
  })
  ch.subscribe('bank', (m) => {
    S.bank = m.data
    if (S.tab === 'preguntas') render()
  })
  ch.subscribe('token', (m) => {
    // el programa renueva el token mientras está abierto: se guarda para reconectar más tarde
    if (m.data && m.data.token) {
      S.pair = { ...S.pair, t: m.data.token, exp: m.data.expires }
      store.set('konk.pair', S.pair)
    }
  })
  ch.subscribe('bye', () => {
    S.bye = true
    forget()
    toast('El portátil ha desconectado este mando')
  })
}
function disconnect() {
  try {
    rt && rt.close()
  } catch (e) {
    /* ya cerrada */
  }
  rt = null
  ch = null
}
function forget() {
  disconnect()
  S.pair = null
  S.snap = null
  S.conn = 'off'
  store.set('konk.pair', null)
  releaseAwake()
  render()
}

function send(cmd) {
  if (!ch || S.conn !== 'connected') return toast('Sin conexión con el portátil')
  ch.publish('cmd', { cmd, rev: S.snap ? S.snap.rev : 0, from: deviceId }).catch(() => toast('No se pudo enviar'))
}

// pantalla siempre encendida mientras está conectado
let wake = null
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen')
      wake.addEventListener('release', () => (wake = null))
    }
  } catch (e) {
    /* el navegador no lo permite */
  }
}
function releaseAwake() {
  try {
    wake && wake.release()
  } catch (e) {
    /* nada */
  }
  wake = null
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (S.conn === 'connected') keepAwake()
    else if (S.pair && S.conn !== 'connecting') connect()
  }
})

// ---------------------------------------------------------------- pintado
const app = document.getElementById('app')
const snapNow = () => Date.now() + S.offset

function render() {
  const keep = document.querySelector('main')?.scrollTop || 0
  if (!S.pair) {
    app.replaceChildren(pairScreen())
    closeSheet(true)
    return
  }
  const main = h('main', 'ui')
  const tab = S.tab
  if (!S.snap) main.append(waiting())
  else if (tab === 'juego') gameScreen(main)
  else if (tab === 'preguntas') questionsScreen(main)
  else if (tab === 'sonidos') soundsScreen(main)
  else scoreScreen(main)
  app.replaceChildren(topBar(), main, tabBar())
  if (tab === 'preguntas') main.scrollTop = keep
  if (S.sheet) paintSheet()
}

function waiting() {
  const msg = S.conn === 'failed' ? S.connErr : S.conn === 'connected' ? 'Conectado. Esperando al portátil…' : 'Conectando con el portátil…'
  return h('div', '', { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' }, [
    h('div', 'mut', { fontSize: 15, lineHeight: 1.45, maxWidth: 300 }, [msg]),
    S.conn === 'failed' ? tap(h('button', 'b acc', { minHeight: 48 }, ['Reintentar']), connect) : null,
    S.conn === 'failed' ? tap(h('button', 'b ghost', { minHeight: 44 }, ['Olvidar este emparejamiento']), forget) : null
  ])
}

// ---- barra de escenas (MTop)
function topBar() {
  const s = S.snap
  const ok = S.conn === 'connected'
  const plano = s && s.plano ? (PLANOS.find((p) => p[0] === s.plano) || ['', s.plano])[1] : null
  const chip = tap(h('button', 'planchip', null, [plano ? 'Plano: ' + plano : 'Plano', icon(I.caret, 10, '#9a9aa3')]), () => openSheet(planoSheet))
  return h('div', 'mtop ui', null, [
    h('div', 'mstat', null, [
      h('span', 'dot', { background: ok ? '#3ecf8e' : S.conn === 'failed' ? '#e5484d' : '#e8a23a' }),
      h('span', '', { fontSize: 12, fontWeight: 600 }, [ok ? 'Conectado' : S.conn === 'failed' ? 'Sin conexión' : 'Conectando…']),
      h('span', 'mut', { fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, ['· portátil']),
      h('span', 'spacer'),
      chip,
      h('span', 'lbl air', { fontSize: 10 }, ['En el aire'])
    ]),
    h(
      'div',
      'scenes',
      null,
      SCENES.map(([id, t, d]) => {
        const live = s && s.scene === id
        const b = h('button', 'sb' + (live ? ' live' : ''), null, [icon(d, 18, '#9a9aa3'), t])
        b.setAttribute('aria-pressed', String(!!live))
        tap(b, () => send({ t: 'scene', id }), true)
        // pulsación larga en Cámaras o Juego: plano y quién sale
        if (id === 'camaras' || id === 'juego') longPress(b, () => openSheet(planoSheet))
        return b
      })
    )
  ])
}

// ---- barra inferior (MTabs); deslizar hacia arriba abre los sonidos rápidos
function tabBar() {
  const nav = h(
    'nav',
    'mtabs ui',
    null,
    TABS.map(([id, t, d]) => {
      const b = h('button', 'tb' + (S.tab === id ? ' on' : ''), null, [h('span', 'pill', null, [icon(d, 20, '#8a8a93')]), t])
      tap(b, () => {
        S.tab = id
        if (id === 'preguntas') send({ t: 'bank' })
        render()
      })
      return b
    })
  )
  let y0 = null
  nav.addEventListener('touchstart', (e) => (y0 = e.touches[0].clientY), { passive: true })
  nav.addEventListener(
    'touchmove',
    (e) => {
      if (y0 !== null && y0 - e.touches[0].clientY > 40) {
        y0 = null
        openSheet(quickSoundsSheet)
      }
    },
    { passive: true }
  )
  return nav
}

// ---- piezas comunes del juego
function header(title, sub, withTurn) {
  const s = S.snap
  const g = s.game
  const tgt = g && g.kind === 'quiz' ? (g.mode === 'all' ? 'Todos' : g.target) : ''
  return h('div', '', { display: 'flex', alignItems: 'center', gap: 8, minHeight: 30 }, [
    h('span', '', { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }, [title]),
    h('span', 'mut', { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [sub]),
    h('span', 'spacer'),
    withTurn ? tap(h('button', 'turn', null, [icon(I.person, 12, '#8fb0ff'), 'Turno: ' + (tgt || '—')]), () => openSheet(turnSheet)) : null
  ])
}
function goButton(extraStyle) {
  const go = S.snap.go
  // las pistas de teclado del panel no pintan nada en el móvil
  const after = (go.after || '').replace('A-D o clic en la opción: ', '').replace(/ con [A-Z] \/ [A-Z]\b/, '')
  const label = go.label || '—'
  const b = h('button', 'next', extraStyle, [icon(I.play, 24, '#fff'), h('span', '', { textAlign: 'left', fontSize: label.length > 24 ? '18px' : '' }, [label, h('small', null, null, [after])])])
  b.disabled = !go.enabled
  return tap(b, () => send({ t: 'go' }), true)
}
function scoreRow(name) {
  const p = S.snap.players.find((x) => x.name === name) || S.snap.players.find((x) => x.turn)
  if (!p) return null
  return h('div', 'ptr', null, [
    h('span', '', { fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [p.name]),
    h('span', '', { fontSize: 22, fontWeight: 800, marginRight: 6 }, [fmt(p.score)]),
    tap(h('button', 'pb', null, ['−' + S.step]), () => send({ t: 'score', key: p.key, d: -S.step })),
    tap(h('button', 'pb', null, ['+' + S.step]), () => send({ t: 'score', key: p.key, d: S.step }), true)
  ])
}
function subLine() {
  const b = S.snap.bank
  return b && b.count ? `${b.index >= 0 ? b.index + 1 : '—'}/${b.count}${b.name ? ' · ' + b.name : ''}` : ''
}
/** Tras un fallo: segunda oportunidad, seguir igualmente y el soborno. */
function missRow(g) {
  if (!g.miss) return null
  return h('div', 'missrow', null, [
    h('span', '', { fontWeight: 700, flex: '1 1 100%' }, [`Ha fallado ${g.miss.name} (${letterOf(g, g.miss.pick)})`]),
    tap(h('button', 'b', { minHeight: 40 }, ['Segunda oportunidad']), () => send({ t: 'secondChance' }), true),
    tap(h('button', 'b', { minHeight: 40 }, ['Seguir igualmente']), () => send({ t: 'forgive' }), true),
    h('span', 'spacer'),
    h('span', '', { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }, [tap(h('button', 'sw' + (S.snap.bribe ? ' on' : '')), () => send({ t: 'bribe' })), 'Soborno'])
  ])
}
const letterOf = (g, i) => (g.tipo === 'sino' ? (g.options[i] || {}).t || '' : L[i] || '')
/** Pulsación larga en una opción: hacerla la correcta. */
function changeCorrect(g, i) {
  if (i === g.correcta) return
  openSheet((sheet, close) => {
    add(
      sheet,
      h('div', '', { fontSize: 16, fontWeight: 700 }, [`¿La correcta es la ${letterOf(g, i)}?`]),
      h('div', 'mut', { fontSize: 13 }, [`«${g.options[i].t}». Si ya está revelada, el plató y los puntos se recalculan. Solo para esta partida (para guardarlo en el banco, hazlo en el panel).`]),
      tap(
        h('button', 'next', { minHeight: 60 }, ['Hacerla correcta']),
        () => {
          send({ t: 'setCorrect', i })
          close()
        },
        true
      ),
      tap(h('button', 'b ghost', { minHeight: 44 }, ['Cancelar']), close)
    )
  })
}
const canMark = (g, i) => (g.phase === 'options' || g.phase === 'locked') && g.mode !== 'all' && !['hidden', 'gone', 'wrong'].includes(g.options[i].st)
const markCls = (g, i) => {
  if (g.phase === 'revealed') {
    const last = g.picked !== null ? g.picked : g.miss ? g.miss.pick : -1
    if (last !== i) return ''
    return i === g.correcta ? 'r-ok' : 'r-ko'
  }
  return g.phase === 'locked' && g.picked === i ? 'on' : ''
}

// ---- pantalla Juego
function gameScreen(m) {
  const s = S.snap
  const g = s.game
  const lg = s.liveGame
  if (!g) {
    add(
      m,
      header(gameLabel(lg), s.scene === 'juego' ? 'en el aire' : '', false),
      h('div', 'mut', { fontSize: 15, lineHeight: 1.45, padding: '20px 0' }, [
        lg === 'rosco' ? 'El rosco se prepara en el panel (roscos y concursantes). Después, empiézalo desde aquí.' : 'No hay pregunta cargada. Pulsa el botón o elige una en Preguntas.'
      ]),
      tap(h('button', 'b', { minHeight: 44 }, ['Cambiar de juego…']), () => openSheet(planoSheet)),
      h('span', 'spacer'),
      goButton()
    )
    return
  }
  if (g.kind === 'rosco') return roscoScreen(m, g)
  if (g.kind === 'estimacion') return estimationScreen(m, g)
  if (g.ladder) return ladderScreen(m, g)
  if (g.tipo === 'sino') return sinoScreen(m, g)
  if (g.tipo === 'quien') return quienScreen(m, g)
  return testScreen(m, g)
}

function optionList(g, compact) {
  return h(
    'div',
    '',
    { display: 'flex', flexDirection: 'column', gap: 6 },
    g.options.map((o, i) => {
      const cls = ['mo']
      if (o.st === 'right') cls.push('right')
      if (o.st === 'wrong') cls.push('wrong')
      if (o.st === 'hidden') cls.push('hid')
      if (o.st === 'gone') cls.push('gone')
      const row = h('div', cls.join(' '), compact ? { minHeight: 38 } : null, [
        h('span', 'L', null, [L[i]]),
        h('span', '', { flex: 1 }, [o.t]),
        o.st === 'right' ? h('span', 'priv', null, ['CORRECTA · SOLO TÚ']) : null,
        o.st === 'hidden' ? h('span', 'mut', { fontSize: 11 }, ['aún no']) : null,
        o.st === 'gone' ? h('span', 'mut', { fontSize: 11 }, ['quitada']) : null
      ])
      longPress(row, () => changeCorrect(g, i))
      return row
    })
  )
}
function marksGrid(g) {
  if (g.mode === 'all') return allMarks(g)
  return h(
    'div',
    '',
    { display: 'grid', gridTemplateColumns: `repeat(${g.options.length}, minmax(0, 1fr))`, gap: 8 },
    g.options.map((o, i) => {
      const b = h('button', 'mk ' + markCls(g, i), null, [L[i]])
      b.disabled = !canMark(g, i) && !markCls(g, i)
      b.setAttribute('aria-label', `${g.target} responde ${L[i]}`)
      return tap(b, () => send(g.phase === 'locked' && g.picked === i ? { t: 'unpick' } : { t: 'pick', i }), true)
    })
  )
}
/** "Todos responden": una fila por concursante. */
function allMarks(g) {
  const s = S.snap
  return h(
    'div',
    '',
    { display: 'flex', flexDirection: 'column', gap: 6 },
    s.players.map((p) => {
      const a = g.answers.find((x) => x.key === p.key)
      return h('div', '', { display: 'flex', alignItems: 'center', gap: 6 }, [
        h('span', '', { width: 84, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [p.name]),
        ...g.options.map((o, i) => {
          const on = a && a.pick === i
          const b = h('button', 'mk' + (on ? (g.phase === 'revealed' ? (i === g.correcta ? ' r-ok' : ' r-ko') : ' on') : ''), { flex: 1, height: 44, fontSize: 16 }, [g.tipo === 'sino' ? o.t : L[i]])
          b.disabled = g.phase === 'revealed' || g.phase === 'ready' || g.phase === 'question' || o.st === 'hidden' || o.st === 'gone'
          return tap(b, () => send({ t: 'answer', key: p.key, i: on ? null : i }))
        })
      ])
    })
  )
}

function testScreen(m, g) {
  add(
    m,
    header('Tipo test', subLine(), true),
    h('div', 'qt', null, [g.text]),
    optionList(g),
    g.note ? noteBox(g.note) : null,
    missRow(g),
    h('span', 'spacer'),
    g.mode === 'all' ? null : h('span', 'tiny', null, ['Marca lo que responde ' + g.target]),
    marksGrid(g),
    goButton(),
    g.mode === 'all' ? null : scoreRow(g.target)
  )
}
const noteBox = (t) => h('div', '', { display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#19191c', fontSize: 13, lineHeight: 1.45, color: '#c9c9d0' }, [t])

function sinoScreen(m, g) {
  const right = g.options[g.correcta]
  add(
    m,
    header('Sí o no', subLine(), true),
    h('div', 'qt', { fontSize: 22 }, [g.text]),
    longPress(
      h('div', 'mo right', { justifyContent: 'space-between' }, [h('span', null, null, ['Respuesta: ', h('b', null, null, [right ? right.t : '—'])]), h('span', 'priv', null, ['SOLO TÚ'])]),
      () => changeCorrect(g, g.correcta === 0 ? 1 : 0)
    ),
    g.note ? noteBox(g.note) : null,
    missRow(g),
    h('span', 'spacer'),
    g.mode === 'all' ? allMarks(g) : h('span', 'tiny', null, ['Marca lo que responde ' + g.target]),
    g.mode === 'all'
      ? null
      : h(
          'div',
          '',
          { display: 'flex', gap: 10 },
          g.options.map((o, i) => {
            const b = h('button', 'yn ' + markCls(g, i), null, [o.t.toUpperCase()])
            b.disabled = !canMark(g, i) && !markCls(g, i)
            return tap(b, () => send(g.phase === 'locked' && g.picked === i ? { t: 'unpick' } : { t: 'pick', i }), true)
          })
        ),
    goButton(),
    g.mode === 'all' ? null : scoreRow(g.target)
  )
}

function quienScreen(m, g) {
  add(
    m,
    header('¿Quién lo dijo?', subLine(), true),
    h('div', '', { padding: '18px 18px 16px', borderRadius: 14, background: '#19191c', border: '1px solid #2a2a2f', display: 'flex', flexDirection: 'column', gap: 12 }, [
      icon(I.quote, 26, '#4a4a52', '0 0 26 20'),
      h('div', '', { fontSize: 21, fontWeight: 600, lineHeight: 1.35 }, [g.text]),
      g.source ? h('div', 'mut', { fontSize: 12 }, [g.source]) : null
    ]),
    h('div', 'mo right', { justifyContent: 'space-between' }, [
      h('span', null, null, ['Lo escribió ', h('b', null, null, [g.author || (g.options[g.correcta] || {}).t || '—'])]),
      h('span', 'priv', null, ['SOLO TÚ'])
    ]),
    missRow(g),
    h('span', 'spacer'),
    g.mode === 'all' ? allMarks(g) : h('span', 'tiny', null, ['Marca lo que responde ' + g.target]),
    g.mode === 'all'
      ? null
      : h(
          'div',
          '',
          { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
          g.options.map((o, i) => {
            const cls = ['nb']
            if (i === g.correcta) cls.push('right')
            const mc = markCls(g, i)
            if (mc) cls.push(mc)
            const b = h('button', cls.join(' '), null, [h('span', 'L', null, [L[i]]), o.t])
            b.disabled = !canMark(g, i) && !mc
            longPress(b, () => changeCorrect(g, i))
            return tap(b, () => send(g.phase === 'locked' && g.picked === i ? { t: 'unpick' } : { t: 'pick', i }), true)
          })
        ),
    goButton(),
    g.mode === 'all' ? null : scoreRow(g.target)
  )
}

function ladderScreen(m, g) {
  const l = g.ladder
  const bank = (lv) => (lv > 0 ? (l.levels[Math.min(lv, l.levels.length) - 1] || { v: 0 }).v : 0)
  let safe = 0
  for (let i = 0; i < Math.min(l.level, l.levels.length); i++) if (l.levels[i].safe) safe = l.levels[i].v
  const val = (l.levels[Math.min(l.level, l.levels.length - 1)] || { v: 0 }).v
  const walk = h('button', 'b', { width: 96, minHeight: 78, borderRadius: 16, flexDirection: 'column', gap: 2, fontSize: 14, flex: 'none' }, [
    'Se planta',
    h('span', 'mut', { fontSize: 11 }, ['con ' + fmt(bank(l.level))])
  ])
  walk.disabled = !!l.outcome
  add(
    m,
    h('div', '', { display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }, [
      h('span', '', { fontSize: 13, fontWeight: 700 }, ['Escalera']),
      h('span', 'mut', { fontSize: 12 }, [l.target + ' juega']),
      h('span', 'spacer'),
      h('span', '', { fontSize: 12 }, [h('span', 'mut', null, ['Asegurado ']), h('b', null, null, [fmt(safe)])])
    ]),
    h(
      'div',
      '',
      { display: 'grid', gridTemplateColumns: `repeat(${l.levels.length}, minmax(0, 1fr))`, gap: 3 },
      l.levels.map((x, i) => h('span', 'rg' + (i < l.level ? ' pass' : i === l.level && !l.outcome ? ' cur' : '') + (x.safe ? ' safe' : ''), null, [String(i + 1)]))
    ),
    h('div', '', { display: 'flex', alignItems: 'baseline', gap: 8 }, [
      h('span', 'mut', { fontSize: 12 }, [l.outcome ? 'Final' : `Escalón ${Math.min(l.level + 1, l.levels.length)} · en juego`]),
      h('span', '', { fontSize: 20, fontWeight: 800 }, [fmt(l.outcome ? l.prize : val)]),
      l.outcome ? null : h('span', 'mut', { fontSize: 12 }, ['· si falla se queda con ' + fmt(safe)])
    ]),
    g.text ? h('div', 'qt', { fontSize: 17 }, [g.text]) : null,
    g.text ? optionList(g, true) : null,
    h(
      'div',
      '',
      { display: 'flex', gap: 6 },
      l.lifelines.map((x, i) => {
        const b = h('button', 'lf' + (x.used ? ' used' : ''), null, [x.name])
        b.disabled = !!l.outcome
        return tap(b, () => send({ t: 'lifeline', i }), true)
      })
    ),
    missRow(g),
    h('span', 'spacer'),
    g.text ? marksGrid(g) : null,
    h('div', '', { display: 'flex', gap: 8 }, [goButton({ flex: '1' }), tap(walk, () => send({ t: 'walk' }), true)])
  )
}

function estimationScreen(m, g) {
  const s = S.snap
  const rows = g.rows
  if (S.estQ !== g.text) {
    S.estQ = g.text
    S.estBuf = {}
    S.estSel = 0
  }
  if (S.estSel >= rows.length) S.estSel = 0
  const sel = rows[S.estSel]
  const cur = (r) => (S.estBuf[r.key] !== undefined ? S.estBuf[r.key] : r.value === null ? '' : String(Math.round(r.value)))
  const put = (fn) => {
    if (!sel || g.revealed) return
    const v = fn(cur(sel)).slice(0, 12)
    S.estBuf[sel.key] = v
    clearTimeout(estTimer)
    estTimer = setTimeout(() => send({ t: 'guess', key: sel.key, value: v === '' ? null : Number(v) }), 250)
    render()
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => ({ t: d, cls: '', run: () => put((x) => x + d) }))
  keys.push({ t: '⌫', cls: 'ok', run: () => put((x) => x.slice(0, -1)) })
  keys.push({ t: '0', cls: '', run: () => put((x) => (x ? x + '0' : x)) })
  keys.push({ t: 'Siguiente', cls: 'ok', run: () => ((S.estSel = (S.estSel + 1) % rows.length), render()) })
  add(
    m,
    h('div', '', { display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }, [
      h('span', '', { fontSize: 13, fontWeight: 700 }, ['Estimación']),
      h('span', 'mut', { fontSize: 12 }, [subLine() + ' · todos responden'])
    ]),
    h('div', 'qt', { fontSize: 17 }, [g.text]),
    h('div', 'mo right', { justifyContent: 'space-between', minHeight: 36 }, [
      h('span', null, null, ['Respuesta: ', h('b', null, null, [fmt(g.value) + (g.unit ? ' ' + g.unit : '')])]),
      h('span', 'priv', null, ['SOLO TÚ'])
    ]),
    h(
      'div',
      '',
      { display: 'flex', flexDirection: 'column', gap: 6 },
      rows.map((r, i) => {
        const v = cur(r)
        return tap(
          h('div', 'er' + (!g.revealed && S.estSel === i ? ' sel' : ''), null, [
            h('span', '', { fontWeight: 600 }, [r.name]),
            h('span', 'mut', { fontSize: 12 }, [g.revealed ? (r.best ? 'más cerca' : r.diff !== null ? 'a ' + fmt(r.diff) : 'sin cifra') : S.estSel === i ? 'escribiendo' : '']),
            h('span', 'v', { color: g.revealed && r.best ? '#3ecf8e' : '#ececef' }, [v ? fmt(Number(v)) : '—'])
          ]),
          () => ((S.estSel = i), render())
        )
      })
    ),
    h('span', 'spacer'),
    g.revealed
      ? null
      : h(
          'div',
          '',
          { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 },
          keys.map((k) => tap(h('button', 'ky ' + k.cls, null, [k.t]), k.run))
        ),
    goButton({ minHeight: 64 })
  )
  void s
}
let estTimer = 0

function roscoScreen(m, g) {
  const p = g.players[g.turn]
  const now = snapNow()
  const left = (pl) => (pl.endsAt !== null ? Math.max(0, pl.endsAt - now) : pl.remainingMs)
  const running = p && p.endsAt !== null
  const letters = p ? p.letters.split('') : []
  add(
    m,
    h(
      'div',
      '',
      { display: 'flex', gap: 8 },
      g.players.map((pl, i) =>
        tap(
          h('button', 'pc ' + (i === g.turn ? 'on' : 'wait'), null, [
            h('div', '', { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, flex: 1, minWidth: 0 }, [
              h('span', '', { fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }, [pl.name]),
              h('span', '', { fontSize: 11 }, [
                h('span', 'ok', null, [pl.ok + ' aciertos']),
                ' · ',
                h('span', '', { color: '#ff8a3d' }, [pl.ko + ' fallos']),
                ' · ',
                h('span', 'mut', null, [pl.timeUp ? 'sin tiempo' : i === g.turn ? (pl.endsAt !== null ? 'turno' : 'en pausa') : pl.done ? 'terminado' : 'espera'])
              ])
            ]),
            h('span', 'rtime', { fontSize: 20, fontWeight: 800 }, [mmss(left(pl))])
          ]),
          () => i !== g.turn && send({ t: 'rosco', op: 'swap' })
        )
      )
    ),
    p
      ? h(
          'div',
          '',
          { display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: 3 },
          letters.map((ch2, i) => {
            const cur = i === p.current && !p.done
            const el = h('span', 'ld s-' + (cur ? 'cur' : p.status[i]), null, [ch2])
            if (p.status[i] === 'k') tap(el, () => openSheet((sheet, close) => fixSheet(sheet, close, g.turn, i, ch2)))
            return el
          })
        )
      : null,
    g.lastKo
      ? h('div', 'missrow', null, [
          h('span', '', { fontWeight: 700, flex: '1 1 100%' }, [`Fallo de ${g.players[g.lastKo.player].name} en la ${g.lastKo.letra}`]),
          tap(h('button', 'b', { minHeight: 40 }, ['Contar como acierto']), () => send({ t: 'roscoFix', player: g.lastKo.player, index: g.lastKo.index, status: 'ok' }), true),
          tap(h('button', 'b', { minHeight: 40 }, ['Pasapalabra']), () => send({ t: 'roscoFix', player: g.lastKo.player, index: g.lastKo.index, status: 'pasa' })),
          h('span', 'spacer'),
          h('span', '', { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }, [tap(h('button', 'sw' + (S.snap.bribe ? ' on' : '')), () => send({ t: 'bribe' })), 'Soborno'])
        ])
      : null,
    g.def
      ? h('div', '', { padding: 16, borderRadius: 14, background: '#19191c', border: '1px solid #2a2a2f', display: 'flex', flexDirection: 'column', gap: 10 }, [
          h('div', '', { display: 'flex', alignItems: 'center', gap: 12 }, [
            h('span', '', { width: 54, height: 54, borderRadius: 12, background: '#111113', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800 }, [
              g.def.letra
            ]),
            h('span', 'mut', { fontSize: 13 }, [(g.def.modo === 'contiene' ? 'Contiene la ' : 'Empieza por ') + g.def.letra]),
            h('span', 'spacer'),
            tap(h('button', 'b', { minHeight: 40 }, [running ? 'Pausar reloj' : 'Seguir reloj']), () => send({ t: 'rosco', op: 'clock' }))
          ]),
          h('div', '', { fontSize: 18, fontWeight: 600, lineHeight: 1.35 }, [g.def.definicion]),
          h('div', '', { display: 'flex', alignItems: 'baseline', gap: 10 }, [
            h('span', 'ok', { fontSize: 30, fontWeight: 800, letterSpacing: '0.02em' }, [g.def.respuesta.toUpperCase()]),
            h('span', 'priv', { color: '#9a9aa3' }, ['SOLO TÚ'])
          ])
        ])
      : h('div', 'mut', { fontSize: 15, padding: '10px 0' }, [g.finished ? 'Rosco terminado.' : p && p.timeUp ? `Tiempo agotado para ${p.name}.` : '']),
    h('span', 'spacer'),
    S.snap.go.enabled ? goButton({ minHeight: 64 }) : null,
    g.players.length === 2 && !g.finished ? tap(h('button', 'b', { minHeight: 44 }, ['Cambiar turno']), () => send({ t: 'rosco', op: 'swap' })) : null,
    h('div', '', { display: 'flex', gap: 8 }, [
      roscoBtn('Acierto', 'se queda el turno', '#22a06b', 'ok', { flex: '1', height: 108 }, p),
      roscoBtn('Fallo', g.players.length === 2 ? 'pasa el turno' : 'para el reloj', '#e8742a', 'ko', { flex: '1', height: 108 }, p)
    ]),
    roscoBtn('Pasapalabra', g.players.length === 2 ? 'pasa el turno' : 'para el reloj', '#2e2e34', 'pasa', { width: '100%', height: 80, border: '1px solid #44444c' }, p)
  )
}
function roscoBtn(t, sub, bg, op, style, p) {
  const b = h('button', 'g3', Object.assign({ background: bg }, style), [t, h('small', null, null, [sub])])
  b.disabled = !p || p.done || S.snap.game.finished
  return tap(b, () => send({ t: 'rosco', op }), true)
}
function fixSheet(sheet, close, player, index, letra) {
  add(
    sheet,
    h('div', '', { fontSize: 16, fontWeight: 700 }, [`Fallo en la ${letra}`]),
    tap(
      h('button', 'next', { minHeight: 60 }, ['Contar como acierto']),
      () => {
        send({ t: 'roscoFix', player, index, status: 'ok' })
        close()
      },
      true
    ),
    tap(h('button', 'b', { minHeight: 48 }, ['Dejarla en pasapalabra']), () => {
      send({ t: 'roscoFix', player, index, status: 'pasa' })
      close()
    }),
    tap(h('button', 'b ghost', { minHeight: 44 }, ['Cancelar']), close)
  )
}

// ---- pantalla Elegir pregunta
function questionsScreen(m) {
  const s = S.snap
  const b = S.bank
  if (s.liveGame === 'rosco') {
    add(m, h('div', 'mut', { fontSize: 15, padding: '20px 0', lineHeight: 1.45 }, ['El rosco no tiene preguntas que elegir: sus letras salen del rosco elegido en el panel.']))
    return
  }
  const sel = (b && b.items.find((x) => S.qSel && x.id === S.qSel.id && x.ref === S.qSel.ref)) || null
  const cur = b ? b.items.find((x) => x.cur) : null
  const list = b ? b.items.filter((x) => (!S.hideUsed || !x.used || x.cur) && (!S.search || x.t.toLowerCase().includes(S.search.toLowerCase()))) : []
  const bankName = s.liveGame === 'escalera' ? 'Escalera · preguntas preparadas' : `${gameLabel(s.liveGame)} · ${((b && b.banks.find((x) => x.ref === b.ref)) || {}).name || '—'}`
  const search = h('input', 'inp', { height: 44, fontSize: 15 })
  search.placeholder = 'Buscar pregunta'
  search.value = S.search
  search.addEventListener('input', () => {
    S.search = search.value
    render()
    const i2 = document.querySelector('main .inp')
    if (i2) {
      i2.focus()
      i2.setSelectionRange(i2.value.length, i2.value.length)
    }
  })
  const load = h('button', 'next sticky', { minHeight: 64 }, [
    h('span', '', { textAlign: 'center' }, [
      sel ? `Cargar la pregunta ${sel.n}` : 'Elige una pregunta',
      h('small', null, null, [sel ? (cur && cur.id === sel.id ? 'Ya es la pregunta en curso' : cur && !cur.used ? `Sustituye a la ${cur.n}, que sigue sin usar` : 'Se carga sin enseñarla') : ''])
    ])
  ])
  load.disabled = !sel
  add(
    m,
    h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
      tap(
        h('button', 'b', { flex: 1, justifyContent: 'space-between', minHeight: 44, fontSize: 14, minWidth: 0, overflow: 'hidden' }, [
          h('span', '', { overflow: 'hidden', textOverflow: 'ellipsis' }, [bankName]),
          icon(I.caret, 14, '#9a9aa3')
        ]),
        () => b && b.banks.length && openSheet(bankSheet)
      )
    ]),
    search,
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }, [
      h('span', 'mut', { flex: 1 }, [b ? `${b.items.length} preguntas · ${b.items.filter((x) => x.used).length} usadas` : 'Cargando…']),
      'Ocultar usadas',
      tap(h('button', 'sw' + (S.hideUsed ? ' on' : '')), () => ((S.hideUsed = !S.hideUsed), render()))
    ]),
    h(
      'div',
      '',
      { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 },
      list.map((q) =>
        tap(
          h('div', 'qr' + (sel && sel.id === q.id ? ' sel' : q.cur ? ' cur' : q.used ? ' used' : ''), null, [
            h('span', 'n', null, [String(q.n)]),
            h('span', '', { flex: 1 }, [q.t]),
            q.cur ? h('span', 'tag', { background: '#2a2a30', color: '#ececef' }, ['EN CURSO']) : null
          ]),
          () => ((S.qSel = { ref: q.ref, id: q.id }), render())
        )
      )
    ),
    tap(
      load,
      () => {
        if (!sel) return
        send({ t: 'load', ref: sel.ref, id: sel.id })
        S.qSel = null
        S.tab = 'juego'
        render()
      },
      true
    )
  )
}
function bankSheet(sheet, close) {
  const b = S.bank
  add(
    sheet,
    h('div', '', { fontSize: 16, fontWeight: 700 }, ['Banco de preguntas']),
    ...b.banks.map((x) =>
      tap(
        h('button', 'qr' + (x.ref === b.ref ? ' sel' : ''), { border: 0, background: x.ref === b.ref ? '#1b2132' : 'transparent', color: '#ececef', width: '100%' }, [
          h('span', '', { flex: 1, textAlign: 'left' }, [x.name]),
          h('span', 'mut', { fontSize: 12 }, [`${x.count - x.used} sin usar`])
        ]),
        () => {
          send({ t: 'bank', ref: x.ref })
          close()
        }
      )
    )
  )
}

// ---- pantalla Sonidos (con pestaña Efectos)
function musicCard(compact) {
  const mu = S.snap.music
  const cur = mu.playing ? Math.min(mu.duration || 0, mu.current + (Date.now() - S.snapAt) / 1000) : mu.current
  const pct = mu.duration ? Math.min(100, (cur / mu.duration) * 100) : 0
  const vol = h('input', '', { flex: 1, minWidth: 0, accentColor: '#ececef' })
  vol.type = 'range'
  vol.min = '0'
  vol.max = '100'
  vol.value = String(Math.round(mu.volume * 100))
  vol.setAttribute('aria-label', 'Volumen de la música')
  vol.addEventListener('change', () => send({ t: 'music', op: 'vol', v: Number(vol.value) / 100 }))
  const playBtn = tap(h('button', 'ib', { width: compact ? 44 : 52, height: compact ? 44 : 52, background: '#ececef' }, [icon(mu.playing ? I.pause : I.play, 22, '#111113')]), () =>
    send({ t: 'music', op: 'toggle' })
  )
  if (compact)
    return h('div', '', { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: '#141416' }, [
      playBtn,
      h('div', '', { flex: 1, minWidth: 0 }, [
        h('div', '', { fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [mu.track || 'Sin música']),
        h('div', '', { height: 4, borderRadius: 2, background: '#2e2e34', marginTop: 6 }, [h('div', '', { width: pct + '%', height: '100%', borderRadius: 2, background: '#ececef' })])
      ]),
      tap(h('button', 'b', { minHeight: 40 }, ['Fundido']), () => send({ t: 'music', op: 'fade' }))
    ])
  return h('div', '', { padding: '12px 14px', borderRadius: 14, background: '#19191c', border: '1px solid #2a2a2f', display: 'flex', flexDirection: 'column', gap: 10 }, [
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [
      h('div', '', { width: 40, height: 40, borderRadius: 8, background: '#26314d', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }, [icon(I.music, 18, '#8fb0ff')]),
      h('div', '', { flex: 1, minWidth: 0 }, [
        h('div', '', { fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, [mu.track || 'Sin música']),
        h('div', 'mut', { fontSize: 12 }, [mu.track ? (mu.playing ? 'Sonando' : 'En pausa') : 'Elige pista con ▶ o siguiente'])
      ])
    ]),
    h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
      h('span', 'mut', { fontSize: 11 }, [mmss(cur * 1000)]),
      h('div', '', { flex: 1, height: 6, borderRadius: 3, background: '#2e2e34', position: 'relative' }, [h('div', '', { width: pct + '%', height: '100%', borderRadius: 3, background: '#ececef' })]),
      h('span', 'mut', { fontSize: 11 }, [mu.duration ? mmss(mu.duration * 1000) : '—'])
    ]),
    h('div', '', { display: 'flex', alignItems: 'center', gap: 4 }, [
      tap(h('button', 'ib', null, [icon(I.prev, 20, '#ececef')]), () => send({ t: 'music', op: 'prev' })),
      playBtn,
      tap(h('button', 'ib', null, [icon(I.next, 20, '#ececef')]), () => send({ t: 'music', op: 'next' })),
      tap(h('button', 'b', { minHeight: 40, marginLeft: 4 }, ['Fundido']), () => send({ t: 'music', op: 'fade' })),
      icon(I.vol, 18, '#9a9aa3'),
      vol
    ])
  ])
}
function pads(big) {
  const s = S.snap
  return h(
    'div',
    '',
    { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
    s.fx.map((t, i) =>
      tap(
        h('button', 'pd' + (S.hit === i ? ' hit' : ''), big ? null : { height: 76 }, [t, h('small', null, null, [S.hit === i ? 'Sonando' : 'Num ' + (i + 1)])]),
        () => {
          send({ t: 'sound', i })
          S.hit = i
          render()
          setTimeout(() => {
            if (S.hit === i) {
              S.hit = -1
              render()
            }
          }, 1500)
        },
        true
      )
    )
  )
}
function effectsGrid() {
  const s = S.snap
  return h('div', '', { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }, [
    ...s.effects.map((e, i) => tap(h('button', 'vx' + (e.on ? ' on' : ''), { height: 52 }, [e.label + (e.hold ? '' : ' ·')]), () => send({ t: 'effect', i }), true)),
    tap(h('button', 'vx', { height: 52, color: '#9a9aa3' }, ['Quitar todos']), () => send({ t: 'effectsOff' }))
  ])
}
function soundsScreen(m) {
  const s = S.snap
  const seg = h('div', 'seg', { display: 'flex' }, [
    tap(h('button', S.sndTab === 'sonidos' ? 'on' : '', null, ['Sonidos']), () => ((S.sndTab = 'sonidos'), render())),
    tap(h('button', S.sndTab === 'efectos' ? 'on' : '', null, ['Efectos']), () => ((S.sndTab = 'efectos'), render()))
  ])
  if (S.sndTab === 'efectos') {
    add(
      m,
      seg,
      h('span', 'tiny', null, ['Efectos en el plató']),
      effectsGrid(),
      h('div', 'mut', { fontSize: 12, lineHeight: 1.4 }, ['Los que se mantienen (Tensión, Apagón, Focos, Latido, Foco) se apagan pulsándolos otra vez. Los marcados con · son golpes.'])
    )
    return
  }
  add(
    m,
    seg,
    musicCard(false),
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }, [
      h('div', '', { flex: 1 }, [h('div', '', { fontWeight: 600, fontSize: 13 }, ['Sonidos automáticos del juego']), h('div', 'mut', { fontSize: 11 }, ['Correcto y error suenan solos al revelar'])]),
      tap(h('button', 'sw' + (s.autoSounds ? ' on' : '')), () => send({ t: 'auto' }))
    ]),
    h('span', 'spacer'),
    h('span', 'tiny', null, ['Sonidos']),
    pads(true)
  )
}
function quickSoundsSheet(sheet, close) {
  add(
    sheet,
    h('div', '', { display: 'flex', alignItems: 'center', gap: 8 }, [
      h('span', '', { fontSize: 16, fontWeight: 700, flex: 1 }, ['Sonidos rápidos']),
      tap(h('a', '', { fontSize: 13 }, ['Ver todo']), () => {
        close()
        S.tab = 'sonidos'
        render()
      }),
      tap(h('button', 'b', { minHeight: 36 }, ['Cerrar']), close)
    ]),
    musicCard(true),
    pads(false),
    h('span', 'mut', { fontSize: 11, textAlign: 'center' }, ['Desliza hacia arriba desde la barra inferior en cualquier pantalla para abrirla'])
  )
}

// ---- pantalla Marcador
function scoreScreen(m) {
  const s = S.snap
  add(
    m,
    h('div', '', { display: 'flex', alignItems: 'center', gap: 6 }, [
      h('span', '', { fontSize: 16, fontWeight: 700, flex: 1 }, ['Marcador']),
      h('span', 'mut', { fontSize: 12, marginRight: 2 }, ['Paso']),
      ...[10, 50, 100].map((v) => tap(h('button', 'chip' + (S.step === v ? ' on' : ''), null, ['±' + v]), () => ((S.step = v), store.set('konk.step', v), render())))
    ]),
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }, [h('span', 'mut', { flex: 1 }, ['Toca un nombre para darle el turno'])]),
    h('span', 'spacer'),
    h(
      'div',
      '',
      { display: 'flex', flexDirection: 'column', gap: 8 },
      s.players.map((p) =>
        h('div', 'pr' + (p.turn ? ' on' : ''), null, [
          tap(
            h('button', '', { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: '#ececef', padding: 0, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }, [
              h('div', '', { fontSize: p.name.length > 14 ? 14 : 16, fontWeight: 700, overflowWrap: 'anywhere' }, [p.name]),
              h('div', '', { fontSize: 11, color: p.turn ? '#8fb0ff' : '#77777f' }, [p.turn ? 'Turno' : 'Toca para darle el turno'])
            ]),
            () => send({ t: 'turn', key: p.key })
          ),
          h('span', '', { fontSize: 32, fontWeight: 800, minWidth: 70, textAlign: 'right', marginRight: 4 }, [fmt(p.score)]),
          tap(h('button', 'bb', null, ['−']), () => send({ t: 'score', key: p.key, d: -S.step })),
          tap(h('button', 'bb', { background: '#4f7dff', borderColor: '#4f7dff' }, ['+']), () => send({ t: 'score', key: p.key, d: S.step }), true)
        ])
      )
    ),
    tap(h('button', 'b', { minHeight: 50, fontSize: 14 }, ['Deshacer el último paso del juego']), () => send({ t: 'undo' }))
  )
}

// ---- hojas
function openSheet(fn) {
  S.sheet = fn
  paintSheet()
}
function closeSheet(silent) {
  S.sheet = null
  document.querySelectorAll('.veil, .sheet').forEach((x) => x.remove())
  if (!silent) render()
}
function paintSheet() {
  document.querySelectorAll('.veil, .sheet').forEach((x) => x.remove())
  if (!S.sheet || !S.snap) return
  const veil = h('div', 'veil')
  veil.addEventListener('click', () => closeSheet())
  const sheet = h('div', 'sheet ui', null, [h('div', 'grab')])
  sheet.setAttribute('role', 'dialog')
  S.sheet(sheet, () => closeSheet())
  document.body.append(veil, sheet)
}
/** Plano, juego en el aire, quién sale y preajustes. */
function planoSheet(sheet, close) {
  const s = S.snap
  const pick = (cmd) => {
    send(cmd)
    close()
  }
  add(
    sheet,
    h('div', '', { fontSize: 16, fontWeight: 700 }, ['Plano']),
    h(
      'div',
      '',
      { display: 'flex', flexDirection: 'column', gap: 6 },
      PLANOS.map(([id, t]) => {
        const b = h('button', 'vx' + (s.plano === id ? ' on' : ''), { height: 46, textAlign: 'left' }, [t])
        b.disabled = (id === 'juego' || id === 'sincam') && !s.hasGame
        if (b.disabled) b.style.opacity = '0.4'
        return tap(b, () => pick({ t: 'plano', id }), true)
      })
    ),
    h('span', 'tiny', null, ['Quién sale']),
    h(
      'div',
      '',
      { display: 'flex', flexWrap: 'wrap', gap: 6 },
      s.people.map((p) => tap(h('button', 'vx' + (p.on ? ' on' : ''), null, [p.slot === 'host' ? p.name + ' (yo)' : p.name]), () => send({ t: 'person', slot: p.slot })))
    ),
    h('div', '', { display: 'flex', gap: 6 }, [
      tap(h('button', 'vx', { flex: 1 }, ['Solo yo']), () => send({ t: 'preset', id: 'yo' })),
      tap(h('button', 'vx', { flex: 1 }, ['Turno']), () => send({ t: 'preset', id: 'turno' })),
      tap(h('button', 'vx', { flex: 1 }, ['Todos']), () => send({ t: 'preset', id: 'todos' }))
    ]),
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }, [
      h('span', '', { flex: 1 }, ['Rótulo inferior']),
      tap(h('button', 'sw' + (s.lowerThird ? ' on' : '')), () => send({ t: 'lowerThird' }))
    ]),
    h('span', 'tiny', null, ['Juego en el aire']),
    h(
      'div',
      '',
      { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 },
      GAMES.map(([id, t]) => tap(h('button', 'vx' + (s.liveGame === id ? ' on' : ''), null, [t]), () => pick({ t: 'liveGame', game: id })))
    )
  )
}
/** Turno: un botón por concursante + Todos, y el rebote. */
function turnSheet(sheet, close) {
  const s = S.snap
  const g = s.game
  const all = g && g.kind === 'quiz' && g.mode === 'all'
  add(
    sheet,
    h('div', '', { fontSize: 16, fontWeight: 700 }, ['A quién va']),
    ...s.players.map((p) =>
      tap(h('button', 'vx' + (!all && g && g.target === p.name ? ' on' : ''), { height: 48, textAlign: 'left' }, [p.name]), () => {
        send({ t: 'turn', key: p.key })
        close()
      })
    ),
    tap(h('button', 'vx' + (all ? ' on' : ''), { height: 48, textAlign: 'left' }, ['Todos responden']), () => {
      send({ t: 'turn', key: 'all' })
      close()
    }),
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }, [
      h('span', '', { flex: 1 }, ['Rebote: si falla, pasa al siguiente sin desvelar']),
      tap(h('button', 'sw' + (s.rebound ? ' on' : '')), () => send({ t: 'reboundToggle' }))
    ])
  )
}

// ---------------------------------------------------------------- emparejar (pantalla)
let scanStream = null
function pairScreen() {
  const last = store.get('konk.lastPair')
  const status = S.bye ? ['El portátil desconectó este mando', '#e8a23a', '#26231c'] : ['Esperando el QR del portátil', '#e8a23a', '#26231c']
  const box = h('div', 'scan', null, [
    h('div', '', {
      position: 'absolute',
      left: 70,
      top: 70,
      width: 140,
      height: 140,
      borderRadius: 6,
      background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 10px, transparent 10px 20px), repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0 10px, transparent 10px 20px)',
      opacity: 0.55
    }),
    h('div', 'cn', { left: 40, top: 40, borderLeftWidth: '4px', borderTopWidth: '4px', borderTopLeftRadius: 10 }),
    h('div', 'cn', { right: 40, top: 40, borderRightWidth: '4px', borderTopWidth: '4px', borderTopRightRadius: 10 }),
    h('div', 'cn', { left: 40, bottom: 40, borderLeftWidth: '4px', borderBottomWidth: '4px', borderBottomLeftRadius: 10 }),
    h('div', 'cn', { right: 40, bottom: 40, borderRightWidth: '4px', borderBottomWidth: '4px', borderBottomRightRadius: 10 }),
    h('div', 'scanline')
  ])
  const canScan = 'BarcodeDetector' in window && navigator.mediaDevices
  return h('div', 'ui', { height: '100%', boxSizing: 'border-box', padding: '24px 20px 28px', display: 'flex', flexDirection: 'column', gap: 16, background: '#111113' }, [
    h('div', '', { display: 'flex', alignItems: 'center', gap: 10 }, [
      h('span', '', { fontSize: 20, fontWeight: 800, letterSpacing: '0.08em' }, ['KONKURSOX']),
      h('span', 'mut', { fontSize: 14 }, ['· El mando'])
    ]),
    h(
      'div',
      '',
      { display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 8, height: 30, padding: '0 12px', borderRadius: 15, background: status[2], fontSize: 13, fontWeight: 600 },
      [h('span', '', { width: 8, height: 8, borderRadius: '50%', background: status[1] }), status[0]]
    ),
    box,
    h('div', 'mut', { textAlign: 'center', fontSize: 14, lineHeight: 1.45 }, ['Apunta con la cámara del móvil al código QR', h('br'), 'que sale en el portátil (botón «Mando»).']),
    h('span', 'spacer'),
    canScan ? tap(h('button', 'next', { marginTop: 6 }, ['Escanear desde aquí']), () => startScan(box)) : null,
    last
      ? tap(h('button', 'b ghost', { minHeight: 48, fontSize: 14 }, [`Reconectar con el portátil · ${new Date(last.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`]), () => {
          S.pair = last
          store.set('konk.pair', last)
          connect()
        })
      : null
  ])
}
async function startScan(box) {
  try {
    const det = new BarcodeDetector({ formats: ['qr_code'] })
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    const v = h('video')
    v.playsInline = true
    v.muted = true
    v.srcObject = scanStream
    box.prepend(v)
    await v.play()
    const loop = async () => {
      if (!scanStream) return
      try {
        const codes = await det.detect(v)
        const raw = codes[0] && codes[0].rawValue
        if (raw && raw.includes('#c=')) {
          stopScan()
          location.hash = raw.split('#')[1]
          if (readPairFromUrl()) connect()
          return
        }
      } catch (e) {
        /* sigue intentando */
      }
      requestAnimationFrame(loop)
    }
    loop()
  } catch (e) {
    toast('No se pudo abrir la cámara: usa la cámara del móvil')
  }
}
function stopScan() {
  if (scanStream) scanStream.getTracks().forEach((t) => t.stop())
  scanStream = null
}

// relojes del rosco y barra de la música en vivo, sin repintar todo
setInterval(() => {
  if (!S.snap || S.tab !== 'juego' || !S.snap.game || S.snap.game.kind !== 'rosco') return
  const g = S.snap.game
  const now = snapNow()
  document.querySelectorAll('.rtime').forEach((el, i) => {
    const pl = g.players[i]
    if (pl) el.textContent = mmss(pl.endsAt !== null ? Math.max(0, pl.endsAt - now) : pl.remainingMs)
  })
}, 250)

// ---------------------------------------------------------------- arranque
S.step = store.get('konk.step') || 10
if (readPairFromUrl() || (S.pair = store.get('konk.pair'))) {
  store.set('konk.lastPair', S.pair)
  connect()
}
render()
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {})
