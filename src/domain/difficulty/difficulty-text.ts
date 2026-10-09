import { isSamePitch, LETTERS, type Pitch } from '../pitch'
import { DURATION_VALUES, type Duration } from '../question'
import { isPlayable, LEDGER_LINE_LIMITS, RANGE_PITCHES } from './customization'
import type { Difficulty } from './difficulty'

const pitchText = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`

export function serializeDifficulty(difficulty: Difficulty): string {
  return JSON.stringify({
    low: pitchText(difficulty.range.low),
    high: pitchText(difficulty.range.high),
    ledgerLines: difficulty.ledgerLines,
    durations: difficulty.durations,
    askDuration: difficulty.askDuration,
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

export function parseDifficulty(text: string): Difficulty | null {
  const data = parseJson(text)
  if (typeof data !== 'object' || data === null) return null
  const fields = data as Record<string, unknown>
  const low = parsePitch(fields.low)
  const high = parsePitch(fields.high)
  const ledgerLines = LEDGER_LINE_LIMITS.find((limit) => limit === fields.ledgerLines)
  const durations = parseDurations(fields.durations)
  const { askDuration } = fields
  if (!low || !high || ledgerLines === undefined || !durations) return null
  if (typeof askDuration !== 'boolean') return null
  const difficulty: Difficulty = { range: { low, high }, ledgerLines, durations, askDuration }
  return isPlayable(difficulty) ? difficulty : null
}
