import type { KeySignature } from '@/domain/key-signature'
import type { PianoKey } from '@/domain/keyboard'
import { signOfHeard, spellHeard } from '@/domain/keyboard'
import type { Pitch } from '@/domain/pitch'
import { beyondLedgerLines, type Clef } from '@/domain/staff'
import type { StaffHeard } from '@/infrastructure/notation'

// The current note as the player should sound it: its pitch with the key signature and the signs.
export function heardOnStaff(
  key: PianoKey,
  column: number,
  clef: Clef,
  context: { current: Pitch; keySignature: KeySignature },
): StaffHeard {
  const pitch = spellHeard(key, context)
  const beyond = beyondLedgerLines(pitch, clef)
  if (beyond) return { column, beyond }
  const sign = signOfHeard(pitch, context.keySignature)
  return sign ? { column, pitch, sign } : { column, pitch }
}
