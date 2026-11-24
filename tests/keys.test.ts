import { describe, expect, it } from 'vitest'
import { effectIndexForKey, isNumpad, NUMPAD_LAYOUT, soundIndexForKey, soundKeyLabel } from '../src/shared/keys'

const k = (key: string, code: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) => ({ key, code, ...mods })

describe('botonera de sonidos en el teclado numérico', () => {
  it('Num1..Num9 con Bloq Num disparan los botones 1..9', () => {
    for (let n = 1; n <= 9; n++) expect(soundIndexForKey(k(String(n), `Numpad${n}`))).toBe(n - 1)
  })

  it('con Bloq Num desactivado no disparan nada', () => {
    expect(soundIndexForKey(k('Home', 'Numpad7'))).toBeNull()
    expect(soundIndexForKey(k('ArrowDown', 'Numpad2'))).toBeNull()
  })

  it('Num0 y el resto del numérico no son botones', () => {
    expect(soundIndexForKey(k('0', 'Numpad0'))).toBeNull()
    expect(soundIndexForKey(k('+', 'NumpadAdd'))).toBeNull()
  })

  it('Ctrl+1..9 de la fila de números sigue funcionando; los números solos no', () => {
    expect(soundIndexForKey(k('3', 'Digit3', { ctrlKey: true }))).toBe(2)
    expect(soundIndexForKey(k('3', 'Digit3'))).toBeNull()
    expect(soundIndexForKey(k('3', 'Digit3', { altKey: true }))).toBeNull()
  })

  it('se pinta con la disposición física del numérico: 7 8 9 / 4 5 6 / 1 2 3', () => {
    expect(NUMPAD_LAYOUT.map((i) => i + 1)).toEqual([7, 8, 9, 4, 5, 6, 1, 2, 3])
    expect([...NUMPAD_LAYOUT].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(soundKeyLabel(6)).toBe('Num 7')
  })

  it('el numérico se distingue de la fila de números (comodines 1-5 de la escalera)', () => {
    expect(isNumpad(k('1', 'Numpad1'))).toBe(true)
    expect(isNumpad(k('1', 'Digit1'))).toBe(false)
  })
})

describe('botonera de efectos visuales', () => {
  it('Alt+1..9 (fila de números) disparan los efectos 1..9', () => {
    for (let n = 1; n <= 9; n++) expect(effectIndexForKey(k(String(n), `Digit${n}`, { altKey: true }))).toBe(n - 1)
  })

  it('sin Alt, con Ctrl o en el numérico no son efectos', () => {
    expect(effectIndexForKey(k('1', 'Digit1'))).toBeNull()
    expect(effectIndexForKey(k('1', 'Digit1', { altKey: true, ctrlKey: true }))).toBeNull()
    expect(effectIndexForKey(k('1', 'Numpad1', { altKey: true }))).toBeNull()
  })
})
