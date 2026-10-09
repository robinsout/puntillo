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

const correct: Grade = { pitch: true, duration: true }
const incorrect: Grade = { pitch: false, duration: false }
const pitchOnly: Grade = { pitch: true, duration: false }
const durationOnly: Grade = { pitch: false, duration: true }
// The duration is not asked, so the note is worth one point (spec 7.1).
const nameRight: Grade = { pitch: true, duration: null }
const nameWrong: Grade = { pitch: false, duration: null }

const scoreOf = (points: number, maxPoints: number): Score => ({
  checked: maxPoints / 2,
  points,
  maxPoints,
  streak: 0,
  bestStreak: 0,
  totalTimeMs: 0,
})

const timedScore = (checked: number, totalTimeMs: number): Score => ({
  ...scoreOf(0, checked * 2),
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
  it('starts with nothing checked, no points, no streak and no time', () => {
    expect(EMPTY_SCORE).toEqual({
      checked: 0,
      points: 0,
      maxPoints: 0,
      streak: 0,
      bestStreak: 0,
      totalTimeMs: 0,
    })
  })
})

// A note is worth two points, one for the pitch and one for the duration (spec 7.1).
describe('recordGrade', () => {
  it('counts a fully correct grade as checked with both points', () => {
    expect(recordGrade(EMPTY_SCORE, correct, 1000)).toMatchObject({
      checked: 1,
      points: 2,
      maxPoints: 2,
    })
  })

  it('counts a fully incorrect grade as checked with no points', () => {
    expect(recordGrade(EMPTY_SCORE, incorrect, 1000)).toMatchObject({
      checked: 1,
      points: 0,
      maxPoints: 2,
    })
  })

  it('gives one point for the right pitch alone', () => {
    expect(recordGrade(EMPTY_SCORE, pitchOnly, 1000)).toMatchObject({
      checked: 1,
      points: 1,
      maxPoints: 2,
    })
  })

  it('gives one point for the right duration alone', () => {
    expect(recordGrade(EMPTY_SCORE, durationOnly, 1000)).toMatchObject({
      checked: 1,
      points: 1,
      maxPoints: 2,
    })
  })

  it('accumulates a sequence of grades', () => {
    const grades = [correct, pitchOnly, correct, correct, incorrect]
    expect(record(grades, 2000)).toEqual({
      checked: 5,
      points: 7,
      maxPoints: 10,
      streak: 0,
      bestStreak: 2,
      totalTimeMs: 10000,
    })
  })

  it('returns a new score and leaves the previous one untouched', () => {
    const before = scoreOf(4, 6)
    const after = recordGrade(before, correct, 1500)
    expect(after).not.toBe(before)
    expect(before).toEqual({
      checked: 3,
      points: 4,
      maxPoints: 6,
      streak: 0,
      bestStreak: 0,
      totalTimeMs: 0,
    })
    expect(EMPTY_SCORE).toEqual({
      checked: 0,
      points: 0,
      maxPoints: 0,
      streak: 0,
      bestStreak: 0,
      totalTimeMs: 0,
    })
  })
})

// Feature difficulty-presets, criterion 5.
describe('recordGrade without the duration asked', () => {
  it('gives the one point of the note for the right name', () => {
    expect(recordGrade(EMPTY_SCORE, nameRight, 1000)).toMatchObject({
      checked: 1,
      points: 1,
      maxPoints: 1,
    })
  })

  it('gives no point for a wrong name', () => {
    expect(recordGrade(EMPTY_SCORE, nameWrong, 1000)).toMatchObject({
      checked: 1,
      points: 0,
      maxPoints: 1,
    })
  })

  it('counts 3 of 4 points for three right names out of four, 75%', () => {
    const score = record([nameRight, nameWrong, nameRight, nameRight])

    expect(score).toMatchObject({ checked: 4, points: 3, maxPoints: 4 })
    expect(accuracyPercent(score)).toBe(75)
  })

  it('grows the streak on a right name and drops it on a wrong one', () => {
    expect(streaksAfter([nameRight, nameRight])).toEqual({ streak: 2, bestStreak: 2 })
    expect(streaksAfter([nameRight, nameRight, nameWrong])).toEqual({ streak: 0, bestStreak: 2 })
  })

  it('adds the time of the answer as for any other note', () => {
    expect(recordGrade(EMPTY_SCORE, nameRight, 2400).totalTimeMs).toBe(2400)
  })
})

