import { diatonicStep } from '@/domain/pitch'
import type { Pitch } from '@/domain/pitch'

export type Clef = 'treble'

// Lines and spaces are numbered from the bottom of the staff, as a reader counts them.
export type StaffPosition =
  | { readonly kind: 'line'; readonly number: number }
  | { readonly kind: 'space'; readonly number: number }
  | { readonly kind: 'ledger-line-below'; readonly number: number }
  | { readonly kind: 'below-staff' }

const BOTTOM_LINE: Record<Clef, Pitch> = { treble: { letter: 'E', octave: 4 } }

export function staffPosition(pitch: Pitch, clef: Clef): StaffPosition {
  const step = diatonicStep(pitch) - diatonicStep(BOTTOM_LINE[clef])
  if (step === -1) return { kind: 'below-staff' }
  if (step < 0) return { kind: 'ledger-line-below', number: -step / 2 }
  return step % 2 === 0
    ? { kind: 'line', number: step / 2 + 1 }
    : { kind: 'space', number: (step + 1) / 2 }
}
