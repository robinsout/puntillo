import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import { allowedPitches, presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { KeySignature } from '@/domain/key-signature'
import { isSamePitch, type Pitch } from '@/domain/pitch'
import { COMMON_TIME, type Note, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

// Feature staff-progress-row, slice 1, criterion 12: in questions of one note the key signature
// is picked once for a row of ten questions. The session asks the generator for the key on the
// first question of a row and gives it the key of the row on the other nine. A key signature
// given is taken as it is, and no value is spent on it, so that the values after it go as they
// would have; without one the generator picks it as before.
//
// Edge case 2 and assumption 2: a due item is written in the key given, its own sign before it
// where the key does not give it; an item the key cannot express waits for a later question.

const SHARP_OR_FLAT = { sharp: '#', flat: 'b' }
const name = ({ letter, octave, alteration }: Pitch): string =>
  `${letter}${alteration === 1 ? SHARP_OR_FLAT.sharp : alteration === -1 ? SHARP_OR_FLAT.flat : ''}${octave}`
const notesOf = (question: Question) => question.notes.map((note) => name(note.pitch))

// An extra call fails the test.
function scripted(...values: number[]): Random {
  const queue = [...values]
  return {
    next() {
      const value = queue.shift()
      if (value === undefined) throw new Error('scripted random is exhausted')
      return value
    },
  }
}

// mulberry32: a deterministic seeded generator.
function seeded(seed: number): Random {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }
const TWO_FLATS: KeySignature = { count: 2, accidental: 'flat' }
const NO_SIGNS: KeySignature = { count: 0 }

// First steps: one note of the seven D4…C5, by floor(next × 7), then half or quarter, by
// floor(next × 2). F4 is the third of them, D4 the first.
const FIRST_STEPS = presetDifficulty('first-steps')
const F4 = 2.5 / 7
const D4 = 0.5 / 7

const values = (overrides: Partial<Difficulty>): Difficulty => ({ ...FIRST_STEPS, ...overrides })

// One note in 4/4, so that any item of the range and the durations fits a question.
const ONE_NOTE: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'G', octave: 5 } },
  ledgerLines: 1,
  keySignatures: 2,
  accidentals: 'none',
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: [COMMON_TIME],
  rests: false,
  dots: false,
}

const pitch = (letter: Pitch['letter'], octave: number, alteration?: Pitch['alteration']): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const item = (asked: Pitch): ReviewItem => ({ pitch: asked, duration: { value: 'quarter' } })

function soleNote(question: Question): Note {
  const [note, ...others] = question.notes
  if (!note || others.length > 0) throw new Error(`expected one note, got ${question.notes.length}`)
  return note
}

describe('a question with a key signature given', () => {
  it('has the key signature given and spends no value on it', () => {
    const nextQuestion = createQuestionGenerator(scripted(F4, 0), values({ keySignatures: 2 }))

    const question = nextQuestion([], { keySignature: ONE_SHARP })

    expect(question.keySignature).toEqual(ONE_SHARP)
    expect(notesOf(question)).toEqual(['F#4'])
  })

  it('has no signs when given none, though the difficulty allows them', () => {
    const nextQuestion = createQuestionGenerator(scripted(F4, 0), values({ keySignatures: 7 }))

    const question = nextQuestion([], { keySignature: NO_SIGNS })

    expect(question.keySignature).toEqual(NO_SIGNS)
    expect(notesOf(question)).toEqual(['F4'])
  })

  it('leaves the values after it to the next question, which picks its key as before', () => {
    // The first question takes F4 and a half; the second D4, of the six left, a half, and its key:
    // one sign by floor(0.5 × 3), a sharp by 0.
    const nextQuestion = createQuestionGenerator(
      scripted(F4, 0, 0, 0, 0.5, 0),
      values({ keySignatures: 2 }),
    )

    expect(nextQuestion([], { keySignature: TWO_FLATS }).keySignature).toEqual(TWO_FLATS)
    const next = nextQuestion()
    expect(next.keySignature).toEqual(ONE_SHARP)
    expect(notesOf(next)).toEqual(['D4'])
  })

  it('picks the key as before when the options give none', () => {
    const nextQuestion = createQuestionGenerator(
      scripted(D4, 0, 0.5, 0),
      values({ keySignatures: 2 }),
    )

    expect(nextQuestion([], {}).keySignature).toEqual(ONE_SHARP)
  })

  it('puts no sharp or flat before a note the key given already alters', () => {
    // F4, a half, and the chance of a sign, 0.9: with one sharp F stands altered, so no sign.
    const nextQuestion = createQuestionGenerator(
      scripted(F4, 0, 0.9),
      values({ keySignatures: 2, accidentals: 'sharp-and-flat' }),
    )

    const question = nextQuestion([], { keySignature: ONE_SHARP })

    expect(notesOf(question)).toEqual(['F#4'])
    expect(soleNote(question).accidental).toBeUndefined()
  })
})

