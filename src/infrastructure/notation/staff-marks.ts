import type { Pitch } from '@/domain/pitch'

export type NoteMark = 'correct' | 'wrong'

// A head drawn in outline in the column of a note, on the step of its pitch.
export interface StaffGhost {
  readonly pitch: Pitch
  readonly mark: NoteMark
}
