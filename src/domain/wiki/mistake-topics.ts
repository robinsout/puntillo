import { isEnharmonic } from '../pitch'
import {
  alterationSource,
  cancelledByNatural,
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
import type { WikiTopic } from './topics'

// The order of the kinds of a mistake: place, signs, key signatures, duration.
const MISTAKE_TOPICS: readonly WikiTopic[] = [
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

export function readingMistakeTopics(
  question: Question,
  index: number,
  { letter, alteration, duration }: NoteAnswer,
): WikiTopic[] {
  const note = question.notes[index] as Note
  const topics: (WikiTopic | undefined)[] = []
  if (letter !== note.pitch.letter || alteration !== note.pitch.alteration) {
    topics.push('treble-staff')
    if (isEnharmonic({ letter, alteration }, note.pitch)) topics.push('accidentals')
    topics.push(alterationTopic(question, index))
  }
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
