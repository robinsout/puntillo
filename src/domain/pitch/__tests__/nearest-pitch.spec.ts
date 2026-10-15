import { describe, expect, it } from 'vitest'
import { nearestPitchOfLetter, type Pitch } from '@/domain/pitch'

// Feature design-system, slice 3, criterion 13: a name answered without an octave is shown on the
// staff on the step of its letter nearest to the right note.

const pitch = (letter: Pitch['letter'], octave: number): Pitch => ({ letter, octave })

describe('nearestPitchOfLetter', () => {
  it('keeps the octave of the note for its own letter', () => {
    expect(nearestPitchOfLetter('C', undefined, pitch('C', 4))).toEqual(pitch('C', 4))
  })

  it('goes up when the letter is nearer above', () => {
    expect(nearestPitchOfLetter('F', undefined, pitch('C', 4))).toEqual(pitch('F', 4))
  })

  it('goes down when the letter is nearer below', () => {
    expect(nearestPitchOfLetter('A', undefined, pitch('C', 4))).toEqual(pitch('A', 3))
  })

  it('goes down to the fourth below rather than up to the fifth above', () => {
    expect(nearestPitchOfLetter('G', undefined, pitch('C', 4))).toEqual(pitch('G', 3))
  })

  it('goes up to the fourth above rather than down to the fifth below', () => {
    expect(nearestPitchOfLetter('C', undefined, pitch('G', 4))).toEqual(pitch('C', 5))
  })

  it('crosses the octave upwards from B to C', () => {
    expect(nearestPitchOfLetter('C', undefined, pitch('B', 4))).toEqual(pitch('C', 5))
  })

  it('crosses the octave downwards from C to B', () => {
    expect(nearestPitchOfLetter('B', undefined, pitch('C', 5))).toEqual(pitch('B', 4))
  })

  it('takes the step a second above in the same octave', () => {
    expect(nearestPitchOfLetter('D', undefined, pitch('C', 4))).toEqual(pitch('D', 4))
  })

  it('carries the alteration answered', () => {
    expect(nearestPitchOfLetter('G', -1, { letter: 'F', octave: 4, alteration: 1 })).toEqual({
      letter: 'G',
      octave: 4,
      alteration: -1,
    })
  })

  it('finds the step by the letters alone, the alteration of the note aside', () => {
    expect(nearestPitchOfLetter('B', 1, { letter: 'C', octave: 5, alteration: -1 })).toEqual({
      letter: 'B',
      octave: 4,
      alteration: 1,
    })
  })

  it('writes a natural with no alteration field', () => {
    expect(nearestPitchOfLetter('E', undefined, { letter: 'F', octave: 4, alteration: 1 })).toEqual(
      pitch('E', 4),
    )
  })
})
