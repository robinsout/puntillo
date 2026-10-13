import { describe, expect, it } from 'vitest'
import type { KeyValueStorage, WallClock } from '@/application/ports'
import { createProgress } from '@/application/progress'
import {
  NO_STATISTICS,
  recordAnswers,
  serializeStatistics,
  type ItemStats,
} from '@/domain/progress'
import type { Duration } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

// Feature progress-and-storage, slice 1: the statistics by item outlive the page (criteria 5, 6);
// damaged statistics read as none (edge case 1); without a storage that saves, the trainer goes
// on and nothing fails (criteria 18, 19).
//
// The order and the counting themselves are the domain's, see domain/progress. Tests do not
// depend on the storage key: a reload is a new progress over the same storage.

const QUARTER: Duration = { value: 'quarter' }

const C4: ReviewItem = { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }
const F4: ReviewItem = { pitch: { letter: 'F', octave: 4 }, duration: QUARTER }

const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)
const MINUTE = 60_000

function memoryStorage() {
  const entries = new Map<string, string>()
  const storage: KeyValueStorage = {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
    canSave: () => true,
  }
  return { storage, entries }
}

// Whatever key is read, the value is the given one.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

// What the storage port promises when the browser storage is unavailable.
const unavailableStorage = (): KeyValueStorage => ({
  get: () => null,
  set: () => {},
  canSave: () => false,
})

// What the storage port promises when the browser storage is full: it reads, but the first
// write fails, and from then on it cannot save.
function fullStorage(): KeyValueStorage {
  let failed = false
  return {
    get: () => null,
    set: () => {
      failed = true
    },
    canSave: () => !failed,
  }
}

function wallClock(at = OCT_13_2026) {
  let now = at
  const clock: WallClock = { now: () => now }
  return {
    clock,
    elapse(ms: number) {
      now += ms
    },
  }
}

describe('progress', () => {
  describe('the statistics by item', () => {
    it('has no hardest notes at first', () => {
      const { storage } = memoryStorage()

      expect(createProgress(storage, wallClock().clock).hardestNotes).toEqual([])
    })

    it('gives an item answered wrong with the time of the answer', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)

      progress.recordAnswers([{ item: C4, right: false }])

      expect(progress.hardestNotes).toEqual<ItemStats[]>([
        { item: C4, shown: 1, mistakes: 1, lastShownAt: OCT_13_2026, lastRight: false },
      ])
    })

    it('takes the time of each answer from the clock', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      const progress = createProgress(storage, clock)
      progress.recordAnswers([{ item: C4, right: false }])
      elapse(MINUTE)

      progress.recordAnswers([{ item: C4, right: true }])

      expect(progress.hardestNotes).toEqual<ItemStats[]>([
        { item: C4, shown: 2, mistakes: 1, lastShownAt: OCT_13_2026 + MINUTE, lastRight: true },
      ])
    })

    it('keeps the items answered right for later mistakes', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)
      progress.recordAnswers([
        { item: C4, right: true },
        { item: F4, right: true },
      ])

      progress.recordAnswers([{ item: C4, right: false }])

      expect(
        progress.hardestNotes.map(({ item, shown, mistakes }) => [item, shown, mistakes]),
      ).toEqual([[C4, 2, 1]])
    })
  })

  describe('after a reload', () => {
    it('gives the hardest notes recorded before', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      const before = createProgress(storage, clock)
      before.recordAnswers([{ item: C4, right: false }])
      elapse(MINUTE)
      before.recordAnswers([
        { item: F4, right: false },
        { item: C4, right: true },
      ])

      expect(createProgress(storage, clock).hardestNotes).toEqual(before.hardestNotes)
    })

    it('goes on counting from the statistics recorded before', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      createProgress(storage, clock).recordAnswers([{ item: C4, right: false }])

      createProgress(storage, clock).recordAnswers([{ item: C4, right: false }])

      expect(createProgress(storage, clock).hardestNotes.map(({ mistakes }) => mistakes)).toEqual([
        2,
      ])
    })

    it('reads the statistics as the domain writes them', () => {
      const saved = recordAnswers(NO_STATISTICS, [{ item: F4, right: false }], OCT_13_2026)

      expect(
        createProgress(storageHolding(serializeStatistics(saved)), wallClock().clock).hardestNotes,
      ).toEqual<ItemStats[]>([
        { item: F4, shown: 1, mistakes: 1, lastShownAt: OCT_13_2026, lastRight: false },
      ])
    })

    it('saves nothing before the first answer', () => {
      const { storage, entries } = memoryStorage()

      createProgress(storage, wallClock().clock)

      expect(entries.size).toBe(0)
    })
  })

  describe('damaged statistics (edge case 1)', () => {
    it.each([
      ['not JSON', '{"version": 1, "items": ['],
      ['of another version', JSON.stringify({ version: 2, items: [] })],
      [
        'with more mistakes than showings',
        JSON.stringify({
          version: 1,
          items: [
            {
              item: { pitch: { letter: 'C', octave: 4 }, duration: { value: 'quarter' } },
              shown: 1,
              mistakes: 2,
              lastShownAt: OCT_13_2026,
              lastRight: false,
            },
          ],
        }),
      ],
    ])('read as none: %s', (_, damaged) => {
      expect(createProgress(storageHolding(damaged), wallClock().clock).hardestNotes).toEqual([])
    })

    it('are replaced by the statistics recorded after them', () => {
      const { storage, entries } = memoryStorage()
      const { clock } = wallClock()
      createProgress(storage, clock).recordAnswers([{ item: C4, right: true }])
      const [key] = [...entries.keys()]
      if (key === undefined) throw new Error('expected the statistics saved')
      entries.set(key, 'damaged')

      createProgress(storage, clock).recordAnswers([{ item: F4, right: false }])

      expect(
        createProgress(storage, clock).hardestNotes.map(({ item, shown, mistakes }) => [
          item,
          shown,
          mistakes,
        ]),
      ).toEqual([[F4, 1, 1]])
    })
  })

  describe('a storage that does not save (criteria 18, 19)', () => {
    it('can save while the storage can', () => {
      const { storage } = memoryStorage()

      expect(createProgress(storage, wallClock().clock).canSave).toBe(true)
    })

    it('cannot save without a storage', () => {
      expect(createProgress(unavailableStorage(), wallClock().clock).canSave).toBe(false)
    })

    it('has no hardest notes without a storage', () => {
      expect(createProgress(unavailableStorage(), wallClock().clock).hardestNotes).toEqual([])
    })

    it('takes answers without a storage', () => {
      const progress = createProgress(unavailableStorage(), wallClock().clock)

      expect(() => progress.recordAnswers([{ item: C4, right: false }])).not.toThrow()
    })

    it('cannot save once the storage is full, and takes answers on', () => {
      const progress = createProgress(fullStorage(), wallClock().clock)
      progress.recordAnswers([{ item: C4, right: false }])

      expect(progress.canSave).toBe(false)
      expect(() => progress.recordAnswers([{ item: F4, right: false }])).not.toThrow()
    })
  })
})
