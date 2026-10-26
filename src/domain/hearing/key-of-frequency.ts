import type { PianoKey } from '../keyboard'

const A4_HZ = 440
const A4_NUMBER = 69
const OCTAVE = 12
const LOWEST = 40
const HIGHEST = 96

// Equal temperament: the nearest semitone, so a pitch more than 50 cents off is the next key.
export function keyOfFrequency(frequency: number): PianoKey | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null
  const number = Math.round(A4_NUMBER + OCTAVE * Math.log2(frequency / A4_HZ))
  return number >= LOWEST && number <= HIGHEST ? { number } : null
}
