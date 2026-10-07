import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Grade } from '@/domain/question'
import {
  accuracy,
  accuracyPercent,
  EMPTY_SCORE,
  isLastQuestion,
  recordGrade,
  SESSION_LENGTHS,
} from '@/domain/session'
import type { Score, SessionLength } from '@/domain/session'

const correct: Grade = { correct: true }
const incorrect: Grade = { correct: false }

const scoreOf = (correctCount: number, checked: number): Score => ({
  checked,
  correct: correctCount,
})

describe('SessionLength', () => {
  it('offers exactly 10, 20, 50 and no limit, in this order', () => {
    expect(SESSION_LENGTHS).toEqual([10, 20, 50, 'unlimited'])
  })

  it('is exactly the union of the four offered lengths', () => {
    expectTypeOf<SessionLength>().toEqualTypeOf<10 | 20 | 50 | 'unlimited'>()
    expectTypeOf(SESSION_LENGTHS).toEqualTypeOf<readonly SessionLength[]>()
  })

  it('cannot express a length outside the offered set', () => {
    // @ts-expect-error 30 is not an offered session length
    const thirty: SessionLength = 30
    // @ts-expect-error a length is not an arbitrary number
    const anyNumber: SessionLength = 10 as number
    // @ts-expect-error a length is not an arbitrary string
    const anyString: SessionLength = 'infinite'
    expect([thirty, anyNumber, anyString]).toHaveLength(3)
  })
})

describe('EMPTY_SCORE', () => {
  it('starts with nothing checked and nothing correct', () => {
    expect(EMPTY_SCORE).toEqual({ checked: 0, correct: 0 })
  })
})

describe('recordGrade', () => {
  it('counts a correct grade as checked and correct', () => {
    expect(recordGrade(EMPTY_SCORE, correct)).toEqual({ checked: 1, correct: 1 })
  })

  it('counts an incorrect grade as checked only', () => {
    expect(recordGrade(EMPTY_SCORE, incorrect)).toEqual({ checked: 1, correct: 0 })
  })

  it('accumulates a sequence of grades', () => {
    const grades = [correct, incorrect, correct, correct, incorrect]
    expect(grades.reduce(recordGrade, EMPTY_SCORE)).toEqual({ checked: 5, correct: 3 })
  })

  it('returns a new score and leaves the previous one untouched', () => {
    const before = scoreOf(2, 3)
    const after = recordGrade(before, correct)
    expect(after).not.toBe(before)
    expect(before).toEqual({ checked: 3, correct: 2 })
    expect(EMPTY_SCORE).toEqual({ checked: 0, correct: 0 })
  })
})

describe('accuracy', () => {
  it('is the share of correct among checked questions', () => {
    expect(accuracy(scoreOf(7, 9))).toBeCloseTo(7 / 9)
    expect(accuracy(scoreOf(1, 2))).toBe(0.5)
  })

  it('is 1 when every checked question is correct', () => {
    expect(accuracy(scoreOf(4, 4))).toBe(1)
  })

  it('is 0 when no checked question is correct', () => {
    expect(accuracy(scoreOf(0, 3))).toBe(0)
  })

  it('is null when nothing has been checked yet', () => {
    expect(accuracy(EMPTY_SCORE)).toBeNull()
  })
})

describe('accuracyPercent', () => {
  it('rounds the share to a whole percent', () => {
    expect(accuracyPercent(scoreOf(7, 9))).toBe(78)
    expect(accuracyPercent(scoreOf(2, 3))).toBe(67)
  })

  it('rounds an exact half up', () => {
    expect(accuracyPercent(scoreOf(1, 8))).toBe(13)
  })

  it('rounds an exact half up even when floating-point division lands just below it', () => {
    // 23 / 40 * 100 evaluates to 57.49999999999999 in IEEE 754
    expect(accuracyPercent(scoreOf(23, 40))).toBe(58)
  })

  it('gives 100 and 0 at the extremes', () => {
    expect(accuracyPercent(scoreOf(9, 9))).toBe(100)
    expect(accuracyPercent(scoreOf(0, 9))).toBe(0)
  })

  it('is null when nothing has been checked yet', () => {
    expect(accuracyPercent(EMPTY_SCORE)).toBeNull()
  })
})

describe('isLastQuestion', () => {
  it.each([10, 20, 50] as const)(
    'is true for the final question of a %i-question session',
    (length) => {
      expect(isLastQuestion(length, length)).toBe(true)
    },
  )

  it.each([10, 20, 50] as const)(
    'is false for earlier questions of a %i-question session',
    (length) => {
      expect(isLastQuestion(length, 1)).toBe(false)
      expect(isLastQuestion(length, length - 1)).toBe(false)
    },
  )

  it('is never true without a limit', () => {
    expect(isLastQuestion('unlimited', 1)).toBe(false)
    expect(isLastQuestion('unlimited', 10)).toBe(false)
    expect(isLastQuestion('unlimited', 50)).toBe(false)
    expect(isLastQuestion('unlimited', 1000)).toBe(false)
  })
})
