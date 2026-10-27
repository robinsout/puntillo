import type { Pitch } from '@/domain/pitch'
import { stepFromBottomLine, type Clef } from '@/domain/staff'
import type { StaffLayout } from '@/infrastructure/notation'

type Band = StaffLayout['lines'][number]

// In half staff spaces: below the staff a row clears the stems down, below a low note its head.
const BELOW_STAFF = 4
const BELOW_HEAD = 3

const halfSpaceOf = (band: Band) => (band.bottomLine - band.topLine) / 8

// As a fraction of the drawing's height, as the layout.
export const yOfPitch = (pitch: Pitch, clef: Clef, band: Band): number =>
  band.bottomLine - stepFromBottomLine(pitch, clef) * halfSpaceOf(band)

// The top of a row under the staff and under the lowest head, at y, standing on it.
export function topBelow(band: Band, y: number): number {
  const halfSpace = halfSpaceOf(band)
  return Math.max(band.bottomLine + BELOW_STAFF * halfSpace, y + BELOW_HEAD * halfSpace)
}
