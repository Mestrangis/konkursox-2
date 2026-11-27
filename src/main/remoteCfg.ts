// Configuración local del mando (clave de Ably y canal). Vive en la carpeta de datos del programa
// (%APPDATA%\KONKURSOX\mando.json), que no cambia entre versiones ni la borra el instalador al actualizar.
// Se escribe de forma atómica (archivo temporal + renombrar) y con una copia (.bak): si un corte de luz
// deja el archivo a medias, la clave se recupera de la copia.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface RemoteCfg {
  ablyKey?: string
  channel?: string
  /** para pruebas: otra dirección de la app del mando */
  mandoUrl?: string
}

export const CFG_NAME = 'mando.json'
const fileIn = (dir: string) => join(dir, CFG_NAME)

function parse(path: string): RemoteCfg | null {
  try {
    if (!existsSync(path)) return null
    const v = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as RemoteCfg) : null
  } catch {
    return null
  }
}

/** Lee la configuración; si el archivo está dañado, usa la copia. */
export function readRemoteCfg(dir: string): RemoteCfg {
  return parse(fileIn(dir)) ?? parse(fileIn(dir) + '.bak') ?? {}
}

export function writeRemoteCfg(dir: string, c: RemoteCfg): void {
  mkdirSync(dir, { recursive: true })
  const f = fileIn(dir)
  const tmp = f + '.tmp'
  writeFileSync(tmp, JSON.stringify(c, null, 2) + '\n', 'utf8')
  renameSync(tmp, f)
  // la copia se hace del archivo ya completo
  copyFileSync(f, f + '.bak')
}

/** Cambia algunos campos sin perder el resto (la clave no se pierde al cambiar de canal). */
export function patchRemoteCfg(dir: string, patch: Partial<RemoteCfg>): RemoteCfg {
  const c = { ...readRemoteCfg(dir), ...patch }
  for (const k of Object.keys(c) as (keyof RemoteCfg)[]) if (c[k] === undefined) delete c[k]
  writeRemoteCfg(dir, c)
  return c
}

/** Borra la configuración (y su copia). */
export function deleteRemoteCfg(dir: string): void {
  for (const f of [fileIn(dir), fileIn(dir) + '.bak', fileIn(dir) + '.tmp']) rmSync(f, { force: true })
}
