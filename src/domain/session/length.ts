export type SessionLength = 10 | 20 | 50 | 'unlimited'

export const SESSION_LENGTHS: readonly SessionLength[] = [10, 20, 50, 'unlimited']

export function isLastQuestion(length: SessionLength, questionNumber: number): boolean {
  return length !== 'unlimited' && questionNumber === length
}
