import { describe, expect, it } from 'vitest'
import { EXERCISES, isExercise } from '@/domain/session'

// Feature m2-write-notes, criterion 1: the exercise is chosen before the session, Read notes (M1)
// or Write notes (M2), Read notes first.
describe('exercises', () => {
  it('are reading and writing notes, reading first', () => {
    expect(EXERCISES).toEqual(['read', 'write'])
  })

  it.each(['read', 'write'])('tells %j for an exercise', (value) => {
    expect(isExercise(value)).toBe(true)
  })

  it.each(['', 'Read', 'm2', 'write ', 'undefined'])('tells %j for no exercise', (value) => {
    expect(isExercise(value)).toBe(false)
  })
})
