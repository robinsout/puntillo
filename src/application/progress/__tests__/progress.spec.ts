import { describe, expect, it } from 'vitest'
import type { KeyValueStorage, WallClock } from '@/application/ports'
import { createProgress } from '@/application/progress'
import {
  NO_HISTORY,
  NO_STATISTICS,
  recordAnswers,
  recordSession,
  serializeHistory,
  serializeSavedSession,
  serializeStatistics,
  type ItemStats,
  type SavedSession,
  type SessionRecord,
  type SessionSummary,
} from '@/domain/progress'
import { presetDifficulty } from '@/domain/difficulty'
import { createQuestion, type Duration } from '@/domain/question'
import { EMPTY_REVIEW_QUEUE, type ReviewItem } from '@/domain/review-queue'
import { EMPTY_SCORE, NO_MISTAKES, recordGrade } from '@/domain/session'

// Feature progress-and-storage, slice 1: the statistics by item outlive the page (criteria 5, 6);
// damaged statistics read as none (edge case 1); without a storage that saves, the trainer goes
// on and nothing fails (criteria 18, 19).
// Slice 2: so does the history of sessions, the time a session finished taken from the wall clock
// (criteria 2–4); damaged history reads as none and leaves the statistics as they are, and the
// other way round (edge case 1).
// Slice 3: the session not finished is kept over a reload until it is discarded (criteria 8, 12);
// a damaged one reads as none and leaves the rest as it is (edge case 1); without a storage it is
// kept until the page is closed, as the rest. What is kept and how is the domain's, see
// domain/progress; when to save and to discard is the session's.
//
// The order, the counting and the 30 days themselves are the domain's, see domain/progress. Tests
// do not depend on the storage keys: a reload is a new progress over the same storage.

const QUARTER: Duration = { value: 'quarter' }

const C4: ReviewItem = { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }
const F4: ReviewItem = { pitch: { letter: 'F', octave: 4 }, duration: QUARTER }

const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const READ_20: SessionSummary = { exercise: 'read', length: 20, questions: 20, accuracy: 85 }
const WRITE_5_MIN: SessionSummary = {
  exercise: 'write',
  length: { minutes: 5 },
  questions: 12,
  accuracy: 67,
}

// A session of 20 left on its seventh question, not checked yet.
const SAVED: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: presetDifficulty('confident-reading'),
  attempts: 2,
  number: 7,
  elapsedMs: 84_000,
  score: recordGrade(EMPTY_SCORE, [{ pitch: true, duration: false }], 2_000),
  mistakes: NO_MISTAKES,
  reviewQueue: EMPTY_REVIEW_QUEUE,
  question: createQuestion({ pitch: { letter: 'G', octave: 4 }, duration: QUARTER }),
  grades: null,
}

const SAVED_LATER: SavedSession = {
  ...SAVED,
  number: 8,
  elapsedMs: 90_000,
  grades: { first: [{ pitch: true, duration: true }], second: null },
}

