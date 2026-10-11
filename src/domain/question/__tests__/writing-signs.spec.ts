import { describe, expect, it } from 'vitest'
import { NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  applyAccidentals,
  createQuestionOf,
  gradeWriting,
  isCourtesySign,
  signMistake,
  type Accidental,
  type NoteOrRest,
  type Question,
  type TimeSignature,
  type WrittenNote,
} from '@/domain/question'

// Feature m2-write-notes, slice 3, criteria 11 and 13: the sign of a written note is compared with
// the right notation of the question, the one M1 draws and the review shows: the field
// `accidental` of its notes, as applyAccidentals writes them. A note is right on the step of the
// question note with the same written sign. Where the right notation puts a courtesy sign, one
// that changes no sound, the note is right with it and without it. Any other sign is a mistake: a
// sign where none is needed, a needed sign left out, a natural among them, or another sign.
//
// isCourtesySign tells a courtesy sign from a needed one. signMistake tells, for a written sign
// on the right step, what is wrong with it, for the review:
// - 'not needed': the note needs no sign; `source` says what makes it sound as it does, the key
//   signature, a sign earlier in the bar, or nothing (undefined) for a natural note;
// - 'natural needed': the note needs a natural; `cancels` says what it cancels, as
//   cancelledByNatural;
// - 'sign needed': the note needs a sharp or a flat that neither the key signature nor a sign
//   earlier in the bar gives it.
// For a right sign it gives undefined.

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const G_MAJOR: KeySignature = { count: 1, accidental: 'sharp' }
const F_MAJOR: KeySignature = { count: 1, accidental: 'flat' }

const place = (letter: Letter, octave: number): Pitch => ({ letter, octave })

// A quarter on its place, with the sign of its own if any, as the generator writes it.
const quarter = (letter: Letter, octave: number, accidental?: Accidental): NoteOrRest =>
  accidental
    ? { pitch: place(letter, octave), duration: { value: 'quarter' }, accidental }
    : { pitch: place(letter, octave), duration: { value: 'quarter' } }

const whole = (letter: Letter, octave: number, accidental?: Accidental): NoteOrRest =>
  accidental
    ? { pitch: place(letter, octave), duration: { value: 'whole' }, accidental }
    : { pitch: place(letter, octave), duration: { value: 'whole' } }

// The question in its right notation, as the generator makes it.
const questionOf = (keySignature: KeySignature, ...elements: NoteOrRest[]): Question =>
  createQuestionOf(FOUR_FOUR, applyAccidentals(elements, FOUR_FOUR, keySignature), keySignature)

const written = (letter: Letter, octave: number, accidental?: Accidental): WrittenNote =>
  accidental
    ? { pitch: place(letter, octave), duration: null, accidental }
    : { pitch: place(letter, octave), duration: null }

// Grades only the note at `index`; the others are written right, as the question writes them.
function gradeAt(question: Question, index: number, note: WrittenNote) {
  const rest = question.notes.map(({ pitch, accidental }): WrittenNote =>
    accidental
      ? { pitch: place(pitch.letter, pitch.octave), duration: null, accidental }
      : { pitch: place(pitch.letter, pitch.octave), duration: null },
  )
  rest[index] = note
  return gradeWriting(question, rest)[index]?.pitch
}

// G major: F4 sounds F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = () => questionOf(G_MAJOR, quarter('F', 4))
// C major: F♯4 needs its sharp.
const F_SHARP = () => questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'))
// C major: F♯4, then F4 in the same bar, still sharp by the sign before it.
const F_SHARP_TWICE = () => questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'), quarter('F', 4))
// G major: F♮4 needs a natural against the key signature.
const F_NATURAL_IN_G_MAJOR = () => questionOf(G_MAJOR, quarter('F', 4, 'natural'))
// C major: F♯4, then F♮4 in the same bar, which needs a natural against the sharp before it.
const F_SHARP_THEN_NATURAL = () =>
  questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'), quarter('F', 4, 'natural'))
