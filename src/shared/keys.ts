// Asignación de teclas de las botoneras (sonidos y efectos visuales).

/** Datos mínimos de un evento de teclado (para poder probarlo sin navegador). */
export interface KeyLike {
  key: string
  code: string
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}

/**
 * Orden de pintado de la botonera de sonidos, igual que el teclado numérico:
 * arriba 7 8 9, en medio 4 5 6, abajo 1 2 3. Son índices de botón (tecla - 1).
 */
export const NUMPAD_LAYOUT: number[] = [6, 7, 8, 3, 4, 5, 0, 1, 2]

/** Etiqueta de la tecla de un botón de sonido. */
export const soundKeyLabel = (index: number): string => `Num ${index + 1}`

/**
 * Botón de sonido que dispara una tecla: Num1-Num9 (con Bloq Num activado) o Ctrl+1..9 como alternativa.
 * Devuelve el índice del botón (0-8) o null.
 */
export function soundIndexForKey(e: KeyLike): number | null {
  if (e.altKey || e.metaKey) return null
  const num = /^Numpad([1-9])$/.exec(e.code)
  // con Bloq Num desactivado las teclas del numérico son flechas, Inicio...: no cuentan
  if (num && !e.ctrlKey && e.key === num[1]) return Number(num[1]) - 1
  if (e.ctrlKey && /^[1-9]$/.test(e.key) && !num) return Number(e.key) - 1
  return null
}

/** Efecto visual que dispara una tecla: Alt+1..9 (fila de números). Índice 0-8 o null. */
export function effectIndexForKey(e: KeyLike): number | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null
  const m = /^Digit([1-9])$/.exec(e.code)
  return m ? Number(m[1]) - 1 : null
}

/** El teclado numérico no debe disparar las teclas de los juegos (p. ej. los comodines 1-5). */
export const isNumpad = (e: KeyLike): boolean => /^Numpad/.test(e.code)
