import type { Random } from '@/application/ports'
import type { Difficulty } from '@/domain/difficulty'
import {
  allowedPitches,
  barCount,
  fewestNotes,
  fittingTimeSignatures,
  MAX_NOTES,
  SEVERAL_NOTES,
} from '@/domain/difficulty'
import type { Pitch } from '@/domain/pitch'
import { isSamePitch } from '@/domain/pitch'
import type { Duration, Note, NoteOrRest, Question, Rest, TimeSignature } from '@/domain/question'
import { barSixteenths, createQuestionOf, isNote, isRest, sixteenths } from '@/domain/question'

const REST_FROM = 3 / 4

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export function createQuestionGenerator(random: Random, difficulty: Difficulty): () => Question {
  const pitches = allowedPitches(difficulty)
  const timeSignatures = fittingTimeSignatures(difficulty)
  const { durations, questionLength, rests } = difficulty
  let previous: Pitch | undefined

  const nextPitch = (): Pitch => {
    const pitch = pick(
      pitches.filter((candidate) => !previous || !isSamePitch(candidate, previous)),
      random,
    )
    previous = pitch
    return pitch
  }

  const nextNote = (fitting: (value: Duration['value']) => boolean): Note => {
    const pitch = nextPitch()
    return { pitch, duration: { value: pick(durations.filter(fitting), random) } }
  }

  // The chance is spent even when no rest may stand here, so that one choice never shifts the
  // values the next ones get.
  const nextRest = (
    elements: readonly NoteOrRest[],
    fitting: (value: Duration['value']) => boolean,
  ): Rest | undefined => {
    if (random.next() < REST_FROM) return undefined
    const last = elements.at(-1)
    if (last && isRest(last)) return undefined
    const restDurations = durations.filter(fitting)
    if (restDurations.length === 0) return undefined
    return { duration: { value: pick(restDurations, random) } }
  }

  const oneNote = (bar: number): Note[] => [nextNote((value) => sixteenths(value) <= bar)]

  // Each duration leaves room for the notes after it, at the shortest duration each.
  const notesInBar = (bar: number): Note[] => {
    const shortest = Math.min(...durations.map(sixteenths))
    const count = pick(
      SEVERAL_NOTES.filter((each) => each * shortest <= bar),
      random,
    )
    const notes: Note[] = []
    let room = bar
    for (let index = 0; index < count; index++) {
      const notesAfter = count - index - 1
      const note = nextNote((value) => sixteenths(value) + notesAfter * shortest <= room)
      room -= sixteenths(note.duration.value)
      notes.push(note)
    }
    return notes
  }

  // Each duration fits what is left of its bar and leaves a way to fill the rest within MAX_NOTES.
  // Until the first note, a rest leaves room for one.
  const fullBars = (bar: number, bars: number): NoteOrRest[] => {
    const elements: NoteOrRest[] = []
    for (let barsAfter = bars - 1; barsAfter >= 0; barsAfter--) {
      const notesForBarsAfter = barsAfter * fewestNotes(bar, durations)
      let room = bar
      while (room > 0) {
        const fits = (value: Duration['value']): boolean => {
          const left = room - sixteenths(value)
          return (
            left >= 0 &&
            elements.length + 1 + fewestNotes(left, durations) + notesForBarsAfter <= MAX_NOTES
          )
        }
        const leavesNote = (value: Duration['value']): boolean =>
          elements.some(isNote) || room - sixteenths(value) + barsAfter * bar > 0
        const element =
          (rests && nextRest(elements, (value) => fits(value) && leavesNote(value))) ||
          nextNote(fits)
        room -= sixteenths(element.duration.value)
        elements.push(element)
      }
    }
    return elements
  }

  const elementsIn = (timeSignature: TimeSignature): NoteOrRest[] => {
    const bar = barSixteenths(timeSignature)
    switch (questionLength) {
      case 'one-note':
        return oneNote(bar)
      case 'two-to-four-notes':
        return notesInBar(bar)
      case 'one-bar':
      case 'two-bars':
        return fullBars(bar, barCount(questionLength))
    }
  }

  return () => {
    const timeSignature =
      timeSignatures.length > 1 ? pick(timeSignatures, random) : timeSignatures[0]
    if (!timeSignature) throw new Error('No time signature fits the difficulty')
    return createQuestionOf(timeSignature, elementsIn(timeSignature))
  }
}
