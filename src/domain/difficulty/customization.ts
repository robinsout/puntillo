import { diatonicPitchesBetween, isSamePitch } from '../pitch'
import type { Pitch } from '../pitch'
import {
  DURATION_VALUES,
  isSameTimeSignature,
  TIME_SIGNATURES,
  type Duration,
  type TimeSignature,
} from '../question'
import {
  allowedPitches,
  fittingTimeSignatures,
  type Difficulty,
  type LedgerLineLimit,
  type QuestionLength,
} from './difficulty'

export const RANGE_PITCHES: readonly Pitch[] = diatonicPitchesBetween(
  { letter: 'A', octave: 3 },
  { letter: 'C', octave: 6 },
)

export const LEDGER_LINE_LIMITS: readonly LedgerLineLimit[] = [0, 1, 2]

export type DifficultyChange =
  | { readonly low: Pitch }
  | { readonly high: Pitch }
  | { readonly ledgerLines: LedgerLineLimit }
  | { readonly duration: Duration['value']; readonly on: boolean }
  | { readonly askDuration: boolean }
  | { readonly questionLength: QuestionLength }
  | { readonly timeSignature: TimeSignature; readonly on: boolean }

const includesTimeSignature = (list: readonly TimeSignature[], one: TimeSignature): boolean =>
  list.some((each) => isSameTimeSignature(each, one))

export function changeDifficulty(difficulty: Difficulty, change: DifficultyChange): Difficulty {
  if ('low' in change) return { ...difficulty, range: { ...difficulty.range, low: change.low } }
  if ('high' in change) return { ...difficulty, range: { ...difficulty.range, high: change.high } }
  if ('ledgerLines' in change) return { ...difficulty, ledgerLines: change.ledgerLines }
  if ('askDuration' in change) return { ...difficulty, askDuration: change.askDuration }
  if ('questionLength' in change) return { ...difficulty, questionLength: change.questionLength }
  // The generator picks a time signature and a duration by their place in the list, so the order
  // is kept fixed.
  if ('timeSignature' in change) {
    return {
      ...difficulty,
      timeSignatures: TIME_SIGNATURES.filter((offered) =>
        isSameTimeSignature(offered, change.timeSignature)
          ? change.on
          : includesTimeSignature(difficulty.timeSignatures, offered),
      ),
    }
  }
  return {
    ...difficulty,
    durations: DURATION_VALUES.filter((value) =>
      value === change.duration ? change.on : difficulty.durations.includes(value),
    ),
  }
}
// The generator does not repeat a note twice in a row, so a question needs two notes.
export function isPlayable(difficulty: Difficulty): boolean {
  return allowedPitches(difficulty).length >= 2 && fittingTimeSignatures(difficulty).length > 0
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
    a.questionLength === b.questionLength &&
    a.durations.length === b.durations.length &&
    a.durations.every((duration) => b.durations.includes(duration)) &&
    a.timeSignatures.length === b.timeSignatures.length &&
    a.timeSignatures.every((one) => includesTimeSignature(b.timeSignatures, one))
  )
}
