import { describe, expect, it } from 'vitest'
import {
  applyKeySignature,
  keySignatureLetters,
  NO_KEY_SIGNATURE,
  type KeySignature,
} from '@/domain/key-signature'
import { LETTERS, type Pitch } from '@/domain/pitch'

// Feature accidentals, slice 1. A key signature is a number of signs, from 0 to 7, and their kind,
// sharps or flats (spec 4.1); a key signature of no signs has no kind. The signs come in the
// order of the circle of fifths, as every textbook and Gould's «Behind Bars» give it: the sharps
// F C G D A E B, the flats B E A D G C F, the flats the sharps backwards.
//
// Applying the key signature (spec 4.2) gives the pitch written on a place of the staff: a sign
// of the key signature alters its letter in every octave.

type Count = Exclude<KeySignature['count'], 0>

const sharps = (count: Count): KeySignature => ({ count, accidental: 'sharp' })
const flats = (count: Count): KeySignature => ({ count, accidental: 'flat' })

const place = (letter: Pitch['letter'], octave = 4): Pitch => ({ letter, octave })

describe('NO_KEY_SIGNATURE', () => {
  it('has no signs and no kind', () => {
    expect(NO_KEY_SIGNATURE).toEqual({ count: 0 })
  })
})

describe('keySignatureLetters', () => {
  it('gives no letter for no signs', () => {
    expect(keySignatureLetters(NO_KEY_SIGNATURE)).toEqual([])
  })

  it.each([
    [1, ['F']],
    [2, ['F', 'C']],
    [3, ['F', 'C', 'G']],
    [4, ['F', 'C', 'G', 'D']],
    [5, ['F', 'C', 'G', 'D', 'A']],
    [6, ['F', 'C', 'G', 'D', 'A', 'E']],
    [7, ['F', 'C', 'G', 'D', 'A', 'E', 'B']],
  ] as const)('gives %i sharps in the order F C G D A E B: %j', (count, letters) => {
    expect(keySignatureLetters(sharps(count))).toEqual(letters)
  })

  it.each([
    [1, ['B']],
    [2, ['B', 'E']],
    [3, ['B', 'E', 'A']],
    [4, ['B', 'E', 'A', 'D']],
    [5, ['B', 'E', 'A', 'D', 'G']],
    [6, ['B', 'E', 'A', 'D', 'G', 'C']],
    [7, ['B', 'E', 'A', 'D', 'G', 'C', 'F']],
  ] as const)('gives %i flats in the order B E A D G C F: %j', (count, letters) => {
    expect(keySignatureLetters(flats(count))).toEqual(letters)
  })

  it('gives the flats in the order of the sharps backwards', () => {
    expect(keySignatureLetters(flats(7))).toEqual([...keySignatureLetters(sharps(7))].reverse())
  })
})

describe('applyKeySignature', () => {
  it('leaves every place natural without signs', () => {
    for (const letter of LETTERS)
      expect(applyKeySignature(place(letter), NO_KEY_SIGNATURE)).toEqual(place(letter))
  })

  // One sharp: the note on the 5th line is F♯5.
  it('sharpens F alone with one sharp', () => {
    expect(applyKeySignature(place('F', 5), sharps(1))).toEqual({
      letter: 'F',
      octave: 5,
      alteration: 1,
    })
    for (const letter of LETTERS.filter((each) => each !== 'F'))
      expect(applyKeySignature(place(letter), sharps(1))).toEqual(place(letter))
  })

  it('alters its letter in every octave, not only where the sign stands', () => {
    for (const octave of [3, 4, 5, 6])
      expect(applyKeySignature(place('F', octave), sharps(1))).toEqual({
        letter: 'F',
        octave,
        alteration: 1,
      })
  })

  it('flattens B and E with two flats, and nothing else', () => {
    expect(LETTERS.map((letter) => applyKeySignature(place(letter), flats(2)).alteration)).toEqual([
      undefined,
      undefined,
      -1,
      undefined,
      undefined,
      undefined,
      -1,
    ])
  })

  it('sharpens every letter with seven sharps, B and E as well', () => {
    expect(LETTERS.map((letter) => applyKeySignature(place(letter), sharps(7)))).toEqual(
      LETTERS.map((letter) => ({ letter, octave: 4, alteration: 1 })),
    )
  })

  it('flattens every letter with seven flats, C and F as well', () => {
    expect(LETTERS.map((letter) => applyKeySignature(place(letter), flats(7)))).toEqual(
      LETTERS.map((letter) => ({ letter, octave: 4, alteration: -1 })),
    )
  })

  it.each([1, 2, 3, 4, 5, 6, 7] as const)(
    'alters exactly the letters of %i sharps or flats',
    (count) => {
      for (const keySignature of [sharps(count), flats(count)]) {
        const altered = LETTERS.filter(
          (letter) => applyKeySignature(place(letter), keySignature).alteration !== undefined,
        )
        expect([...altered].sort()).toEqual([...keySignatureLetters(keySignature)].sort())
      }
    },
  )

  it('keeps the letter and the octave of the place', () => {
    const { letter, octave } = applyKeySignature(place('B', 3), flats(1))

    expect({ letter, octave }).toEqual({ letter: 'B', octave: 3 })
  })

  it('leaves the given place as it was', () => {
    const given = place('F', 5)

    applyKeySignature(given, sharps(1))

    expect(given).toEqual(place('F', 5))
  })
})
