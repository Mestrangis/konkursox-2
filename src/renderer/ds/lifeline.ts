// Icono de un comodín: propio (trazado o texto) o una imagen subida.
import { LIFELINE_ICONS, type LifelineDef } from '../../shared/quiz'
import { h, svg } from './components'

export function lifelineIcon(def: Pick<LifelineDef, 'icon' | 'name'>, size: number, color: string): Element {
  if (def.icon.startsWith('img:')) {
    const img = h('img', '', { width: size, height: size, objectFit: 'contain' })
    img.src = `konk-media://imagenes/${encodeURIComponent(def.icon.slice(4))}`
    img.alt = ''
    return img
  }
  const ic = LIFELINE_ICONS[def.icon] ?? LIFELINE_ICONS.estrella
  if (ic.text) return h('span', '', { fontSize: Math.round(size * 0.62), fontWeight: 700, color, letterSpacing: '0.02em', lineHeight: 1, whiteSpace: 'nowrap' }, [ic.text])
  return svg('0 0 24 24', { width: size, height: size }, `<path fill="${color}" fill-rule="evenodd" d="${ic.path}"></path>`)
}
