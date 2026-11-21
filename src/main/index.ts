import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { banksDir, createBank, deleteBank, ensureLibrary, importImage, listLibrary, markUsed, readBank, saveBank } from './banks'
import { importPhoto } from './library'
import type { LibType } from '../shared/library'
import type { Bank } from '../shared/questions'
import { installDisplayMediaHandler, listWindowSources, resolveSource } from './capture'
import { audioDir, audioLibrary, handleMediaProtocol, importAudio, registerMediaScheme, setAudioDir } from './media'
import { dispatch, flushSave, getState, initStore, onStateChange } from './store'
import { checkForUpdates, initUpdater, installUpdate } from './updater'
import { createPanel, createPlato, getPanel, listDisplays, placePlato, showPlato } from './windows'
import type { Action } from '../shared/types'

// Windows Graphics Capture para ventanas (captura aunque esté tapada por otras).
app.commandLine.appendSwitch('enable-features', 'AllowWgcWindowCapturer,AllowWgcScreenCapturer')
app.setAppUserModelId('com.mestrangis.konkursox')
registerMediaScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const p = getPanel()
    if (p) {
      if (p.isMinimized()) p.restore()
      p.focus()
    }
  })

  app.whenReady().then(() => {
    initStore(join(app.getPath('userData'), 'konkursox-state.json'), app.getVersion())
    handleMediaProtocol()
    try {
      ensureLibrary(getState().quiz.used)
    } catch (err) {
      console.error('[biblioteca]', err)
    }
    installDisplayMediaHandler()
    registerIpc()

    onStateChange((next, prev) => {
      if (
        next.plato.displayId !== prev.plato.displayId ||
        next.plato.windowed !== prev.plato.windowed ||
        next.plato.visible !== prev.plato.visible
      ) {
        void placePlato()
      }
    })

    const sendDisplays = () => getPanel()?.webContents.send('displays', listDisplays())
    screen.on('display-added', () => {
      sendDisplays()
      void placePlato()
    })
    screen.on('display-removed', () => {
      sendDisplays()
      void placePlato()
    })
    screen.on('display-metrics-changed', sendDisplays)

    createPlato()
    createPanel(() => app.quit())
    initUpdater()
  })

  app.on('before-quit', flushSave)
  app.on('window-all-closed', () => app.quit())
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => getState())
  ipcMain.handle('state:dispatch', (_e, action: Action) => {
    dispatch(action)
  })
  ipcMain.handle('capture:sources', () => listWindowSources())
  ipcMain.handle('capture:resolve', () => resolveSource())
  ipcMain.handle('displays:list', () => listDisplays())
  ipcMain.handle('plato:show', () => showPlato())
  ipcMain.handle('audio:library', () => audioLibrary())
  ipcMain.handle('audio:openDir', () => shell.openPath(audioDir()))
  ipcMain.handle('audio:chooseDir', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: 'Carpeta de audio (con subcarpetas musica y efectos)',
      defaultPath: audioDir(),
      properties: ['openDirectory', 'createDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (!res.canceled && res.filePaths[0]) setAudioDir(res.filePaths[0])
    return audioLibrary()
  })
  ipcMain.handle('audio:import', (_e, paths: string[], kind: 'musica' | 'efectos') => importAudio(paths, kind))
  ipcMain.handle('lib:list', () => listLibrary())
  ipcMain.handle('lib:get', (_e, ref: string) => readBank(ref))
  ipcMain.handle('lib:save', (_e, ref: string, bank: Bank) => saveBank(ref, bank))
  ipcMain.handle('lib:create', (_e, tipo: LibType, nombre: string) => createBank(tipo, nombre))
  ipcMain.handle('lib:delete', (_e, ref: string) => deleteBank(ref))
  ipcMain.handle('lib:markUsed', (_e, ref: string, ids: string[], used: boolean) => markUsed(ref, ids, used))
  ipcMain.handle('lib:importImage', (_e, path: string) => importImage(path))
  ipcMain.handle('lib:chooseImage', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: 'Imagen de la pregunta',
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
      properties: ['openFile']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return importImage(res.filePaths[0])
  })
  ipcMain.handle('lib:openDir', () => shell.openPath(banksDir()))
  ipcMain.handle('people:choosePhoto', async (_e, name: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: 'Foto de ' + (name || 'la persona'),
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
      properties: ['openFile']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return importPhoto(res.filePaths[0], name)
  })
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () => installUpdate())
}
