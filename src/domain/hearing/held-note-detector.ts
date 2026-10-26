import type { PianoKey } from '../keyboard'
import { keyOfFrequency } from './key-of-frequency'

// A moment of the sound: its pitch, or null when there is nothing clear enough to name.
export interface SoundFrame {
  readonly atMs: number
  readonly frequency: number | null
}

export interface HeldNoteDetector {
  hear(frame: SoundFrame): PianoKey | null
}

const HOLD_MS = 150

interface Run {
  readonly number: number
  readonly fromMs: number
  heard: boolean
}

export function createHeldNoteDetector(): HeldNoteDetector {
  let run: Run | null = null

  return {
    hear({ atMs, frequency }) {
      const key = frequency === null ? null : keyOfFrequency(frequency)
      if (key === null) {
        run = null
        return null
      }
      if (run?.number !== key.number) {
        run = { number: key.number, fromMs: atMs, heard: false }
        return null
      }
      if (run.heard || atMs - run.fromMs < HOLD_MS) return null
      run.heard = true
      return key
    },
  }
}
