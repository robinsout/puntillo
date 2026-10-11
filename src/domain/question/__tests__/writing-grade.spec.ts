import { describe, expect, it } from 'vitest'
import type { Letter, Pitch } from '@/domain/pitch'
import { createQuestion, gradeWriting, type Duration, type WrittenNote } from '@/domain/question'

// Feature m2-write-notes, criteria 11–12: a written note is right on the step of the question
// note. Unlike a name in M1, a step stands for one octave, so the octave counts. Slice 2: the
// duration, when asked, is graded apart from the pitch, as in M1; a written note without a
// duration (null) is one whose duration is not asked, so it is not graded.

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

const questionOn = (letter: Letter, octave: number, value: Duration['value'] = 'quarter') =>
  createQuestion({ pitch: pitch(letter, octave), duration: { value } })

const written = (note: Pitch, duration: Duration | null = null): WrittenNote => ({
  pitch: note,
  duration,
})

describe('gradeWriting', () => {
  describe('the pitch', () => {
    it('is right on the step of the question note', () => {
      expect(gradeWriting(questionOn('G', 4), [written(pitch('G', 4))])).toEqual([
        { pitch: true, duration: null },
      ])
    })

    it('is wrong on another step', () => {
      expect(gradeWriting(questionOn('G', 4), [written(pitch('F', 4))])).toEqual([
        { pitch: false, duration: null },
      ])
    })

    it('is wrong for the same letter in another octave', () => {
      expect(gradeWriting(questionOn('C', 5), [written(pitch('C', 4))])).toEqual([
        { pitch: false, duration: null },
      ])
    })
  })

  describe('the duration', () => {
    it('is right for the duration of the question note', () => {
      expect(
        gradeWriting(questionOn('G', 4, 'half'), [written(pitch('G', 4), { value: 'half' })]),
      ).toEqual([{ pitch: true, duration: true }])
    })

    it('is wrong for another duration, graded apart from the pitch', () => {
      expect(
        gradeWriting(questionOn('G', 4, 'half'), [written(pitch('G', 4), { value: 'quarter' })]),
      ).toEqual([{ pitch: true, duration: false }])
      expect(
        gradeWriting(questionOn('G', 4, 'half'), [written(pitch('E', 4), { value: 'half' })]),
      ).toEqual([{ pitch: false, duration: true }])
    })

    it('is right only with the dot of a dotted note', () => {
      const dotted = createQuestion({
        pitch: pitch('G', 4),
        duration: { value: 'half', dots: 1 },
      })

      expect(gradeWriting(dotted, [written(pitch('G', 4), { value: 'half', dots: 1 })])).toEqual([
        { pitch: true, duration: true },
      ])
      expect(gradeWriting(dotted, [written(pitch('G', 4), { value: 'half' })])).toEqual([
        { pitch: true, duration: false },
      ])
    })
  })

  it('grades each note against the note at its place', () => {
    const question = createQuestion(
      { pitch: pitch('E', 4), duration: { value: 'half' } },
      { pitch: pitch('G', 4), duration: { value: 'quarter' } },
    )

    expect(
      gradeWriting(question, [
        written(pitch('G', 4), { value: 'quarter' }),
        written(pitch('G', 4), { value: 'quarter' }),
      ]),
    ).toEqual([
      { pitch: false, duration: false },
      { pitch: true, duration: true },
    ])
  })

  it.each([
    ['fewer', []],
    ['more', [written(pitch('G', 4)), written(pitch('G', 4))]],
  ] as const)('refuses %s written notes than the notes of the question', (_, notes) => {
    expect(() => gradeWriting(questionOn('G', 4), notes)).toThrow(/note/i)
  })
})
