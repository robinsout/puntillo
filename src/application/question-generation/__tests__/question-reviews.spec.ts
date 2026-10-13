import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Pitch } from '@/domain/pitch'
import { COMMON_TIME, type Duration, type Note, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

// Feature review-queue, slice 1, criterion 6: the generator takes the items the queue has due for
// the question it makes (spec 13). In a question of one note the note is the due item: the same
// pitch, the same sign and the same duration. Read notes and Write notes share the generator, so
// both get it (criterion 2). With nothing due the questions go as before.

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

// One note in 4/4, so that any item of the range and the durations fits a question.
const ONE_NOTE: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'G', octave: 5 } },
  ledgerLines: 1,
  keySignatures: 0,
  accidentals: 'none',
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: [COMMON_TIME],
  rests: false,
  dots: false,
}

const WITH_SIGNS: Difficulty = { ...ONE_NOTE, accidentals: 'sharp-and-flat' }
const WITH_DOTS: Difficulty = { ...ONE_NOTE, dots: true }
// First steps: the duration is not asked, the notes are halves and quarters.
const FIRST_STEPS = presetDifficulty('first-steps')

const pitch = (letter: Pitch['letter'], octave: number, alteration?: Pitch['alteration']): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const item = (asked: Pitch, duration: Duration): ReviewItem => ({ pitch: asked, duration })

function soleNote(question: Question): Note {
  const [note, ...others] = question.notes
  if (!note || others.length > 0) throw new Error(`expected one note, got ${question.notes.length}`)
  return note
}

// The note as written: its sign, its pitch and its duration.
const written = ({ pitch: { letter, octave, alteration }, duration, accidental }: Note) => ({
  letter,
  octave,
  alteration,
  value: duration.value,
  dots: duration.dots,
  accidental,
})

describe('question generation with due review items', () => {
  it.each<[string, ReviewItem]>([
    ['the lowest note of the range, whole', item(pitch('C', 4), { value: 'whole' })],
    ['the highest note of the range, eighth', item(pitch('G', 5), { value: 'eighth' })],
    ['a note within the range, quarter', item(pitch('A', 4), { value: 'quarter' })],
  ])('asks about the due item: %s', (_, due) => {
    for (let seed = 1; seed <= 20; seed++) {
      const nextQuestion = createQuestionGenerator(seeded(seed), ONE_NOTE)

      const note = soleNote(nextQuestion([due]))

      expect(note.pitch).toEqual(due.pitch)
      expect(note.duration).toEqual(due.duration)
    }
  })

  it('asks about the due item on a later question of the session too', () => {
    const due = item(pitch('E', 5), { value: 'half' })
    const nextQuestion = createQuestionGenerator(seeded(7), ONE_NOTE)
    for (let asked = 0; asked < 5; asked++) nextQuestion([])

    expect(written(soleNote(nextQuestion([due])))).toEqual(
      written({ pitch: due.pitch, duration: due.duration }),
    )
  })

  it('writes a sharp item with a sharp before the note', () => {
    const due = item(pitch('C', 4, 1), { value: 'quarter' })

    for (let seed = 1; seed <= 20; seed++) {
      const note = soleNote(createQuestionGenerator(seeded(seed), WITH_SIGNS)([due]))

      expect(note.pitch).toEqual(pitch('C', 4, 1))
      expect(note.accidental).toBe('sharp')
      expect(note.duration).toEqual({ value: 'quarter' })
    }
  })

  it('writes a flat item with a flat before the note, not as the same sound', () => {
    const due = item(pitch('D', 4, -1), { value: 'half' })

    for (let seed = 1; seed <= 20; seed++) {
      const note = soleNote(createQuestionGenerator(seeded(seed), WITH_SIGNS)([due]))

      expect(note.pitch).toEqual(pitch('D', 4, -1))
      expect(note.accidental).toBe('flat')
    }
  })

  it('writes a natural item without a sign', () => {
    const due = item(pitch('F', 4), { value: 'quarter' })

    for (let seed = 1; seed <= 20; seed++) {
      const note = soleNote(createQuestionGenerator(seeded(seed), WITH_SIGNS)([due]))

      expect(note.pitch).toEqual(pitch('F', 4))
      expect(note.accidental).toBeUndefined()
    }
  })

  it('keeps a dotted item dotted', () => {
    const due = item(pitch('B', 4), { value: 'quarter', dots: 1 })

    for (let seed = 1; seed <= 20; seed++) {
      const note = soleNote(createQuestionGenerator(seeded(seed), WITH_DOTS)([due]))

      expect(note.duration).toEqual({ value: 'quarter', dots: 1 })
    }
  })

  it('asks about the due item when the duration is not asked, with its duration', () => {
    const due = item(pitch('G', 4), { value: 'half' })

    for (let seed = 1; seed <= 20; seed++) {
      const note = soleNote(createQuestionGenerator(seeded(seed), FIRST_STEPS)([due]))

      expect(note.pitch).toEqual(pitch('G', 4))
      expect(note.duration).toEqual({ value: 'half' })
    }
  })

  it('goes on with questions of the difficulty after the due one', () => {
    const due = item(pitch('C', 4), { value: 'whole' })
    const nextQuestion = createQuestionGenerator(seeded(3), ONE_NOTE)
    nextQuestion([due])

    for (let asked = 0; asked < 20; asked++) {
      const note = soleNote(nextQuestion([]))
      expect(ONE_NOTE.durations).toContain(note.duration.value)
    }
  })

  it('makes the same questions with nothing due as without the queue', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const withQueue = createQuestionGenerator(seeded(seed), presetDifficulty('advanced'))
      const without = createQuestionGenerator(seeded(seed), presetDifficulty('advanced'))

      for (let asked = 0; asked < 10; asked++) expect(withQueue([])).toEqual(without())
    }
  })
})
