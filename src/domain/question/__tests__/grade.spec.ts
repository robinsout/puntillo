import { describe, expect, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import type { Duration, NoteAnswer, Question } from '@/domain/question'
import { createQuestion, gradeAnswer } from '@/domain/question'

const questionOn = (letter: Letter, octave: number, value: Duration['value'] = 'whole') =>
  createQuestion({ pitch: { letter, octave }, duration: { value } })

// A question of one note is graded as a sequence of one.
function gradeOne(question: Question, answer: NoteAnswer) {
  const [grade, ...others] = gradeAnswer(question, [answer])
  if (!grade || others.length > 0) throw new Error('expected the grade of one note')
  return grade
}

describe('gradeAnswer for one note', () => {
  describe('the pitch', () => {
    it('is correct for the letter class of the question note', () => {
      expect(
        gradeOne(questionOn('C', 4), { letter: 'C', duration: { value: 'whole' } }).pitch,
      ).toBe(true)
    })

    it('is incorrect for any other letter class', () => {
      expect(
        gradeOne(questionOn('C', 4), { letter: 'D', duration: { value: 'whole' } }).pitch,
      ).toBe(false)
    })

    it('compares against the question note, not a fixed one', () => {
      const question = questionOn('G', 4)

      expect(gradeOne(question, { letter: 'G', duration: { value: 'whole' } }).pitch).toBe(true)
      expect(gradeOne(question, { letter: 'C', duration: { value: 'whole' } }).pitch).toBe(false)
    })

    it('ignores the octave because the answer names a degree only', () => {
      expect(
        gradeOne(questionOn('C', 5), { letter: 'C', duration: { value: 'whole' } }).pitch,
      ).toBe(true)
    })
  })

  describe('the duration', () => {
    it.each(['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const)(
      'is correct for the duration of a %s note',
      (value) => {
        expect(
          gradeOne(questionOn('C', 4, value), { letter: 'C', duration: { value } }).duration,
        ).toBe(true)
      },
    )

    it('is incorrect for any other duration', () => {
      const question = questionOn('C', 4, 'half')

      expect(gradeOne(question, { letter: 'C', duration: { value: 'quarter' } }).duration).toBe(
        false,
      )
      expect(gradeOne(question, { letter: 'C', duration: { value: 'whole' } }).duration).toBe(false)
    })

    it('tells the sixteenth from the eighth', () => {
      const sixteenth = questionOn('C', 4, 'sixteenth')

      expect(gradeOne(sixteenth, { letter: 'C', duration: { value: 'eighth' } }).duration).toBe(
        false,
      )
    })
  })

  // Each part is worth a point of its own (spec 7.1), so one wrong part leaves the other right.
  it('grades the pitch and the duration separately', () => {
    const question = questionOn('E', 4, 'quarter')

    expect(gradeOne(question, { letter: 'E', duration: { value: 'quarter' } })).toEqual({
      pitch: true,
      duration: true,
    })
    expect(gradeOne(question, { letter: 'E', duration: { value: 'half' } })).toEqual({
      pitch: true,
      duration: false,
    })
    expect(gradeOne(question, { letter: 'F', duration: { value: 'quarter' } })).toEqual({
      pitch: false,
      duration: true,
    })
    expect(gradeOne(question, { letter: 'F', duration: { value: 'eighth' } })).toEqual({
      pitch: false,
      duration: false,
    })
  })

  // Feature difficulty-presets, criterion 5: with the duration not asked only the name counts.
  describe('without the duration asked', () => {
    it('grades the pitch alone and leaves the duration ungraded', () => {
      const question = questionOn('E', 4, 'quarter')

      expect(gradeOne(question, { letter: 'E', duration: null })).toEqual({
        pitch: true,
        duration: null,
      })
      expect(gradeOne(question, { letter: 'F', duration: null })).toEqual({
        pitch: false,
        duration: null,
      })
    })
  })
})

// Feature multi-note-questions, criterion 15: the grade goes note by note (spec 4.1).
describe('gradeAnswer for several notes', () => {
  const note = (letter: Letter, value: Duration['value']) => ({
    pitch: { letter, octave: 4 },
    duration: { value },
  })
  // C4 half, E4 quarter, G4 quarter.
  const question = createQuestion(note('C', 'half'), note('E', 'quarter'), note('G', 'quarter'))

  it('grades every note right for the right answer', () => {
    expect(
      gradeAnswer(question, [
        { letter: 'C', duration: { value: 'half' } },
        { letter: 'E', duration: { value: 'quarter' } },
        { letter: 'G', duration: { value: 'quarter' } },
      ]),
    ).toEqual([
      { pitch: true, duration: true },
      { pitch: true, duration: true },
      { pitch: true, duration: true },
    ])
  })

  it('grades each answer against the note at its place, not against another note', () => {
    expect(
      gradeAnswer(question, [
        { letter: 'E', duration: { value: 'quarter' } },
        { letter: 'C', duration: { value: 'half' } },
        { letter: 'G', duration: { value: 'quarter' } },
      ]),
    ).toEqual([
      { pitch: false, duration: false },
      { pitch: false, duration: false },
      { pitch: true, duration: true },
    ])
  })

  it('grades the name and the duration of each note separately', () => {
    expect(
      gradeAnswer(question, [
        { letter: 'C', duration: { value: 'quarter' } },
        { letter: 'F', duration: { value: 'quarter' } },
        { letter: 'A', duration: { value: 'eighth' } },
      ]),
    ).toEqual([
      { pitch: true, duration: false },
      { pitch: false, duration: true },
      { pitch: false, duration: false },
    ])
  })

  it('leaves every duration ungraded when the duration is not asked', () => {
    expect(
      gradeAnswer(question, [
        { letter: 'C', duration: null },
        { letter: 'D', duration: null },
        { letter: 'G', duration: null },
      ]),
    ).toEqual([
      { pitch: true, duration: null },
      { pitch: false, duration: null },
      { pitch: true, duration: null },
    ])
  })

  it.each([
    ['fewer', [{ letter: 'C', duration: null }]],
    [
      'more',
      [
        { letter: 'C', duration: null },
        { letter: 'E', duration: null },
        { letter: 'G', duration: null },
        { letter: 'B', duration: null },
      ],
    ],
  ] as const)('refuses an answer of %s parts than the notes', (_, answer) => {
    expect(() => gradeAnswer(question, answer)).toThrow(/note/i)
  })
})
