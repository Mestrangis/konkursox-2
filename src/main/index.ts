import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from 'electron'
import { banksDir, createBank, deleteBank, ensureLibrary, importImage, listLibrary, markUsed, readBank, saveBank } from './banks'
import { importPhoto } from './library'
import { addYoutube, createFolder, deleteMedia, importMedia, mediaDir, mediaLibrary } from './multimedia'
import type { LibType } from '../shared/library'
import type { Bank } from '../shared/questions'
import { installDisplayMediaHandler, listWindowSources, resolveSource } from './capture'
import { audioDir, audioLibrary, handleMediaProtocol, importAudio, registerMediaScheme, setAudioDir } from './media'
import { ensureThemes, listThemes, readTheme, themesDir } from './themes'
import { disconnectRemote, publishBank, publishState, remoteInfo, setRemoteKey, startRemote, stopRemote } from './remote'
import { docsDir, exportAll, exportSize, importAll, inspectArchive, isFreshInstall, wipeAll } from './portable'
import { dispatch, flushSave, getState, initStore, onStateChange } from './store'
import { checkForUpdates, initUpdater, installUpdate } from './updater'
import { createPanel, createPlato, getPanel, listDisplays, placePlato, showPlato } from './windows'
import type { Action } from '../shared/types'

// Windows Graphics Capture para ventanas (captura aunque esté tapada por otras).
app.commandLine.appendSwitch('enable-features', 'AllowWgcWindowCapturer,AllowWgcScreenCapturer')
app.setAppUserModelId('com.mestrangis.konkursox')
registerMediaScheme()
// solo para pruebas automáticas: otra carpeta de Documentos (para no tocar la de verdad)
if (process.env.KONK_TEST_DOCS) app.setPath('documents', process.env.KONK_TEST_DOCS)

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
    // primera vez en este ordenador (antes de crear nada): el panel ofrece importar un concurso
    firstRun = isFreshInstall()
    initStore(join(app.getPath('userData'), 'konkursox-state.json'), app.getVersion())
    handleMediaProtocol()
    try {
      ensureLibrary(getState().quiz.used)
    } catch (err) {
      console.error('[biblioteca]', err)
    }
    try {
      ensureThemes()
    } catch (err) {
      console.error('[temas]', err)
    }
    installDisplayMediaHandler()
    registerIpc()
    // mando (móvil) por Ably: solo si hay clave en la configuración local
    void startRemote()
    // YouTube no deja reproducir incrustado sin "Referer" (desde file:// no hay ninguno)
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*', '*://*.googlevideo.com/*', '*://*.ytimg.com/*'] }, (details, callback) => {
      const headers = { ...details.requestHeaders }
      if (!headers.Referer && !headers.referer) headers.Referer = 'https://konkursox.app/'
      callback({ requestHeaders: headers })
    })

    onStateChange((next, prev) => {
      if (next.plato.displayId !== prev.plato.displayId || next.plato.windowed !== prev.plato.windowed || next.plato.visible !== prev.plato.visible) {
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

  app.on('before-quit', () => {
    stopRemote()
    flushSave()
  })
  app.on('window-all-closed', () => app.quit())
}

let firstRun = false

const stamp = () => {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

function registerIpc(): void {
  // llevar el concurso a otro ordenador
  ipcMain.handle('app:firstRun', () => firstRun)
  ipcMain.handle('app:firstRunDone', () => {
    firstRun = false
  })
  ipcMain.handle('portable:size', () => exportSize())
  ipcMain.handle('portable:export', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.SaveDialogOptions = {
      title: 'Exportar todo el concurso',
      defaultPath: join(app.getPath('desktop'), `KONKURSOX-${stamp()}.konkursox`),
      filters: [{ name: 'Concurso de KONKURSOX', extensions: ['konkursox'] }]
    }
    // pruebas automáticas: sin diálogo
    const res = process.env.KONK_TEST_FILE ? { canceled: false, filePath: process.env.KONK_TEST_FILE } : win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    const file = res.filePath.toLowerCase().endsWith('.konkursox') ? res.filePath : res.filePath + '.konkursox'
    const info = await exportAll(file)
    return { file, ...info }
  })
  ipcMain.handle('portable:showFile', (_e, file: string) => shell.showItemInFolder(file))
  ipcMain.handle('portable:chooseImport', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: 'Importar un concurso de KONKURSOX',
      filters: [{ name: 'Concurso de KONKURSOX', extensions: ['konkursox'] }],
      properties: ['openFile']
    }
    const res = process.env.KONK_TEST_FILE ? { canceled: false, filePaths: [process.env.KONK_TEST_FILE] } : win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    try {
      return { file: res.filePaths[0], info: await inspectArchive(res.filePaths[0]), here: exportSize(), docs: docsDir() }
    } catch (err) {
      return { error: String((err as Error).message ?? err) }
    }
  })
  ipcMain.handle('portable:import', async (_e, file: string) => {
    try {
      await importAll(file)
      return null
    } catch (err) {
      return String((err as Error).message ?? err)
    }
  })
  ipcMain.handle('portable:wipe', () => wipeAll())
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
  ipcMain.handle('remote:info', () => remoteInfo())
  ipcMain.handle('remote:setKey', (_e, key: string) => setRemoteKey(key))
  ipcMain.handle('remote:disconnect', () => disconnectRemote())
  ipcMain.handle('remote:reconnect', () => startRemote())
  ipcMain.on('remote:publish', (_e, snap: unknown) => publishState(snap))
  ipcMain.on('remote:bank', (_e, data: unknown) => publishBank(data))
  ipcMain.handle('themes:list', () => listThemes())
  ipcMain.handle('themes:get', (_e, id: string) => readTheme(id))
  ipcMain.handle('themes:openDir', () => {
    ensureThemes()
    return shell.openPath(themesDir())
  })
  ipcMain.handle('audio:import', (_e, paths: string[], kind: 'musica' | 'efectos') => importAudio(paths, kind))
  ipcMain.handle('audio:choose', async (_e, kind: 'musica' | 'efectos') => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: kind === 'musica' ? 'Añadir música' : 'Añadir sonidos',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'webm'] }],
      properties: ['openFile', 'multiSelections']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? [] : importAudio(res.filePaths, kind)
  })
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
  ipcMain.handle('media:list', () => mediaLibrary())
  ipcMain.handle('media:import', (_e, paths: string[], folder: string) => importMedia(paths, folder))
  ipcMain.handle('media:folder', (_e, name: string) => createFolder(name))
  ipcMain.handle('media:delete', (_e, id: string) => deleteMedia(id))
  ipcMain.handle('media:youtube', (_e, url: string, folder: string) => addYoutube(url, folder))
  ipcMain.handle('media:openDir', () => shell.openPath(mediaDir()))
  ipcMain.handle('media:choose', async (_e, folder: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? getPanel()
    const opts: Electron.OpenDialogOptions = {
      title: 'Añadir imágenes o vídeos',
      filters: [{ name: 'Imágenes y vídeos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'] }],
      properties: ['openFile', 'multiSelections']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? 0 : importMedia(res.filePaths, folder)
  })
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
