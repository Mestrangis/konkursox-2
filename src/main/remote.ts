// Mando (móvil) por Ably. La clave raíz vive solo en %APPDATA%\KONKURSOX\mando.json (nunca en el repo ni
// en el instalador). Cada partida tiene un canal privado; el móvil recibe un token con permiso solo para ese
// canal, que el programa renueva mientras está abierto. El programa es la única fuente de verdad: el móvil
// manda comandos, el panel los ejecuta y publica una instantánea del estado.
import { randomBytes } from 'node:crypto'
import { app } from 'electron'
import * as Ably from 'ably'
import { dispatch } from './store'
import { getPanel } from './windows'
import { deleteRemoteCfg, patchRemoteCfg, readRemoteCfg, type RemoteCfg } from './remoteCfg'

/** Dirección pública de la app del mando (GitHub Pages). */
export const MANDO_URL = 'https://mestrangis.github.io/konkursox-2/'
const TOKEN_TTL = 24 * 3600 * 1000
const RENEW_EVERY = 20 * 60 * 1000

const dataDir = () => app.getPath('userData')
const readCfg = (): RemoteCfg => readRemoteCfg(dataDir())

/** Para exportar / importar / borrar todo. */
export const remoteCfgRaw = (): RemoteCfg => readCfg()
export function replaceRemoteCfg(c: RemoteCfg | null): void {
  stopRemote()
  deleteRemoteCfg(dataDir())
  if (c && Object.keys(c).length) patchRemoteCfg(dataDir(), c)
}

let rt: Ably.Realtime | null = null
let ch: Ably.RealtimeChannel | null = null
let renewTimer: ReturnType<typeof setInterval> | null = null
let lastToken: { token: string; expires: number } | null = null

const newChannel = () => `konk-${randomBytes(9).toString('base64url')}`
const forward = (data: unknown) => getPanel()?.webContents.send('remote:cmd', data)

/** Clave oculta para enseñarla en Ajustes. */
export function remoteInfo(): { hasKey: boolean; keyMasked: string; channel: string | null; url: string } {
  const c = readCfg()
  const k = c.ablyKey ?? ''
  return { hasKey: !!k, keyMasked: k ? `${k.slice(0, 6)}…${k.slice(-4)}` : '', channel: c.channel ?? null, url: c.mandoUrl ?? MANDO_URL }
}

export function setRemoteKey(key: string): void {
  patchRemoteCfg(dataDir(), { ablyKey: key.trim() || undefined })
  void startRemote()
}

/** Token del móvil: solo puede usar el canal de esta partida. */
async function issueToken(channel: string): Promise<{ token: string; expires: number }> {
  if (!rt) throw new Error('sin conexión')
  const td = await rt.auth.requestToken({ clientId: 'mando', ttl: TOKEN_TTL, capability: JSON.stringify({ [channel]: ['publish', 'subscribe', 'presence', 'history'] }) })
  lastToken = { token: td.token, expires: td.expires }
  return lastToken
}

function linkFor(channel: string, token: string): string {
  const c = readCfg()
  return `${c.mandoUrl ?? MANDO_URL}#c=${encodeURIComponent(channel)}&t=${encodeURIComponent(token)}`
}

async function refreshLink(): Promise<void> {
  const c = readCfg()
  if (!c.channel || !ch) return
  const t = await issueToken(c.channel)
  dispatch({ type: 'setRemote', patch: { link: linkFor(c.channel, t.token) } })
  // el móvil conectado guarda el token nuevo para reconectarse aunque pase el tiempo
  await ch.publish('token', t)
}

function countMandos(members: Ably.PresenceMessage[]): number {
  return new Set(members.filter((m) => m.clientId === 'mando').map((m) => m.connectionId)).size
}

export async function startRemote(): Promise<void> {
  stopRemote()
  const c = readCfg()
  if (!c.ablyKey) {
    dispatch({ type: 'setRemote', patch: { status: 'off', connected: 0, link: null, error: undefined } })
    return
  }
  if (!c.channel) c.channel = patchRemoteCfg(dataDir(), { channel: newChannel() }).channel as string
  dispatch({ type: 'setRemote', patch: { status: 'connecting', error: undefined } })
  try {
    rt = new Ably.Realtime({ key: c.ablyKey, clientId: 'programa', echoMessages: false })
    rt.connection.on((st) => {
      if (st.current === 'connected') dispatch({ type: 'setRemote', patch: { status: 'ready', error: undefined } })
      else if (st.current === 'failed' || st.current === 'suspended') dispatch({ type: 'setRemote', patch: { status: 'error', error: st.reason?.message ?? st.current } })
      else if (st.current === 'disconnected' || st.current === 'connecting') dispatch({ type: 'setRemote', patch: { status: 'connecting' } })
    })
    await attach(c.channel)
    await refreshLink()
    renewTimer = setInterval(() => void refreshLink().catch((err) => console.error('[mando] renovar token', err)), RENEW_EVERY)
  } catch (err) {
    console.error('[mando]', err)
    dispatch({ type: 'setRemote', patch: { status: 'error', error: String((err as Error).message ?? err) } })
  }
}

async function attach(channel: string): Promise<void> {
  if (!rt) return
  ch = rt.channels.get(channel)
  await ch.subscribe('cmd', (m) => forward(m.data))
  await ch.subscribe('hello', () => {
    forward({ cmd: { t: 'hello' }, rev: 0 })
    // al reconectar, el móvil recibe también el token vigente
    if (lastToken) void ch?.publish('token', lastToken)
  })
  const update = async () => {
    try {
      const members = await ch!.presence.get()
      dispatch({ type: 'setRemote', patch: { connected: countMandos(members) } })
    } catch {
      /* sin presencia ahora */
    }
  }
  await ch.presence.subscribe(() => void update())
  void update()
}

/** Avisar al móvil de que se desconecta y parar (borrar los datos de este ordenador). */
export async function byeRemote(): Promise<void> {
  try {
    await ch?.publish('bye', {})
  } catch {
    /* da igual */
  }
  stopRemote()
  dispatch({ type: 'setRemote', patch: { status: 'off', connected: 0, link: null } })
}

export function stopRemote(): void {
  if (renewTimer) clearInterval(renewTimer)
  renewTimer = null
  try {
    rt?.close()
  } catch {
    /* ya cerrada */
  }
  rt = null
  ch = null
}

/** Publica la instantánea del estado (la manda el panel, ya con lo que solo él sabe). */
export function publishState(snap: unknown): void {
  void ch?.publish('state', snap).catch((err) => console.error('[mando] publicar', err))
}

/** Lista de preguntas del banco que pide el mando ("Elegir pregunta"). */
export function publishBank(data: unknown): void {
  void ch?.publish('bank', data).catch((err) => console.error('[mando] banco', err))
}

/** Desconectar el mando: se avisa, se cambia de canal (los tokens viejos dejan de servir) y hay QR nuevo. */
export async function disconnectRemote(): Promise<void> {
  try {
    await ch?.publish('bye', {})
  } catch {
    /* da igual */
  }
  patchRemoteCfg(dataDir(), { channel: newChannel() })
  dispatch({ type: 'setRemote', patch: { connected: 0 } })
  await startRemote()
}
