// Llevar el concurso a otro ordenador: un único archivo .konkursox (zip) con toda la carpeta
// Documentos\KONKURSOX y toda la configuración del programa (incluida la clave del mando).
// También "Borrar mis datos de este ordenador" (deja el programa como recién instalado).
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { app, session } from 'electron'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { persistable } from '../shared/state'
import { byeRemote, remoteCfgRaw, replaceRemoteCfg, stopRemote } from './remote'
import type { RemoteCfg } from './remoteCfg'
import { flushSave, freezeStore, getState } from './store'
import { getPanel, getPlato } from './windows'

export const FORMAT = 'konkursox'
const FORMAT_VERSION = 1
export const docsDir = (): string => join(app.getPath('documents'), 'KONKURSOX')
export const statePath = (): string => join(app.getPath('userData'), 'konkursox-state.json')

export interface ArchiveInfo {
  createdAt: string
  appVersion: string
  files: number
  bytes: number
  hasKey: boolean
  computer?: string
}

/** ¿Es la primera vez en este ordenador? (ni configuración ni carpeta de datos). Se mira antes de crear nada. */
export function isFreshInstall(): boolean {
  return !existsSync(statePath()) && !existsSync(docsDir())
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile()) out.push(p)
  }
  return out
}

// lo que ya va comprimido (audio, vídeo, imágenes) se guarda tal cual: más rápido y ocupa lo mismo
const STORED = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.webm', '.mp4', '.mov', '.m4v', '.mkv', '.ogv', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.woff2', '.zip'])
const inside = (parent: string, child: string) => {
  const r = relative(parent, child)
  return !!r && !r.startsWith('..') && !isAbsolute(r)
}

/** Exporta todo a un archivo .konkursox. */
export async function exportAll(dest: string): Promise<ArchiveInfo> {
  flushSave()
  const zip = new yazl.ZipFile()
  const root = docsDir()
  const entries: { abs: string; name: string }[] = walk(root).map((abs) => ({ abs, name: 'documentos/' + relative(root, abs).split(sep).join('/') }))
  // si la música está en otra carpeta (Ajustes → audio), también va: en el otro ordenador acaba en Documentos\KONKURSOX\audio
  const st = getState()
  const audioDir = st.audio.dir
  if (audioDir && existsSync(audioDir) && !inside(root, audioDir) && resolve(audioDir) !== resolve(root)) {
    const taken = new Set(entries.map((e) => e.name.toLowerCase()))
    for (const abs of walk(audioDir)) {
      const name = 'documentos/audio/' + relative(audioDir, abs).split(sep).join('/')
      if (!taken.has(name.toLowerCase())) entries.push({ abs, name })
    }
  }
  let bytes = 0
  for (const e of entries) {
    const size = statSync(e.abs).size
    bytes += size
    zip.addFile(e.abs, e.name, { compress: !STORED.has(extname(e.abs).toLowerCase()) })
  }
  const cfg = remoteCfgRaw()
  const info: ArchiveInfo = { createdAt: new Date().toISOString(), appVersion: app.getVersion(), files: entries.length, bytes, hasKey: !!cfg.ablyKey }
  zip.addBuffer(Buffer.from(JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, ...info }, null, 2)), 'konkursox.json')
  zip.addBuffer(Buffer.from(JSON.stringify(persistable(st), null, 2)), 'config/estado.json')
  zip.addBuffer(Buffer.from(JSON.stringify(cfg, null, 2)), 'config/mando.json')
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = dest + '.part'
  await new Promise<void>((ok, ko) => {
    const out = createWriteStream(tmp)
    out.on('close', () => ok())
    out.on('error', ko)
    zip.outputStream.on('error', ko)
    zip.outputStream.pipe(out)
    zip.end()
  })
  rmSync(dest, { force: true })
  renameSync(tmp, dest)
  return info
}

// ---------------------------------------------------------------- leer un .konkursox

const openZip = (file: string) => new Promise<yauzl.ZipFile>((ok, ko) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, z) => (err || !z ? ko(err ?? new Error('zip')) : ok(z))))

function readEntry(z: yauzl.ZipFile, e: yauzl.Entry): Promise<Buffer> {
  return new Promise((ok, ko) =>
    z.openReadStream(e, (err, s) => {
      if (err || !s) return ko(err ?? new Error('zip'))
      const parts: Buffer[] = []
      s.on('data', (c: Buffer) => parts.push(c))
      s.on('end', () => ok(Buffer.concat(parts)))
      s.on('error', ko)
    })
  )
}

function pipeEntry(z: yauzl.ZipFile, e: yauzl.Entry, to: string): Promise<void> {
  return new Promise((ok, ko) =>
    z.openReadStream(e, (err, s) => {
      if (err || !s) return ko(err ?? new Error('zip'))
      mkdirSync(dirname(to), { recursive: true })
      const out = createWriteStream(to)
      out.on('close', () => ok())
      out.on('error', ko)
      s.on('error', ko)
      s.pipe(out)
    })
  )
}

