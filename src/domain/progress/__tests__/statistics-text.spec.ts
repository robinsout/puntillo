import { describe, expect, it } from 'vitest'
import type { Duration } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import {
  hardestNotes,
  NO_STATISTICS,
  parseStatistics,
  recordAnswers,
  serializeStatistics,
  type ItemStatistics,
} from '@/domain/progress'

// Feature progress-and-storage, slice 1: the statistics by item are kept as text (criterion 6),
// and saved data that is damaged or of another version reads as none (edge case 1).
//
// The text is JSON: { version: 1, items: [...] }, each item
// { item: { pitch, duration }, shown, mistakes, lastShownAt, lastRight }, with the pitch and the
// duration as in the domain: a natural has no alteration field, a plain duration no dots field.

const QUARTER: Duration = { value: 'quarter' }

const C4: ReviewItem = { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }
const F_SHARP_4_DOTTED_HALF: ReviewItem = {
  pitch: { letter: 'F', octave: 4, alteration: 1 },
  duration: { value: 'half', dots: 1 },
}
const B_FLAT_FLAT_5: ReviewItem = {
  pitch: { letter: 'B', octave: 5, alteration: -2 },
  duration: { value: 'sixteenth' },
}

const SOME_STATISTICS: ItemStatistics = recordAnswers(
  recordAnswers(
    NO_STATISTICS,
    [
      { item: C4, right: false },
      { item: F_SHARP_4_DOTTED_HALF, right: true },
    ],
    1_760_000_000_000,
  ),
  [
    { item: B_FLAT_FLAT_5, right: false },
    { item: C4, right: true },
  ],
  1_760_000_060_000,
)

const VALID_ITEM = {
  item: { pitch: { letter: 'C', octave: 4 }, duration: { value: 'quarter' } },
  shown: 3,
  mistakes: 1,
  lastShownAt: 1_760_000_000_000,
  lastRight: true,
}

const text = (data: unknown): string => JSON.stringify(data)

const withItem = (changes: Record<string, unknown>): string =>
  text({ version: 1, items: [{ ...VALID_ITEM, ...changes }] })

const withPitch = (pitch: unknown): string =>
  withItem({ item: { pitch, duration: { value: 'quarter' } } })

const withDuration = (duration: unknown): string =>
  withItem({ item: { pitch: { letter: 'C', octave: 4 }, duration } })

