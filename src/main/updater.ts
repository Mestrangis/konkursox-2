// Actualizaciones automáticas desde GitHub Releases (electron-updater).
// Se descarga en segundo plano y se instala al cerrar, o al pulsar "Reiniciar y actualizar" en el panel.
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { dispatch } from './store'

const { autoUpdater } = electronUpdater

export function initUpdater(): void {
  if (!app.isPackaged) {
    dispatch({ type: 'setUpdate', status: { state: 'disabled', message: 'Modo desarrollo' } })
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => dispatch({ type: 'setUpdate', status: { state: 'checking' } }))
  autoUpdater.on('update-not-available', () => dispatch({ type: 'setUpdate', status: { state: 'none' } }))
  autoUpdater.on('update-available', (i) => dispatch({ type: 'setUpdate', status: { state: 'available', version: i.version } }))
  autoUpdater.on('download-progress', (p) =>
    dispatch({ type: 'setUpdate', status: { state: 'downloading', percent: Math.round(p.percent) } })
  )
  autoUpdater.on('update-downloaded', (i) => dispatch({ type: 'setUpdate', status: { state: 'ready', version: i.version } }))
  autoUpdater.on('error', (e) => dispatch({ type: 'setUpdate', status: { state: 'error', message: String(e?.message ?? e) } }))
  void checkForUpdates()
  setInterval(() => void checkForUpdates(), 30 * 60 * 1000)
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    dispatch({ type: 'setUpdate', status: { state: 'error', message: String((e as Error)?.message ?? e) } })
  }
}

export function installUpdate(): void {
  if (app.isPackaged) autoUpdater.quitAndInstall(false, true)
}
