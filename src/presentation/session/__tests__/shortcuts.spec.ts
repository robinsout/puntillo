import { describe, expect, it } from 'vitest'
import { shortcutOf, type Shortcut } from '../shortcuts'

// Feature keyboard-shortcuts, slice 1: a key is taken by its place on the keyboard, the code of the
// event, not by the character it types (criterion 2), so the same keys work in every layout.

describe('the shortcut of a key', () => {
  it.each([
    ['KeyA', 'C'],
    ['KeyS', 'D'],
    ['KeyD', 'E'],
    ['KeyF', 'F'],
    ['KeyG', 'G'],
    ['KeyH', 'A'],
    ['KeyJ', 'B'],
  ] as const)('takes %s for the note name %s (criterion 4)', (code, letter) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'name', letter })
  })

  it('takes = for the sharp (criterion 5)', () => {
    expect(shortcutOf('Equal')).toEqual<Shortcut>({ type: 'sharp' })
  })

  it.each(['Minus', 'NumpadSubtract'])('takes %s for the flat (criterion 5)', (code) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'flat' })
  })

  it.each([
    ['Digit1', 'whole'],
    ['Digit2', 'half'],
    ['Digit3', 'quarter'],
    ['Digit4', 'eighth'],
    ['Digit5', 'sixteenth'],
    ['Numpad1', 'whole'],
    ['Numpad2', 'half'],
    ['Numpad3', 'quarter'],
    ['Numpad4', 'eighth'],
    ['Numpad5', 'sixteenth'],
  ] as const)('takes %s for the %s note (criterion 8)', (code, value) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'duration', value })
  })

  it.each(['Period', 'NumpadDecimal'])('takes %s for the dot (criterion 8)', (code) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'dot' })
  })

  it.each(['Enter', 'NumpadEnter'])('takes %s for Check and Next (criterion 9)', (code) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'confirm' })
  })

  it('takes the left arrow for the previous note (criterion 10)', () => {
    expect(shortcutOf('ArrowLeft')).toEqual<Shortcut>({ type: 'previous-note' })
  })

  it('takes the right arrow for the next note (criterion 10)', () => {
    expect(shortcutOf('ArrowRight')).toEqual<Shortcut>({ type: 'next-note' })
  })

  // Only keys no slice of the feature gives a meaning to: W E T Y U, Z, X, 0 and the arrows up
  // and down are for the piano keyboard and Write notes.
  it.each([
    'KeyQ',
    'KeyK',
    'KeyL',
    'Digit6',
    'Digit9',
    'Numpad6',
    'Space',
    'Tab',
    'Escape',
    'Backspace',
    'Slash',
    'Comma',
    'ShiftLeft',
    'ControlLeft',
    '',
  ])('takes nothing for %j', (code) => {
    expect(shortcutOf(code)).toBeNull()
  })
})