const finished = (summary: SessionSummary, finishedAt = OCT_13_2026): SessionRecord => ({
  finishedAt,
  ...summary,
})

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

  describe('the history of sessions (criteria 2–4)', () => {
    it('has no recent sessions at first', () => {
      const { storage } = memoryStorage()

      expect(createProgress(storage, wallClock().clock).recentSessions).toEqual([])
    })

    it('gives a session recorded with the time it finished', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)

      progress.recordSession(READ_20)

      expect(progress.recentSessions).toEqual([finished(READ_20)])
    })

    it('takes the time of each session from the clock, the latest first', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      const progress = createProgress(storage, clock)
      progress.recordSession(READ_20)
      elapse(DAY)

      progress.recordSession(WRITE_5_MIN)

      expect(progress.recentSessions).toEqual([
        finished(WRITE_5_MIN, OCT_13_2026 + DAY),
        finished(READ_20),
      ])
    })

    it('leaves out a session once 30 days have passed since it', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      const progress = createProgress(storage, clock)
      progress.recordSession(READ_20)

      elapse(30 * DAY + 1)

      expect(progress.recentSessions).toEqual([])
    })

    it('leaves the statistics by item as they are', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)
      progress.recordAnswers([{ item: C4, right: false }])

      progress.recordSession(READ_20)

      expect(progress.hardestNotes.map(({ item }) => item)).toEqual([C4])
    })

    it('is not touched by answers', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)
      progress.recordSession(READ_20)

      progress.recordAnswers([{ item: C4, right: false }])

      expect(progress.recentSessions).toEqual([finished(READ_20)])
    })
  })

  describe('the history after a reload', () => {
    it('gives the sessions recorded before', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      const before = createProgress(storage, clock)
      before.recordSession(READ_20)
      elapse(MINUTE)
      before.recordSession(WRITE_5_MIN)

      expect(createProgress(storage, clock).recentSessions).toEqual(before.recentSessions)
    })

    it('goes on from the sessions recorded before', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      createProgress(storage, clock).recordSession(READ_20)
      elapse(MINUTE)

      createProgress(storage, clock).recordSession(WRITE_5_MIN)

      expect(createProgress(storage, clock).recentSessions).toEqual([
        finished(WRITE_5_MIN, OCT_13_2026 + MINUTE),
        finished(READ_20),
      ])
    })

    it('keeps the statistics recorded before on the page', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      createProgress(storage, clock).recordAnswers([{ item: C4, right: false }])

      createProgress(storage, clock).recordSession(READ_20)

      const after = createProgress(storage, clock)
      expect(after.hardestNotes.map(({ item }) => item)).toEqual([C4])
      expect(after.recentSessions).toEqual([finished(READ_20)])
    })

    it('reads the history as the domain writes it', () => {
      const saved = recordSession(NO_HISTORY, finished(WRITE_5_MIN))

      expect(
        createProgress(storageHolding(serializeHistory(saved)), wallClock().clock).recentSessions,
      ).toEqual([finished(WRITE_5_MIN)])
    })

    it('leaves out the sessions that have grown older than 30 days since', () => {
      const { storage } = memoryStorage()
      const { clock, elapse } = wallClock()
      createProgress(storage, clock).recordSession(READ_20)
      elapse(31 * DAY)

      expect(createProgress(storage, clock).recentSessions).toEqual([])
    })
  })

  describe('a damaged part of the progress (edge case 1)', () => {
    // The keys the statistics and the history are saved under, found by what each one writes.
    function savedKeys() {
      const { storage, entries } = memoryStorage()
      const { clock } = wallClock()
      const progress = createProgress(storage, clock)
      progress.recordAnswers([{ item: C4, right: false }])
      const [statisticsKey] = [...entries.keys()]
      progress.recordSession(READ_20)
      const historyKey = [...entries.keys()].find((key) => key !== statisticsKey)
      if (statisticsKey === undefined || historyKey === undefined)
        throw new Error('expected the statistics and the history saved apart')
      return { storage, entries, clock, statisticsKey, historyKey }
    }

    it.each([
      ['not JSON', '{"version": 1, "sessions": ['],
      ['of another version', JSON.stringify({ version: 2, sessions: [] })],
      [
        'with no question checked',
        JSON.stringify({ version: 1, sessions: [{ ...finished(READ_20), questions: 0 }] }),
      ],
    ])('reads a history %s as none', (_, damaged) => {
      expect(createProgress(storageHolding(damaged), wallClock().clock).recentSessions).toEqual([])
    })

    it('reads a damaged history as none and the statistics as they are', () => {
      const { storage, entries, clock, historyKey } = savedKeys()
      entries.set(historyKey, 'damaged')

      const after = createProgress(storage, clock)

      expect(after.recentSessions).toEqual([])
      expect(after.hardestNotes.map(({ item }) => item)).toEqual([C4])
    })

    it('reads damaged statistics as none and the history as it is', () => {
      const { storage, entries, clock, statisticsKey } = savedKeys()
      entries.set(statisticsKey, 'damaged')

      const after = createProgress(storage, clock)

      expect(after.hardestNotes).toEqual([])
      expect(after.recentSessions).toEqual([finished(READ_20)])
    })

    it('replaces a damaged history by the sessions recorded after it', () => {
      const { storage, entries, clock, historyKey } = savedKeys()
      entries.set(historyKey, 'damaged')

      createProgress(storage, clock).recordSession(WRITE_5_MIN)

      expect(createProgress(storage, clock).recentSessions).toEqual([finished(WRITE_5_MIN)])
    })
  })

  describe('the history with a storage that does not save (criteria 18, 19)', () => {
    it('has no recent sessions without a storage', () => {
      expect(createProgress(unavailableStorage(), wallClock().clock).recentSessions).toEqual([])
    })

    // Decision of the lead on slice 2: as the statistics, the history is kept until the page is
    // closed.
    it('gives the sessions of this page without a storage', () => {
      const progress = createProgress(unavailableStorage(), wallClock().clock)

      progress.recordSession(READ_20)

      expect(progress.recentSessions).toEqual([finished(READ_20)])
    })

    it('gives the sessions of this page once the storage is full', () => {
      const progress = createProgress(fullStorage(), wallClock().clock)
      progress.recordSession(READ_20)

      progress.recordSession(WRITE_5_MIN)

      expect(progress.canSave).toBe(false)
      expect(progress.recentSessions).toEqual([finished(WRITE_5_MIN), finished(READ_20)])
    })
  })

  describe('the session not finished (criteria 8, 12)', () => {
    it('has none at first', () => {
      const { storage } = memoryStorage()

      expect(createProgress(storage, wallClock().clock).unfinishedSession).toBeNull()
    })

    it('gives the session saved', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)

      progress.saveSession(SAVED)

      expect(progress.unfinishedSession).toEqual(SAVED)
    })

    it('gives the session saved last', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)
      progress.saveSession(SAVED)

      progress.saveSession(SAVED_LATER)

      expect(progress.unfinishedSession).toEqual(SAVED_LATER)
    })

    it('gives none once discarded', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)
      progress.saveSession(SAVED)

      progress.discardSession()

      expect(progress.unfinishedSession).toBeNull()
    })

    it('discards nothing when there is none', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)

      expect(() => progress.discardSession()).not.toThrow()
      expect(progress.unfinishedSession).toBeNull()
    })

    it('leaves the statistics and the history as they are', () => {
      const { storage } = memoryStorage()
      const progress = createProgress(storage, wallClock().clock)
      progress.recordAnswers([{ item: C4, right: false }])
      progress.recordSession(READ_20)

      progress.saveSession(SAVED)
      progress.discardSession()

      expect(progress.hardestNotes.map(({ item }) => item)).toEqual([C4])
      expect(progress.recentSessions).toEqual([finished(READ_20)])
    })
  })

  describe('the session not finished after a reload (criteria 8, 12)', () => {
    it('gives the session saved before', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      createProgress(storage, clock).saveSession(SAVED)

      expect(createProgress(storage, clock).unfinishedSession).toEqual(SAVED)
    })

    it('gives the session saved last before', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      createProgress(storage, clock).saveSession(SAVED)
      createProgress(storage, clock).saveSession(SAVED_LATER)

      expect(createProgress(storage, clock).unfinishedSession).toEqual(SAVED_LATER)
    })

    it('gives none once discarded before', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      createProgress(storage, clock).saveSession(SAVED)

      createProgress(storage, clock).discardSession()

      expect(createProgress(storage, clock).unfinishedSession).toBeNull()
    })

    it('reads the session as the domain writes it', () => {
      expect(
        createProgress(storageHolding(serializeSavedSession(SAVED)), wallClock().clock)
          .unfinishedSession,
      ).toEqual(SAVED)
    })

    it('keeps the statistics and the history recorded before', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      const before = createProgress(storage, clock)
      before.recordAnswers([{ item: C4, right: false }])
      before.recordSession(READ_20)

      createProgress(storage, clock).saveSession(SAVED)

      const after = createProgress(storage, clock)
      expect(after.hardestNotes.map(({ item }) => item)).toEqual([C4])
      expect(after.recentSessions).toEqual([finished(READ_20)])
      expect(after.unfinishedSession).toEqual(SAVED)
    })

    it('is not touched by answers and finished sessions', () => {
      const { storage } = memoryStorage()
      const { clock } = wallClock()
      const before = createProgress(storage, clock)
      before.saveSession(SAVED)

      before.recordAnswers([{ item: C4, right: false }])
      before.recordSession(READ_20)

      expect(createProgress(storage, clock).unfinishedSession).toEqual(SAVED)
    })
  })

  describe('a damaged session not finished (edge case 1)', () => {
    // The key the session is saved under, found by what it writes.
    function savedSessionKey() {
      const { storage, entries } = memoryStorage()
      const { clock } = wallClock()
      const progress = createProgress(storage, clock)
      progress.recordAnswers([{ item: C4, right: false }])
      progress.recordSession(READ_20)
      const others = new Set(entries.keys())
      progress.saveSession(SAVED)
      const sessionKey = [...entries.keys()].find((key) => !others.has(key))
      if (sessionKey === undefined) throw new Error('expected the session saved apart')
      return { storage, entries, clock, sessionKey, others }
    }

    it.each([
      ['not JSON', '{"version": 1, "exercise": '],
      ['of another version', JSON.stringify({ ...SAVED, version: 2 })],
    ])('reads a session %s as none', (_, damaged) => {
      expect(
        createProgress(storageHolding(damaged), wallClock().clock).unfinishedSession,
      ).toBeNull()
    })

    it('reads as none and leaves the statistics and the history as they are', () => {
      const { storage, entries, clock, sessionKey } = savedSessionKey()
      entries.set(sessionKey, 'damaged')

      const after = createProgress(storage, clock)

      expect(after.unfinishedSession).toBeNull()
      expect(after.hardestNotes.map(({ item }) => item)).toEqual([C4])
      expect(after.recentSessions).toEqual([finished(READ_20)])
    })

    it('is read as it is when the statistics and the history are damaged', () => {
      const { storage, entries, clock, others } = savedSessionKey()
      for (const key of others) entries.set(key, 'damaged')

      expect(createProgress(storage, clock).unfinishedSession).toEqual(SAVED)
    })

    it('is replaced by the session saved after it', () => {
      const { storage, entries, clock, sessionKey } = savedSessionKey()
      entries.set(sessionKey, 'damaged')

      createProgress(storage, clock).saveSession(SAVED_LATER)

      expect(createProgress(storage, clock).unfinishedSession).toEqual(SAVED_LATER)
    })
  })

  describe('the session not finished with a storage that does not save (criteria 18, 19)', () => {
    it('has none without a storage', () => {
      expect(createProgress(unavailableStorage(), wallClock().clock).unfinishedSession).toBeNull()
    })

    it('gives the session of this page without a storage', () => {
      const progress = createProgress(unavailableStorage(), wallClock().clock)

      progress.saveSession(SAVED)

      expect(progress.unfinishedSession).toEqual(SAVED)
    })

    it('discards the session of this page without a storage', () => {
      const progress = createProgress(unavailableStorage(), wallClock().clock)
      progress.saveSession(SAVED)

      progress.discardSession()

      expect(progress.unfinishedSession).toBeNull()
    })

    it('gives the session of this page once the storage is full', () => {
      const progress = createProgress(fullStorage(), wallClock().clock)
      progress.saveSession(SAVED)

      progress.saveSession(SAVED_LATER)

      expect(progress.canSave).toBe(false)
      expect(progress.unfinishedSession).toEqual(SAVED_LATER)
    })
  })
})
