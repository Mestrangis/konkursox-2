// Ventanas: PLATÓ (sin marco, pantalla completa en el monitor elegido) y PANEL del presentador.
import { join } from 'node:path'
import { BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { dispatch, getState } from './store'
import type { DisplayInfo } from '../shared/types'

let plato: BrowserWindow | null = null
let panel: BrowserWindow | null = null

const preload = join(__dirname, '../preload/index.js')

function load(win: BrowserWindow, page: 'plato' | 'panel'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

export function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Pantalla ${i + 1}`,
    bounds: d.bounds,
    primary: d.id === primary,
    scaleFactor: d.scaleFactor
  }))
}

/** Monitor del plató: el guardado si sigue conectado; si no, el primero que no sea el principal. */
export function platoDisplay(): Display {
  const all = screen.getAllDisplays()
  const saved = all.find((d) => d.id === getState().plato.displayId)
  if (saved) return saved
  const primary = screen.getPrimaryDisplay()
  return all.find((d) => d.id !== primary.id) ?? primary
}

function panelDisplay(): Display {
  const pd = platoDisplay()
  const primary = screen.getPrimaryDisplay()
  if (primary.id !== pd.id) return primary
  return screen.getAllDisplays().find((d) => d.id !== pd.id) ?? primary
}

function centered(area: Rectangle, w: number, h: number): Rectangle {
  const width = Math.min(w, area.width)
  const height = Math.min(h, area.height)
  return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height }
}

export function createPlato(): BrowserWindow {
  if (plato && !plato.isDestroyed()) return plato
  plato = new BrowserWindow({
    title: 'KONKURSOX · Plató',
    width: 1920,
    height: 1080,
    frame: false,
    show: false,
    backgroundColor: '#03060d',
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  plato.on('page-title-updated', (e) => e.preventDefault())
  plato.once('ready-to-show', () => {
    void placePlato()
  })
  plato.on('closed', () => {
    plato = null
  })
  load(plato, 'plato')
  return plato
}

let placing: Promise<void> = Promise.resolve()

/** Coloca el plató en su monitor (pantalla completa o en ventana para pruebas). Serializado. */
export function placePlato(): Promise<void> {
  placing = placing.then(doPlace, doPlace)
  return placing
}

async function doPlace(): Promise<void> {
  const win = plato
  if (!win || win.isDestroyed()) return
  const { windowed, visible } = getState().plato
  const d = platoDisplay()
  if (win.isFullScreen()) {
    await new Promise<void>((res) => {
      const t = setTimeout(res, 600)
      win.once('leave-full-screen', () => {
        clearTimeout(t)
        res()
      })
      win.setFullScreen(false)
    })
  }
  if (windowed) {
    win.setResizable(true)
    win.setBounds(centered(d.workArea, 960, 540))
  } else {
    win.setBounds(d.bounds)
    win.setFullScreen(true)
  }
  if (visible) {
    if (!win.isVisible()) win.showInactive()
  } else win.hide()
}

export function createPanel(onClosed: () => void): BrowserWindow {
  if (panel && !panel.isDestroyed()) return panel
  const d = panelDisplay()
  panel = new BrowserWindow({
    title: 'KONKURSOX · Panel del presentador',
    ...centered(d.workArea, 1480, 940),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#050a16',
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  panel.on('page-title-updated', (e) => e.preventDefault())
  panel.once('ready-to-show', () => {
    panel?.show()
    if (d.workArea.width < 1600) panel?.maximize()
  })
  panel.on('closed', () => {
    panel = null
    onClosed()
  })
  load(panel, 'panel')
  return panel
}

export function showPlato(): void {
  dispatch({ type: 'setPlato', patch: { visible: true } })
  if (!plato || plato.isDestroyed()) createPlato()
  else void placePlato()
}

export const getPanel = (): BrowserWindow | null => (panel && !panel.isDestroyed() ? panel : null)
export const getPlato = (): BrowserWindow | null => (plato && !plato.isDestroyed() ? plato : null)
