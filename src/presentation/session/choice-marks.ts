import type { AnswerMark } from '@/presentation/ui'

// The marks of a row of choices on the second attempt and on the review.
export interface ChoiceMarks<T> {
  markOf(value: T): AnswerMark | null
  // The id of the hidden text describing the mark.
  describedBy(value: T): string | undefined
}

export interface MarkedChoices<T> {
  // Rejected on the first attempt.
  readonly rejected?: T
  // On the review: the last choice when it is wrong, and the right one.
  readonly wrong?: T
  readonly right?: T
}

export interface MarkIds {
  readonly incorrect: string
  readonly correct: string
}

export const isIncorrectMark = (mark: AnswerMark | null): boolean =>
  mark === 'rejected' || mark === 'wrong'

// A choice is marked once, by the first of rejected, wrong and right it is.
export function choiceMarks<T>(
  { rejected, wrong, right }: MarkedChoices<T>,
  ids: MarkIds,
): ChoiceMarks<T> {
  const markOf = (value: T): AnswerMark | null => {
    if (rejected !== undefined && value === rejected) return 'rejected'
    if (wrong !== undefined && value === wrong) return 'wrong'
    if (right !== undefined && value === right) return 'correct'
    return null
  }
  return {
    markOf,
    describedBy(value) {
      const mark = markOf(value)
      if (mark === null) return undefined
      return isIncorrectMark(mark) ? ids.incorrect : ids.correct
    },
  }
}
