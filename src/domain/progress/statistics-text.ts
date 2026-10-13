import { LETTERS, type Alteration, type Pitch } from '../pitch'
import { DURATION_VALUES, type Duration } from '../question'
import type { ReviewItem } from '../review-queue'
import type { ItemStatistics, ItemStats } from './item-statistics'
import { fieldsOf, isCount, parseJson } from './json-fields'

const VERSION = 1

const ALTERATIONS: readonly Alteration[] = [-2, -1, 1, 2]

export const serializeStatistics = ({ items }: ItemStatistics): string =>
  JSON.stringify({ version: VERSION, items })

function parsePitch(value: unknown): Pitch | null {
  const fields = fieldsOf(value)
  const letter = LETTERS.find((candidate) => candidate === fields?.letter)
  const octave = fields?.octave
  if (!fields || !letter || typeof octave !== 'number' || !Number.isInteger(octave)) return null
  if (fields.alteration === undefined) return { letter, octave }
  const alteration = ALTERATIONS.find((candidate) => candidate === fields.alteration)
  return alteration === undefined ? null : { letter, octave, alteration }
}

function parseDuration(value: unknown): Duration | null {
  const fields = fieldsOf(value)
  const durationValue = DURATION_VALUES.find((candidate) => candidate === fields?.value)
  if (!fields || !durationValue) return null
  if (fields.dots === undefined) return { value: durationValue }
  return fields.dots === 1 ? { value: durationValue, dots: 1 } : null
}

function parseItem(value: unknown): ReviewItem | null {
  const fields = fieldsOf(value)
  const pitch = parsePitch(fields?.pitch)
  const duration = parseDuration(fields?.duration)
  return pitch && duration ? { pitch, duration } : null
}

function parseStats(value: unknown): ItemStats | null {
  const fields = fieldsOf(value)
  const item = parseItem(fields?.item)
  if (!fields || !item) return null
  const { shown, mistakes, lastShownAt, lastRight } = fields
  if (!isCount(shown) || !isCount(mistakes) || mistakes > shown) return null
  if (!isCount(lastShownAt) || typeof lastRight !== 'boolean') return null
  return { item, shown, mistakes, lastShownAt, lastRight }
}

export function parseStatistics(text: string): ItemStatistics | null {
  const fields = fieldsOf(parseJson(text))
  if (!fields || fields.version !== VERSION || !Array.isArray(fields.items)) return null
  const items = fields.items.map(parseStats)
  return items.every((each): each is ItemStats => each !== null) ? { items } : null
}
