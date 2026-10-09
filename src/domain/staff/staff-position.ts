import { diatonicStep } from '@/domain/pitch'
import type { Pitch } from '@/domain/pitch'

export type Clef = 'treble'

// Lines and spaces are numbered from the bottom of the staff, as a reader counts them,
// ledger lines from the staff outwards.
export type StaffPosition =
  | { readonly kind: 'line'; readonly number: number }
  | { readonly kind: 'space'; readonly number: number }
  | { readonly kind: 'ledger-line-below'; readonly number: number }
  | { readonly kind: 'below-ledger-line'; readonly number: number }
  | { readonly kind: 'ledger-line-above'; readonly number: number }
  | { readonly kind: 'above-ledger-line'; readonly number: number }
  | { readonly kind: 'below-staff' }
  | { readonly kind: 'above-staff' }

const BOTTOM_LINE: Record<Clef, Pitch> = { treble: { letter: 'E', octave: 4 } }
const TOP_LINE_STEP = 8

function stepFromBottomLine(pitch: Pitch, clef: Clef): number {
  return diatonicStep(pitch) - diatonicStep(BOTTOM_LINE[clef])
}

export function staffPosition(pitch: Pitch, clef: Clef): StaffPosition {
  const step = stepFromBottomLine(pitch, clef)
  if (step === -1) return { kind: 'below-staff' }
  if (step === TOP_LINE_STEP + 1) return { kind: 'above-staff' }
  if (step < 0) {
    const away = -step
    return away % 2 === 0
      ? { kind: 'ledger-line-below', number: away / 2 }
      : { kind: 'below-ledger-line', number: (away - 1) / 2 }
  }
  if (step > TOP_LINE_STEP) {
    const away = step - TOP_LINE_STEP
    return away % 2 === 0
      ? { kind: 'ledger-line-above', number: away / 2 }
      : { kind: 'above-ledger-line', number: (away - 1) / 2 }
  }
  return step % 2 === 0
    ? { kind: 'line', number: step / 2 + 1 }
    : { kind: 'space', number: (step + 1) / 2 }
}

export function ledgerLines(pitch: Pitch, clef: Clef): number {
  const step = stepFromBottomLine(pitch, clef)
  return Math.max(0, Math.floor(-step / 2), Math.floor((step - TOP_LINE_STEP) / 2))
}