/** Recorre las entradas del zip una a una. */
async function eachEntry(file: string, fn: (z: yauzl.ZipFile, e: yauzl.Entry) => Promise<void>): Promise<void> {
  const z = await openZip(file)
  try {
    await new Promise<void>((ok, ko) => {
      z.on('entry', (e: yauzl.Entry) => {
        fn(z, e).then(() => z.readEntry(), ko)
      })
      z.on('end', () => ok())
      z.on('error', ko)
      z.readEntry()
    })
  } finally {
    z.close()
  }
}

/** Lee la cabecera de un .konkursox (para avisar antes de importar). */
export async function inspectArchive(file: string): Promise<ArchiveInfo> {
  let info: ArchiveInfo | null = null
  await eachEntry(file, async (z, e) => {
    if (e.fileName === 'konkursox.json') {
      const m = JSON.parse((await readEntry(z, e)).toString('utf8'))
      if (m.format !== FORMAT) throw new Error('No es un archivo de KONKURSOX')
      info = { createdAt: m.createdAt, appVersion: m.appVersion, files: m.files, bytes: m.bytes, hasKey: !!m.hasKey }
    }
  })
  if (!info) throw new Error('No es un archivo de KONKURSOX (le falta la cabecera)')
  return info
}

/** Quita ventanas que puedan tener archivos abiertos (vídeos del plató) antes de tocar la carpeta. */
function releaseFiles(): void {
  stopRemote()
  getPlato()?.destroy()
}

const rmDir = (p: string) => rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

/**
 * Importa un .konkursox: primero lo descomprime aparte (si algo falla, no se ha tocado nada),
 * luego cambia la carpeta de datos y la configuración, y reinicia el programa.
 */
export async function importAll(file: string): Promise<void> {
  await inspectArchive(file)
  const root = docsDir()
  const staging = root + '.importando'
  rmDir(staging)
  mkdirSync(staging, { recursive: true })
  let estado: unknown = null
  let mando: RemoteCfg | null = null
  try {
    await eachEntry(file, async (z, e) => {
      const name = e.fileName
      if (name.endsWith('/')) return
      if (name === 'config/estado.json') estado = JSON.parse((await readEntry(z, e)).toString('utf8'))
      else if (name === 'config/mando.json') mando = JSON.parse((await readEntry(z, e)).toString('utf8')) as RemoteCfg
      else if (name.startsWith('documentos/')) {
        const to = resolve(staging, name.slice('documentos/'.length))
        // nada fuera de la carpeta (rutas con ".." o absolutas en un zip manipulado)
        if (!inside(staging, to)) return
        await pipeEntry(z, e, to)
      }
    })
  } catch (err) {
    rmDir(staging)
    throw err
  }
  if (!estado) {
    rmDir(staging)
    throw new Error('Al archivo le falta la configuración')
  }

  // a partir de aquí se sustituye lo de este ordenador
  freezeStore()
  releaseFiles()
  const old = root + '.anterior'
  rmDir(old)
  try {
    if (existsSync(root)) renameSync(root, old)
  } catch {
    // la carpeta está abierta en el Explorador (no se puede renombrar): se vacía en su sitio
    for (const e of readdirSync(root)) rmDir(join(root, e))
  }
  try {
    if (existsSync(root)) {
      cpSync(staging, root, { recursive: true })
      rmDir(staging)
    } else renameSync(staging, root)
  } catch (err) {
    // si no se pudo dejar en su sitio, se recupera lo que había
    if (!existsSync(root) && existsSync(old)) renameSync(old, root)
    throw err
  }
  rmDir(old)
  // la música viaja dentro de Documentos\KONKURSOX\audio: la carpeta del otro ordenador no existe aquí
  const st = estado as { audio?: { dir?: string | null } }
  if (st.audio) st.audio.dir = null
  writeFileSync(statePath(), JSON.stringify(estado, null, 2), 'utf8')
  replaceRemoteCfg(mando)
  restart()
}

/** Borra todo lo de este ordenador: carpeta de datos, configuración, clave del mando y datos del panel. */
export async function wipeAll(): Promise<void> {
  await byeRemote()
  freezeStore()
  releaseFiles()
  rmDir(docsDir())
  rmDir(docsDir() + '.importando')
  rmDir(docsDir() + '.anterior')
  replaceRemoteCfg(null)
  for (const f of [statePath(), statePath() + '.tmp']) rmSync(f, { force: true })
  // preferencias del panel (pestañas, bancos elegidos...) y caché
  await session.defaultSession.clearStorageData()
  await session.defaultSession.clearCache()
  restart()
}

function restart(): void {
  getPanel()?.destroy()
  app.relaunch()
  app.exit(0)
}

/** Para la ventana de exportar: tamaño aproximado de lo que se va a guardar. */
export function exportSize(): { files: number; bytes: number } {
  const files = walk(docsDir())
  return { files: files.length, bytes: files.reduce((a, f) => a + statSync(f).size, 0) }
}
