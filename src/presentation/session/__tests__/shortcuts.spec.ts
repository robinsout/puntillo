import { describe, expect, it } from 'vitest'
import { shortcutOf, type Shortcut } from '../shortcuts'

// Feature keyboard-shortcuts, slices 1–3: a key is taken by its place on the keyboard, the code of the
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

  // Slice 2: the black keys of the piano keyboard, each above the white key of its letter
  // (criterion 6), and the working octave moved down and up (criterion 7).
  it.each([
    ['KeyW', 'C'],
    ['KeyE', 'D'],
    ['KeyT', 'F'],
    ['KeyY', 'G'],
    ['KeyU', 'A'],
  ] as const)('takes %s for the black key above %s (criterion 6)', (code, below) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'black', below })
  })

  it('takes Z for the octave down (criterion 7)', () => {
    expect(shortcutOf('KeyZ')).toEqual<Shortcut>({ type: 'octave-down' })
  })

  it('takes X for the octave up (criterion 7)', () => {
    expect(shortcutOf('KeyX')).toEqual<Shortcut>({ type: 'octave-up' })
  })

  // Slice 3: Write notes moves the note a step with the arrows up and down and puts the natural
  // with 0 (criterion 11).
  it('takes the up arrow for a step up (criterion 11)', () => {
    expect(shortcutOf('ArrowUp')).toEqual<Shortcut>({ type: 'step-up' })
  })

  it('takes the down arrow for a step down (criterion 11)', () => {
    expect(shortcutOf('ArrowDown')).toEqual<Shortcut>({ type: 'step-down' })
  })

  it.each(['Digit0', 'Numpad0'])('takes %s for the natural (criterion 11)', (code) => {
    expect(shortcutOf(code)).toEqual<Shortcut>({ type: 'natural' })
  })

  // Only keys no slice of the feature gives a meaning to.
  it.each([
    'KeyQ',
    'KeyR',
    'KeyI',
    'KeyC',
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
