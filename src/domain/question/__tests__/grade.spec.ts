import { describe, expect, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import { createQuestion, gradeAnswer } from '@/domain/question'

const questionOn = (letter: Letter, octave: number) =>
  createQuestion({ pitch: { letter, octave }, duration: { value: 'whole' } })

describe('gradeAnswer', () => {
  it('grades the letter class of the question note as correct', () => {
    expect(gradeAnswer(questionOn('C', 4), { letter: 'C' })).toEqual({ correct: true })
  })

  it('grades any other letter class as incorrect', () => {
    expect(gradeAnswer(questionOn('C', 4), { letter: 'D' })).toEqual({ correct: false })
  })

  it('compares against the question note, not a fixed one', () => {
    expect(gradeAnswer(questionOn('G', 4), { letter: 'G' })).toEqual({ correct: true })
    expect(gradeAnswer(questionOn('G', 4), { letter: 'C' })).toEqual({ correct: false })
  })

  it('ignores the octave because the answer names a degree only', () => {
    expect(gradeAnswer(questionOn('C', 5), { letter: 'C' })).toEqual({ correct: true })
  })
})
