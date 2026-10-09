import type { Pitch } from '../pitch'

export const DURATION_VALUES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const

export interface Duration {
  value: (typeof DURATION_VALUES)[number]
}

export interface Note {
  pitch: Pitch
  duration: Duration
}

export interface Rest {
  duration: Duration
}

export type NoteOrRest = Note | Rest

export const isNote = (element: NoteOrRest): element is Note => 'pitch' in element
export const isRest = (element: NoteOrRest): element is Rest => !isNote(element)

export interface TimeSignature {
  beats: number
  beatValue: number
}

export interface Question {
  clef: 'treble'
  timeSignature: TimeSignature
  elements: readonly NoteOrRest[]
  // The elements without the rests: only notes are answered.
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
  return createQuestionOf(timeSignature, [first, ...rest])
}

export function createQuestionOf(
  timeSignature: TimeSignature,
  elements: readonly NoteOrRest[],
): Question {
  const [first, ...rest] = elements.filter(isNote)
  if (!first) throw new Error('A question needs a note to answer')
  return { clef: 'treble', timeSignature, elements: [...elements], notes: [first, ...rest] }
}

export function barsOf(question: Question): NoteOrRest[][] {
  const bar = barSixteenths(question.timeSignature)
  const bars: NoteOrRest[][] = []
  let current: NoteOrRest[] = []
  let filled = 0
  for (const element of question.elements) {
    current.push(element)
    filled += sixteenths(element.duration.value)
    if (filled >= bar) {
      bars.push(current)
      current = []
      filled = 0
    }
  }
  if (current.length > 0) bars.push(current)
  return bars
}
