import type { Difficulty } from '../difficulty'
import { LETTERS, semitones, type Letter, type Pitch } from '../pitch'

// The number of the sound in MIDI, C4 = 60.
export interface PianoKey {
  readonly number: number
}

const OCTAVE = 12
const MIDDLE_C_OFFSET = OCTAVE
const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11]

export const keyOf = (pitch: Pitch): PianoKey => ({
  number: semitones(pitch) + MIDDLE_C_OFFSET,
})

const pitchClassOf = ({ number }: PianoKey): number => number % OCTAVE

// As in scientific pitch notation: C4 to B4 is octave 4.
export const octaveOf = ({ number }: PianoKey): number => Math.floor(number / OCTAVE) - 1

export const isWhiteKey = (key: PianoKey): boolean =>
  WHITE_PITCH_CLASSES.includes(pitchClassOf(key))

function whiteSpelling(number: number): Pitch {
  return {
    letter: LETTERS[WHITE_PITCH_CLASSES.indexOf(number % OCTAVE)] as Letter,
    octave: octaveOf({ number }),
  }
}

// A black key is named by the white key below with a sharp and the one above with a flat.
export function keySpellings({ number }: PianoKey): Pitch[] {
  if (isWhiteKey({ number })) return [whiteSpelling(number)]
  return [
    { ...whiteSpelling(number - 1), alteration: 1 },
    { ...whiteSpelling(number + 1), alteration: -1 },
  ]
}

export function keyboardKeys(difficulty: Difficulty): PianoKey[] {
  const { low: lowest, high: highest } = difficulty.range
  const signs = difficulty.keySignatures > 0 || difficulty.accidentals !== 'none'
  const margin = signs ? 1 : 0
  let low = keyOf(lowest).number - margin
  let high = keyOf(highest).number + margin
  while (!isWhiteKey({ number: low })) low--
  while (!isWhiteKey({ number: high })) high++
  return Array.from({ length: high - low + 1 }, (_, index) => ({ number: low + index }))
}

// The white key the keyboard opens at, the upper of two in the middle; the keys are never none.
export function middleWhiteIndex(keys: readonly PianoKey[]): number {
  const whites = keys.flatMap((key, index) => (isWhiteKey(key) ? [index] : []))
  return whites[Math.floor(whites.length / 2)] as number
}
