import { describe, expect, it } from 'vitest'
import { keyOfFrequency, pitchOf } from '@/domain/hearing'

// Feature microphone-input, slice 4: what the trainer hears is the nearest key, as keyOfFrequency
// tells it, and how far the sound is from that key in cents, -50 to +50, not rounded (criterion
// 13). Above the key is positive, below it negative. A sound beyond the range told, E2 to C7, and
// a frequency that is no sound have no pitch (edge case 4).

// The frequency of a key, off by the cents given.
const hz = (number: number, cents = 0) => 440 * 2 ** ((number - 69 + cents / 100) / 12)

const A4 = 69

describe('pitchOf', () => {
  it('hears A4 at 440 Hz in tune', () => {
    const pitch = pitchOf(440)

    expect(pitch?.key).toEqual({ number: A4 })
    expect(pitch?.cents).toBeCloseTo(0, 6)
  })

  it.each([
    ['C4', 60],
    ['B♭3', 58],
    ['F♯4', 66],
    ['C5', 72],
  ])('hears %s in tune', (_, number) => {
    const pitch = pitchOf(hz(number))

    expect(pitch?.key).toEqual({ number })
    expect(pitch?.cents).toBeCloseTo(0, 6)
  })

  it.each([12, 8.4, 49, -8, -12.6, -49])('hears A4 off by %d cents', (cents) => {
    const pitch = pitchOf(hz(A4, cents))

    expect(pitch?.key).toEqual({ number: A4 })
    expect(pitch?.cents).toBeCloseTo(cents, 6)
  })

  it('hears 51 cents above A4 as B♭4, 49 cents below it', () => {
    const pitch = pitchOf(hz(A4, 51))

    expect(pitch?.key).toEqual({ number: 70 })
    expect(pitch?.cents).toBeCloseTo(-49, 6)
  })

  it('hears 51 cents below A4 as A♭4, 49 cents above it', () => {
    const pitch = pitchOf(hz(A4, -51))

    expect(pitch?.key).toEqual({ number: 68 })
    expect(pitch?.cents).toBeCloseTo(49, 6)
  })

  it('gives the key keyOfFrequency gives, from E2 to C7 and beyond', () => {
    // Off the boundaries between two keys, where rounding may go either way.
    const frequencies = Array.from({ length: 700 }, (_, index) => hz(30, index * 11 + 0.3))

    for (const frequency of frequencies)
      expect(pitchOf(frequency)?.key ?? null).toEqual(keyOfFrequency(frequency))
  })

  describe('the range, E2 to C7 (edge case 4)', () => {
    it('hears E2 a little flat', () => {
      const pitch = pitchOf(hz(40, -40))

      expect(pitch?.key).toEqual({ number: 40 })
      expect(pitch?.cents).toBeCloseTo(-40, 6)
    })

    it('hears C7 a little sharp', () => {
      const pitch = pitchOf(hz(96, 40))

      expect(pitch?.key).toEqual({ number: 96 })
      expect(pitch?.cents).toBeCloseTo(40, 6)
    })

    it.each([
      ['D♯2', 39],
      ['C♯7', 97],
      ['C1', 24],
      ['C8', 108],
    ])('hears no pitch for %s, beyond it', (_, number) => {
      expect(pitchOf(hz(number))).toBeNull()
    })
  })

  it.each([0, -440, Number.NaN, Number.POSITIVE_INFINITY])(
    'hears no pitch for %d hertz, which is no sound',
    (frequency) => {
      expect(pitchOf(frequency)).toBeNull()
    },
  )
})
