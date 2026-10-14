// The marks of a row of choices on the second attempt and on the review.
export interface ChoiceMarks<T> {
  isIncorrect(value: T): boolean
  isCorrect(value: T): boolean
  // The id of the hidden text describing the mark.
  markOf(value: T): string | undefined
}
