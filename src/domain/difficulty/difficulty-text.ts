import { isSamePitch, LETTERS, type Pitch } from '../pitch'
import { DURATION_VALUES, TIME_SIGNATURES, type Duration, type TimeSignature } from '../question'
import {
  isPlayable,
  KEY_SIGNATURE_LIMITS,
  LEDGER_LINE_LIMITS,
  RANGE_PITCHES,
} from './customization'
import {
  ACCIDENTAL_SETS,
  QUESTION_LENGTHS,
  type Difficulty,
  type QuestionLength,
} from './difficulty'

const pitchText = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`

const timeSignatureText = ({ beats, beatValue }: TimeSignature): string => `${beats}/${beatValue}`

export function serializeDifficulty(difficulty: Difficulty): string {
  return JSON.stringify({
    low: pitchText(difficulty.range.low),
    high: pitchText(difficulty.range.high),
    ledgerLines: difficulty.ledgerLines,
    keySignatures: difficulty.keySignatures,
    accidentals: difficulty.accidentals,
    durations: difficulty.durations,
    askDuration: difficulty.askDuration,
    questionLength: difficulty.questionLength,
    timeSignatures: difficulty.timeSignatures.map(timeSignatureText),
    rests: difficulty.rests,
    dots: difficulty.dots,
  })
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parsePitch(value: unknown): Pitch | null {
  const match = typeof value === 'string' ? /^([A-G])(\d)$/.exec(value) : null
  const letter = LETTERS.find((candidate) => candidate === match?.[1])
  if (!match || !letter) return null
  const pitch: Pitch = { letter, octave: Number(match[2]) }
  return RANGE_PITCHES.some((offered) => isSamePitch(offered, pitch)) ? pitch : null
}

const isDurationValue = (value: unknown): value is Duration['value'] =>
  DURATION_VALUES.some((duration) => duration === value)

function parseDurations(value: unknown): Duration['value'][] | null {
  if (!Array.isArray(value)) return null
  const durations = value.filter(isDurationValue)
  return durations.length === value.length ? durations : null
}

// A text saved before the length was offered asks about one note.
function parseQuestionLength(value: unknown): QuestionLength | undefined {
  if (value === undefined) return 'one-note'
  return QUESTION_LENGTHS.find((length) => length === value)
}

// A text saved before the time signatures were offered asks in 4/4.
function parseTimeSignatures(value: unknown): TimeSignature[] | null {
  if (value === undefined) return TIME_SIGNATURES.slice(0, 1)
  if (!Array.isArray(value) || value.length === 0) return null
  const found = value.map((text) =>
    TIME_SIGNATURES.find((offered) => timeSignatureText(offered) === text),
  )
  return found.every((each) => each !== undefined) ? found : null
}

export function parseDifficulty(text: string): Difficulty | null {
  const data = parseJson(text)
  if (typeof data !== 'object' || data === null) return null
  const fields = data as Record<string, unknown>
  const low = parsePitch(fields.low)
  const high = parsePitch(fields.high)
  const ledgerLines = LEDGER_LINE_LIMITS.find((limit) => limit === fields.ledgerLines)
  const keySignatures =
    fields.keySignatures === undefined
      ? 0
      : KEY_SIGNATURE_LIMITS.find((limit) => limit === fields.keySignatures)
  if (keySignatures === undefined) return null
  const accidentals =
    fields.accidentals === undefined
      ? 'none'
      : ACCIDENTAL_SETS.find((set) => set === fields.accidentals)
  if (accidentals === undefined) return null
  const durations = parseDurations(fields.durations)
  const questionLength = parseQuestionLength(fields.questionLength)
  const timeSignatures = parseTimeSignatures(fields.timeSignatures)
  const { askDuration, rests = false, dots = false } = fields
  if (!low || !high || ledgerLines === undefined || !durations || !questionLength) return null
  if (!timeSignatures) return null
  if (typeof askDuration !== 'boolean' || typeof rests !== 'boolean') return null
  if (typeof dots !== 'boolean') return null
  const difficulty: Difficulty = {
    range: { low, high },
    ledgerLines,
    keySignatures,
    accidentals,
    durations,
    askDuration,
    questionLength,
    timeSignatures,
    rests,
    dots,
  }
  return isPlayable(difficulty) ? difficulty : null
}
