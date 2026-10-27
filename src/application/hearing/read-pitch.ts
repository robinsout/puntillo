import { pitchOf, writtenKeyOf, type SoundFrame, type Tuning } from '@/domain/hearing'
import type { PianoKey } from '@/domain/keyboard'

// The key as the instrument writes it, and how far the sound is from it in whole cents.
export interface PitchReading {
  readonly key: PianoKey
  readonly cents: number
}

const READING_MS = 100

// The median passes over a stray frame, a jump to an overtone or a slide into the note.
function medianOf(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function readingOf(window: readonly SoundFrame[], tuning: Tuning): PitchReading | null {
  const frequencies = window.flatMap(({ frequency }) => (frequency === null ? [] : [frequency]))
  if (frequencies.length * 2 < window.length) return null
  const median = medianOf(frequencies)
  const pitch = median === undefined ? null : pitchOf(median)
  if (pitch === null) return null
  // Adding 0 turns the -0 of a slightly flat note into 0.
  return { key: writtenKeyOf(pitch.key, tuning), cents: Math.round(pitch.cents) + 0 }
}

// Readings follow the time of the frames, not a timer, so the indicator changes at most ten times a
// second however often the frames come.
export function readPitch(
  onReading: (reading: PitchReading | null) => void,
  tuning: Tuning,
): (frame: SoundFrame) => void {
  let window: SoundFrame[] = []
  let fromMs: number | null = null
  return (frame) => {
    fromMs ??= frame.atMs
    window.push(frame)
    if (frame.atMs - fromMs < READING_MS) return
    onReading(readingOf(window, tuning))
    window = []
    fromMs = frame.atMs
  }
}
