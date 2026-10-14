import { describe, expect, it } from 'vitest'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { isWhiteKey, keyboardKeys, keyOf, keySpellings, type PianoKey } from '@/domain/keyboard'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'

// Feature piano-keyboard, slice 1: a key of the piano is the number of its sound in MIDI, C4 = 60
// (criterion 8). A key is graded by its sound, so a pitch is played on the key it sounds on
// (criterion 5: C♭4 sounds as B3). A white key is named by one pitch, a black key by two, the
// sharp first (criterion 12). The keyboard spans every sound a question may hold at the
// difficulty: its range, whatever ledger lines it allows, a semitone wider on each side when signs
// may occur, and ends on white keys (criterion 5).

const key = (number: number): PianoKey => ({ number })

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const numbersOf = (keys: readonly PianoKey[]): number[] => keys.map(({ number }) => number)

const between = (low: number, high: number): number[] =>
  Array.from({ length: high - low + 1 }, (_, index) => low + index)

describe('keyOf', () => {
  it.each([
    ['C4', pitch('C', 4), 60],
    ['D4', pitch('D', 4), 62],
    ['E4', pitch('E', 4), 64],
    ['F4', pitch('F', 4), 65],
    ['G4', pitch('G', 4), 67],
    ['A4', pitch('A', 4), 69],
    ['B4', pitch('B', 4), 71],
    ['C5', pitch('C', 5), 72],
    ['A3', pitch('A', 3), 57],
    ['C6', pitch('C', 6), 84],
  ])('plays %s on the key of its sound', (_name, given, number) => {
    expect(keyOf(given)).toEqual(key(number))
  })

  it.each([
    ['C♯4', pitch('C', 4, 1), 61],
    ['D♭4', pitch('D', 4, -1), 61],
    ['F♯4', pitch('F', 4, 1), 66],
    ['B♭4', pitch('B', 4, -1), 70],
  ])('plays %s on a black key', (_name, given, number) => {
    expect(keyOf(given)).toEqual(key(number))
  })

  it.each([
    ['E♯4 on F4', pitch('E', 4, 1), 65],
    ['F♭4 on E4', pitch('F', 4, -1), 64],
    ['B♯3 on C4', pitch('B', 3, 1), 60],
  ])('plays %s', (_name, given, number) => {
    expect(keyOf(given)).toEqual(key(number))
  })

  it('plays C♭4 on B3, the key of the octave below', () => {
    expect(keyOf(pitch('C', 4, -1))).toEqual(key(59))
  })

  it.each([
    ['F𝄪4 on G4', pitch('F', 4, 2), 67],
    ['D𝄫4 on C4', pitch('D', 4, -2), 60],
  ])('plays %s', (_name, given, number) => {
    expect(keyOf(given)).toEqual(key(number))
  })
})

describe('isWhiteKey', () => {
  it.each([60, 62, 64, 65, 67, 69, 71, 72, 59, 57])('tells key %i white', (number) => {
    expect(isWhiteKey(key(number))).toBe(true)
  })

  it.each([61, 63, 66, 68, 70, 73, 58, 56])('tells key %i black', (number) => {
    expect(isWhiteKey(key(number))).toBe(false)
  })
})

describe('keySpellings', () => {
  it.each([
    [60, pitch('C', 4)],
    [62, pitch('D', 4)],
    [64, pitch('E', 4)],
    [65, pitch('F', 4)],
    [67, pitch('G', 4)],
    [69, pitch('A', 4)],
    [71, pitch('B', 4)],
    [72, pitch('C', 5)],
    [59, pitch('B', 3)],
  ])('names white key %i by one pitch without a sign', (number, spelling) => {
    expect(keySpellings(key(number))).toEqual([spelling])
  })

  it.each([
    [61, pitch('C', 4, 1), pitch('D', 4, -1)],
    [63, pitch('D', 4, 1), pitch('E', 4, -1)],
    [66, pitch('F', 4, 1), pitch('G', 4, -1)],
    [68, pitch('G', 4, 1), pitch('A', 4, -1)],
    [70, pitch('A', 4, 1), pitch('B', 4, -1)],
    [58, pitch('A', 3, 1), pitch('B', 3, -1)],
    [73, pitch('C', 5, 1), pitch('D', 5, -1)],
  ])('names black key %i by its sharp, then its flat', (number, sharp, flat) => {
    expect(keySpellings(key(number))).toEqual([sharp, flat])
  })

  it('names each key by pitches that sound on it', () => {
    for (const number of between(55, 86))
      for (const spelling of keySpellings(key(number))) expect(keyOf(spelling)).toEqual(key(number))
  })
})

