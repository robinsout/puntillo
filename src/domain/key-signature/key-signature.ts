import type { Letter, Pitch } from '../pitch'

export type KeySignature =
  | { readonly count: 0 }
  | { readonly count: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly accidental: 'sharp' | 'flat' }

export const NO_KEY_SIGNATURE: KeySignature = { count: 0 }

const SHARPS: readonly Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLATS: readonly Letter[] = [...SHARPS].reverse()

export function keySignatureLetters(keySignature: KeySignature): Letter[] {
  if (keySignature.count === 0) return []
  return (keySignature.accidental === 'sharp' ? SHARPS : FLATS).slice(0, keySignature.count)
}

export function applyKeySignature(pitch: Pitch, keySignature: KeySignature): Pitch {
  const { letter, octave } = pitch
  if (keySignature.count === 0 || !keySignatureLetters(keySignature).includes(letter))
    return { letter, octave }
  return { letter, octave, alteration: keySignature.accidental === 'sharp' ? 1 : -1 }
}
