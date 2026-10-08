import { LETTERS } from './pitch'
import type { Pitch } from './pitch'

export function diatonicStep(pitch: Pitch): number {
  return pitch.octave * LETTERS.length + LETTERS.indexOf(pitch.letter)
}

function octavesBetween(low: Pitch, high: Pitch): number[] {
  return Array.from({ length: high.octave - low.octave + 1 }, (_, offset) => low.octave + offset)
}

export function isSamePitch(a: Pitch, b: Pitch): boolean {
  return a.letter === b.letter && a.octave === b.octave
}

export function diatonicPitchesBetween(low: Pitch, high: Pitch): Pitch[] {
  const lowStep = diatonicStep(low)
  const highStep = diatonicStep(high)
  return octavesBetween(low, high)
    .flatMap((octave) => LETTERS.map((letter): Pitch => ({ letter, octave })))
    .filter((pitch) => diatonicStep(pitch) >= lowStep && diatonicStep(pitch) <= highStep)
}
