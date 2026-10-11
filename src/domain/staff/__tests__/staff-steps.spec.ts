import { describe, expect, it } from 'vitest'
import { diatonicPitchesBetween, type Letter, type Pitch } from '@/domain/pitch'
import { canStepDown, canStepUp, nearestStep, pitchAtStep, stepDown, stepUp } from '@/domain/staff'

// Feature m2-write-notes, criterion 5 and edge cases 1–2: a note is written on a step of the staff,
// a line or a space, within the steps the difficulty allows. The steps are given in ascending
// order, as allowedPitches gives them.

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

// First steps: C4–C5 without ledger lines, so C4 is left out. Seven steps, G4 in the middle.
const D4_TO_C5 = diatonicPitchesBetween(pitch('D', 4), pitch('C', 5))
// Eight steps: the middle falls between F4 and G4.
const C4_TO_C5 = diatonicPitchesBetween(pitch('C', 4), pitch('C', 5))

describe('pitchAtStep on the treble clef', () => {
  // Steps are counted in lines and spaces from the bottom line up, as staffPosition reads them.
  it.each<[number, Letter, number]>([
    [-6, 'F', 3],
    [-4, 'A', 3],
    [-2, 'C', 4],
    [-1, 'D', 4],
    [0, 'E', 4],
    [1, 'F', 4],
    [2, 'G', 4],
    [4, 'B', 4],
    [5, 'C', 5],
    [8, 'F', 5],
    [9, 'G', 5],
    [12, 'C', 6],
  ])('puts step %i on %s%i', (step, letter, octave) => {
    expect(pitchAtStep(step, 'treble')).toEqual(pitch(letter, octave))
  })

  it('gives a natural pitch, without an alteration', () => {
    expect(pitchAtStep(1, 'treble')).not.toHaveProperty('alteration')
  })
})

describe('nearestStep', () => {
  it('keeps a pitch that is one of the steps', () => {
    expect(nearestStep(pitch('A', 4), D4_TO_C5)).toEqual(pitch('A', 4))
  })

  it.each<[Letter, number]>([
    ['D', 4],
    ['C', 5],
  ])('keeps the edge step %s%i', (letter, octave) => {
    expect(nearestStep(pitch(letter, octave), D4_TO_C5)).toEqual(pitch(letter, octave))
  })

  // Edge case 1: a touch above or below the allowed steps writes the note on the edge one.
  it.each<[Letter, number]>([
    ['D', 5],
    ['F', 5],
    ['C', 7],
  ])('takes %s%i above the steps down to the top one', (letter, octave) => {
    expect(nearestStep(pitch(letter, octave), D4_TO_C5)).toEqual(pitch('C', 5))
  })

  it.each<[Letter, number]>([
    ['C', 4],
    ['A', 3],
    ['C', 2],
  ])('takes %s%i below the steps up to the bottom one', (letter, octave) => {
    expect(nearestStep(pitch(letter, octave), D4_TO_C5)).toEqual(pitch('D', 4))
  })
})

describe('stepUp and stepDown', () => {
  it('move a written note one step up', () => {
    expect(stepUp(pitch('G', 4), D4_TO_C5)).toEqual(pitch('A', 4))
  })

  it('move a written note one step down', () => {
    expect(stepDown(pitch('G', 4), D4_TO_C5)).toEqual(pitch('F', 4))
  })

  it('cross the octave between B and C', () => {
    expect(stepUp(pitch('B', 4), D4_TO_C5)).toEqual(pitch('C', 5))
    expect(stepDown(pitch('C', 5), D4_TO_C5)).toEqual(pitch('B', 4))
  })

  it('leave a note on the top step where it is when moved up', () => {
    expect(stepUp(pitch('C', 5), D4_TO_C5)).toEqual(pitch('C', 5))
  })

  it('leave a note on the bottom step where it is when moved down', () => {
    expect(stepDown(pitch('D', 4), D4_TO_C5)).toEqual(pitch('D', 4))
  })

  // Edge case 2: before a note is written, either button writes it in the middle of the range.
  describe('before a note is written', () => {
    it('write it on the middle step of an odd number of steps', () => {
      expect(stepUp(null, D4_TO_C5)).toEqual(pitch('G', 4))
      expect(stepDown(null, D4_TO_C5)).toEqual(pitch('G', 4))
    })

    // Of the two middle steps the lower one, the same for both buttons.
    it('write it on the lower of the two middle steps of an even number of steps', () => {
      expect(stepUp(null, C4_TO_C5)).toEqual(pitch('F', 4))
      expect(stepDown(null, C4_TO_C5)).toEqual(pitch('F', 4))
    })

    it('write it on the only step there is', () => {
      const one = [pitch('B', 4)]

      expect(stepUp(null, one)).toEqual(pitch('B', 4))
      expect(stepDown(null, one)).toEqual(pitch('B', 4))
    })
  })
})

// Edge case 2: on the edge step the button towards the edge is disabled.
describe('canStepUp and canStepDown', () => {
  it('allow both ways from a step inside the range', () => {
    expect(canStepUp(pitch('G', 4), D4_TO_C5)).toBe(true)
    expect(canStepDown(pitch('G', 4), D4_TO_C5)).toBe(true)
  })

  it('allow no way up from the top step', () => {
    expect(canStepUp(pitch('C', 5), D4_TO_C5)).toBe(false)
    expect(canStepDown(pitch('C', 5), D4_TO_C5)).toBe(true)
  })

  it('allow no way down from the bottom step', () => {
    expect(canStepDown(pitch('D', 4), D4_TO_C5)).toBe(false)
    expect(canStepUp(pitch('D', 4), D4_TO_C5)).toBe(true)
  })

  it('allow both ways before a note is written, since either writes it', () => {
    expect(canStepUp(null, D4_TO_C5)).toBe(true)
    expect(canStepDown(null, D4_TO_C5)).toBe(true)
  })
})
