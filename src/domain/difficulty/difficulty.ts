import { diatonicPitchesBetween } from '../pitch'
import type { Pitch } from '../pitch'
import type { Duration } from '../question'
import { ledgerLines } from '../staff'

export interface Difficulty {
  readonly range: { readonly low: Pitch; readonly high: Pitch }
  readonly ledgerLines: 0 | 1 | 2
  readonly durations: readonly Duration['value'][]
  readonly askDuration: boolean
}

export function allowedPitches(difficulty: Difficulty): Pitch[] {
  const { low, high } = difficulty.range
  return diatonicPitchesBetween(low, high).filter(
    (pitch) => ledgerLines(pitch, 'treble') <= difficulty.ledgerLines,
  )
}
