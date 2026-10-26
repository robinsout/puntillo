import type { PianoKey } from '../keyboard'
import { keyOfFrequency } from './key-of-frequency'

// A moment of the sound: its pitch, or null when there is nothing clear enough to name, and its
// volume, the root mean square of the samples.
export interface SoundFrame {
  readonly atMs: number
  readonly frequency: number | null
  readonly volume: number
}

export interface HeldNoteDetector {
  hear(frame: SoundFrame): PianoKey | null
}

const HOLD_MS = 150
// A tongued note does not go silent: its pitch holds while the volume dips and rises again.
const FALL = 1 / 2
const ATTACK = 2

interface Run {
  readonly number: number
  readonly fromMs: number
  loudest: number
  heard: boolean
}

// The key whose sound fell, waiting for a new attack.
interface Fall {
  readonly number: number
  softest: number
}

export function createHeldNoteDetector(): HeldNoteDetector {
  let run: Run | null = null
  let fall: Fall | null = null

  const start = (number: number, fromMs: number, volume: number) => {
    run = { number, fromMs, loudest: volume, heard: false }
    fall = null
  }

  return {
    hear({ atMs, frequency, volume }) {
      const key = frequency === null ? null : keyOfFrequency(frequency)
      if (key === null) {
        run = null
        fall = null
        return null
      }
      if (fall?.number === key.number) {
        if (volume >= fall.softest * ATTACK) start(key.number, atMs, volume)
        else fall.softest = Math.min(fall.softest, volume)
        return null
      }
      if (run?.number !== key.number) {
        start(key.number, atMs, volume)
        return null
      }
      if (volume <= run.loudest * FALL) {
        fall = { number: key.number, softest: volume }
        run = null
        return null
      }
      run.loudest = Math.max(run.loudest, volume)
      if (run.heard || atMs - run.fromMs < HOLD_MS) return null
      run.heard = true
      return key
    },
  }
}