// C major: F♯4 fills a bar; F4 in the next bar gets a courtesy natural.
const COURTESY_NATURAL = () => questionOf(NO_KEY_SIGNATURE, whole('F', 4, 'sharp'), whole('F', 4))
// C major: F♯5, then F4 in the same bar, another octave: a courtesy natural.
const COURTESY_IN_ANOTHER_OCTAVE = () =>
  questionOf(NO_KEY_SIGNATURE, quarter('F', 5, 'sharp'), quarter('F', 4))
// F major: B4 sounds B♭ by the key signature.
const B_IN_F_MAJOR = () => questionOf(F_MAJOR, quarter('B', 4))
// C major: F4, natural, no sign.
const PLAIN_F = () => questionOf(NO_KEY_SIGNATURE, quarter('F', 4))

describe('the questions of these tests', () => {
  it('are written as applyAccidentals writes them', () => {
    expect(F_IN_G_MAJOR().notes[0]).toMatchObject({ pitch: { alteration: 1 } })
    expect(F_IN_G_MAJOR().notes[0]?.accidental).toBeUndefined()
    expect(COURTESY_NATURAL().notes[1]?.accidental).toBe('natural')
    expect(COURTESY_IN_ANOTHER_OCTAVE().notes[1]?.accidental).toBe('natural')
    expect(F_SHARP_TWICE().notes[1]?.accidental).toBeUndefined()
  })
})

describe('isCourtesySign', () => {
  it.each([
    ['a natural in the bar after a sharp', COURTESY_NATURAL, 1],
    ['a natural after a sharp in another octave of the bar', COURTESY_IN_ANOTHER_OCTAVE, 1],
  ])('tells a courtesy sign: %s', (_, question, index) => {
    expect(isCourtesySign(question(), index)).toBe(true)
  })

  it.each([
    ['a sharp no key signature gives', F_SHARP, 0],
    ['a natural against the key signature', F_NATURAL_IN_G_MAJOR, 0],
    ['a natural against a sharp earlier in the bar', F_SHARP_THEN_NATURAL, 1],
    ['the sharp before a courtesy natural', COURTESY_NATURAL, 0],
  ])('tells a needed sign: %s', (_, question, index) => {
    expect(isCourtesySign(question(), index)).toBe(false)
  })

  it.each([
    ['altered by the key signature', F_IN_G_MAJOR, 0],
    ['altered by a sign earlier in the bar', F_SHARP_TWICE, 1],
    ['natural', PLAIN_F, 0],
  ])('is false for a note without a sign: %s', (_, question, index) => {
    expect(isCourtesySign(question(), index)).toBe(false)
  })

  it('refuses a note the question does not have', () => {
    expect(() => isCourtesySign(PLAIN_F(), 1)).toThrow(/note 2/)
  })
})

describe('gradeWriting with signs', () => {
  it.each<[string, () => Question, number, WrittenNote, boolean]>([
    ['F4 without a sign in G major', F_IN_G_MAJOR, 0, written('F', 4), true],
    ['a sharp the key signature gives already', F_IN_G_MAJOR, 0, written('F', 4, 'sharp'), false],
    ['a natural against the key signature', F_IN_G_MAJOR, 0, written('F', 4, 'natural'), false],
    ['a needed sharp', F_SHARP, 0, written('F', 4, 'sharp'), true],
    ['a needed sharp left out', F_SHARP, 0, written('F', 4), false],
    ['a flat for a needed sharp', F_SHARP, 0, written('F', 4, 'flat'), false],
    ['a note sharp by the sign before it', F_SHARP_TWICE, 1, written('F', 4), true],
    ['the sharp repeated in the bar', F_SHARP_TWICE, 1, written('F', 4, 'sharp'), false],
    ['a needed natural', F_NATURAL_IN_G_MAJOR, 0, written('F', 4, 'natural'), true],
    ['a needed natural left out', F_NATURAL_IN_G_MAJOR, 0, written('F', 4), false],
    ['a needed natural after a sharp', F_SHARP_THEN_NATURAL, 1, written('F', 4, 'natural'), true],
    ['a natural after a sharp left out', F_SHARP_THEN_NATURAL, 1, written('F', 4), false],
    ['a courtesy natural written', COURTESY_NATURAL, 1, written('F', 4, 'natural'), true],
    ['a courtesy natural left out', COURTESY_NATURAL, 1, written('F', 4), true],
    ['a sharp for a courtesy natural', COURTESY_NATURAL, 1, written('F', 4, 'sharp'), false],
    [
      'a courtesy natural in another octave left out',
      COURTESY_IN_ANOTHER_OCTAVE,
      1,
      written('F', 4),
      true,
    ],
    ['B4 without a sign in F major', B_IN_F_MAJOR, 0, written('B', 4), true],
    ['a flat the key signature gives already', B_IN_F_MAJOR, 0, written('B', 4, 'flat'), false],
    ['a natural note without a sign', PLAIN_F, 0, written('F', 4), true],
    ['a natural where none is needed', PLAIN_F, 0, written('F', 4, 'natural'), false],
    ['a sharp where none is needed', PLAIN_F, 0, written('F', 4, 'sharp'), false],
  ])('grades %s', (_, question, index, note, right) => {
    expect(gradeAt(question(), index, note)).toBe(right)
  })

  it('grades the right sign on a wrong step wrong', () => {
    expect(gradeAt(F_SHARP(), 0, written('G', 4, 'sharp'))).toBe(false)
  })
})

