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
import type { Duration, Note, Question, TimeSignature } from '@/domain/question'
import { barSixteenths, createQuestionIn, sixteenths } from '@/domain/question'

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export function createQuestionGenerator(random: Random, difficulty: Difficulty): () => Question {
  const pitches = allowedPitches(difficulty)
  const timeSignatures = fittingTimeSignatures(difficulty)
  const { durations, questionLength } = difficulty
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
  const fullBars = (bar: number, bars: number): Note[] => {
    const notes: Note[] = []
    for (let barsAfter = bars - 1; barsAfter >= 0; barsAfter--) {
      const notesForBarsAfter = barsAfter * fewestNotes(bar, durations)
      let room = bar
      while (room > 0) {
        const note = nextNote((value) => {
          const left = room - sixteenths(value)
          return (
            left >= 0 &&
            notes.length + 1 + fewestNotes(left, durations) + notesForBarsAfter <= MAX_NOTES
          )
        })
        room -= sixteenths(note.duration.value)
        notes.push(note)
      }
    }
    return notes
  }

  const notesIn = (timeSignature: TimeSignature): Note[] => {
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
    const [first, ...rest] = notesIn(timeSignature) as [Note, ...Note[]]
    return createQuestionIn(timeSignature, first, ...rest)
  }
}
