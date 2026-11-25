// Temas del plató: archivos JSON en Documentos\KONKURSOX\temas\ con variables CSS (colores, tipografías, brillo de marcos).
// Se pueden añadir más copiando uno y cambiando sus valores; el panel no cambia, solo lo que sale en el plató.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'

export interface Theme {
  nombre: string
  descripcion?: string
  /** versión del tema de serie (para actualizar los que no hayas tocado) */
  version?: number
  /** variables CSS (--k-...) que cambia respecto al tema clásico */
  vars: Record<string, string>
}

export const themesDir = (): string => join(app.getPath('documents'), 'KONKURSOX', 'temas')

/** Escala de acento (sustituye al dorado). */
function accent(c: string[], rgbSoft: string, rgbBase: string): Record<string, string> {
  const keys = ['900', '800', '600', '500', '450', '400', '350', '300', '200', '150', '100']
  const out: Record<string, string> = {}
  keys.forEach((k, i) => (out[`--k-gold-${k}`] = c[i]))
  out['--k-gold-a07'] = `rgba(${rgbSoft}, 0.07)`
  out['--k-gold-a11'] = `rgba(${rgbSoft}, 0.11)`
  out['--k-gold-a18'] = `rgba(${rgbSoft}, 0.18)`
  out['--k-gold-a22'] = `rgba(${rgbBase}, 0.22)`
  out['--k-gold-a45'] = `rgba(${rgbBase}, 0.45)`
  out['--k-gold-a50'] = `rgba(${rgbSoft}, 0.5)`
  out['--k-gold-a60'] = `rgba(${rgbBase}, 0.6)`
  out['--k-cam-shadow'] = '0 0 0 1px var(--k-gold-600), 0 0 0 5px var(--k-navy-875), 0 0 0 6px var(--k-gold-a22), 0 0 34px var(--k-gold-a22), 0 24px 60px rgba(0, 0, 0, 0.6)'
  return out
}

export const DEFAULT_THEMES: Record<string, Theme> = {
  clasico: { nombre: 'Clásico', descripcion: 'Marino y oro (el de siempre)', vars: {} },
  noche: {
    nombre: 'Noche',
    descripcion: 'Más oscuro y con menos brillo',
    vars: {
      '--k-navy-1000': '#010206',
      '--k-navy-950': '#02040a',
      '--k-navy-925': '#02050a',
      '--k-navy-900': '#03060e',
      '--k-navy-875': '#03050a',
      '--k-navy-850': '#040812',
      '--k-navy-800': '#050a17',
      '--k-navy-750': '#060b18',
      '--k-navy-700': '#060c19',
      '--k-navy-650': '#060912',
      '--k-navy-600': '#0b1426',
      '--k-navy-550': '#0c152b',
      '--k-navy-500': '#0d162d',
      '--k-navy-450': '#121d38',
      '--k-navy-400': '#111b34',
      '--k-navy-350': '#141d30',
      '--k-silhouette': '#1a2338',
      '--k-text-muted': '#76819a',
      '--k-cam-shadow': '0 0 0 1px var(--k-gold-800), 0 0 0 5px var(--k-navy-875), 0 24px 60px rgba(0, 0, 0, 0.8)'
    }
  },
  claro: {
    nombre: 'Claro',
    descripcion: 'Todo claro: escenario, marcos, pregunta y opciones, con texto oscuro y dorados oscuros',
    version: 4,
    vars: {
      '--k-bg-stage': 'radial-gradient(ellipse 75% 60% at 50% 32%, #ffffff 0%, #e9eff8 45%, #c9d6ea 100%)',
      '--k-bg-cover': 'radial-gradient(ellipse 60% 55% at 50% 50%, #ffffff 0%, #e6ecf7 45%, #c2cfe5 100%)',
      '--k-bg-cam': 'radial-gradient(ellipse at 50% 38%, #e6ecf5, #bccadf 78%)',
      '--k-silhouette': '#a3b3cd',
      '--k-cam-vignette': 'radial-gradient(ellipse at center, transparent 62%, rgba(20, 32, 60, 0.16) 100%)',
      '--k-cam-shadow': '0 0 0 1px var(--k-gold-600), 0 0 0 5px #ffffff, 0 0 0 6px var(--k-gold-a45), 0 16px 36px rgba(20, 32, 60, 0.28)',
      '--k-bevel-fill': 'linear-gradient(180deg, #ffffff 0%, #f2f5fa 55%, #dde5f1 100%)',
      '--k-bevel-edge': 'linear-gradient(90deg, #8a6a2f, #c9a961 50%, #8a6a2f)',
      '--k-panel-fill': 'linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(226, 233, 245, 0.96))',
      '--k-text': '#13203b',
      '--k-text-muted': '#5b6884',
      '--k-text-quote': '#2a2412',
      '--k-gold-900': '#3f2f0e',
      '--k-gold-800': '#5a4415',
      '--k-gold-600': '#8a6a2f',
      '--k-gold-500': '#a07c35',
      '--k-gold-450': '#8f6d27',
      '--k-gold-400': '#866420',
      '--k-gold-350': '#866420',
      '--k-gold-300': '#6f5219',
      '--k-gold-200': '#a07c35',
      '--k-gold-150': '#c9a961',
      '--k-gold-100': '#e6cb85',
      '--k-gold-a07': 'rgba(138, 106, 47, 0.07)',
      '--k-gold-a11': 'rgba(138, 106, 47, 0.11)',
      '--k-gold-a18': 'rgba(138, 106, 47, 0.18)',
      '--k-gold-a22': 'rgba(138, 106, 47, 0.22)',
      '--k-gold-a45': 'rgba(138, 106, 47, 0.45)',
      '--k-gold-a50': 'rgba(138, 106, 47, 0.5)',
      '--k-gold-a60': 'rgba(138, 106, 47, 0.6)',
      '--k-navy-875': '#ffffff',
      '--k-rung': '#5a4415',
      '--k-rung-safe': '#13203b',
      '--k-rung-safe-n': '#13203b',
      '--k-est-mark': '#2a3550',
      '--k-ladder-bg': 'linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(224, 231, 243, 0.97))',
      '--k-life-bg': 'radial-gradient(ellipse at 50% 30%, #ffffff, #dce4f1 75%)'
    }
  },
  rojo: {
    nombre: 'Acento rojo',
    descripcion: 'Marino con acento rojo',
    vars: accent(['#5e1a1f', '#7d2229', '#b23a44', '#c9505a', '#d96b74', '#e8848c', '#e8838b', '#f2aab0', '#f4b6bb', '#f8c9cd', '#ffe9eb'], '214, 110, 118', '201, 80, 90')
  },
  verde: {
    nombre: 'Acento verde',
    descripcion: 'Marino con acento verde',
    vars: accent(['#1d4f33', '#256b44', '#3f9a68', '#52b07c', '#6cc492', '#86d6a8', '#84d4a6', '#aee6c6', '#b9ebcf', '#ccf1dc', '#ebfaf1'], '120, 200, 155', '82, 176, 124')
  },
  morado: {
    nombre: 'Acento morado',
    descripcion: 'Marino con acento morado',
    vars: accent(['#3e2563', '#553384', '#7d57b8', '#9268cc', '#a582d8', '#b89de4', '#b69be2', '#d2c0f0', '#d9c9f2', '#e4d8f6', '#f5f0fc'], '170, 140, 220', '146, 104, 204')
  }
}

