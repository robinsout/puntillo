import { applyKeySignature, type KeySignature } from '../key-signature'
import type { Pitch } from '../pitch'
import { signOf } from '../question'
import { keyOf, keySpellings, type PianoKey } from './keyboard'

// The note of the question the key is heard against, and its key signature.
export interface HeardContext {
  readonly current: Pitch | null
  readonly keySignature: KeySignature
}

// A key that sounds as the current note is written as it; otherwise a black key follows the
// direction of the key signature, a sharp when it has none.
export function spellHeard(key: PianoKey, { current, keySignature }: HeardContext): Pitch {
  if (current && keyOf(current).number === key.number) return current
  const [sharp, flat] = keySpellings(key) as [Pitch, Pitch?]
  const inFlats = 'accidental' in keySignature && keySignature.accidental === 'flat'
  return flat && inFlats ? flat : sharp
}

// Only against the key signature; signs earlier in the bar are not taken into account.
export function signOfHeard(
  pitch: Pitch,
  keySignature: KeySignature,
): 'sharp' | 'flat' | 'natural' | null {
  const given = applyKeySignature(pitch, keySignature).alteration
  return pitch.alteration === given ? null : signOf(pitch.alteration)
}
