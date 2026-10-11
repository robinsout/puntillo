import { diatonicStep, isSamePitch, LETTERS, type Letter, type Pitch } from '@/domain/pitch'
import { stepFromBottomLine, type Clef } from './staff-position'

// The pitches a note may be written on, in ascending order, never empty.
type Steps = readonly Pitch[]

const C0: Pitch = { letter: 'C', octave: 0 }

export function pitchAtStep(step: number, clef: Clef): Pitch {
  const diatonic = step - stepFromBottomLine(C0, clef)
  const octave = Math.floor(diatonic / LETTERS.length)
  return { letter: LETTERS[diatonic - octave * LETTERS.length] as Letter, octave }
}

export function nearestStep(pitch: Pitch, steps: Steps): Pitch {
  const target = diatonicStep(pitch)
  return steps.find((step) => diatonicStep(step) >= target) ?? (steps.at(-1) as Pitch)
}

// Of two middle steps the lower one, so that both buttons write the same note.
const middleStep = (steps: Steps): Pitch => steps[Math.floor((steps.length - 1) / 2)] as Pitch

const indexOf = (pitch: Pitch, steps: Steps): number =>
  steps.findIndex((step) => isSamePitch(step, pitch))

export function stepUp(pitch: Pitch | null, steps: Steps): Pitch {
  if (pitch === null) return middleStep(steps)
  return steps[indexOf(pitch, steps) + 1] ?? pitch
}

export function stepDown(pitch: Pitch | null, steps: Steps): Pitch {
  if (pitch === null) return middleStep(steps)
  return steps[indexOf(pitch, steps) - 1] ?? pitch
}

export const canStepUp = (pitch: Pitch | null, steps: Steps): boolean =>
  pitch === null || indexOf(pitch, steps) < steps.length - 1

export const canStepDown = (pitch: Pitch | null, steps: Steps): boolean =>
  pitch === null || indexOf(pitch, steps) > 0
