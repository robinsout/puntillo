import { describe, expect, it } from 'vitest'
import { isTuning, TUNINGS, writtenKeyOf } from '@/domain/hearing'

// Feature microphone-input, slice 3: the instrument is in C or in B♭ (criterion 2, assumption 3).
// A note heard is named as the instrument writes it (criterion 9): an instrument in C sounds as
// written; a trumpet or a clarinet in B♭ sounds a major second below, so the written note is two
// semitones above the sound: B♭3 heard, 58, is the written C4, 60.

describe('tunings', () => {
  it('are C and B♭, C first', () => {
    expect(TUNINGS).toEqual(['c', 'b-flat'])
  })

  it.each(['c', 'b-flat'])('tells %j for a tuning', (value) => {
    expect(isTuning(value)).toBe(true)
  })

  it.each(['', 'C', 'b', 'bb', 'B-flat', 'b-flat ', 'e-flat', 'f', 'in-c', 'undefined'])(
    'tells %j for no tuning',
    (value) => {
      expect(isTuning(value)).toBe(false)
    },
  )
})

describe('writtenKeyOf', () => {
  it.each([
    ['C4', 60],
    ['B♭3', 58],
    ['the lowest heard, E2', 40],
    ['the highest heard, C7', 96],
  ])('keeps %s as heard in C', (_, number) => {
    expect(writtenKeyOf({ number }, 'c')).toEqual({ number })
  })

  it.each([
    ['B♭3 as C4', 58, 60],
    ['C4 as D4', 60, 62],
    ['F♯4 as G♯4', 66, 68],
    ['B4 as C♯5', 71, 73],
    ['the lowest heard, E2, as F♯2', 40, 42],
    ['the highest heard, C7, as D7', 96, 98],
  ])('writes %s in B♭', (_, heard, written) => {
    expect(writtenKeyOf({ number: heard }, 'b-flat')).toEqual({ number: written })
  })
})
