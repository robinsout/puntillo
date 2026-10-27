import type { PianoKey } from '@/domain/keyboard'
import { keySpellings } from '@/domain/keyboard'
import type { Pitch } from '@/domain/pitch'
import { beyondLedgerLines, type Clef } from '@/domain/staff'
import type { StaffHeard } from '@/infrastructure/notation'

// A black key is written with a sharp for now.
export function heardOnStaff(key: PianoKey, column: number, clef: Clef): StaffHeard {
  const [pitch] = keySpellings(key) as [Pitch]
  const beyond = beyondLedgerLines(pitch, clef)
  return beyond ? { column, beyond } : { column, pitch }
}
