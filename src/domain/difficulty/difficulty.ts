import { diatonicPitchesBetween } from '../pitch'
import type { Pitch } from '../pitch'
import { barSixteenths, sixteenths, type Duration, type TimeSignature } from '../question'
import { ledgerLines } from '../staff'

export type LedgerLineLimit = 0 | 1 | 2

export const QUESTION_LENGTHS = ['one-note', 'two-to-four-notes', 'one-bar', 'two-bars'] as const

export type QuestionLength = (typeof QUESTION_LENGTHS)[number]

export const MAX_NOTES = 16

// How many notes a question of 2–4 notes may hold, all within one bar.
export const SEVERAL_NOTES = [2, 3, 4] as const

export const barCount = (length: QuestionLength): number => (length === 'two-bars' ? 2 : 1)

export interface Difficulty {
  readonly range: { readonly low: Pitch; readonly high: Pitch }
  readonly ledgerLines: LedgerLineLimit
  readonly durations: readonly Duration['value'][]
  readonly askDuration: boolean
  readonly questionLength: QuestionLength
  readonly timeSignatures: readonly TimeSignature[]
  readonly rests: boolean
}

export function allowedPitches(difficulty: Difficulty): Pitch[] {
  const { low, high } = difficulty.range
  return diatonicPitchesBetween(low, high).filter(
    (pitch) => ledgerLines(pitch, 'treble') <= difficulty.ledgerLines,
  )
}

// Greedy is exact here: every duration is a power of two of the shorter ones.
export function fewestNotes(room: number, durations: readonly Duration['value'][]): number {
  const lengths = durations.map(sixteenths).sort((a, b) => b - a)
  let count = 0
  let left = room
  for (const length of lengths) {
    count += Math.floor(left / length)
    left %= length
  }
  return left === 0 ? count : Infinity
}

function fits(difficulty: Difficulty, timeSignature: TimeSignature): boolean {
  const { durations, questionLength } = difficulty
  if (durations.length === 0) return false
  const bar = barSixteenths(timeSignature)
  const shortest = Math.min(...durations.map(sixteenths))
  switch (questionLength) {
    case 'one-note':
      return shortest <= bar
    case 'two-to-four-notes':
      return SEVERAL_NOTES[0] * shortest <= bar
    case 'one-bar':
    case 'two-bars':
      return barCount(questionLength) * fewestNotes(bar, durations) <= MAX_NOTES
  }
}

export function fittingTimeSignatures(difficulty: Difficulty): TimeSignature[] {
  return difficulty.timeSignatures.filter((timeSignature) => fits(difficulty, timeSignature))
}