/** Crea la carpeta y los temas de serie que falten (no pisa los que hayas cambiado). */
export function ensureThemes(): void {
  const dir = themesDir()
  mkdirSync(dir, { recursive: true })
  for (const [id, t] of Object.entries(DEFAULT_THEMES)) {
    const f = join(dir, `${id}.json`)
    // el Claro de la 0.6 se rehízo: si sigue siendo el de entonces (sin versión), se actualiza
    const old = existsSync(f) && id === 'claro' && !/"version": 4/.test(readFileSync(f, 'utf8'))
    if (!existsSync(f) || old) writeFileSync(f, JSON.stringify(t, null, 2) + '\n', 'utf8')
  }
  const readme = join(dir, 'LEEME.txt')
  if (!existsSync(readme))
    writeFileSync(
      readme,
      'Temas del plató de KONKURSOX.\r\nCada archivo .json es un tema: "nombre", "descripcion" y "vars" (variables CSS --k-...).\r\nPara crear uno, copia un archivo, cámbiale el nombre y los colores, y elígelo en Ajustes.\r\nLas variables que no pongas se quedan como en el tema Clásico.\r\n',
      'utf8'
    )
}

export function listThemes(): { id: string; nombre: string; descripcion: string }[] {
  ensureThemes()
  const out: { id: string; nombre: string; descripcion: string }[] = []
  for (const f of readdirSync(themesDir()).filter((x) => x.toLowerCase().endsWith('.json')).sort()) {
    const t = readTheme(basename(f, '.json'))
    if (t) out.push({ id: basename(f, '.json'), nombre: t.nombre, descripcion: t.descripcion ?? '' })
  }
  // el clásico primero
  return out.sort((a, b) => (a.id === 'clasico' ? -1 : b.id === 'clasico' ? 1 : a.nombre.localeCompare(b.nombre, 'es')))
}

export function readTheme(id: string): Theme | null {
  if (!/^[\w\- áéíóúñÁÉÍÓÚÑ]+$/.test(id)) return null
  try {
    const raw = JSON.parse(readFileSync(join(themesDir(), `${id}.json`), 'utf8').replace(/^﻿/, '')) as Partial<Theme>
    const vars: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw.vars ?? {})) if (k.startsWith('--') && typeof v === 'string') vars[k] = v
    return { nombre: typeof raw.nombre === 'string' ? raw.nombre : id, descripcion: raw.descripcion, vars }
  } catch {
    return null
  }
}
