import { LETTERS, type Alteration, type Pitch } from '../pitch'
import { DURATION_VALUES, type Duration } from '../question'
import type { ReviewItem } from '../review-queue'
import { SESSION_LENGTHS, type SessionLength } from '../session'
import { fieldsOf } from './json-fields'

const ALTERATIONS: readonly Alteration[] = [-2, -1, 1, 2]

export function parsePitch(value: unknown): Pitch | null {
  const fields = fieldsOf(value)
  const letter = LETTERS.find((candidate) => candidate === fields?.letter)
  const octave = fields?.octave
  if (!fields || !letter || typeof octave !== 'number' || !Number.isInteger(octave)) return null
  if (fields.alteration === undefined) return { letter, octave }
  const alteration = ALTERATIONS.find((candidate) => candidate === fields.alteration)
  return alteration === undefined ? null : { letter, octave, alteration }
}

export function parseDuration(value: unknown): Duration | null {
  const fields = fieldsOf(value)
  const durationValue = DURATION_VALUES.find((candidate) => candidate === fields?.value)
  if (!fields || !durationValue) return null
  if (fields.dots === undefined) return { value: durationValue }
  return fields.dots === 1 ? { value: durationValue, dots: 1 } : null
}

export function parseItem(value: unknown): ReviewItem | null {
  const fields = fieldsOf(value)
  const pitch = parsePitch(fields?.pitch)
  const duration = parseDuration(fields?.duration)
  return pitch && duration ? { pitch, duration } : null
}

export function parseLength(value: unknown): SessionLength | null {
  const minutes = fieldsOf(value)?.minutes
  return (
    SESSION_LENGTHS.find((candidate) =>
      typeof candidate === 'object' ? candidate.minutes === minutes : candidate === value,
    ) ?? null
  )
}
