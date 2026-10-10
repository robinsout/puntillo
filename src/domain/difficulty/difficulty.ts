import { diatonicPitchesBetween } from '../pitch'
import type { Pitch } from '../pitch'
import {
  barSixteenths,
  canBeDotted,
  sixteenths,
  sixteenthsOf,
  type Duration,
  type TimeSignature,
} from '../question'
import { ledgerLines } from '../staff'

export type LedgerLineLimit = 0 | 1 | 2

export type KeySignatureLimit = 0 | 2 | 4 | 7

export const QUESTION_LENGTHS = ['one-note', 'two-to-four-notes', 'one-bar', 'two-bars'] as const

export type QuestionLength = (typeof QUESTION_LENGTHS)[number]

export const MAX_NOTES = 16

// How many notes a question of 2–4 notes may hold, all within one bar.
export const SEVERAL_NOTES = [2, 3, 4] as const

export const barCount = (length: QuestionLength): number => (length === 'two-bars' ? 2 : 1)

export interface Difficulty {
  readonly range: { readonly low: Pitch; readonly high: Pitch }
  readonly ledgerLines: LedgerLineLimit
  readonly keySignatures: KeySignatureLimit
  readonly durations: readonly Duration['value'][]
  readonly askDuration: boolean
  readonly questionLength: QuestionLength
  readonly timeSignatures: readonly TimeSignature[]
  readonly rests: boolean
  readonly dots: boolean
}

export function allowedPitches(difficulty: Difficulty): Pitch[] {
  const { low, high } = difficulty.range
  return diatonicPitchesBetween(low, high).filter(
    (pitch) => ledgerLines(pitch, 'treble') <= difficulty.ledgerLines,
  )
}

// The durations a note may take, plain and, with the dots on, dotted.
export function durationsOf(difficulty: Pick<Difficulty, 'durations' | 'dots'>): Duration[] {
  return difficulty.durations.flatMap((value) =>
    difficulty.dots && canBeDotted(value) ? [{ value }, { value, dots: 1 as const }] : [{ value }],
  )
}

// Dotted lengths are no powers of two of the others, so a greedy count could miss the fewest.
export function fewestNotes(room: number, durations: readonly Duration[]): number {
  const lengths = durations.map(sixteenthsOf)
  let filled = new Set([0])
  for (let count = 0; filled.size > 0; count++) {
    if (filled.has(room)) return count
    filled = new Set(
      [...filled]
        .flatMap((each) => lengths.map((length) => each + length))
        .filter((each) => each <= room),
    )
  }
  return Infinity
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
      return barCount(questionLength) * fewestNotes(bar, durationsOf(difficulty)) <= MAX_NOTES
  }
}

export function fittingTimeSignatures(difficulty: Difficulty): TimeSignature[] {
  return difficulty.timeSignatures.filter((timeSignature) => fits(difficulty, timeSignature))
}
