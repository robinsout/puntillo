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
import {
  applyKeySignature,
  keySignatureLetters,
  NO_KEY_SIGNATURE,
  type KeySignature,
} from '@/domain/key-signature'
import type { Pitch } from '@/domain/pitch'
import { isSamePitch } from '@/domain/pitch'
import type {
  Accidental,
  Duration,
  Note,
  NoteOrRest,
  Question,
  Rest,
  TimeSignature,
} from '@/domain/question'
import {
  applyAccidentals,
  barSixteenths,
  canBeDotted,
  createQuestionOf,
  inBars,
  isNote,
  isRest,
  signOf,
  sixteenths,
  sixteenthsOf,
} from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

const REST_FROM = 3 / 4
const DOT_FROM = 3 / 4
const ACCIDENTAL_FROM = 3 / 4

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random.next() * items.length)]
  if (item === undefined) throw new Error('Random source must return a number in [0, 1)')
  return item
}

export interface QuestionOptions {
  // Taken as it is, so that a row of questions can share one key; none picks a key of its own.
  readonly keySignature?: KeySignature
}

export type QuestionGenerator = (due?: readonly ReviewItem[], options?: QuestionOptions) => Question

const isSamePlace = (a: Pitch, b: Pitch): boolean => a.letter === b.letter && a.octave === b.octave

const placeOf = ({ letter, octave }: Pitch): Pitch => ({ letter, octave })

const lengthOf = (notes: readonly NoteOrRest[]): number =>
  notes.reduce((total, { duration }) => total + sixteenthsOf(duration), 0)

