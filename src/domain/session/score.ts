import type { Grade } from '../question'

export interface Score {
  checked: number
  correct: number
  streak: number
  bestStreak: number
  totalTimeMs: number
}

export const EMPTY_SCORE: Score = {
  checked: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  totalTimeMs: 0,
}

export function recordGrade(score: Score, grade: Grade, elapsedMs: number): Score {
  const streak = grade.correct ? score.streak + 1 : 0
  return {
    checked: score.checked + 1,
    correct: score.correct + (grade.correct ? 1 : 0),
    streak,
    bestStreak: Math.max(score.bestStreak, streak),
    totalTimeMs: score.totalTimeMs + elapsedMs,
  }
}

export function accuracy(score: Score): number | null {
  return score.checked === 0 ? null : score.correct / score.checked
}

// Multiply before dividing: 23 / 40 * 100 is 57.49999999999999 in IEEE 754.
export function accuracyPercent(score: Score): number | null {
  return score.checked === 0 ? null : Math.round((score.correct * 100) / score.checked)
}

export function averageTimeMs(score: Score): number | null {
  return score.checked === 0 ? null : score.totalTimeMs / score.checked
}
