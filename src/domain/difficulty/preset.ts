import type { Difficulty } from './difficulty'

export const PRESETS = ['first-steps', 'confident-reading'] as const

export type Preset = (typeof PRESETS)[number]

const PRESET_DIFFICULTY: Record<Preset, Difficulty> = {
  'first-steps': {
    range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
    ledgerLines: 0,
    durations: ['half', 'quarter'],
    askDuration: false,
  },
  'confident-reading': {
    range: { low: { letter: 'C', octave: 4 }, high: { letter: 'G', octave: 5 } },
    ledgerLines: 1,
    durations: ['whole', 'half', 'quarter', 'eighth'],
    askDuration: true,
  },
}

export function isPreset(value: string): value is Preset {
  return (PRESETS as readonly string[]).includes(value)
}

export function presetDifficulty(preset: Preset): Difficulty {
  return PRESET_DIFFICULTY[preset]
}
