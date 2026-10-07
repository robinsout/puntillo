import { describe, expect, it } from 'vitest'
import { diatonicPitchesBetween, isSamePitch } from '@/domain/pitch'

describe('diatonicPitchesBetween', () => {
  it('lists the eight natural pitches from C4 to C5 in ascending order', () => {
    expect(diatonicPitchesBetween({ letter: 'C', octave: 4 }, { letter: 'C', octave: 5 })).toEqual([
      { letter: 'C', octave: 4 },
      { letter: 'D', octave: 4 },
      { letter: 'E', octave: 4 },
      { letter: 'F', octave: 4 },
      { letter: 'G', octave: 4 },
      { letter: 'A', octave: 4 },
      { letter: 'B', octave: 4 },
      { letter: 'C', octave: 5 },
    ])
  })

  it('crosses the octave boundary between B and C', () => {
    expect(diatonicPitchesBetween({ letter: 'A', octave: 3 }, { letter: 'D', octave: 4 })).toEqual([
      { letter: 'A', octave: 3 },
      { letter: 'B', octave: 3 },
      { letter: 'C', octave: 4 },
      { letter: 'D', octave: 4 },
    ])
  })

  it('returns a single pitch when both bounds are the same pitch', () => {
    expect(diatonicPitchesBetween({ letter: 'G', octave: 4 }, { letter: 'G', octave: 4 })).toEqual([
      { letter: 'G', octave: 4 },
    ])
  })
})

describe('isSamePitch', () => {
  it('treats pitches with the same letter and octave as the same', () => {
    expect(isSamePitch({ letter: 'E', octave: 4 }, { letter: 'E', octave: 4 })).toBe(true)
  })

  it('treats pitches with different letters as different', () => {
    expect(isSamePitch({ letter: 'E', octave: 4 }, { letter: 'F', octave: 4 })).toBe(false)
  })

  it('treats the same letter in different octaves as different pitches', () => {
    expect(isSamePitch({ letter: 'C', octave: 4 }, { letter: 'C', octave: 5 })).toBe(false)
  })
})
