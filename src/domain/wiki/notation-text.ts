import { NO_KEY_SIGNATURE, type KeySignature } from '../key-signature'
import { LETTERS, type Pitch } from '../pitch'
import {
  applyAccidentals,
  canBeDotted,
  createQuestionOf,
  DURATION_VALUES,
  TIME_SIGNATURES,
  type Accidental,
  type Duration,
  type NoteOrRest,
  type Question,
} from '../question'

interface WrittenPitch {
  readonly pitch: Pitch
  readonly accidental?: Accidental
}

const SIGNS = {
  '#': { accidental: 'sharp', alteration: 1 },
  b: { accidental: 'flat', alteration: -1 },
  n: { accidental: 'natural' },
} as const

const isSign = (text: string): text is keyof typeof SIGNS => text in SIGNS

function parseWrittenPitch(text: string): WrittenPitch | null {
  const match = /^([A-G])([#bn]?)(\d)$/.exec(text)
  const letter = LETTERS.find((each) => each === match?.[1])
  if (!match || !letter) return null
  const [, , signText = '', octaveText] = match
  const pitch: Pitch = { letter, octave: Number(octaveText) }
  if (!isSign(signText)) return { pitch }
  const sign = SIGNS[signText]
  return 'alteration' in sign
    ? { pitch: { ...pitch, alteration: sign.alteration }, accidental: sign.accidental }
    : { pitch, accidental: sign.accidental }
}

export const parsePitchText = (text: string): Pitch | null => parseWrittenPitch(text)?.pitch ?? null

function parseDuration(text: string): Duration | null {
  const match = /^([a-z]+)(\.?)$/.exec(text)
  const value = DURATION_VALUES.find((each) => each === match?.[1])
  if (!value) return null
  if (!match?.[2]) return { value }
  return canBeDotted(value) ? { value, dots: 1 } : null
}

function parseElement(text: string): NoteOrRest | null {
  const parts = text.split('/')
  if (parts.length !== 2) return null
  const [what = '', durationText = ''] = parts
  const duration = parseDuration(durationText)
  if (!duration) return null
  if (what === 'rest') return { duration }
  const written = parseWrittenPitch(what)
  return written && { ...written, duration }
}

function parseKeySignature(text: string | undefined): KeySignature | null {
  const match = /^([1-7])([#b])$/.exec(text ?? '')
  if (!match) return null
  const count = Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6 | 7
  return { count, accidental: match[2] === '#' ? 'sharp' : 'flat' }
}

// "4/4 2# C4/half. rest/quarter Fn4/quarter": the time signature, an optional key signature,
// then the notes and the rests as written; they sound as in the trainer, by the key signature
// and the signs earlier in the bar.
export function parseStaffExample(text: string): Question | null {
  const [timeText, ...rest] = text.trim().split(/\s+/)
  const timeSignature = TIME_SIGNATURES.find(
    ({ beats, beatValue }) => `${beats}/${beatValue}` === timeText,
  )
  if (!timeSignature) return null
  const keySignature = parseKeySignature(rest[0])
  const elements = (keySignature ? rest.slice(1) : rest).map(parseElement)
  if (!elements.every((element) => element !== null)) return null
  if (!elements.some((element) => 'pitch' in element)) return null
  return createQuestionOf(
    timeSignature,
    applyAccidentals(elements, timeSignature, keySignature ?? NO_KEY_SIGNATURE),
    keySignature ?? NO_KEY_SIGNATURE,
  )
}
