import { NO_KEY_SIGNATURE, type KeySignature } from '../key-signature'
import type { Pitch } from '../pitch'

export const DURATION_VALUES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const

export interface Duration {
  value: (typeof DURATION_VALUES)[number]
  // A plain duration has no dots field, so that it is written as before.
  dots?: 1
}

export type Accidental = 'sharp' | 'flat' | 'natural'

export interface Note {
  pitch: Pitch
  duration: Duration
  // The sign written before the note, its own or a courtesy one; the pitch is how it sounds.
  accidental?: Accidental
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
  keySignature: KeySignature
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

export const sixteenthsOf = ({ value, dots }: Duration): number =>
  SIXTEENTHS[value] * (dots ? 1.5 : 1)

// A dotted sixteenth would be a sixteenth and a half: no bar of whole sixteenths holds it.
export const canBeDotted = (value: Duration['value']): boolean => value !== 'sixteenth'

export const isSameDuration = (a: Duration, b: Duration): boolean =>
  a.value === b.value && (a.dots ?? 0) === (b.dots ?? 0)

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
  keySignature: KeySignature = NO_KEY_SIGNATURE,
): Question {
  const [first, ...rest] = elements.filter(isNote)
  if (!first) throw new Error('A question needs a note to answer')
  return {
    clef: 'treble',
    keySignature,
    timeSignature,
    elements: [...elements],
    notes: [first, ...rest],
  }
}

// Each element with the index of the bar it stands in.
export function inBars<T extends NoteOrRest>(
  elements: readonly T[],
  timeSignature: TimeSignature,
): { element: T; bar: number }[] {
  const bar = barSixteenths(timeSignature)
  let filled = 0
  return elements.map((element) => {
    const index = Math.floor(filled / bar)
    filled += sixteenthsOf(element.duration)
    return { element, bar: index }
  })
}

export function barsOf(question: Question): NoteOrRest[][] {
  const bar = barSixteenths(question.timeSignature)
  const bars: NoteOrRest[][] = []
  let current: NoteOrRest[] = []
  let filled = 0
  for (const element of question.elements) {
    current.push(element)
    filled += sixteenthsOf(element.duration)
    if (filled >= bar) {
      bars.push(current)
      current = []
      filled = 0
    }
  }
  if (current.length > 0) bars.push(current)
  return bars
}
