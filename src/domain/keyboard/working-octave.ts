import type { Letter } from '../pitch'
import { keyOf, middleWhiteIndex, octaveOf, type PianoKey } from './keyboard'

export const startOctave = (keys: readonly PianoKey[]): number =>
  octaveOf(keys[middleWhiteIndex(keys)] as PianoKey)

// The octave moves only where at least one key of the keyboard is (edge case 3).
export function shiftOctave(keys: readonly PianoKey[], octave: number, step: 1 | -1): number {
  const shifted = octave + step
  return keys.some((key) => octaveOf(key) === shifted) ? shifted : octave
}

// A black key is the one above the white key of its letter.
export const keyIn = (octave: number, letter: Letter, black: boolean): PianoKey => ({
  number: keyOf({ letter, octave }).number + (black ? 1 : 0),
})
