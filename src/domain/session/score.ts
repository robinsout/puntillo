import { isRight, type Grade } from '../question'

export interface Score {
  checked: number
  points: number
  maxPoints: number
  streak: number
  bestStreak: number
  totalTimeMs: number
}

export const EMPTY_SCORE: Score = {
  checked: 0,
  points: 0,
  maxPoints: 0,
  streak: 0,
  bestStreak: 0,
  totalTimeMs: 0,
}

export function recordGrade(score: Score, grade: Grade, elapsedMs: number): Score {
  const streak = isRight(grade) ? score.streak + 1 : 0
  return {
    checked: score.checked + 1,
    points: grade.reduce(
      (sum, note) => sum + Number(note.pitch) + Number(note.duration === true),
      score.points,
    ),
    maxPoints: grade.reduce((sum, note) => sum + (note.duration === null ? 1 : 2), score.maxPoints),
    streak,
    bestStreak: Math.max(score.bestStreak, streak),
    totalTimeMs: score.totalTimeMs + elapsedMs,
  }
}

export function accuracy(score: Score): number | null {
  return score.maxPoints === 0 ? null : score.points / score.maxPoints
}

// Multiply before dividing: 23 / 40 * 100 is 57.49999999999999 in IEEE 754.
export function accuracyPercent(score: Score): number | null {
  return score.maxPoints === 0 ? null : Math.round((score.points * 100) / score.maxPoints)
}

export function averageTimeMs(score: Score): number | null {
  return score.checked === 0 ? null : score.totalTimeMs / score.checked
}