describe('keyboardKeys', () => {
  const custom = (change: Partial<Difficulty>): Difficulty => ({
    ...presetDifficulty('first-steps'),
    ...change,
  })

  const range = (low: Pitch, high: Pitch): Pick<Difficulty, 'range'> => ({ range: { low, high } })

  it('spans do4 to do5 for First steps, white and black keys in a row', () => {
    expect(keyboardKeys(presetDifficulty('first-steps'))).toEqual(between(60, 72).map(key))
  })

  it('spans B3 to A5 for Confident reading: C♭4 below, G♯5 above widened to a white key', () => {
    expect(numbersOf(keyboardKeys(presetDifficulty('confident-reading')))).toEqual(between(59, 81))
  })

  it('spans G3 to D6 for Advanced: A♭3 and C♯6 widened to white keys', () => {
    expect(numbersOf(keyboardKeys(presetDifficulty('advanced')))).toEqual(between(55, 86))
  })

  it('adds a semitone on each side for the range C4–C5 with signs', () => {
    expect(
      numbersOf(keyboardKeys(custom({ keySignatures: 2, accidentals: 'sharp-and-flat' }))),
    ).toEqual(between(59, 74))
  })

  it('adds the semitones for key signatures alone', () => {
    expect(numbersOf(keyboardKeys(custom({ keySignatures: 2, accidentals: 'none' })))).toEqual(
      between(59, 74),
    )
  })

  it('adds the semitones for accidentals alone', () => {
    expect(
      numbersOf(keyboardKeys(custom({ keySignatures: 0, accidentals: 'sharp-flat-and-natural' }))),
    ).toEqual(between(59, 74))
  })

  it('keeps the range as it is without signs', () => {
    expect(numbersOf(keyboardKeys(custom(range(pitch('E', 4), pitch('B', 4)))))).toEqual(
      between(64, 71),
    )
  })

  it('widens a black key at the low end to the white key below: E♭4 to D4', () => {
    expect(
      numbersOf(keyboardKeys(custom({ ...range(pitch('E', 4), pitch('A', 4)), keySignatures: 2 }))),
    ).toEqual(between(62, 71))
  })

  it('keeps a semitone that falls on a white key: F♭4 on E4, B♯4 on C5', () => {
    expect(
      numbersOf(keyboardKeys(custom({ ...range(pitch('F', 4), pitch('B', 4)), keySignatures: 7 }))),
    ).toEqual(between(64, 72))
  })

  it('keeps C♭5 on B4 at the low end and E♯5 on F5 at the high end', () => {
    expect(
      numbersOf(keyboardKeys(custom({ ...range(pitch('C', 5), pitch('E', 5)), keySignatures: 7 }))),
    ).toEqual(between(71, 77))
  })

  describe('for a range wider than the ledger lines allow', () => {
    const wide = range(pitch('A', 3), pitch('C', 6))

    it('spans the range: A3 to C6', () => {
      expect(numbersOf(keyboardKeys(custom({ ...wide, ledgerLines: 0 })))).toEqual(between(57, 84))
    })

    it('widens A♭3 and C♯6 to G3 and D6 with signs', () => {
      expect(
        numbersOf(keyboardKeys(custom({ ...wide, ledgerLines: 0, keySignatures: 2 }))),
      ).toEqual(between(55, 86))
    })

    it('is not narrowed by the ledger lines', () => {
      const keysWith = (ledgerLines: Difficulty['ledgerLines']) =>
        numbersOf(keyboardKeys(custom({ ...wide, ledgerLines, keySignatures: 2 })))

      expect(keysWith(0)).toEqual(keysWith(2))
      expect(keysWith(1)).toEqual(keysWith(2))
    })
  })

  it('starts and ends on a white key for every preset', () => {
    for (const preset of ['first-steps', 'confident-reading', 'advanced'] as const) {
      const keys = keyboardKeys(presetDifficulty(preset))
      expect(isWhiteKey(keys[0] as PianoKey)).toBe(true)
      expect(isWhiteKey(keys[keys.length - 1] as PianoKey)).toBe(true)
    }
  })
})