describe('streak', () => {
  it('grows by one on each fully correct grade in a row', () => {
    expect(streaksAfter([correct])).toEqual({ streak: 1, bestStreak: 1 })
    expect(streaksAfter([correct, correct, correct])).toEqual({ streak: 3, bestStreak: 3 })
  })

  it('stays at zero on an incorrect grade from the start', () => {
    expect(streaksAfter([incorrect])).toEqual({ streak: 0, bestStreak: 0 })
  })

  it('drops to zero on an incorrect grade', () => {
    expect(streaksAfter([correct, correct, incorrect]).streak).toBe(0)
  })

  it.each([
    ['pitch', durationOnly],
    ['duration', pitchOnly],
  ])('drops to zero when only the %s is wrong', (_, grade) => {
    expect(streaksAfter([correct, correct, grade])).toEqual({ streak: 0, bestStreak: 2 })
  })

  it('starts over from one after being dropped', () => {
    expect(streaksAfter([correct, correct, incorrect, correct]).streak).toBe(1)
  })

  it('keeps the best streak after the current one is dropped', () => {
    expect(streaksAfter([correct, correct, incorrect])).toEqual({ streak: 0, bestStreak: 2 })
  })

  it('takes the longest run as the best streak, wherever it occurs', () => {
    const longestFirst = [correct, correct, correct, incorrect, correct, pitchOnly]
    const longestLast = [correct, durationOnly, correct, correct, correct, correct]

    expect(streaksAfter(longestFirst)).toEqual({ streak: 0, bestStreak: 3 })
    expect(streaksAfter(longestLast)).toEqual({ streak: 4, bestStreak: 4 })
  })

  it('does not raise the best streak while a shorter run is going', () => {
    const score = { ...scoreOf(10, 12), streak: 1, bestStreak: 4 }

    expect(recordGrade(score, correct, 1000)).toMatchObject({ streak: 2, bestStreak: 4 })
  })

  it('leaves the previous score untouched', () => {
    const before = { ...scoreOf(4, 4), streak: 2, bestStreak: 2 }

    recordGrade(before, incorrect, 1000)

    expect(before).toEqual({
      checked: 2,
      points: 4,
      maxPoints: 4,
      streak: 2,
      bestStreak: 2,
      totalTimeMs: 0,
    })
  })
})

describe('accuracy', () => {
  it('is the share of points among the points possible', () => {
    expect(accuracy(scoreOf(5, 6))).toBeCloseTo(5 / 6)
    expect(accuracy(scoreOf(1, 2))).toBe(0.5)
  })

  it('counts a half-right note as half', () => {
    expect(accuracy(record([correct, pitchOnly]))).toBe(0.75)
  })

  it('is 1 when every point is earned', () => {
    expect(accuracy(scoreOf(4, 4))).toBe(1)
  })

  it('is 0 when no point is earned', () => {
    expect(accuracy(scoreOf(0, 6))).toBe(0)
  })

  it('is null when nothing has been checked yet', () => {
    expect(accuracy(EMPTY_SCORE)).toBeNull()
  })
})

describe('accuracyPercent', () => {
  it('rounds the share to a whole percent', () => {
    expect(accuracyPercent(scoreOf(5, 6))).toBe(83)
    expect(accuracyPercent(scoreOf(2, 6))).toBe(33)
  })

  it('rounds an exact half up', () => {
    expect(accuracyPercent(scoreOf(1, 8))).toBe(13)
  })

  it('rounds an exact half up even when floating-point division lands just below it', () => {
    // 23 / 40 * 100 evaluates to 57.49999999999999 in IEEE 754
    expect(accuracyPercent(scoreOf(23, 40))).toBe(58)
  })

  it('gives 100 and 0 at the extremes', () => {
    expect(accuracyPercent(scoreOf(18, 18))).toBe(100)
    expect(accuracyPercent(scoreOf(0, 18))).toBe(0)
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
