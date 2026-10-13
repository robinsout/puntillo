import { describe, expect, it } from 'vitest'
import {
  NO_HISTORY,
  recentSessions,
  recordSession,
  type SessionHistory,
  type SessionRecord,
} from '@/domain/progress'

// Feature progress-and-storage, slice 2: the history of finished sessions for Recent sessions on
// the Progress screen (criteria 2–4).
//
// A record is a session that reached its results: when it finished, in epoch milliseconds, its
// exercise, its length, the questions checked and the accuracy as a whole percent. The history is
// a plain value, its records in the order recorded. recentSessions gives those of the last 30
// days, 30 × 24 hours before now included, the latest first; of two finished at the same time, the
// one recorded later. recordSession drops the records older than 30 days before the one it records,
// so that the history does not grow.

const DAY = 24 * 60 * 60 * 1000
const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)

const finishedAt = (at: number, changes: Partial<SessionRecord> = {}): SessionRecord => ({
  finishedAt: at,
  exercise: 'read',
  length: 20,
  questions: 20,
  accuracy: 85,
  ...changes,
})

const historyOf = (...records: SessionRecord[]): SessionHistory =>
  records.reduce(recordSession, NO_HISTORY)

describe('the history of sessions', () => {
  it('has no recent sessions at first', () => {
    expect(recentSessions(NO_HISTORY, OCT_13_2026)).toEqual([])
  })

  it('gives a session recorded', () => {
    const record = finishedAt(OCT_13_2026)

    expect(recentSessions(historyOf(record), OCT_13_2026)).toEqual([record])
  })

  it('keeps every field of a record', () => {
    const record: SessionRecord = {
      finishedAt: OCT_13_2026,
      exercise: 'write',
      length: { minutes: 5 },
      questions: 12,
      accuracy: 67,
    }

    expect(recentSessions(historyOf(record), OCT_13_2026)).toEqual([record])
  })

  it('gives the latest session first', () => {
    const first = finishedAt(OCT_13_2026 - 2 * DAY)
    const second = finishedAt(OCT_13_2026 - DAY, { exercise: 'write' })
    const third = finishedAt(OCT_13_2026, { length: 'unlimited' })

    expect(recentSessions(historyOf(first, second, third), OCT_13_2026)).toEqual([
      third,
      second,
      first,
    ])
  })

  it('orders by the time finished, not by the order recorded', () => {
    const earlier = finishedAt(OCT_13_2026 - DAY)
    const later = finishedAt(OCT_13_2026, { exercise: 'write' })

    expect(recentSessions(historyOf(later, earlier), OCT_13_2026)).toEqual([later, earlier])
  })

  it('gives the one recorded later first of two finished at the same time', () => {
    const one = finishedAt(OCT_13_2026, { questions: 10, length: 10 })
    const other = finishedAt(OCT_13_2026, { questions: 50, length: 50 })

    expect(recentSessions(historyOf(one, other), OCT_13_2026)).toEqual([other, one])
  })

  it('does not change the history it is given', () => {
    const history = historyOf(finishedAt(OCT_13_2026 - DAY))

    recordSession(history, finishedAt(OCT_13_2026))

    expect(recentSessions(history, OCT_13_2026)).toHaveLength(1)
  })

  describe('the last 30 days (criterion 4)', () => {
    it('gives a session finished exactly 30 days ago', () => {
      const record = finishedAt(OCT_13_2026 - 30 * DAY)

      expect(recentSessions(historyOf(record), OCT_13_2026)).toEqual([record])
    })

    it('leaves out a session finished 30 days and a millisecond ago', () => {
      const record = finishedAt(OCT_13_2026 - 30 * DAY - 1)

      expect(recentSessions(historyOf(record), OCT_13_2026)).toEqual([])
    })

    it('leaves out the old sessions and keeps the recent ones', () => {
      const old = finishedAt(OCT_13_2026 - 40 * DAY)
      const recent = finishedAt(OCT_13_2026 - 10 * DAY)

      expect(recentSessions(historyOf(old, recent), OCT_13_2026)).toEqual([recent])
    })

    it('leaves a session out once 30 days have passed since it', () => {
      const history = historyOf(finishedAt(OCT_13_2026))

      expect(recentSessions(history, OCT_13_2026 + 30 * DAY)).toHaveLength(1)
      expect(recentSessions(history, OCT_13_2026 + 30 * DAY + 1)).toEqual([])
    })

    // The clock of the device can be set back.
    it('gives a session finished after now', () => {
      const record = finishedAt(OCT_13_2026 + DAY)

      expect(recentSessions(historyOf(record), OCT_13_2026)).toEqual([record])
    })
  })

  describe('the size of the history', () => {
    it('drops the sessions older than 30 days before the one recorded', () => {
      const old = finishedAt(OCT_13_2026 - 30 * DAY - 1)
      const recent = finishedAt(OCT_13_2026 - 30 * DAY)
      const record = finishedAt(OCT_13_2026)

      expect(historyOf(old, recent, record).sessions).toEqual([recent, record])
    })

    it('keeps the sessions in the order recorded', () => {
      const later = finishedAt(OCT_13_2026)
      const earlier = finishedAt(OCT_13_2026 - DAY)

      expect(historyOf(later, earlier).sessions).toEqual([later, earlier])
    })

    it('is empty at first', () => {
      expect(NO_HISTORY).toEqual({ sessions: [] })
    })
  })
})
