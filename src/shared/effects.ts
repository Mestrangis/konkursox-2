// Efectos visuales del plató (botonera "Efectos", Alt+1..9). "Mantener": se quedan hasta volver a pulsar.
// "Golpe": duran un momento. Cada uno puede llevar un sonido.
import type { GameState, SlotId } from './types'

export type EffectId = 'tension' | 'apagon' | 'focos' | 'latido' | 'temblor' | 'destello' | 'confeti' | 'foco'

export interface EffectDef {
  id: EffectId
  label: string
  kind: 'hold' | 'hit'
  /** cuánto dura un golpe (ms) */
  ms?: number
  hint: string
}

export const EFFECTS: EffectDef[] = [
  { id: 'tension', label: 'Tensión', kind: 'hold', hint: 'Viñeta que oscurece los bordes' },
  { id: 'apagon', label: 'Apagón', kind: 'hold', hint: 'Todo a oscuras salvo la pregunta' },
  { id: 'focos', label: 'Focos', kind: 'hold', hint: 'Haces de luz moviéndose' },
  { id: 'latido', label: 'Latido', kind: 'hold', hint: 'Desenfoque que palpita, con latido' },
  { id: 'temblor', label: 'Temblor', kind: 'hit', ms: 700, hint: 'La pantalla vibra' },
  { id: 'destello', label: 'Destello', kind: 'hit', ms: 900, hint: 'Flash de luz con onda' },
  { id: 'confeti', label: 'Confeti', kind: 'hit', ms: 4200, hint: 'Confeti dorado' },
  { id: 'foco', label: 'Foco en uno', kind: 'hold', hint: 'Oscurece al resto y destaca una cámara' }
]

export interface EffectsState {
  /** efectos "mantener" activos */
  on: Partial<Record<EffectId, boolean>>
  /** último golpe (id y cuándo) */
  hit: { id: EffectId; at: number } | null
  /** cámara destacada por "Foco en uno" */
  focus: SlotId | null
  /** sonido asociado a cada efecto (archivo de efectos) y su volumen */
  sounds: Partial<Record<EffectId, string | null>>
  volumes: Partial<Record<EffectId, number>>
}

export type EffectsAction =
  | { type: 'fxvToggle'; id: EffectId; now: number; focus?: SlotId | null }
  | { type: 'fxvClear' }
  | { type: 'fxvSound'; id: EffectId; file?: string | null; volume?: number }

export function defaultEffects(): EffectsState {
  return { on: {}, hit: null, focus: null, sounds: { latido: 'kx-latido.wav', destello: 'kx-tension.wav', confeti: 'kx-aplausos.wav' }, volumes: {} }
}

export const effectDef = (id: EffectId): EffectDef => EFFECTS.find((e) => e.id === id)!

/** ¿Está "puesto" un efecto? (los golpes, solo mientras duran) */
export function effectActive(s: Pick<GameState, 'effects'>, id: EffectId, now: number): boolean {
  const d = effectDef(id)
  if (d.kind === 'hold') return !!s.effects.on[id]
  const h = s.effects.hit
  return !!h && h.id === id && now >= h.at && now - h.at < (d.ms ?? 800)
}

export function applyEffectsAction(s: GameState, a: EffectsAction): GameState {
  const e = s.effects
  switch (a.type) {
    case 'fxvToggle': {
      const d = EFFECTS.find((x) => x.id === a.id)
      if (!d) return s
      if (d.kind === 'hit') return { ...s, effects: { ...e, hit: { id: a.id, at: a.now } } }
      const on = !e.on[a.id]
      return { ...s, effects: { ...e, on: { ...e.on, [a.id]: on }, focus: a.id === 'foco' ? (on ? a.focus ?? e.focus : e.focus) : e.focus } }
    }
    case 'fxvClear':
      return { ...s, effects: { ...e, on: {}, hit: null } }
    case 'fxvSound':
      return {
        ...s,
        effects: {
          ...e,
          sounds: a.file !== undefined ? { ...e.sounds, [a.id]: a.file } : e.sounds,
          volumes: a.volume !== undefined ? { ...e.volumes, [a.id]: Math.max(0, Math.min(1, a.volume)) } : e.volumes
        }
      }
    default:
      return s
  }
}
