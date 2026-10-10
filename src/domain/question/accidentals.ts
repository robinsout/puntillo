import { applyKeySignature, type KeySignature } from '../key-signature'
import type { Alteration, Pitch } from '../pitch'
import {
  inBars,
  isNote,
  type Accidental,
  type Note,
  type NoteOrRest,
  type Question,
  type TimeSignature,
} from './question'

export type AlterationSource = 'sign' | 'earlier in the bar' | 'key signature'

const SIGN_ALTERATION: Record<Accidental, Alteration | undefined> = {
  sharp: 1,
  flat: -1,
  natural: undefined,
}

const signOf = (alteration: Alteration | undefined): Accidental =>
  alteration === undefined ? 'natural' : alteration > 0 ? 'sharp' : 'flat'

const isSamePlace = (a: Pitch, b: Pitch): boolean => a.letter === b.letter && a.octave === b.octave

const placeWith = ({ letter, octave }: Pitch, alteration: Alteration | undefined): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

interface Sign {
  readonly place: Pitch
  readonly bar: number
  readonly alteration: Alteration | undefined
}

export function applyAccidentals(
  elements: readonly NoteOrRest[],
  timeSignature: TimeSignature,
  keySignature: KeySignature,
): NoteOrRest[] {
  const signs: Sign[] = []
  const notesSeen: { place: Pitch; bar: number }[] = []
  return inBars(elements, timeSignature).map(({ element, bar }): NoteOrRest => {
    if (!isNote(element)) return element
    const { pitch: place, duration } = element
    const first = !notesSeen.some((each) => each.bar === bar && isSamePlace(each.place, place))
    notesSeen.push({ place, bar })
    if (element.accidental) {
      const alteration = SIGN_ALTERATION[element.accidental]
      signs.push({ place, bar, alteration })
      return { pitch: placeWith(place, alteration), duration, accidental: element.accidental }
    }
    const earlier = [...signs]
      .reverse()
      .find((sign) => sign.bar === bar && isSamePlace(sign.place, place))
    const alteration = earlier
      ? earlier.alteration
      : applyKeySignature(place, keySignature).alteration
    const sounding: Note = { pitch: placeWith(place, alteration), duration }
    if (!first) return sounding
    // A courtesy sign: the same letter said otherwise in another octave of this bar or in the bar
    // before.
    const contradicted = signs.some(
      (sign) =>
        sign.place.letter === place.letter &&
        sign.alteration !== alteration &&
        (sign.bar === bar - 1 || (sign.bar === bar && sign.place.octave !== place.octave)),
    )
    return contradicted ? { ...sounding, accidental: signOf(alteration) } : sounding
  })
}

interface PlacedNote {
  readonly note: Note
  readonly bar: number
}

const placedNotes = (question: Question): PlacedNote[] =>
  inBars(question.elements, question.timeSignature).flatMap(({ element, bar }) =>
    isNote(element) ? [{ note: element, bar }] : [],
  )

const noteAt = (notes: readonly PlacedNote[], noteIndex: number): PlacedNote => {
  const placed = notes[noteIndex]
  if (!placed) throw new Error(`The question has no note ${noteIndex + 1}`)
  return placed
}

const signsBefore = (
  notes: readonly PlacedNote[],
  index: number,
  { note, bar }: PlacedNote,
): PlacedNote[] =>
  notes
    .slice(0, index)
    .filter(
      (each) =>
        each.bar === bar && each.note.accidental && isSamePlace(each.note.pitch, note.pitch),
    )

export function alterationSource(
  question: Question,
  noteIndex: number,
): AlterationSource | undefined {
  const notes = placedNotes(question)
  const placed = noteAt(notes, noteIndex)
  if (placed.note.accidental) return 'sign'
  if (signsBefore(notes, noteIndex, placed).length > 0) return 'earlier in the bar'
  return applyKeySignature(placed.note.pitch, question.keySignature).alteration === undefined
    ? undefined
    : 'key signature'
}

export interface Cancellation {
  readonly accidental: 'sharp' | 'flat'
  readonly source: 'key signature' | 'earlier in the bar'
}

const cancellation = (
  alteration: Alteration | undefined,
  source: Cancellation['source'],
): Cancellation | undefined =>
  alteration === undefined ? undefined : { accidental: alteration > 0 ? 'sharp' : 'flat', source }

// What the natural deciding the note's sound takes away: the last sign on its place before it
// in the bar, else the key signature. A natural over a note that would sound natural anyway
// cancels nothing.
export function cancelledByNatural(
  question: Question,
  noteIndex: number,
): Cancellation | undefined {
  const notes = placedNotes(question)
  const placed = noteAt(notes, noteIndex)
  if (placed.note.pitch.alteration !== undefined) return undefined
  const deciding = placed.note.accidental ? placed : signsBefore(notes, noteIndex, placed).at(-1)
  if (deciding?.note.accidental !== 'natural') return undefined
  const earlier = signsBefore(notes, notes.indexOf(deciding), placed).at(-1)
  return earlier
    ? cancellation(earlier.note.pitch.alteration, 'earlier in the bar')
    : cancellation(
        applyKeySignature(placed.note.pitch, question.keySignature).alteration,
        'key signature',
      )
}
