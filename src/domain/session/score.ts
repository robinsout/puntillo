import type { Grade } from '../question'

export interface Score {
  checked: number
  correct: number
}

export const EMPTY_SCORE: Score = { checked: 0, correct: 0 }

export function recordGrade(score: Score, grade: Grade): Score {
  return {
    checked: score.checked + 1,
    correct: score.correct + (grade.correct ? 1 : 0),
  }
}

export function accuracy(score: Score): number | null {
  return score.checked === 0 ? null : score.correct / score.checked
}

// Multiply before dividing: 23 / 40 * 100 is 57.49999999999999 in IEEE 754.
export function accuracyPercent(score: Score): number | null {
  return score.checked === 0 ? null : Math.round((score.correct * 100) / score.checked)
}
