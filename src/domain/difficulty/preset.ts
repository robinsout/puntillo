import { TIME_SIGNATURES } from '../question'
import type { Difficulty } from './difficulty'

export const PRESETS = ['first-steps', 'confident-reading', 'advanced'] as const

export type Preset = (typeof PRESETS)[number]

const PRESET_DIFFICULTY: Record<Preset, Difficulty> = {
  'first-steps': {
    range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
    ledgerLines: 0,
    durations: ['half', 'quarter'],
    askDuration: false,
    questionLength: 'one-note',
    timeSignatures: TIME_SIGNATURES.slice(0, 1),
  },
  'confident-reading': {
    range: { low: { letter: 'C', octave: 4 }, high: { letter: 'G', octave: 5 } },
    ledgerLines: 1,
    durations: ['whole', 'half', 'quarter', 'eighth'],
    askDuration: true,
    questionLength: 'one-bar',
    timeSignatures: TIME_SIGNATURES.slice(0, 2),
  },
  advanced: {
    range: { low: { letter: 'A', octave: 3 }, high: { letter: 'C', octave: 6 } },
    ledgerLines: 2,
    durations: ['whole', 'half', 'quarter', 'eighth', 'sixteenth'],
    askDuration: true,
    questionLength: 'two-bars',
    timeSignatures: TIME_SIGNATURES,
  },
}

export function isPreset(value: string): value is Preset {
  return (PRESETS as readonly string[]).includes(value)
}

export function presetDifficulty(preset: Preset): Difficulty {
  return PRESET_DIFFICULTY[preset]
}
