import { diatonicPitchesBetween } from '../pitch'
import type { Pitch } from '../pitch'
import { barSixteenths, COMMON_TIME, sixteenths, type Duration } from '../question'
import { ledgerLines } from '../staff'

export type LedgerLineLimit = 0 | 1 | 2

export const QUESTION_LENGTHS = ['one-note', 'two-to-four-notes'] as const

export type QuestionLength = (typeof QUESTION_LENGTHS)[number]

const NOTE_COUNTS: Record<QuestionLength, readonly [number, ...number[]]> = {
  'one-note': [1],
  'two-to-four-notes': [2, 3, 4],
}

export const noteCounts = (length: QuestionLength): readonly [number, ...number[]] =>
  NOTE_COUNTS[length]

export interface Difficulty {
  readonly range: { readonly low: Pitch; readonly high: Pitch }
  readonly ledgerLines: LedgerLineLimit
  readonly durations: readonly Duration['value'][]
  readonly askDuration: boolean
  readonly questionLength: QuestionLength
}

export function allowedPitches(difficulty: Difficulty): Pitch[] {
  const { low, high } = difficulty.range
  return diatonicPitchesBetween(low, high).filter(
    (pitch) => ledgerLines(pitch, 'treble') <= difficulty.ledgerLines,
  )
}

// Every note of a question shares one bar.
export function fitsBar(difficulty: Difficulty): boolean {
  const fewest = Math.min(...noteCounts(difficulty.questionLength))
  return difficulty.durations.some(
    (value) => fewest * sixteenths(value) <= barSixteenths(COMMON_TIME),
  )
}