describe('statistics as text', () => {
  describe('a round trip', () => {
    it('reads back the statistics written', () => {
      expect(parseStatistics(serializeStatistics(SOME_STATISTICS))).toEqual(SOME_STATISTICS)
    })

    it('reads back no statistics', () => {
      expect(parseStatistics(serializeStatistics(NO_STATISTICS))).toEqual(NO_STATISTICS)
    })

    it('keeps the order of items shown at the same time', () => {
      const statistics = recordAnswers(
        NO_STATISTICS,
        [
          { item: C4, right: false },
          { item: B_FLAT_FLAT_5, right: false },
        ],
        1000,
      )

      const parsed = parseStatistics(serializeStatistics(statistics))

      expect(parsed && hardestNotes(parsed)).toEqual(hardestNotes(statistics))
    })

    it('writes the version', () => {
      expect(JSON.parse(serializeStatistics(SOME_STATISTICS))).toMatchObject({ version: 1 })
    })
  })

  describe('a valid text', () => {
    it('reads an item', () => {
      const parsed = parseStatistics(withItem({}))

      expect(parsed && hardestNotes(parsed)).toEqual([VALID_ITEM])
    })

    it('reads an empty list as no statistics', () => {
      const parsed = parseStatistics(text({ version: 1, items: [] }))

      expect(parsed && hardestNotes(parsed)).toEqual([])
    })

    it.each([
      ['a double flat', { letter: 'B', octave: 5, alteration: -2 }],
      ['a double sharp', { letter: 'F', octave: 4, alteration: 2 }],
      ['a low octave', { letter: 'A', octave: 0 }],
    ])('reads %s', (_, pitch) => {
      expect(parseStatistics(withPitch(pitch))).not.toBeNull()
    })

    it.each(['whole', 'half', 'quarter', 'eighth', 'sixteenth'])('reads a %s', (value) => {
      expect(parseStatistics(withDuration({ value }))).not.toBeNull()
    })

    it('reads a dotted duration', () => {
      expect(parseStatistics(withDuration({ value: 'half', dots: 1 }))).not.toBeNull()
    })

    it('reads an item with no mistakes', () => {
      expect(parseStatistics(withItem({ mistakes: 0, lastRight: true }))).not.toBeNull()
    })

    it('reads an item with every showing a mistake', () => {
      expect(parseStatistics(withItem({ shown: 2, mistakes: 2 }))).not.toBeNull()
    })
  })

  describe('damaged data or another version reads as none (edge case 1)', () => {
    it.each([
      ['not JSON', '{"version": 1, "items": ['],
      ['empty', ''],
      ['null', 'null'],
      ['a number', '1'],
      ['a list', '[]'],
      ['no version', text({ items: [] })],
      ['another version', text({ version: 2, items: [] })],
      ['a version as text', text({ version: '1', items: [] })],
      ['no items', text({ version: 1 })],
      ['items not a list', text({ version: 1, items: {} })],
      ['an item not an object', text({ version: 1, items: [null] })],
      ['an item as a number', text({ version: 1, items: [1] })],
    ])('%s', (_, damaged) => {
      expect(parseStatistics(damaged)).toBeNull()
    })

    it('rejects the whole text for one damaged item', () => {
      expect(
        parseStatistics(text({ version: 1, items: [VALID_ITEM, { ...VALID_ITEM, shown: -1 }] })),
      ).toBeNull()
    })

    it.each([
      ['shown missing', { shown: undefined }],
      ['shown as text', { shown: '3' }],
      ['shown negative', { shown: -1 }],
      ['shown fractional', { shown: 2.5 }],
      ['mistakes missing', { mistakes: undefined }],
      ['mistakes as text', { mistakes: '1' }],
      ['mistakes negative', { mistakes: -1 }],
      ['mistakes fractional', { mistakes: 0.5 }],
      ['more mistakes than showings', { shown: 2, mistakes: 3 }],
      ['the time missing', { lastShownAt: undefined }],
      ['the time as text', { lastShownAt: '2026-10-13' }],
      ['the time negative', { lastShownAt: -1 }],
      ['the time fractional', { lastShownAt: 1.5 }],
      ['the last result missing', { lastRight: undefined }],
      ['the last result as text', { lastRight: 'true' }],
      ['the item missing', { item: undefined }],
      ['the item not an object', { item: 'C4' }],
    ])('%s', (_, changes) => {
      expect(parseStatistics(withItem(changes))).toBeNull()
    })

    it.each([
      ['no pitch', undefined],
      ['a pitch not an object', 'C4'],
      ['a letter out of C…B', { letter: 'H', octave: 4 }],
      ['a lower-case letter', { letter: 'c', octave: 4 }],
      ['no letter', { octave: 4 }],
      ['no octave', { letter: 'C' }],
      ['an octave as text', { letter: 'C', octave: '4' }],
      ['a fractional octave', { letter: 'C', octave: 4.5 }],
      ['an alteration of three', { letter: 'C', octave: 4, alteration: 3 }],
      ['an alteration of minus three', { letter: 'C', octave: 4, alteration: -3 }],
      ['a fractional alteration', { letter: 'C', octave: 4, alteration: 0.5 }],
      ['an alteration as text', { letter: 'C', octave: 4, alteration: '1' }],
    ])('%s', (_, pitch) => {
      expect(parseStatistics(withPitch(pitch))).toBeNull()
    })

    it.each([
      ['no duration', undefined],
      ['a duration not an object', 'quarter'],
      ['an unknown value', { value: 'thirty-second' }],
      ['no value', { dots: 1 }],
      ['two dots', { value: 'half', dots: 2 }],
      ['dots as text', { value: 'half', dots: '1' }],
    ])('%s', (_, duration) => {
      expect(parseStatistics(withDuration(duration))).toBeNull()
    })
  })
})