export function createQuestionGenerator(random: Random, difficulty: Difficulty): QuestionGenerator {
  const pitches = allowedPitches(difficulty)
  const timeSignatures = fittingTimeSignatures(difficulty)
  const { durations, questionLength, rests, dots } = difficulty
  const lengths = durationsOf(difficulty)
  const shortest = Math.min(...durations.map(sixteenths))
  const barsOfQuestion =
    questionLength === 'one-bar' || questionLength === 'two-bars' ? barCount(questionLength) : 1
  const noItems = (): Note[][] => Array.from({ length: barsOfQuestion }, () => [])
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
    last: NoteOrRest | undefined,
    fitting: (duration: Duration) => boolean,
  ): Rest | undefined => {
    if (random.next() < REST_FROM) return undefined
    if (last && isRest(last)) return undefined
    const duration = nextDuration(fitting)
    return duration && { duration }
  }

  // The items stand at random places among the other elements of their bar.
  const withItems = (elements: readonly NoteOrRest[], items: readonly Note[]): NoteOrRest[] =>
    items.reduce<NoteOrRest[]>((placed, item) => {
      const at = Math.floor(random.next() * (placed.length + 1))
      return [...placed.slice(0, at), item, ...placed.slice(at)]
    }, elements.slice())

  const oneNote = (bar: number, [item]: readonly Note[]): Note[] =>
    item ? [item] : [nextNote((duration) => sixteenthsOf(duration) <= bar)]

  // The counts of notes that leave room for the items and the other notes at the shortest
  // duration each.
  const noteCounts = (bar: number, items: readonly Note[]): number[] =>
    SEVERAL_NOTES.filter(
      (count) =>
        count >= items.length && lengthOf(items) + (count - items.length) * shortest <= bar,
    )

  // Each duration leaves room for the notes after it, at the shortest duration each.
  const notesInBar = (bar: number, items: readonly Note[]): NoteOrRest[] => {
    const count = pick(noteCounts(bar, items), random)
    const notes: Note[] = []
    let room = bar - lengthOf(items)
    const free = count - items.length
    for (let index = 0; index < free; index++) {
      const notesAfter = free - index - 1
      const note = nextNote((duration) => sixteenthsOf(duration) + notesAfter * shortest <= room)
      room -= sixteenthsOf(note.duration)
      notes.push(note)
    }
    return withItems(notes, items)
  }

  // The fewest elements a bar takes: its items and the fewest notes that fill the rest of it.
  const fewestInBar = (bar: number, items: readonly Note[]): number =>
    items.length + fewestNotes(bar - lengthOf(items), lengths)

  // Each duration fits what is left of its bar and leaves a way to fill the rest within MAX_NOTES.
  // Until the first note, a rest leaves room for one.
  const fullBars = (bar: number, itemsInBars: readonly (readonly Note[])[]): NoteOrRest[] => {
    const hasItems = itemsInBars.some((items) => items.length > 0)
    const elements: NoteOrRest[] = []
    itemsInBars.forEach((items, barIndex) => {
      const barsAfter = itemsInBars.length - barIndex - 1
      const notesForBarsAfter = itemsInBars
        .slice(barIndex + 1)
        .reduce((total, later) => total + fewestInBar(bar, later), 0)
      const filling: NoteOrRest[] = []
      let room = bar - lengthOf(items)
      while (room > 0) {
        const fits = (duration: Duration): boolean => {
          const left = room - sixteenthsOf(duration)
          return (
            left >= 0 &&
            elements.length +
              filling.length +
              1 +
              fewestNotes(left, lengths) +
              items.length +
              notesForBarsAfter <=
              MAX_NOTES
          )
        }
        const leavesNote = (duration: Duration): boolean =>
          hasItems ||
          elements.some(isNote) ||
          filling.some(isNote) ||
          room - sixteenthsOf(duration) + barsAfter * bar > 0
        const element =
          (rests &&
            nextRest(
              filling.at(-1) ?? elements.at(-1),
              (duration) => fits(duration) && leavesNote(duration),
            )) ||
          nextNote(fits)
        room -= sixteenthsOf(element.duration)
        filling.push(element)
      }
      elements.push(...withItems(filling, items))
    })
    return elements
  }

  const elementsIn = (
    timeSignature: TimeSignature,
    itemsInBars: readonly (readonly Note[])[],
  ): NoteOrRest[] => {
    const bar = barSixteenths(timeSignature)
    const [items = []] = itemsInBars
    switch (questionLength) {
      case 'one-note':
        return oneNote(bar, items)
      case 'two-to-four-notes':
        return notesInBar(bar, items)
      case 'one-bar':
      case 'two-bars':
        return fullBars(bar, itemsInBars)
    }
  }

  // Without items due it is spent after the elements, so that without key signatures the values
  // go as before.
  const nextKeySignature = (): KeySignature => {
    if (difficulty.keySignatures === 0) return NO_KEY_SIGNATURE
    const count = Math.floor(
      random.next() * (difficulty.keySignatures + 1),
    ) as KeySignature['count']
    if (count === 0) return { count }
    return { count, accidental: random.next() < 0.5 ? 'sharp' : 'flat' }
  }

  // A sharp or a flat stands only where the note would sound natural: it never repeats the key
  // signature or a sign earlier in the bar. Where the note would sound altered, only a natural
  // may stand, and after it the place takes no more signs in the bar. The chance is spent for
  // every note, so that one choice never shifts the values the next ones get. The letters of the
  // items take no signs of their own, so that none of them says otherwise than an item.
  const withAccidentals = (
    elements: readonly NoteOrRest[],
    timeSignature: TimeSignature,
    keySignature: KeySignature,
    itemLetters: readonly Pitch['letter'][],
  ): NoteOrRest[] => {
    if (difficulty.accidentals === 'none') return [...elements]
    const naturals = difficulty.accidentals === 'sharp-flat-and-natural'
    const keyLetters = keySignatureLetters(keySignature)
    const signed: { place: Pitch; bar: number; accidental: Accidental }[] = []
    return inBars(elements, timeSignature).map(({ element, bar }): NoteOrRest => {
      if (!isNote(element) || itemLetters.includes(element.pitch.letter)) return element
      const wants = random.next() >= ACCIDENTAL_FROM
      if (!wants) return element
      const { pitch: place } = element
      const earlier = signed
        .filter((each) => each.bar === bar && isSamePitch(each.place, place))
        .at(-1)
      const altered = earlier ? earlier.accidental !== 'natural' : keyLetters.includes(place.letter)
      if (!earlier && !altered) {
        const accidental = random.next() < 0.5 ? 'sharp' : 'flat'
        signed.push({ place, bar, accidental })
        return { ...element, accidental }
      }
      if (!naturals || !altered) return element
      signed.push({ place, bar, accidental: 'natural' })
      return { ...element, accidental: 'natural' }
    })
  }

  // The item is written as it was: its sign stands before it wherever the key signature does not
  // already give it, if the difficulty allows the sign there.
  const itemNote = (
    { pitch, duration }: ReviewItem,
    keySignature: KeySignature,
  ): Note | undefined => {
    const place = placeOf(pitch)
    const fromKey = applyKeySignature(place, keySignature).alteration
    if (pitch.alteration === fromKey) return { pitch: place, duration }
    const allowed =
      pitch.alteration === undefined
        ? difficulty.accidentals === 'sharp-flat-and-natural'
        : fromKey === undefined && difficulty.accidentals !== 'none'
    return allowed ? { pitch: place, duration, accidental: signOf(pitch.alteration) } : undefined
  }

  const holds = (bar: number, itemsInBars: readonly (readonly Note[])[]): boolean => {
    const [items = []] = itemsInBars
    switch (questionLength) {
      case 'one-note':
        return items.length <= 1 && lengthOf(items) <= bar
      case 'two-to-four-notes':
        return noteCounts(bar, items).length > 0
      case 'one-bar':
      case 'two-bars':
        return itemsInBars.reduce((total, each) => total + fewestInBar(bar, each), 0) <= MAX_NOTES
    }
  }

  // The items in the order of their priority, each into a bar that still holds it; an item the
  // question does not hold waits for a later one. Two items of one place never share a question,
  // so that neither stands next to the other or changes its sound.
  const takeItems = (
    due: readonly ReviewItem[],
    timeSignature: TimeSignature,
    keySignature: KeySignature,
  ): Note[][] => {
    const bar = barSixteenths(timeSignature)
    return due.reduce<Note[][]>((itemsInBars, item) => {
      const note = itemNote(item, keySignature)
      const taken = itemsInBars.flat()
      if (!note || taken.some((each) => isSamePlace(each.pitch, note.pitch))) return itemsInBars
      const options = itemsInBars
        .map((items, index) =>
          itemsInBars.map((each, at) => (at === index ? [...each, note] : each)),
        )
        .filter((option) => holds(bar, option))
      return options.length > 0 ? pick(options, random) : itemsInBars
    }, noItems())
  }

  // A note next to an item of its place takes another pitch.
  const apartFromItems = (
    elements: readonly NoteOrRest[],
    items: readonly Note[],
  ): NoteOrRest[] => {
    const notes = elements.filter(isNote)
    const moved = new Map<Note, Note>()
    notes.forEach((note, index) => {
      if (items.includes(note)) return
      const before = notes[index - 1]
      const neighbours = [before && (moved.get(before) ?? before), notes[index + 1]].filter(
        (each): each is Note => each !== undefined,
      )
      const nextTo = (pitch: Pitch) => neighbours.some((each) => isSamePlace(each.pitch, pitch))
      if (!nextTo(note.pitch)) return
      const pitch = pick(
        pitches.filter((candidate) => !nextTo(candidate)),
        random,
      )
      moved.set(note, { ...note, pitch })
    })
    return elements.map((element) => (isNote(element) && moved.get(element)) || element)
  }

  const nextTimeSignature = (): TimeSignature => {
    const timeSignature =
      timeSignatures.length > 1 ? pick(timeSignatures, random) : timeSignatures[0]
    if (!timeSignature) throw new Error('No time signature fits the difficulty')
    return timeSignature
  }

  const questionOf = (
    timeSignature: TimeSignature,
    elements: readonly NoteOrRest[],
    keySignature: KeySignature,
    itemLetters: readonly Pitch['letter'][],
  ): Question =>
    createQuestionOf(
      timeSignature,
      applyAccidentals(
        withAccidentals(elements, timeSignature, keySignature, itemLetters),
        timeSignature,
        keySignature,
      ),
      keySignature,
    )

  const regularQuestion = (given?: KeySignature): Question => {
    const timeSignature = nextTimeSignature()
    const elements = elementsIn(timeSignature, noItems())
    return questionOf(timeSignature, elements, given ?? nextKeySignature(), [])
  }

  // The key signature is drawn before the elements: whether the question takes an item depends on
  // it.
  const reviewQuestion = (due: readonly ReviewItem[], given?: KeySignature): Question => {
    const timeSignature = nextTimeSignature()
    const keySignature = given ?? nextKeySignature()
    const itemsInBars = takeItems(due, timeSignature, keySignature)
    const items = itemsInBars.flat()
    const elements = apartFromItems(elementsIn(timeSignature, itemsInBars), items)
    const last = elements.filter(isNote).at(-1)
    if (last) previous = placeOf(last.pitch)
    return questionOf(
      timeSignature,
      elements,
      keySignature,
      items.map((item) => item.pitch.letter),
    )
  }

  return (due = [], { keySignature } = {}) =>
    due.length > 0 ? reviewQuestion(due, keySignature) : regularQuestion(keySignature)
}