describe('signMistake', () => {
  it.each<[string, () => Question, number, Accidental | undefined]>([
    ['F4 without a sign in G major', F_IN_G_MAJOR, 0, undefined],
    ['a needed sharp', F_SHARP, 0, 'sharp'],
    ['a note sharp by the sign before it', F_SHARP_TWICE, 1, undefined],
    ['a needed natural', F_NATURAL_IN_G_MAJOR, 0, 'natural'],
    ['a courtesy natural written', COURTESY_NATURAL, 1, 'natural'],
    ['a courtesy natural left out', COURTESY_NATURAL, 1, undefined],
    ['a natural note without a sign', PLAIN_F, 0, undefined],
  ])('finds none in %s', (_, question, index, accidental) => {
    expect(signMistake(question(), index, accidental)).toBeUndefined()
  })

  it.each<[string, () => Question, number, Accidental, unknown]>([
    [
      'a sharp the key signature gives already',
      F_IN_G_MAJOR,
      0,
      'sharp',
      { kind: 'not needed', source: 'key signature' },
    ],
    [
      'a flat the key signature gives already',
      B_IN_F_MAJOR,
      0,
      'flat',
      { kind: 'not needed', source: 'key signature' },
    ],
    [
      'the sharp repeated in the bar',
      F_SHARP_TWICE,
      1,
      'sharp',
      { kind: 'not needed', source: 'earlier in the bar' },
    ],
    [
      'a natural where none is needed',
      PLAIN_F,
      0,
      'natural',
      { kind: 'not needed', source: undefined },
    ],
    [
      'a sharp for a courtesy natural',
      COURTESY_NATURAL,
      1,
      'sharp',
      { kind: 'not needed', source: undefined },
    ],
  ])('finds a sign not needed: %s', (_, question, index, accidental, mistake) => {
    expect(signMistake(question(), index, accidental)).toEqual(mistake)
  })

  it.each<[string, () => Question, number, Accidental | undefined, unknown]>([
    [
      'a natural against the key signature left out',
      F_NATURAL_IN_G_MAJOR,
      0,
      undefined,
      { kind: 'natural needed', cancels: { accidental: 'sharp', source: 'key signature' } },
    ],
    [
      'a sharp for a natural against the key signature',
      F_NATURAL_IN_G_MAJOR,
      0,
      'sharp',
      { kind: 'natural needed', cancels: { accidental: 'sharp', source: 'key signature' } },
    ],
    [
      'a natural after a sharp in the bar left out',
      F_SHARP_THEN_NATURAL,
      1,
      undefined,
      { kind: 'natural needed', cancels: { accidental: 'sharp', source: 'earlier in the bar' } },
    ],
  ])('finds a natural needed: %s', (_, question, index, accidental, mistake) => {
    expect(signMistake(question(), index, accidental)).toEqual(mistake)
  })

  it.each<[string, Accidental | undefined]>([
    ['left out', undefined],
    ['a flat for it', 'flat'],
    ['a natural for it', 'natural'],
  ])('finds a sharp needed: %s', (_, accidental) => {
    expect(signMistake(F_SHARP(), 0, accidental)).toEqual({ kind: 'sign needed' })
  })
})
