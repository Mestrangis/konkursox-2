// Store del proceso main: fuente única de verdad del estado del juego.
// Los renderers sólo envían acciones (IPC) y reciben el estado completo.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BrowserWindow } from 'electron'
import { applyAction, hydrate, persistable } from '../shared/state'
import type { Action, GameState } from '../shared/types'

type Listener = (next: GameState, prev: GameState, action: Action) => void

const RUNTIME_ACTIONS = new Set<Action['type']>(['setCaptureHealth', 'setUpdate', 'restartCapture'])

let state: GameState
let filePath = ''
let saveTimer: NodeJS.Timeout | null = null
const listeners: Listener[] = []

export function initStore(path: string, appVersion: string): GameState {
  filePath = path
  let saved: unknown = null
  try {
    // sin BOM: algunos editores (y PowerShell) lo añaden al guardar
    if (existsSync(path)) saved = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  } catch (err) {
    console.error('[store] estado corrupto, se usan valores por defecto', err)
  }
  state = hydrate(saved)
  state.runtime.appVersion = appVersion
  return state
}

export const getState = (): GameState => state

export function dispatch(action: Action): GameState {
  const prev = state
  state = applyAction(state, action)
  if (state === prev) return state
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('state', state)
  if (!RUNTIME_ACTIONS.has(action.type)) scheduleSave()
  for (const l of listeners) l(state, prev, action)
  return state
}

export function onStateChange(l: Listener): void {
  listeners.push(l)
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 300)
}

export function flushSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (!filePath) return
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const tmp = filePath + '.tmp'
    writeFileSync(tmp, JSON.stringify(persistable(state), null, 2), 'utf8')
    renameSync(tmp, filePath)
  } catch (err) {
    console.error('[store] no se pudo guardar', err)
  }
}
