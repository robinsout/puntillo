import type { ItemStatistics, ItemStats } from './item-statistics'
import { fieldsOf, isCount, parseJson } from './json-fields'
import { parseItem } from './parse-values'

const VERSION = 1

export const serializeStatistics = ({ items }: ItemStatistics): string =>
  JSON.stringify({ version: VERSION, items })

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
