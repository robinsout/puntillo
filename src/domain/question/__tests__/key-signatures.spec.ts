import { describe, expect, it } from 'vitest'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  createQuestion,
  createQuestionIn,
  createQuestionOf,
  gradeAnswer,
  type Note,
} from '@/domain/question'

// Feature accidentals, slice 1. A question has a key signature (spec 4.1), no signs unless given.
// Its notes carry the pitches as they sound in it: in a key of one sharp the note on the 5th line
// is F♯5 (criterion 8).
//
// The answer of a note is a letter and an alteration; a natural answer has no alteration field.
// The pitch is right only when written the same (spec 7.1, criterion 8): D♭ for C♯ is wrong.

const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }

const note = (letter: Letter, alteration?: Pitch['alteration']): Note => ({
  pitch: alteration === undefined ? { letter, octave: 5 } : { letter, octave: 5, alteration },
  duration: { value: 'quarter' },
})

describe('the key signature of a question', () => {
  it('has no signs unless given', () => {
    expect(createQuestion(note('F')).keySignature).toEqual({ count: 0 })
    expect(createQuestionIn(COMMON_TIME, note('F')).keySignature).toEqual({ count: 0 })
    expect(createQuestionOf(COMMON_TIME, [note('F')]).keySignature).toEqual({ count: 0 })
  })

  it('is the one given', () => {
    const question = createQuestionOf(COMMON_TIME, [note('F', 1)], ONE_SHARP)

    expect(question.keySignature).toEqual(ONE_SHARP)
    expect(question.notes[0].pitch).toEqual({ letter: 'F', octave: 5, alteration: 1 })
  })
})

describe('gradeAnswer with alterations', () => {
  const pitchGrade = (expected: Note, letter: Letter, alteration?: -1 | 1) =>
    gradeAnswer(createQuestionOf(COMMON_TIME, [expected], ONE_SHARP), [
      alteration === undefined
        ? { letter, duration: null }
        : { letter, alteration, duration: null },
    ])[0]?.pitch

  it('takes F♯ answered with the sharp', () => {
    expect(pitchGrade(note('F', 1), 'F', 1)).toBe(true)
  })

  it('refuses F♯ answered without the sharp', () => {
    expect(pitchGrade(note('F', 1), 'F')).toBe(false)
  })

  it('refuses F♯ answered with the flat', () => {
    expect(pitchGrade(note('F', 1), 'F', -1)).toBe(false)
  })

  it('refuses a natural F answered with a sharp', () => {
    expect(pitchGrade(note('F'), 'F', 1)).toBe(false)
  })

  // Criterion 8: the writing counts, not the sound.
  it('refuses G♭ for F♯ and D♭ for C♯, though they sound the same', () => {
    expect(pitchGrade(note('F', 1), 'G', -1)).toBe(false)
    expect(pitchGrade(note('C', 1), 'D', -1)).toBe(false)
  })

  it('takes B♭ answered with the flat', () => {
    expect(pitchGrade(note('B', -1), 'B', -1)).toBe(true)
  })

  it('takes an answer whose alteration is left undefined as natural', () => {
    const grade = gradeAnswer(createQuestion(note('G')), [
      { letter: 'G', alteration: undefined, duration: null },
    ])

    expect(grade[0]?.pitch).toBe(true)
  })

  it('grades the duration apart from the alteration', () => {
    const grade = gradeAnswer(createQuestionOf(COMMON_TIME, [note('F', 1)], ONE_SHARP), [
      { letter: 'F', duration: { value: 'quarter' } },
    ])

    expect(grade).toEqual([{ pitch: false, duration: true }])
  })
})
