import type { Pitch } from '@/domain/pitch'

export type NoteMark = 'correct' | 'wrong'

// A head drawn in outline in the column of a note, on the step of its pitch.
export interface StaffGhost {
  readonly pitch: Pitch
  readonly mark: NoteMark
}

// The note heard in the column of a note of the question, or, beyond the ledger lines a head is
// drawn with, the side of the staff it lies on.
export type HeardSign = 'sharp' | 'flat' | 'natural'

export type StaffHeard =
  | { readonly column: number; readonly pitch: Pitch; readonly sign?: HeardSign }
  | { readonly column: number; readonly beyond: 'up' | 'down' }
