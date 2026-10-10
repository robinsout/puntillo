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

export function alterationSource(
  question: Question,
  noteIndex: number,
): AlterationSource | undefined {
  const notes = inBars(question.elements, question.timeSignature).flatMap(({ element, bar }) =>
    isNote(element) ? [{ note: element, bar }] : [],
  )
  const placed = notes[noteIndex]
  if (!placed) throw new Error(`The question has no note ${noteIndex + 1}`)
  const { note, bar } = placed
  if (note.accidental) return 'sign'
  const signedEarlier = notes
    .slice(0, noteIndex)
    .some(
      (each) =>
        each.bar === bar && each.note.accidental && isSamePlace(each.note.pitch, note.pitch),
    )
  if (signedEarlier) return 'earlier in the bar'
  return applyKeySignature(note.pitch, question.keySignature).alteration === undefined
    ? undefined
    : 'key signature'
}
