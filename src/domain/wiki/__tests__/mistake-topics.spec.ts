import { describe, expect, it } from 'vitest'
import { NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import {
  applyAccidentals,
  createQuestionOf,
  type Accidental,
  type Duration,
  type KeyAnswer,
  type NoteAnswer,
  type NoteOrRest,
  type Question,
  type TimeSignature,
  type WrittenNote,
} from '@/domain/question'
import { readingMistakeTopics, writingMistakeTopics, type WikiTopic } from '@/domain/wiki'

// Feature session-summary, slice 2, criterion 8: an item in Most mistakes links to the articles
// of the wiki on the kinds of its mistakes, the same topics as the Why? buttons of the review
// (docs/features/wiki.md, decisions of slice 3):
// - the place of the note → Notes on the treble staff;
// - the same sound written otherwise, a sign or a natural earlier in the bar → Sharp, flat and
//   natural;
// - a sign of the key signature, and a natural cancelling it → Key signatures;
// - the duration → Durations of notes and rests.
// In Write notes (docs/features/m2-write-notes.md): a note on another step is a mistake of its
// place only; a wrong sign on the right step is one of the signs, with its reason — the key
// signature, a sign earlier in the bar, or none.
//
// readingMistakeTopics and writingMistakeTopics give the topics of the answer to the note at
// `index`, each once, in the order of the criterion: place, signs, key signatures, duration. A
// right answer gives none. A duration that is not asked (null) is no mistake.

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const G_MAJOR: KeySignature = { count: 1, accidental: 'sharp' }

const QUARTER: Duration = { value: 'quarter' }
const HALF: Duration = { value: 'half' }

const place = (letter: Letter, octave: number): Pitch => ({ letter, octave })

// A quarter on its place, with the sign of its own if any, as the generator writes it.
const quarter = (letter: Letter, octave: number, accidental?: Accidental): NoteOrRest =>
  accidental
    ? { pitch: place(letter, octave), duration: QUARTER, accidental }
    : { pitch: place(letter, octave), duration: QUARTER }

// The question in its right notation, as the generator makes it: the pitch of each note is how
// it sounds.
const questionOf = (keySignature: KeySignature, ...elements: NoteOrRest[]): Question =>
  createQuestionOf(FOUR_FOUR, applyAccidentals(elements, FOUR_FOUR, keySignature), keySignature)

const named = (
  letter: Letter,
  alteration?: Alteration,
  duration: Duration | null = QUARTER,
): NoteAnswer =>
  alteration === undefined ? { letter, duration } : { letter, alteration, duration }

const written = (
  letter: Letter,
  octave: number,
  accidental?: Accidental,
  duration: Duration | null = null,
): WrittenNote =>
  accidental
    ? { pitch: place(letter, octave), duration, accidental }
    : { pitch: place(letter, octave), duration }

// C4 alone in C major.
const C4 = questionOf(NO_KEY_SIGNATURE, quarter('C', 4))
// F♯4 with a sharp of its own in C major.
const F_SHARP = questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'))
// F4 in G major: F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = questionOf(G_MAJOR, quarter('F', 4))
// F4 with a natural against the key signature of G major.
const F_NATURAL_IN_G_MAJOR = questionOf(G_MAJOR, quarter('F', 4, 'natural'))
// F♯4 with its sharp, then F4 without a sign: F♯ again by the sharp earlier in the bar.
const SHARP_EARLIER_IN_BAR = questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'), quarter('F', 4))
// F♯4 with its sharp, then F4 with a natural cancelling it.
const NATURAL_AFTER_SHARP = questionOf(
  NO_KEY_SIGNATURE,
  quarter('F', 4, 'sharp'),
  quarter('F', 4, 'natural'),
)

describe('readingMistakeTopics', () => {
  it('gives no topic for a right answer', () => {
    expect(readingMistakeTopics(C4, 0, named('C'))).toEqual([])
  })

  it('gives no topic for a right name when the duration is not asked', () => {
    expect(readingMistakeTopics(C4, 0, named('C', undefined, null))).toEqual([])
  })

  it('gives the staff for a wrong name', () => {
    expect(readingMistakeTopics(C4, 0, named('D'))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('gives the staff for a wrong name when the duration is not asked', () => {
    expect(readingMistakeTopics(C4, 0, named('E', undefined, null))).toEqual<WikiTopic[]>([
      'treble-staff',
    ])
  })

  it('gives the durations for a wrong duration', () => {
    expect(readingMistakeTopics(C4, 0, named('C', undefined, HALF))).toEqual<WikiTopic[]>([
      'durations',
    ])
  })

  it('gives the staff, then the durations, for a wrong name and a wrong duration', () => {
    expect(readingMistakeTopics(C4, 0, named('D', undefined, HALF))).toEqual<WikiTopic[]>([
      'treble-staff',
      'durations',
    ])
  })

  it('gives the staff for a note with a sign of its own named without it', () => {
    expect(readingMistakeTopics(F_SHARP, 0, named('F'))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('adds the signs for the same sound named otherwise: G♭ for F♯', () => {
    expect(readingMistakeTopics(F_SHARP, 0, named('G', -1))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
    ])
  })

  it('adds the key signatures for a sharp of the key signature named without it', () => {
    expect(readingMistakeTopics(F_IN_G_MAJOR, 0, named('F'))).toEqual<WikiTopic[]>([
      'treble-staff',
      'key-signatures',
    ])
  })

  it('gives the place, the signs and the key signatures for G♭ named for F♯ of the key signature', () => {
    expect(readingMistakeTopics(F_IN_G_MAJOR, 0, named('G', -1))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
      'key-signatures',
    ])
  })

  it('adds the key signatures for a natural cancelling the key signature', () => {
    expect(readingMistakeTopics(F_NATURAL_IN_G_MAJOR, 0, named('F', 1))).toEqual<WikiTopic[]>([
      'treble-staff',
      'key-signatures',
    ])
  })

  it('adds the signs for a sharp earlier in the bar', () => {
    expect(readingMistakeTopics(SHARP_EARLIER_IN_BAR, 1, named('F'))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
    ])
  })

  it('adds the signs for a natural cancelling a sharp earlier in the bar', () => {
    expect(readingMistakeTopics(NATURAL_AFTER_SHARP, 1, named('F', 1))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
    ])
  })

  it('gives every kind once, in the order place, signs, key signatures, duration', () => {
    expect(readingMistakeTopics(F_IN_G_MAJOR, 0, named('G', -1, HALF))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
      'key-signatures',
      'durations',
    ])
  })

  it('reads the note at the index: the first note right, the second wrong', () => {
    expect(readingMistakeTopics(SHARP_EARLIER_IN_BAR, 0, named('F', 1))).toEqual([])
    expect(readingMistakeTopics(SHARP_EARLIER_IN_BAR, 1, named('G'))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
    ])
  })
})

// Feature piano-keyboard, criteria 9 and 11: a key played is graded by its sound, so a wrong key
// is a mistake of the place, with the reason of the sign of the note as for a name; the same
// sound written otherwise is no mistake from the keyboard, so its topic never comes.
// Feature piano-keyboard, criterion 17: the key of the same sound in another octave is a mistake
// of the octave, so it gives the piano keyboard in place of the staff, first as the place, and no
// reason of the sign: the sound was read right.
describe('readingMistakeTopics for a key played', () => {
  const played = (number: number, duration: Duration | null = QUARTER): KeyAnswer => ({
    key: { number },
    duration,
  })

  it('gives no topic for the right key', () => {
    expect(readingMistakeTopics(C4, 0, played(60))).toEqual([])
  })

  it('gives no topic for the right key when the duration is not asked', () => {
    expect(readingMistakeTopics(C4, 0, played(60, null))).toEqual([])
  })

  it('gives the staff for a wrong key', () => {
    expect(readingMistakeTopics(C4, 0, played(62))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('gives the piano keyboard for the key an octave off', () => {
    expect(readingMistakeTopics(C4, 0, played(72))).toEqual<WikiTopic[]>(['piano-keyboard'])
    expect(readingMistakeTopics(C4, 0, played(48))).toEqual<WikiTopic[]>(['piano-keyboard'])
  })

  it('gives the piano keyboard for the key two octaves off', () => {
    expect(readingMistakeTopics(C4, 0, played(84))).toEqual<WikiTopic[]>(['piano-keyboard'])
  })

  it('gives the piano keyboard, then the durations, for the key an octave off and a wrong duration', () => {
    expect(readingMistakeTopics(C4, 0, played(72, HALF))).toEqual<WikiTopic[]>([
      'piano-keyboard',
      'durations',
    ])
  })

  it('gives the piano keyboard for the black key an octave off for a note with a sign of its own', () => {
    expect(readingMistakeTopics(F_SHARP, 0, played(78))).toEqual<WikiTopic[]>(['piano-keyboard'])
    expect(readingMistakeTopics(F_SHARP, 0, played(54))).toEqual<WikiTopic[]>(['piano-keyboard'])
  })

  it('gives the staff for the white key of the letter an octave off for a note with a sharp', () => {
    expect(readingMistakeTopics(F_SHARP, 0, played(77))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('gives the piano keyboard alone for a sharp of the key signature an octave off', () => {
    expect(readingMistakeTopics(F_IN_G_MAJOR, 0, played(78))).toEqual<WikiTopic[]>([
      'piano-keyboard',
    ])
  })

  it('gives the piano keyboard alone for a sharp earlier in the bar an octave off', () => {
    expect(readingMistakeTopics(SHARP_EARLIER_IN_BAR, 1, played(78))).toEqual<WikiTopic[]>([
      'piano-keyboard',
    ])
  })

  it('gives the piano keyboard alone for a natural cancelling the key signature an octave off', () => {
    expect(readingMistakeTopics(F_NATURAL_IN_G_MAJOR, 0, played(77))).toEqual<WikiTopic[]>([
      'piano-keyboard',
    ])
  })

  it('gives the durations for the right key and a wrong duration', () => {
    expect(readingMistakeTopics(C4, 0, played(60, HALF))).toEqual<WikiTopic[]>(['durations'])
  })

  it('gives the staff, then the durations, for a wrong key and a wrong duration', () => {
    expect(readingMistakeTopics(C4, 0, played(62, HALF))).toEqual<WikiTopic[]>([
      'treble-staff',
      'durations',
    ])
  })

  it('gives no topic for the black key of a note with a sign of its own', () => {
    expect(readingMistakeTopics(F_SHARP, 0, played(66))).toEqual([])
  })

  it('gives the staff alone for a wrong key for a note with a sign of its own', () => {
    expect(readingMistakeTopics(F_SHARP, 0, played(65))).toEqual<WikiTopic[]>(['treble-staff'])
    expect(readingMistakeTopics(F_SHARP, 0, played(67))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('adds the key signatures for the white key of a sharp of the key signature', () => {
    expect(readingMistakeTopics(F_IN_G_MAJOR, 0, played(65))).toEqual<WikiTopic[]>([
      'treble-staff',
      'key-signatures',
    ])
  })

  it('adds the key signatures for the black key of a natural cancelling the key signature', () => {
    expect(readingMistakeTopics(F_NATURAL_IN_G_MAJOR, 0, played(66))).toEqual<WikiTopic[]>([
      'treble-staff',
      'key-signatures',
    ])
  })

  it('adds the signs for a sharp earlier in the bar', () => {
    expect(readingMistakeTopics(SHARP_EARLIER_IN_BAR, 1, played(65))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
    ])
  })

  it('adds the signs for a natural cancelling a sharp earlier in the bar', () => {
    expect(readingMistakeTopics(NATURAL_AFTER_SHARP, 1, played(66))).toEqual<WikiTopic[]>([
      'treble-staff',
      'accidentals',
    ])
  })

  it('gives the place, the key signatures and the duration in their order', () => {
    expect(readingMistakeTopics(F_IN_G_MAJOR, 0, played(65, HALF))).toEqual<WikiTopic[]>([
      'treble-staff',
      'key-signatures',
      'durations',
    ])
  })
})

describe('writingMistakeTopics', () => {
  it('gives no topic for a right note', () => {
    expect(writingMistakeTopics(C4, 0, written('C', 4))).toEqual([])
  })

  it('gives no topic for a right note with its duration', () => {
    expect(writingMistakeTopics(C4, 0, written('C', 4, undefined, QUARTER))).toEqual([])
  })

  it('gives no topic for a note left without a sign after a sharp earlier in the bar', () => {
    expect(writingMistakeTopics(SHARP_EARLIER_IN_BAR, 1, written('F', 4))).toEqual([])
  })

  it('gives the staff for a note on another step', () => {
    expect(writingMistakeTopics(C4, 0, written('D', 4))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('gives the staff for a note an octave off', () => {
    expect(writingMistakeTopics(C4, 0, written('C', 5))).toEqual<WikiTopic[]>(['treble-staff'])
  })

  it('gives only the staff for a note on another step with a wrong sign', () => {
    expect(writingMistakeTopics(F_IN_G_MAJOR, 0, written('G', 4, 'sharp'))).toEqual<WikiTopic[]>([
      'treble-staff',
    ])
  })

  it('gives the signs and the key signatures for a sharp the key signature gives already', () => {
    expect(writingMistakeTopics(F_IN_G_MAJOR, 0, written('F', 4, 'sharp'))).toEqual<WikiTopic[]>([
      'accidentals',
      'key-signatures',
    ])
  })

  it('gives the signs for a needed sharp left out', () => {
    expect(writingMistakeTopics(F_SHARP, 0, written('F', 4))).toEqual<WikiTopic[]>(['accidentals'])
  })

  it('gives the signs for a sign on a natural note', () => {
    expect(writingMistakeTopics(C4, 0, written('C', 4, 'sharp'))).toEqual<WikiTopic[]>([
      'accidentals',
    ])
  })

  it('gives the signs for a sharp a sharp earlier in the bar gives already', () => {
    expect(writingMistakeTopics(SHARP_EARLIER_IN_BAR, 1, written('F', 4, 'sharp'))).toEqual<
      WikiTopic[]
    >(['accidentals'])
  })

  it('gives the signs and the key signatures for a natural against the key signature left out', () => {
    expect(writingMistakeTopics(F_NATURAL_IN_G_MAJOR, 0, written('F', 4))).toEqual<WikiTopic[]>([
      'accidentals',
      'key-signatures',
    ])
  })

  it('gives the signs for a natural against a sharp earlier in the bar left out', () => {
    expect(writingMistakeTopics(NATURAL_AFTER_SHARP, 1, written('F', 4))).toEqual<WikiTopic[]>([
      'accidentals',
    ])
  })

  it('gives the durations for a wrong duration', () => {
    expect(writingMistakeTopics(C4, 0, written('C', 4, undefined, HALF))).toEqual<WikiTopic[]>([
      'durations',
    ])
  })

  it('gives the staff, then the durations, for a wrong step and a wrong duration', () => {
    expect(writingMistakeTopics(C4, 0, written('E', 4, undefined, HALF))).toEqual<WikiTopic[]>([
      'treble-staff',
      'durations',
    ])
  })

  it('gives the signs, the key signatures, then the durations for a wrong sign and duration', () => {
    expect(writingMistakeTopics(F_IN_G_MAJOR, 0, written('F', 4, 'sharp', HALF))).toEqual<
      WikiTopic[]
    >(['accidentals', 'key-signatures', 'durations'])
  })
})
