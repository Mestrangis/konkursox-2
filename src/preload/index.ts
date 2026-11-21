import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Bank, BankInfo } from '../shared/questions'
import type { Action, AudioLibrary, CaptureSource, DisplayInfo, GameState } from '../shared/types'

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const h = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.off(channel, h)
}

const api = {
  getState: (): Promise<GameState> => ipcRenderer.invoke('state:get'),
  dispatch: (a: Action): Promise<void> => ipcRenderer.invoke('state:dispatch', a),
  onState: (cb: (s: GameState) => void) => subscribe('state', cb),

  listSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('capture:sources'),
  resolveSource: (): Promise<string | null> => ipcRenderer.invoke('capture:resolve'),

  listDisplays: (): Promise<DisplayInfo[]> => ipcRenderer.invoke('displays:list'),
  onDisplays: (cb: (d: DisplayInfo[]) => void) => subscribe('displays', cb),
  showPlato: (): Promise<void> => ipcRenderer.invoke('plato:show'),

  audioLibrary: (): Promise<AudioLibrary> => ipcRenderer.invoke('audio:library'),
  audioOpenDir: (): Promise<string> => ipcRenderer.invoke('audio:openDir'),
  audioChooseDir: (): Promise<AudioLibrary> => ipcRenderer.invoke('audio:chooseDir'),

  listBanks: (): Promise<BankInfo[]> => ipcRenderer.invoke('bank:list'),
  getBank: (file: string): Promise<Bank> => ipcRenderer.invoke('bank:get', file),
  openBanksDir: (): Promise<string> => ipcRenderer.invoke('bank:openDir'),
  importBanks: (): Promise<{ imported: string[]; errors: string[] }> => ipcRenderer.invoke('bank:import'),

  checkUpdate: (): Promise<void> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install')
}

export type KonkApi = typeof api

contextBridge.exposeInMainWorld('konk', api)
