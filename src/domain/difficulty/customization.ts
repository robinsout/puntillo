import { diatonicPitchesBetween, isSamePitch } from '../pitch'
import type { Pitch } from '../pitch'
import { allowedPitches, type Difficulty, type LedgerLineLimit } from './difficulty'

export const RANGE_PITCHES: readonly Pitch[] = diatonicPitchesBetween(
  { letter: 'A', octave: 3 },
  { letter: 'C', octave: 6 },
)

export const LEDGER_LINE_LIMITS: readonly LedgerLineLimit[] = [0, 1, 2]

export type DifficultyChange =
  { readonly low: Pitch } | { readonly high: Pitch } | { readonly ledgerLines: LedgerLineLimit }

export function changeDifficulty(difficulty: Difficulty, change: DifficultyChange): Difficulty {
  if ('low' in change) return { ...difficulty, range: { ...difficulty.range, low: change.low } }
  if ('high' in change) return { ...difficulty, range: { ...difficulty.range, high: change.high } }
  return { ...difficulty, ledgerLines: change.ledgerLines }
}

// The generator does not repeat a note twice in a row, so a question needs two notes.
export function isPlayable(difficulty: Difficulty): boolean {
  return allowedPitches(difficulty).length >= 2 && difficulty.durations.length >= 1
}

export function canChange(difficulty: Difficulty, change: DifficultyChange): boolean {
  return isPlayable(changeDifficulty(difficulty, change))
}

export function isSameDifficulty(a: Difficulty, b: Difficulty): boolean {
  return (
    isSamePitch(a.range.low, b.range.low) &&
    isSamePitch(a.range.high, b.range.high) &&
    a.ledgerLines === b.ledgerLines &&
    a.askDuration === b.askDuration &&
    a.durations.length === b.durations.length &&
    a.durations.every((duration) => b.durations.includes(duration))
  )
}
