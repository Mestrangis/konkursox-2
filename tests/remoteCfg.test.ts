import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CFG_NAME, deleteRemoteCfg, patchRemoteCfg, readRemoteCfg } from '../src/main/remoteCfg'

const KEY = 'appid.keyid:secreto-de-prueba'
const dirs: string[] = []
const newDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'konk-cfg-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('la clave de Ably se mantiene', () => {
  it('al cerrar y volver a abrir el programa (se lee del disco, no de memoria)', () => {
    const dir = newDir()
    patchRemoteCfg(dir, { ablyKey: KEY })
    // "reinicio": nada en memoria, solo lo que hay en la carpeta
    expect(readRemoteCfg(dir).ablyKey).toBe(KEY)
  })

  it('al actualizar: la versión nueva usa la misma carpeta, cambia de canal y la clave sigue', () => {
    const dir = newDir()
    patchRemoteCfg(dir, { ablyKey: KEY })
    // la versión nueva arranca: crea canal y, al desconectar el mando, lo cambia
    patchRemoteCfg(dir, { channel: 'konk-a' })
    patchRemoteCfg(dir, { channel: 'konk-b' })
    expect(readRemoteCfg(dir)).toEqual({ ablyKey: KEY, channel: 'konk-b' })
    // la carpeta depende del nombre del producto y el instalador no la borra
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
    const builder = readFileSync(join(__dirname, '..', 'electron-builder.yml'), 'utf8')
    expect(pkg.productName).toBe('KONKURSOX')
    expect(builder).toMatch(/^productName: KONKURSOX$/m)
    expect(builder).toMatch(/deleteAppDataOnUninstall: false/)
  })

  it('si un apagón deja el archivo a medias, se recupera de la copia', () => {
    const dir = newDir()
    patchRemoteCfg(dir, { ablyKey: KEY, channel: 'konk-a' })
    writeFileSync(join(dir, CFG_NAME), '{"ablyKey": "appid.ke')
    expect(readRemoteCfg(dir).ablyKey).toBe(KEY)
    // y el siguiente guardado no la pierde
    patchRemoteCfg(dir, { channel: 'konk-c' })
    expect(readRemoteCfg(dir)).toEqual({ ablyKey: KEY, channel: 'konk-c' })
  })

  it('solo desaparece al borrarla a propósito', () => {
    const dir = newDir()
    patchRemoteCfg(dir, { ablyKey: KEY })
    deleteRemoteCfg(dir)
    expect(readRemoteCfg(dir)).toEqual({})
  })
})
