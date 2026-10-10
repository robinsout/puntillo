import type { KeySignature } from '@/domain/key-signature'
import {
  isNote,
  type Accidental,
  type Duration,
  type Note,
  type NoteOrRest,
} from '@/domain/question'

const DURATIONS: Record<Duration['value'], string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
}

const durationOf = ({ value, dots }: Duration) => `${DURATIONS[value]}${dots ? 'd' : ''}`

const MAJOR_KEYS = {
  sharp: ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'],
  flat: ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'],
} as const

// VexFlow names a key signature by its major key.
export function toVexKey(keySignature: Exclude<KeySignature, { count: 0 }>): string {
  return MAJOR_KEYS[keySignature.accidental][keySignature.count]
}

// 'r/4' lets VexFlow place each rest at its usual height: the whole rest hangs from the 4th line,
// the others sit on the middle one.
export function toVexNote(element: NoteOrRest) {
  if (!isNote(element)) return { keys: ['r/4'], duration: `${durationOf(element.duration)}r` }
  const { pitch, duration } = element
  return {
    keys: [`${pitch.letter.toLowerCase()}/${pitch.octave}`],
    duration: durationOf(duration),
    autoStem: true,
  }
}

const ACCIDENTALS: Record<Accidental, string> = { sharp: '#', flat: 'b', natural: 'n' }

export const toVexAccidental = ({ accidental }: Note): string | undefined =>
  accidental && ACCIDENTALS[accidental]
