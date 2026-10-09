import type { Pitch } from '../pitch'

export const DURATION_VALUES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const

export interface Duration {
  value: (typeof DURATION_VALUES)[number]
}

export interface Note {
  pitch: Pitch
  duration: Duration
}

export interface TimeSignature {
  beats: number
  beatValue: number
}

export interface Question {
  clef: 'treble'
  timeSignature: TimeSignature
  notes: readonly [Note, ...Note[]]
}

export const COMMON_TIME: TimeSignature = { beats: 4, beatValue: 4 }

const SIXTEENTHS: Record<Duration['value'], number> = {
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  sixteenth: 1,
}

export const sixteenths = (value: Duration['value']): number => SIXTEENTHS[value]

export const barSixteenths = (timeSignature: TimeSignature): number =>
  (timeSignature.beats * 16) / timeSignature.beatValue

export function createQuestion(first: Note, ...rest: Note[]): Question {
  return { clef: 'treble', timeSignature: COMMON_TIME, notes: [first, ...rest] }
}