describe('a due item in a question with a key signature given', () => {
  it('stands without its sign where the key given gives it, and spends no value on the key', () => {
    // The one value places the item among the bars: a question of one note has one.
    const nextQuestion = createQuestionGenerator(scripted(0), {
      ...ONE_NOTE,
      accidentals: 'sharp-and-flat',
    })

    const question = nextQuestion([item(pitch('F', 4, 1))], { keySignature: ONE_SHARP })

    expect(question.keySignature).toEqual(ONE_SHARP)
    expect(soleNote(question).pitch).toEqual(pitch('F', 4, 1))
    expect(soleNote(question).accidental).toBeUndefined()
  })

  it('takes a natural where the key given would alter it, if the difficulty allows naturals', () => {
    const nextQuestion = createQuestionGenerator(scripted(0), {
      ...ONE_NOTE,
      accidentals: 'sharp-flat-and-natural',
    })

    const question = nextQuestion([item(pitch('B', 4))], { keySignature: TWO_FLATS })

    expect(question.keySignature).toEqual(TWO_FLATS)
    expect(soleNote(question).pitch).toEqual(pitch('B', 4))
    expect(soleNote(question).accidental).toBe('natural')
  })

  it('takes its own sign where the key given leaves the letter natural', () => {
    const nextQuestion = createQuestionGenerator(scripted(0), {
      ...ONE_NOTE,
      accidentals: 'sharp-and-flat',
    })

    const question = nextQuestion([item(pitch('E', 4, -1))], { keySignature: ONE_SHARP })

    expect(question.keySignature).toEqual(ONE_SHARP)
    expect(soleNote(question).pitch).toEqual(pitch('E', 4, -1))
    expect(soleNote(question).accidental).toBe('flat')
  })

  it('waits when the key given cannot express it: the question is one of the difficulty in that key', () => {
    // Without signs before the notes F♯4 needs a key with F sharp.
    const due = [item(pitch('F', 4, 1))]
    const places = allowedPitches(ONE_NOTE)

    for (let seed = 1; seed <= 20; seed++) {
      const nextQuestion = createQuestionGenerator(seeded(seed), ONE_NOTE)

      for (const keySignature of [NO_SIGNS, TWO_FLATS]) {
        const question = nextQuestion(due, { keySignature })
        const note = soleNote(question)

        expect(question.keySignature).toEqual(keySignature)
        expect(note.pitch).not.toEqual(pitch('F', 4, 1))
        const place = { letter: note.pitch.letter, octave: note.pitch.octave }
        expect(places.some((allowed) => isSamePitch(allowed, place))).toBe(true)
      }
    }
  })

  it('is asked about on a later question whose key given expresses it', () => {
    const due = [item(pitch('F', 4, 1))]

    for (let seed = 1; seed <= 20; seed++) {
      const nextQuestion = createQuestionGenerator(seeded(seed), ONE_NOTE)
      nextQuestion(due, { keySignature: NO_SIGNS })

      const later = nextQuestion(due, { keySignature: ONE_SHARP })

      expect(soleNote(later).pitch).toEqual(pitch('F', 4, 1))
      expect(later.keySignature).toEqual(ONE_SHARP)
    }
  })
})
