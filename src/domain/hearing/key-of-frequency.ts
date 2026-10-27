import type { PianoKey } from '../keyboard'

const A4_HZ = 440
const A4_NUMBER = 69
const OCTAVE = 12
const CENTS_IN_SEMITONE = 100
const LOWEST = 40
const HIGHEST = 96

// The key heard and how far the sound is from it, -50 to +50 cents.
export interface HeardPitch {
  readonly key: PianoKey
  readonly cents: number
}

// Equal temperament: the nearest semitone, so a pitch more than 50 cents off is the next key.
export function pitchOf(frequency: number): HeardPitch | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null
  const semitones = A4_NUMBER + OCTAVE * Math.log2(frequency / A4_HZ)
  const number = Math.round(semitones)
  if (number < LOWEST || number > HIGHEST) return null
  return { key: { number }, cents: (semitones - number) * CENTS_IN_SEMITONE }
}

export const keyOfFrequency = (frequency: number): PianoKey | null =>
  pitchOf(frequency)?.key ?? null
