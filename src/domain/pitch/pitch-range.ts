import { LETTERS } from './pitch'
import type { Letter, Pitch } from './pitch'

export function diatonicStep(pitch: Pitch): number {
  return pitch.octave * LETTERS.length + LETTERS.indexOf(pitch.letter)
}

function octavesBetween(low: Pitch, high: Pitch): number[] {
  return Array.from({ length: high.octave - low.octave + 1 }, (_, offset) => low.octave + offset)
}

export function isSamePitch(a: Pitch, b: Pitch): boolean {
  return a.letter === b.letter && a.octave === b.octave && a.alteration === b.alteration
}

const SEMITONES: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const semitones = ({ letter, octave, alteration }: Pitch): number =>
  octave * 12 + SEMITONES[letter] + (alteration ?? 0)

export function isSameSound(a: Pitch, b: Pitch): boolean {
  return semitones(a) === semitones(b)
}

export function diatonicPitchesBetween(low: Pitch, high: Pitch): Pitch[] {
  const lowStep = diatonicStep(low)
  const highStep = diatonicStep(high)
  return octavesBetween(low, high)
    .flatMap((octave) => LETTERS.map((letter): Pitch => ({ letter, octave })))
    .filter((pitch) => diatonicStep(pitch) >= lowStep && diatonicStep(pitch) <= highStep)
}
