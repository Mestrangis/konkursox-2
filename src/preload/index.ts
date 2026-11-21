import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { LibBankInfo, LibType } from '../shared/library'
import type { Bank } from '../shared/questions'
import type { MediaLibrary } from '../main/multimedia'
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
  audioImport: (paths: string[], kind: 'musica' | 'efectos'): Promise<string[]> => ipcRenderer.invoke('audio:import', paths, kind),

  libList: (): Promise<LibBankInfo[]> => ipcRenderer.invoke('lib:list'),
  libGet: (ref: string): Promise<Bank> => ipcRenderer.invoke('lib:get', ref),
  libSave: (ref: string, bank: Bank): Promise<void> => ipcRenderer.invoke('lib:save', ref, bank),
  libCreate: (tipo: LibType, nombre: string): Promise<string> => ipcRenderer.invoke('lib:create', tipo, nombre),
  libDelete: (ref: string): Promise<void> => ipcRenderer.invoke('lib:delete', ref),
  libMarkUsed: (ref: string, ids: string[], used: boolean): Promise<void> => ipcRenderer.invoke('lib:markUsed', ref, ids, used),
  libImportImage: (path: string): Promise<string> => ipcRenderer.invoke('lib:importImage', path),
  libChooseImage: (): Promise<string | null> => ipcRenderer.invoke('lib:chooseImage'),
  libOpenDir: (): Promise<string> => ipcRenderer.invoke('lib:openDir'),

  choosePhoto: (name: string): Promise<string | null> => ipcRenderer.invoke('people:choosePhoto', name),

  mediaList: (): Promise<MediaLibrary> => ipcRenderer.invoke('media:list'),
  mediaImport: (paths: string[], folder: string): Promise<number> => ipcRenderer.invoke('media:import', paths, folder),
  mediaChoose: (folder: string): Promise<number> => ipcRenderer.invoke('media:choose', folder),
  mediaFolder: (name: string): Promise<string> => ipcRenderer.invoke('media:folder', name),
  mediaDelete: (id: string): Promise<void> => ipcRenderer.invoke('media:delete', id),
  mediaYoutube: (url: string, folder: string): Promise<{ title: string; embeddable: boolean }> => ipcRenderer.invoke('media:youtube', url, folder),
  mediaOpenDir: (): Promise<string> => ipcRenderer.invoke('media:openDir'),
  /** ruta en disco de un archivo soltado en la ventana */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  checkUpdate: (): Promise<void> => ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install')
}

export type KonkApi = typeof api

contextBridge.exposeInMainWorld('konk', api)
