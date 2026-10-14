import { describe, expect, it } from 'vitest'
import { presetDifficulty } from '@/domain/difficulty'
import { keyboardKeys, keyIn, shiftOctave, startOctave, type PianoKey } from '@/domain/keyboard'
import type { Letter } from '@/domain/pitch'

// Feature keyboard-shortcuts, slice 2: the letters of the computer keyboard play the piano keys of
// one octave, the working octave, numbered as in scientific pitch notation (C4…B4 is octave 4). A
// question starts in the octave of the white key in the middle of the keyboard (criterion 7); Z and
// X move it an octave down and up while it keeps at least one key of the keyboard (edge case 3).
// A S D F G H J are the white keys of the octave, W E T Y U the black keys above C D F G A
// (criterion 6).

const key = (number: number): PianoKey => ({ number })

const between = (low: number, high: number): PianoKey[] =>
  Array.from({ length: high - low + 1 }, (_, index) => key(low + index))

// First steps: do4 to do5.
const FIRST_STEPS = keyboardKeys(presetDifficulty('first-steps'))
// Confident reading, signs and all: si3 to la5.
const CONFIDENT = keyboardKeys(presetDifficulty('confident-reading'))

describe('startOctave', () => {
  it('is 4 for First steps, whose middle white key is sol4', () => {
    expect(startOctave(FIRST_STEPS)).toBe(4)
  })

  it('is 4 for a keyboard from si3 to la5, whose middle white key is si4', () => {
    expect(startOctave(CONFIDENT)).toBe(4)
  })

  it('is 5 for a keyboard from do4 to do6, whose middle white key is do5', () => {
    expect(startOctave(between(60, 84))).toBe(5)
  })

  it('is 3 for a keyboard from do3 to do4, whose middle white key is sol3', () => {
    expect(startOctave(between(48, 60))).toBe(3)
  })

  it('takes the upper of two middle white keys, as the keyboard does: la3 to re4 gives do4', () => {
    expect(startOctave(between(57, 62))).toBe(4)
  })

  it('is the octave of the only key of a keyboard of one key', () => {
    expect(startOctave([key(84)])).toBe(6)
  })
})

describe('shiftOctave', () => {
  it('moves up to an octave that holds a key of the keyboard', () => {
    expect(shiftOctave(FIRST_STEPS, 4, 1)).toBe(5)
  })

  it('moves up to an octave the keyboard reaches by one key alone', () => {
    expect(shiftOctave([key(60), key(72)], 4, 1)).toBe(5)
  })

  it('stays at the top edge, where the octave above holds no key', () => {
    expect(shiftOctave(FIRST_STEPS, 5, 1)).toBe(5)
  })

  it('stays at the bottom edge, where the octave below holds no key', () => {
    expect(shiftOctave(FIRST_STEPS, 4, -1)).toBe(4)
  })

  it('moves down to the octave of si3, the one key below do4 of a keyboard with signs', () => {
    expect(shiftOctave(CONFIDENT, 4, -1)).toBe(3)
  })

  it('stays below si3, where the octave holds no key', () => {
    expect(shiftOctave(CONFIDENT, 3, -1)).toBe(3)
  })

  it('moves down from 5 to 4 and back up', () => {
    expect(shiftOctave(CONFIDENT, 5, -1)).toBe(4)
    expect(shiftOctave(CONFIDENT, 4, 1)).toBe(5)
  })

  it('takes a black key as a key of the octave: re♭6 alone holds octave 6', () => {
    expect(shiftOctave([key(72), key(85)], 5, 1)).toBe(6)
  })
})

describe('keyIn', () => {
  it.each([
    ['C', 60],
    ['D', 62],
    ['E', 64],
    ['F', 65],
    ['G', 67],
    ['A', 69],
    ['B', 71],
  ] as const)('gives the white key %s of octave 4: %i', (letter: Letter, number) => {
    expect(keyIn(4, letter, false)).toEqual(key(number))
  })

  it.each([
    ['C', 61],
    ['D', 63],
    ['F', 66],
    ['G', 68],
    ['A', 70],
  ] as const)('gives the black key above %s of octave 4: %i', (letter: Letter, number) => {
    expect(keyIn(4, letter, true)).toEqual(key(number))
  })

  it.each([
    [3, 'B', 59],
    [5, 'C', 72],
    [0, 'A', 21],
    [7, 'C', 96],
  ] as const)('gives in octave %i the white key %s: %i', (octave, letter: Letter, number) => {
    expect(keyIn(octave, letter, false)).toEqual(key(number))
  })

  it('gives in octave 5 the black key above la: 82', () => {
    expect(keyIn(5, 'A', true)).toEqual(key(82))
  })
})
