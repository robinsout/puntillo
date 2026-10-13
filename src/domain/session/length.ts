export interface TimeLimit {
  readonly minutes: 3 | 5 | 10
}

export type SessionLength = 10 | 20 | 50 | 'unlimited' | TimeLimit

export const SESSION_LENGTHS: readonly SessionLength[] = [
  10,
  20,
  50,
  { minutes: 3 },
  { minutes: 5 },
  { minutes: 10 },
  'unlimited',
]

const MINUTE_MS = 60_000

// A session on time ends by the clock: isTimeUp, not the number of questions.
export function isLastQuestion(length: SessionLength, questionNumber: number): boolean {
  return typeof length === 'number' && questionNumber === length
}

export function isTimeUp(length: SessionLength, elapsedMs: number): boolean {
  return typeof length === 'object' && elapsedMs >= length.minutes * MINUTE_MS
}
