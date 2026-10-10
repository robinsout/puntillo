import { describe, expect, expectTypeOf, it } from 'vitest'
import { isSamePitch, isSameSound, type Alteration, type Pitch } from '@/domain/pitch'

// Feature accidentals, slice 1. A pitch is a letter, an alteration and an octave (spec 4.1): the
// alteration goes from a double flat, −2, to a double sharp, +2. A natural pitch has no
// alteration field, so that it is written as before: { letter: 'C', octave: 4 }.
//
// Spec 4.1 and 4.2 tell two equalities apart: C♯4 and D♭4 sound the same, yet they are written
// differently. isSamePitch compares the writing, isSameSound the sound.

const pitch = (text: string): Pitch => {
  const match = /^([A-G])(bb|b|##|#|)(\d)$/.exec(text)
  if (!match) throw new Error(`not a pitch: ${text}`)
  const ALTERATIONS: Record<string, Alteration | undefined> = {
    bb: -2,
    b: -1,
    '': undefined,
    '#': 1,
    '##': 2,
  }
  const alteration = ALTERATIONS[match[2] ?? '']
  const letter = match[1] as Pitch['letter']
  const octave = Number(match[3])
  return alteration === undefined ? { letter, octave } : { letter, octave, alteration }
}

describe('the alteration of a pitch', () => {
  it('goes from a double flat to a double sharp, a natural pitch having none', () => {
    expectTypeOf<Alteration>().toEqualTypeOf<-2 | -1 | 1 | 2>()
    expectTypeOf<Pitch['alteration']>().toEqualTypeOf<Alteration | undefined>()
    expectTypeOf<{ letter: 'C'; octave: 4 }>().toExtend<Pitch>()
  })
})

describe('isSamePitch with alterations', () => {
  it('holds for the same letter, alteration and octave', () => {
    expect(isSamePitch(pitch('F#4'), pitch('F#4'))).toBe(true)
    expect(isSamePitch(pitch('Bb4'), pitch('Bb4'))).toBe(true)
  })

  it('does not hold when only one of them is altered, either way round', () => {
    expect(isSamePitch(pitch('F#4'), pitch('F4'))).toBe(false)
    expect(isSamePitch(pitch('F4'), pitch('F#4'))).toBe(false)
  })

  it('does not hold for a sharp and a flat of the same letter', () => {
    expect(isSamePitch(pitch('F#4'), pitch('Fb4'))).toBe(false)
  })

  // Spec 4.1: they sound the same, but they are written differently.
  it('does not hold for C♯4 and D♭4', () => {
    expect(isSamePitch(pitch('C#4'), pitch('Db4'))).toBe(false)
  })

  it('takes an alteration left undefined as natural', () => {
    expect(isSamePitch({ letter: 'C', octave: 4, alteration: undefined }, pitch('C4'))).toBe(true)
  })
})

describe('isSameSound', () => {
  it.each([
    ['C#4', 'Db4'],
    ['F#4', 'Gb4'],
    ['A#4', 'Bb4'],
    // Across the octave: B♯3 is C4, C♭5 is B4.
    ['B#3', 'C4'],
    ['Cb5', 'B4'],
    ['E#4', 'F4'],
    ['Fb4', 'E4'],
    ['F##4', 'G4'],
    ['Bbb3', 'A3'],
    ['C4', 'C4'],
    ['G#5', 'G#5'],
  ])('holds for %s and %s', (a, b) => {
    expect(isSameSound(pitch(a), pitch(b))).toBe(true)
    expect(isSameSound(pitch(b), pitch(a))).toBe(true)
  })

  it.each([
    ['C#4', 'D4'],
    ['C4', 'C#4'],
    ['Db4', 'C4'],
    ['C#4', 'C#5'],
    ['B#3', 'C5'],
    ['E4', 'F4'],
  ])('does not hold for %s and %s', (a, b) => {
    expect(isSameSound(pitch(a), pitch(b))).toBe(false)
  })
})
