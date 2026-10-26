import { describe, expect, it } from 'vitest'
import { keyOfFrequency } from '@/domain/hearing'

// Feature microphone-input, slice 1: a pitch heard is the key of the nearest semitone, by equal
// temperament with A4 = 440 Hz = 69 (assumption 1: within ±50 cents of one semitone, beyond that
// it is the next one). The trainer tells the sounds from E2 to C7, keys 40 to 96; a sound below or
// above is no key (edge case 4), and so is a frequency that is no sound at all.

// The frequency of a key, off by the cents given.
const hz = (number: number, cents = 0) => 440 * 2 ** ((number - 69 + cents / 100) / 12)

describe('keyOfFrequency', () => {
  it.each([
    ['A4', 440, 69],
    ['C4', 261.63, 60],
    ['C5', 523.25, 72],
    ['B♭3, the C4 of a trumpet', 233.08, 58],
    ['F♯4', 369.99, 66],
  ])('hears %s', (_, frequency, number) => {
    expect(keyOfFrequency(frequency)).toEqual({ number })
  })

  it.each([-49, -25, 25, 49])('hears A4 off by %i cents', (cents) => {
    expect(keyOfFrequency(hz(69, cents))).toEqual({ number: 69 })
  })

  it('hears B♭4 51 cents above A4', () => {
    expect(keyOfFrequency(hz(69, 51))).toEqual({ number: 70 })
  })

  it('hears A♭4 51 cents below A4', () => {
    expect(keyOfFrequency(hz(69, -51))).toEqual({ number: 68 })
  })

  describe('the range, E2 to C7 (edge case 4)', () => {
    it.each([
      ['E2', 40],
      ['C7', 96],
    ])('hears %s, its end', (_, number) => {
      expect(keyOfFrequency(hz(number))).toEqual({ number })
    })

    it('hears E2 a little flat as E2', () => {
      expect(keyOfFrequency(hz(40, -40))).toEqual({ number: 40 })
    })

    it('hears C7 a little sharp as C7', () => {
      expect(keyOfFrequency(hz(96, 40))).toEqual({ number: 96 })
    })

    it.each([
      ['D♯2', 39],
      ['C♯7', 97],
      ['C1', 24],
      ['C8', 108],
    ])('hears no key for %s, beyond it', (_, number) => {
      expect(keyOfFrequency(hz(number))).toBeNull()
    })
  })

  it.each([0, -440, Number.NaN, Number.POSITIVE_INFINITY])(
    'hears no key for %d hertz, which is no sound',
    (frequency) => {
      expect(keyOfFrequency(frequency)).toBeNull()
    },
  )
})
