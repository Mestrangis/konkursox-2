import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { banksDir, ensureBanks, importLegacyFile, listBanks, readBank } from './banks'
import { deleteShow, importPhoto, listShows, loadShow, saveShow, showsDir } from './library'
import type { Segment } from '../shared/show'
import { installDisplayMediaHandler, listWindowSources, resolveSource } from './capture'
import { audioDir, audioLibrary, handleMediaProtocol, registerMediaScheme, setAudioDir } from './media'
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
      ensureBanks()
    } catch (err) {
      console.error('[bancos]', err)
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
  ipcMain.handle('bank:list', () => listBanks())
  ipcMain.handle('bank:get', (_e, file: string) => readBank(file))
  ipcMain.handle('bank:openDir', () => shell.openPath(banksDir()))
  ipcMain.handle('bank:import', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: 'Importar preguntas (formato antiguo o nuevo)',
      filters: [{ name: 'Preguntas JSON', extensions: ['json'] }],
      properties: ['openFile', 'multiSelections']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const imported: string[] = []
    const errors: string[] = []
    for (const p of res.canceled ? [] : res.filePaths) {
      try {
        imported.push(importLegacyFile(p))
      } catch (err) {
        errors.push(`${p}: ${(err as Error).message}`)
      }
    }
    return { imported, errors }
  })
  ipcMain.handle('show:list', () => listShows())
  ipcMain.handle('show:save', (_e, title: string, segments: Segment[]) => saveShow(title, segments))
  ipcMain.handle('show:load', (_e, file: string) => loadShow(file))
  ipcMain.handle('show:delete', (_e, file: string) => deleteShow(file))
  ipcMain.handle('show:openDir', () => shell.openPath(showsDir()))
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
