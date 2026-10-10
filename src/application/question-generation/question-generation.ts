import type { Random } from '@/application/ports'
import type { Difficulty } from '@/domain/difficulty'
import {
  allowedPitches,
  barCount,
  durationsOf,
  fewestNotes,
  fittingTimeSignatures,
  MAX_NOTES,
  SEVERAL_NOTES,
} from '@/domain/difficulty'
import { keySignatureLetters, NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import type { Pitch } from '@/domain/pitch'
import { isSamePitch } from '@/domain/pitch'
import type { Duration, Note, NoteOrRest, Question, Rest, TimeSignature } from '@/domain/question'
import {
  applyAccidentals,
  barSixteenths,
  canBeDotted,
  createQuestionOf,
  inBars,
  isNote,
  isRest,
  sixteenths,
  sixteenthsOf,
} from '@/domain/question'

const REST_FROM = 3 / 4
const DOT_FROM = 3 / 4
const ACCIDENTAL_FROM = 3 / 4

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export function createQuestionGenerator(random: Random, difficulty: Difficulty): () => Question {
  const pitches = allowedPitches(difficulty)
  const timeSignatures = fittingTimeSignatures(difficulty)
  const { durations, questionLength, rests, dots } = difficulty
  const lengths = durationsOf(difficulty)
  let previous: Pitch | undefined

  const nextPitch = (): Pitch => {
    const pitch = pick(
      pitches.filter((candidate) => !previous || !isSamePitch(candidate, previous)),
      random,
    )
    previous = pitch
    return pitch
  }

  // With the dots on, the chance of a dot is spent even when the value takes none, so that one
  // choice never shifts the values the next ones get.
  const nextDuration = (fitting: (duration: Duration) => boolean): Duration | undefined => {
    const dottedFits = (value: Duration['value']) =>
      dots && canBeDotted(value) && fitting({ value, dots: 1 })
    const candidates = durations.filter((value) => fitting({ value }) || dottedFits(value))
    if (candidates.length === 0) return undefined
    const value = pick(candidates, random)
    if (!dots) return { value }
    const wantsDot = random.next() >= DOT_FROM
    return dottedFits(value) && (wantsDot || !fitting({ value })) ? { value, dots: 1 } : { value }
  }

  const nextNote = (fitting: (duration: Duration) => boolean): Note => {
    const pitch = nextPitch()
    const duration = nextDuration(fitting)
    if (!duration) throw new Error('No duration fits')
    return { pitch, duration }
  }

  // The chance is spent even when no rest may stand here, so that one choice never shifts the
  // values the next ones get.
  const nextRest = (
    elements: readonly NoteOrRest[],
    fitting: (duration: Duration) => boolean,
  ): Rest | undefined => {
    if (random.next() < REST_FROM) return undefined
    const last = elements.at(-1)
    if (last && isRest(last)) return undefined
    const duration = nextDuration(fitting)
    return duration && { duration }
  }

  const oneNote = (bar: number): Note[] => [nextNote((duration) => sixteenthsOf(duration) <= bar)]

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
      const note = nextNote((duration) => sixteenthsOf(duration) + notesAfter * shortest <= room)
      room -= sixteenthsOf(note.duration)
      notes.push(note)
    }
    return notes
  }

  // Each duration fits what is left of its bar and leaves a way to fill the rest within MAX_NOTES.
  // Until the first note, a rest leaves room for one.
  const fullBars = (bar: number, bars: number): NoteOrRest[] => {
    const elements: NoteOrRest[] = []
    for (let barsAfter = bars - 1; barsAfter >= 0; barsAfter--) {
      const notesForBarsAfter = barsAfter * fewestNotes(bar, lengths)
      let room = bar
      while (room > 0) {
        const fits = (duration: Duration): boolean => {
          const left = room - sixteenthsOf(duration)
          return (
            left >= 0 &&
            elements.length + 1 + fewestNotes(left, lengths) + notesForBarsAfter <= MAX_NOTES
          )
        }
        const leavesNote = (duration: Duration): boolean =>
          elements.some(isNote) || room - sixteenthsOf(duration) + barsAfter * bar > 0
        const element =
          (rests && nextRest(elements, (duration) => fits(duration) && leavesNote(duration))) ||
          nextNote(fits)
        room -= sixteenthsOf(element.duration)
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

  // Spent after the elements, so that without key signatures the values go as before.
  const nextKeySignature = (): KeySignature => {
    if (difficulty.keySignatures === 0) return NO_KEY_SIGNATURE
    const count = Math.floor(
      random.next() * (difficulty.keySignatures + 1),
    ) as KeySignature['count']
    if (count === 0) return { count }
    return { count, accidental: random.next() < 0.5 ? 'sharp' : 'flat' }
  }

  // A sign stands only where the note would sound natural: it never repeats the key signature or
  // a sign earlier in the bar. The chance is spent for every note, so that one choice never shifts
  // the values the next ones get.
  const withAccidentals = (
    elements: readonly NoteOrRest[],
    timeSignature: TimeSignature,
    keySignature: KeySignature,
  ): NoteOrRest[] => {
    if (difficulty.accidentals === 'none') return [...elements]
    const keyLetters = keySignatureLetters(keySignature)
    const signed: { place: Pitch; bar: number }[] = []
    return inBars(elements, timeSignature).map(({ element, bar }): NoteOrRest => {
      if (!isNote(element)) return element
      const wants = random.next() >= ACCIDENTAL_FROM
      const { pitch: place } = element
      const free =
        !keyLetters.includes(place.letter) &&
        !signed.some((each) => each.bar === bar && isSamePitch(each.place, place))
      if (!wants || !free) return element
      signed.push({ place, bar })
      return { ...element, accidental: random.next() < 0.5 ? 'sharp' : 'flat' }
    })
  }

  return () => {
    const timeSignature =
      timeSignatures.length > 1 ? pick(timeSignatures, random) : timeSignatures[0]
    if (!timeSignature) throw new Error('No time signature fits the difficulty')
    const elements = elementsIn(timeSignature)
    const keySignature = nextKeySignature()
    return createQuestionOf(
      timeSignature,
      applyAccidentals(
        withAccidentals(elements, timeSignature, keySignature),
        timeSignature,
        keySignature,
      ),
      keySignature,
    )
  }
}
