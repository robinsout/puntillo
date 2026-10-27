import { describe, expect, it } from 'vitest'
import type { KeySignature } from '@/domain/key-signature'
import { signOfHeard, spellHeard, type PianoKey } from '@/domain/keyboard'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'

// Feature heard-note-on-staff, slice 2, criterion 5: the key heard is written as the current note
// of the question when it sounds as that note; otherwise a white key as itself, a black key with a
// sharp in a key of sharps or without a key signature and with a flat in a key of flats. The sign
// drawn before the head is the one the key signature does not give its letter: none when the key
// signature gives it, a natural when the key signature alters a letter the pitch leaves natural.
// Signs earlier in the bar are not taken into account.

const key = (number: number): PianoKey => ({ number })

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const NONE: KeySignature = { count: 0 }
const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }
const TWO_SHARPS: KeySignature = { count: 2, accidental: 'sharp' }
const ONE_FLAT: KeySignature = { count: 1, accidental: 'flat' }
const THREE_FLATS: KeySignature = { count: 3, accidental: 'flat' }

// MIDI note numbers: C4 = 60.
const DO4 = 60
const RE_SHARP_4 = 63
const MI4 = 64
const FA4 = 65
const FA_SHARP_4 = 66
const SI_FLAT_4 = 70
const SI4 = 71

describe('spellHeard without a current note', () => {
  it.each<[number, KeySignature, Pitch]>([
    [DO4, NONE, pitch('C', 4)],
    [SI4, ONE_FLAT, pitch('B', 4)],
    [FA4, ONE_SHARP, pitch('F', 4)],
  ])('writes the white key %i as itself, in any key signature', (number, keySignature, heard) => {
    expect(spellHeard(key(number), { current: null, keySignature })).toEqual(heard)
  })

  it.each<[number, Pitch]>([
    [FA_SHARP_4, pitch('F', 4, 1)],
    [SI_FLAT_4, pitch('A', 4, 1)],
    [RE_SHARP_4, pitch('D', 4, 1)],
    [49, pitch('C', 3, 1)],
  ])('writes the black key %i with a sharp without a key signature', (number, heard) => {
    expect(spellHeard(key(number), { current: null, keySignature: NONE })).toEqual(heard)
  })

  it.each<[number, KeySignature, Pitch]>([
    [FA_SHARP_4, ONE_SHARP, pitch('F', 4, 1)],
    [SI_FLAT_4, TWO_SHARPS, pitch('A', 4, 1)],
  ])('writes the black key %i with a sharp in a key of sharps', (number, keySignature, heard) => {
    expect(spellHeard(key(number), { current: null, keySignature })).toEqual(heard)
  })

  it.each<[number, KeySignature, Pitch]>([
    [FA_SHARP_4, ONE_FLAT, pitch('G', 4, -1)],
    [SI_FLAT_4, ONE_FLAT, pitch('B', 4, -1)],
    [RE_SHARP_4, THREE_FLATS, pitch('E', 4, -1)],
    [61, THREE_FLATS, pitch('D', 4, -1)],
  ])('writes the black key %i with a flat in a key of flats', (number, keySignature, heard) => {
    expect(spellHeard(key(number), { current: null, keySignature })).toEqual(heard)
  })
})

describe('spellHeard with a current note that sounds as the key', () => {
  it.each<[string, number, Pitch, KeySignature]>([
    ['a flat without a key signature', RE_SHARP_4, pitch('E', 4, -1), NONE],
    ['a flat in a key of sharps', FA_SHARP_4, pitch('G', 4, -1), ONE_SHARP],
    ['a sharp in a key of flats', RE_SHARP_4, pitch('D', 4, 1), ONE_FLAT],
    ['a sharp of the key signature', FA_SHARP_4, pitch('F', 4, 1), ONE_SHARP],
    ['a flat of the key signature', SI_FLAT_4, pitch('B', 4, -1), ONE_FLAT],
  ])('writes a black key as the current note: %s', (_, number, current, keySignature) => {
    expect(spellHeard(key(number), { current, keySignature })).toEqual(current)
  })

  it.each<[string, number, Pitch]>([
    ['E♯ for F', FA4, pitch('E', 4, 1)],
    ['F♭ for E', MI4, pitch('F', 4, -1)],
    ['B♯3 for C4, an octave below the key', DO4, pitch('B', 3, 1)],
    ['C♭5 for B4, an octave above the key', SI4, pitch('C', 5, -1)],
  ])('writes a white key as the current note: %s', (_, number, current) => {
    expect(spellHeard(key(number), { current, keySignature: NONE })).toEqual(current)
  })

  it('writes the key as the current note natural in a key that alters its letter', () => {
    expect(spellHeard(key(SI4), { current: pitch('B', 4), keySignature: ONE_FLAT })).toEqual(
      pitch('B', 4),
    )
  })
})

