import type { PianoKey } from '@/domain/keyboard'

export const TUNINGS = ['c', 'b-flat'] as const

export type Tuning = (typeof TUNINGS)[number]

export const isTuning = (value: string): value is Tuning =>
  (TUNINGS as readonly string[]).includes(value)

// A B♭ instrument sounds a major second below the note it writes.
const B_FLAT_TRANSPOSITION = 2

export const writtenKeyOf = ({ number }: PianoKey, tuning: Tuning): PianoKey => ({
  number: tuning === 'b-flat' ? number + B_FLAT_TRANSPOSITION : number,
})
