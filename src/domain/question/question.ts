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

export const TIME_SIGNATURES: readonly TimeSignature[] = [
  COMMON_TIME,
  { beats: 3, beatValue: 4 },
  { beats: 2, beatValue: 4 },
  { beats: 6, beatValue: 8 },
]

export const isSameTimeSignature = (a: TimeSignature, b: TimeSignature): boolean =>
  a.beats === b.beats && a.beatValue === b.beatValue

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
  return createQuestionIn(COMMON_TIME, first, ...rest)
}

export function createQuestionIn(
  timeSignature: TimeSignature,
  first: Note,
  ...rest: Note[]
): Question {
  return { clef: 'treble', timeSignature, notes: [first, ...rest] }
}

export function barsOf(question: Question): Note[][] {
  const bar = barSixteenths(question.timeSignature)
  const bars: Note[][] = []
  let current: Note[] = []
  let filled = 0
  for (const note of question.notes) {
    current.push(note)
    filled += sixteenths(note.duration.value)
    if (filled >= bar) {
      bars.push(current)
      current = []
      filled = 0
    }
  }
  if (current.length > 0) bars.push(current)
  return bars
}
