import { describe, expect, it } from 'vitest'
import { LETTERS } from '@/domain/pitch'
import { LATIN_SYLLABLE_NAMES, latinSyllableName } from '@/domain/naming'

describe('latin syllable naming', () => {
  it('lists the seven degree names in scale order', () => {
    expect(LATIN_SYLLABLE_NAMES).toEqual(['do', 're', 'mi', 'fa', 'sol', 'la', 'si'])
  })

  it.each([
    ['C', 'do'],
    ['D', 're'],
    ['E', 'mi'],
    ['F', 'fa'],
    ['G', 'sol'],
    ['A', 'la'],
    ['B', 'si'],
  ] as const)('names letter class %s as %s', (letter, name) => {
    expect(latinSyllableName(letter)).toBe(name)
  })

  it('lists names in the same order as letter classes', () => {
    expect(LETTERS.map(latinSyllableName)).toEqual(LATIN_SYLLABLE_NAMES)
  })
})
