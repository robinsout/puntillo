import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Grade } from '@/domain/question'
import {
  accuracy,
  accuracyPercent,
  averageTimeMs,
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
  streak: 0,
  bestStreak: 0,
  totalTimeMs: 0,
})

const timedScore = (checked: number, totalTimeMs: number): Score => ({
  ...scoreOf(0, checked),
  totalTimeMs,
})

const record = (grades: Grade[], elapsedMs = 1000) =>
  grades.reduce((score, grade) => recordGrade(score, grade, elapsedMs), EMPTY_SCORE)

const streaksAfter = (grades: Grade[]) => {
  const { streak, bestStreak } = record(grades)
  return { streak, bestStreak }
}

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
  it('starts with nothing checked, nothing correct, no streak and no time', () => {
    expect(EMPTY_SCORE).toEqual({
      checked: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      totalTimeMs: 0,
    })
  })
})

describe('recordGrade', () => {
  it('counts a correct grade as checked and correct', () => {
    expect(recordGrade(EMPTY_SCORE, correct, 1000)).toMatchObject({ checked: 1, correct: 1 })
  })

  it('counts an incorrect grade as checked only', () => {
    expect(recordGrade(EMPTY_SCORE, incorrect, 1000)).toMatchObject({ checked: 1, correct: 0 })
  })

  it('accumulates a sequence of grades', () => {
    const grades = [correct, incorrect, correct, correct, incorrect]
    expect(record(grades, 2000)).toEqual({
      checked: 5,
      correct: 3,
      streak: 0,
      bestStreak: 2,
      totalTimeMs: 10000,
    })
  })

  it('returns a new score and leaves the previous one untouched', () => {
    const before = scoreOf(2, 3)
    const after = recordGrade(before, correct, 1500)
    expect(after).not.toBe(before)
    expect(before).toEqual({ checked: 3, correct: 2, streak: 0, bestStreak: 0, totalTimeMs: 0 })
    expect(EMPTY_SCORE).toEqual({
      checked: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      totalTimeMs: 0,
    })
  })
})

describe('streak', () => {
  it('grows by one on each correct grade in a row', () => {
    expect(streaksAfter([correct])).toEqual({ streak: 1, bestStreak: 1 })
    expect(streaksAfter([correct, correct, correct])).toEqual({ streak: 3, bestStreak: 3 })
  })

  it('stays at zero on an incorrect grade from the start', () => {
    expect(streaksAfter([incorrect])).toEqual({ streak: 0, bestStreak: 0 })
  })

  it('drops to zero on an incorrect grade', () => {
    expect(streaksAfter([correct, correct, incorrect]).streak).toBe(0)
  })

  it('starts over from one after being dropped', () => {
    expect(streaksAfter([correct, correct, incorrect, correct]).streak).toBe(1)
  })

  it('keeps the best streak after the current one is dropped', () => {
    expect(streaksAfter([correct, correct, incorrect])).toEqual({ streak: 0, bestStreak: 2 })
  })

  it('takes the longest run as the best streak, wherever it occurs', () => {
    const longestFirst = [correct, correct, correct, incorrect, correct, incorrect]
    const longestLast = [correct, incorrect, correct, correct, correct, correct]

    expect(streaksAfter(longestFirst)).toEqual({ streak: 0, bestStreak: 3 })
    expect(streaksAfter(longestLast)).toEqual({ streak: 4, bestStreak: 4 })
  })

  it('does not raise the best streak while a shorter run is going', () => {
    const score = { ...scoreOf(5, 6), streak: 1, bestStreak: 4 }

    expect(recordGrade(score, correct, 1000)).toMatchObject({ streak: 2, bestStreak: 4 })
  })

  it('leaves the previous score untouched', () => {
    const before = { ...scoreOf(2, 2), streak: 2, bestStreak: 2 }

    recordGrade(before, incorrect, 1000)

    expect(before).toEqual({ checked: 2, correct: 2, streak: 2, bestStreak: 2, totalTimeMs: 0 })
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

describe('answer time', () => {
  it('adds the time of a checked question to the total', () => {
    expect(recordGrade(EMPTY_SCORE, correct, 2400).totalTimeMs).toBe(2400)
  })

  it('counts the time of a wrong answer as well', () => {
    expect(recordGrade(EMPTY_SCORE, incorrect, 3100).totalTimeMs).toBe(3100)
  })

  it('sums the times over a sequence of checked questions', () => {
    const score = [
      { grade: correct, ms: 1200 },
      { grade: incorrect, ms: 4500 },
      { grade: correct, ms: 800 },
    ].reduce((acc, { grade, ms }) => recordGrade(acc, grade, ms), EMPTY_SCORE)

    expect(score).toMatchObject({ checked: 3, totalTimeMs: 6500 })
  })

  it('leaves the previous total untouched', () => {
    const before = timedScore(2, 3000)

    recordGrade(before, correct, 1000)

    expect(before.totalTimeMs).toBe(3000)
  })
})

describe('averageTimeMs', () => {
  it('is the total time divided by the number of checked questions', () => {
    expect(averageTimeMs(timedScore(4, 9600))).toBe(2400)
  })

  it('is not rounded, leaving that to the display', () => {
    expect(averageTimeMs(timedScore(3, 1000))).toBeCloseTo(333.333, 3)
  })

  it('is the single time after one checked question', () => {
    expect(averageTimeMs(recordGrade(EMPTY_SCORE, incorrect, 1750))).toBe(1750)
  })

  it('is null when nothing has been checked yet', () => {
    expect(averageTimeMs(EMPTY_SCORE)).toBeNull()
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
