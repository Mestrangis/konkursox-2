// Captura de ventanas (Discord) con desktopCapturer + getDisplayMedia.
// En Windows, Chromium usa Windows Graphics Capture para ventanas: funciona aunque esté tapada.
import { desktopCapturer, session } from 'electron'
import { dispatch, getState } from './store'
import type { CaptureSource } from '../shared/types'

const OWN_TITLE = /^KONKURSOX/i

export async function listWindowSources(): Promise<CaptureSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false
  })
  return sources
    .filter((s) => s.name && !OWN_TITLE.test(s.name))
    .map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() }))
}

/** Busca la fuente guardada; si ya no existe (Discord reiniciado), la primera ventana que contenga "Discord". */
export async function resolveSource(): Promise<string | null> {
  const { sourceId, sourceName } = getState().cameras
  const list = await listWindowSources()
  if (sourceId && list.some((s) => s.id === sourceId)) return sourceId
  const byName = sourceName ? list.find((s) => s.name === sourceName) : undefined
  const found = byName ?? list.find((s) => /discord/i.test(s.name))
  if (!found) return null
  if (found.id !== sourceId) dispatch({ type: 'setCameraSource', sourceId: found.id, sourceName: found.name })
  return found.id
}

/** Ambas ventanas (plató y panel) llaman a getDisplayMedia(); aquí se responde con la ventana configurada. */
export function installDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const { sourceId, sourceName } = getState().cameras
      if (!sourceId) {
        callback({})
        return
      }
      callback({ video: { id: sourceId, name: sourceName ?? 'Discord' } as Electron.DesktopCapturerSource })
    },
    { useSystemPicker: false }
  )
}
