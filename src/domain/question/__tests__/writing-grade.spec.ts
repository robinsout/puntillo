import { describe, expect, it } from 'vitest'
import type { Letter, Pitch } from '@/domain/pitch'
import { createQuestion, gradeWriting } from '@/domain/question'

// Feature m2-write-notes, criteria 11–12, slice 1: a written note is right on the step of the
// question note. Unlike a name in M1, a step stands for one octave, so the octave counts. The
// duration is not asked in slice 1, so it is not graded.

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

const questionOn = (letter: Letter, octave: number) =>
  createQuestion({ pitch: pitch(letter, octave), duration: { value: 'quarter' } })

describe('gradeWriting', () => {
  it('grades a note written on the step of the question note right', () => {
    expect(gradeWriting(questionOn('G', 4), [pitch('G', 4)])).toEqual([
      { pitch: true, duration: null },
    ])
  })

  it('grades a note on another step wrong', () => {
    expect(gradeWriting(questionOn('G', 4), [pitch('F', 4)])).toEqual([
      { pitch: false, duration: null },
    ])
  })

  it('grades the same letter in another octave wrong', () => {
    expect(gradeWriting(questionOn('C', 5), [pitch('C', 4)])).toEqual([
      { pitch: false, duration: null },
    ])
  })

  it('grades each note against the note at its place', () => {
    const question = createQuestion(
      { pitch: pitch('E', 4), duration: { value: 'quarter' } },
      { pitch: pitch('G', 4), duration: { value: 'quarter' } },
    )

    expect(gradeWriting(question, [pitch('G', 4), pitch('G', 4)])).toEqual([
      { pitch: false, duration: null },
      { pitch: true, duration: null },
    ])
  })

  it.each([
    ['fewer', []],
    ['more', [pitch('G', 4), pitch('G', 4)]],
  ] as const)('refuses %s written notes than the notes of the question', (_, written) => {
    expect(() => gradeWriting(questionOn('G', 4), written)).toThrow(/note/i)
  })
})