describe('spellHeard with a current note that does not sound as the key', () => {
  it('writes a black key by the key signature, not as the current note', () => {
    expect(
      spellHeard(key(RE_SHARP_4), { current: pitch('D', 4, 1), keySignature: THREE_FLATS }),
    ).toEqual(pitch('D', 4, 1))
    expect(spellHeard(key(FA_SHARP_4), { current: pitch('E', 4, -1), keySignature: NONE })).toEqual(
      pitch('F', 4, 1),
    )
  })

  it('writes the same pitch class an octave away by the key signature', () => {
    expect(spellHeard(key(RE_SHARP_4), { current: pitch('E', 5, -1), keySignature: NONE })).toEqual(
      pitch('D', 4, 1),
    )
  })

  it('writes a white key as itself', () => {
    expect(spellHeard(key(FA4), { current: pitch('E', 5, 1), keySignature: NONE })).toEqual(
      pitch('F', 4),
    )
  })
})

describe('signOfHeard without a key signature', () => {
  it.each<[Pitch, 'sharp' | 'flat' | null]>([
    [pitch('F', 4, 1), 'sharp'],
    [pitch('B', 4, -1), 'flat'],
    [pitch('E', 4, 1), 'sharp'],
    [pitch('F', 4, -1), 'flat'],
    [pitch('D', 4), null],
  ])('is %o → %s', (heard, sign) => {
    expect(signOfHeard(heard, NONE)).toBe(sign)
  })
})

describe('signOfHeard in a key signature', () => {
  it.each<[string, Pitch, KeySignature]>([
    ['F♯ with one sharp', pitch('F', 4, 1), ONE_SHARP],
    ['C♯ with two sharps', pitch('C', 5, 1), TWO_SHARPS],
    ['B♭ with one flat', pitch('B', 4, -1), ONE_FLAT],
    ['A♭ with three flats', pitch('A', 3, -1), THREE_FLATS],
    ['B with two sharps', pitch('B', 4), TWO_SHARPS],
    ['F with one flat', pitch('F', 4), ONE_FLAT],
  ])('is none when the key signature gives it: %s', (_, heard, keySignature) => {
    expect(signOfHeard(heard, keySignature)).toBeNull()
  })

  it.each<[string, Pitch, KeySignature]>([
    ['F with one sharp', pitch('F', 4), ONE_SHARP],
    ['C with two sharps', pitch('C', 4), TWO_SHARPS],
    ['B with one flat', pitch('B', 4), ONE_FLAT],
    ['E with three flats', pitch('E', 5), THREE_FLATS],
  ])('is a natural when the key signature alters the letter: %s', (_, heard, keySignature) => {
    expect(signOfHeard(heard, keySignature)).toBe('natural')
  })

  it.each<[string, Pitch, KeySignature, 'sharp' | 'flat']>([
    ['C♯ with one sharp', pitch('C', 4, 1), ONE_SHARP, 'sharp'],
    ['G♭ with one sharp', pitch('G', 4, -1), ONE_SHARP, 'flat'],
    ['F♭ with one sharp', pitch('F', 4, -1), ONE_SHARP, 'flat'],
    ['A♯ with one flat', pitch('A', 4, 1), ONE_FLAT, 'sharp'],
    ['B♯ with one flat', pitch('B', 3, 1), ONE_FLAT, 'sharp'],
    ['G♭ with three flats', pitch('G', 4, -1), THREE_FLATS, 'flat'],
  ])('is the sign of the pitch when the key signature gives another: %s', (_, heard, ks, sign) => {
    expect(signOfHeard(heard, ks)).toBe(sign)
  })
})
