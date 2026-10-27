import { keyOf, type PianoKey } from '../keyboard'
import { isEnharmonic, type Pitch } from '../pitch'
import {
  alterationSource,
  cancelledByNatural,
  isKeyAnswer,
  isPitchRight,
  isSameDuration,
  signMistake,
  type AlterationSource,
  type Cancellation,
  type Note,
  type NoteAnswer,
  type Question,
  type SignMistake,
  type WrittenNote,
} from '../question'
import type { NoteInput } from '../session'
import type { WikiTopic } from './topics'

// The order of the kinds of a mistake: place, signs, key signatures, duration.
const MISTAKE_TOPICS: readonly WikiTopic[] = [
  'piano-keyboard',
  'instrument',
  'treble-staff',
  'accidentals',
  'key-signatures',
  'durations',
]

export function inMistakeOrder(topics: Iterable<WikiTopic>): WikiTopic[] {
  const given = new Set(topics)
  return MISTAKE_TOPICS.filter((topic) => given.has(topic))
}

export const cancellationTopic = (cancelled: Cancellation | undefined): WikiTopic =>
  cancelled?.source === 'key signature' ? 'key-signatures' : 'accidentals'

const SOURCE_TOPICS: Record<AlterationSource, WikiTopic | undefined> = {
  sign: undefined,
  'earlier in the bar': 'accidentals',
  'key signature': 'key-signatures',
}

// What makes a note sound as it does without a sign of its own: a natural cancelling a sign, or a
// sign from the key signature or earlier in the bar.
function alterationTopic(question: Question, index: number): WikiTopic | undefined {
  if ((question.notes[index] as Note).pitch.alteration === undefined) {
    const cancelled = cancelledByNatural(question, index)
    return cancelled && cancellationTopic(cancelled)
  }
  // An altered note always has a source: its own sign, the bar or the key signature.
  return SOURCE_TOPICS[alterationSource(question, index) as AlterationSource]
}

// The right sound of the key, in another octave.
export const isOctaveOff = (pitch: Pitch, key: PianoKey): boolean =>
  key.number !== keyOf(pitch).number && (key.number - keyOf(pitch).number) % 12 === 0

// The note was read right but played an octave off, on the keys or on the instrument heard.
export const octaveOffTopic = (input: NoteInput): WikiTopic =>
  input === 'microphone' ? 'instrument' : 'piano-keyboard'

export function readingMistakeTopics(
  question: Question,
  index: number,
  answer: NoteAnswer,
  input: NoteInput = 'keyboard',
): WikiTopic[] {
  const note = question.notes[index] as Note
  const topics: (WikiTopic | undefined)[] = []
  if (isKeyAnswer(answer) && isOctaveOff(note.pitch, answer.key)) {
    topics.push(octaveOffTopic(input))
  } else if (!isPitchRight(note.pitch, answer)) {
    topics.push('treble-staff')
    if (!isKeyAnswer(answer) && isEnharmonic(answer, note.pitch)) topics.push('accidentals')
    topics.push(alterationTopic(question, index))
  }
  const { duration } = answer
  if (duration && !isSameDuration(duration, note.duration)) topics.push('durations')
  return inMistakeOrder(topics.filter((topic) => topic !== undefined))
}

function signTopics(mistake: SignMistake | undefined): WikiTopic[] {
  switch (mistake?.kind) {
    case undefined:
      return []
    case 'sign needed':
      return ['accidentals']
    case 'natural needed':
      return ['accidentals', cancellationTopic(mistake.cancels)]
    case 'not needed':
      return ['accidentals', mistake.source === 'key signature' ? 'key-signatures' : 'accidentals']
  }
}

// A note on another step is a mistake of its place only, whatever its sign.
export function writingMistakeTopics(
  question: Question,
  index: number,
  { pitch, accidental, duration }: WrittenNote,
): WikiTopic[] {
  const note = question.notes[index] as Note
  const topics: WikiTopic[] =
    pitch.letter !== note.pitch.letter || pitch.octave !== note.pitch.octave
      ? ['treble-staff']
      : signTopics(signMistake(question, index, accidental))
  if (duration && !isSameDuration(duration, note.duration)) topics.push('durations')
  return inMistakeOrder(topics)
}
