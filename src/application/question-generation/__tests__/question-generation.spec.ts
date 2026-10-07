import { describe, expect, it } from 'vitest'
import { generateQuestion } from '@/application/question-generation'
import { createQuestion } from '@/domain/question'

// Срез 1: источник вопроса всегда даёт C4 целой нотой. Диапазон и случайность — срез 2.
describe('generateQuestion', () => {
  it('asks about middle C as a whole note', () => {
    expect(generateQuestion().note).toEqual({
      pitch: { letter: 'C', octave: 4 },
      duration: { value: 'whole' },
    })
  })

  it('puts the note on a treble staff in 4/4', () => {
    const question = generateQuestion()

    expect(question.clef).toBe('treble')
    expect(question.timeSignature).toEqual({ beats: 4, beatValue: 4 })
  })

  it('builds the question through the domain', () => {
    expect(generateQuestion()).toEqual(
      createQuestion({ pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } }),
    )
  })

  it('gives a question again on every call', () => {
    expect(generateQuestion()).toEqual(generateQuestion())
  })
})
