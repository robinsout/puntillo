import { describe, expect, it } from 'vitest'
import {
  NO_HISTORY,
  parseHistory,
  recentSessions,
  recordSession,
  serializeHistory,
  type SessionHistory,
  type SessionRecord,
} from '@/domain/progress'

// Feature progress-and-storage, slice 2: the history of sessions is kept as text (criteria 2–4),
// and saved data that is damaged or of another version reads as none (edge case 1).
//
// The text is JSON: { version: 1, sessions: [...] }, each session
// { finishedAt, exercise, length, questions, accuracy }, the length as in the domain: 10, 20, 50,
// "unlimited" or { minutes: 3 | 5 | 10 }. A session that reached its results has at least one
// question checked; its accuracy is a whole percent.

const DAY = 24 * 60 * 60 * 1000
const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)

const SOME_SESSIONS: SessionRecord[] = [
  {
    finishedAt: OCT_13_2026 - 2 * DAY,
    exercise: 'read',
    length: 20,
    questions: 20,
    accuracy: 85,
  },
  {
    finishedAt: OCT_13_2026 - DAY,
    exercise: 'write',
    length: { minutes: 5 },
    questions: 12,
    accuracy: 100,
  },
  {
    finishedAt: OCT_13_2026,
    exercise: 'read',
    length: 'unlimited',
    questions: 1,
    accuracy: 0,
  },
]

const SOME_HISTORY: SessionHistory = SOME_SESSIONS.reduce(recordSession, NO_HISTORY)

const VALID_SESSION = {
  finishedAt: OCT_13_2026,
  exercise: 'read',
  length: 20,
  questions: 20,
  accuracy: 85,
}

const text = (data: unknown): string => JSON.stringify(data)

const withSession = (changes: Record<string, unknown>): string =>
  text({ version: 1, sessions: [{ ...VALID_SESSION, ...changes }] })

const parsedSessions = (saved: string): readonly SessionRecord[] | null => {
  const parsed = parseHistory(saved)
  return parsed && recentSessions(parsed, OCT_13_2026)
}

describe('the history of sessions as text', () => {
  describe('a round trip', () => {
    it('reads back the history written', () => {
      expect(parseHistory(serializeHistory(SOME_HISTORY))).toEqual(SOME_HISTORY)
    })

    it('reads back no history', () => {
      expect(parseHistory(serializeHistory(NO_HISTORY))).toEqual(NO_HISTORY)
    })

    it('keeps the order of sessions finished at the same time', () => {
      const sameTime: SessionRecord[] = [
        { finishedAt: OCT_13_2026, exercise: 'read', length: 10, questions: 10, accuracy: 90 },
        { finishedAt: OCT_13_2026, exercise: 'read', length: 50, questions: 50, accuracy: 90 },
      ]
      const history = sameTime.reduce(recordSession, NO_HISTORY)

      const parsed = parseHistory(serializeHistory(history))

      expect(parsed && recentSessions(parsed, OCT_13_2026)).toEqual(
        recentSessions(history, OCT_13_2026),
      )
    })

    it('writes the version', () => {
      expect(JSON.parse(serializeHistory(SOME_HISTORY))).toMatchObject({ version: 1 })
    })
  })

  describe('a valid text', () => {
    it('reads a session', () => {
      expect(parsedSessions(withSession({}))).toEqual([VALID_SESSION])
    })

    it('reads an empty list as no history', () => {
      expect(parsedSessions(text({ version: 1, sessions: [] }))).toEqual([])
    })

    it.each(['read', 'write'])('reads the exercise %s', (exercise) => {
      expect(parsedSessions(withSession({ exercise }))).toHaveLength(1)
    })

    it.each<[string, unknown]>([
      ['10', 10],
      ['20', 20],
      ['50', 50],
      ['3 min', { minutes: 3 }],
      ['5 min', { minutes: 5 }],
      ['10 min', { minutes: 10 }],
      ['No limit', 'unlimited'],
    ])('reads the length %s', (_, length) => {
      expect(parsedSessions(withSession({ length }))).toEqual([{ ...VALID_SESSION, length }])
    })

    it.each([
      ['one question', { questions: 1 }],
      ['the accuracy 0%', { accuracy: 0 }],
      ['the accuracy 100%', { accuracy: 100 }],
      ['the time 0', { finishedAt: 0 }],
    ])('reads %s', (_, changes) => {
      expect(parseHistory(withSession(changes))).not.toBeNull()
    })
  })

  describe('damaged data or another version reads as none (edge case 1)', () => {
    it.each([
      ['not JSON', '{"version": 1, "sessions": ['],
      ['empty', ''],
      ['null', 'null'],
      ['a number', '1'],
      ['a list', '[]'],
      ['no version', text({ sessions: [] })],
      ['another version', text({ version: 2, sessions: [] })],
      ['a version as text', text({ version: '1', sessions: [] })],
      ['no sessions', text({ version: 1 })],
      ['sessions not a list', text({ version: 1, sessions: {} })],
      ['a session not an object', text({ version: 1, sessions: [null] })],
      ['a session as a number', text({ version: 1, sessions: [1] })],
      ['a session as a list', text({ version: 1, sessions: [[]] })],
    ])('%s', (_, damaged) => {
      expect(parseHistory(damaged)).toBeNull()
    })

    it('rejects the whole text for one damaged session', () => {
      expect(
        parseHistory(
          text({ version: 1, sessions: [VALID_SESSION, { ...VALID_SESSION, questions: -1 }] }),
        ),
      ).toBeNull()
    })

    it.each<[string, Record<string, unknown>]>([
      ['the time missing', { finishedAt: undefined }],
      ['the time as text', { finishedAt: '2026-10-13' }],
      ['the time negative', { finishedAt: -1 }],
      ['the time fractional', { finishedAt: 1.5 }],
      ['the exercise missing', { exercise: undefined }],
      ['an unknown exercise', { exercise: 'listen' }],
      ['the exercise not text', { exercise: 1 }],
      ['the length missing', { length: undefined }],
      ['a number of questions not offered', { length: 15 }],
      ['a length as text', { length: '20' }],
      ['an unknown length', { length: 'forever' }],
      ['minutes not offered', { length: { minutes: 4 } }],
      ['minutes as text', { length: { minutes: '5' } }],
      ['a length object without minutes', { length: {} }],
      ['a length as null', { length: null }],
      ['the questions missing', { questions: undefined }],
      ['no question checked', { questions: 0 }],
      ['the questions negative', { questions: -1 }],
      ['the questions fractional', { questions: 2.5 }],
      ['the questions as text', { questions: '20' }],
      ['the accuracy missing', { accuracy: undefined }],
      ['the accuracy negative', { accuracy: -1 }],
      ['the accuracy above 100%', { accuracy: 101 }],
      ['the accuracy fractional', { accuracy: 85.5 }],
      ['the accuracy as text', { accuracy: '85' }],
    ])('%s', (_, changes) => {
      expect(parseHistory(withSession(changes))).toBeNull()
    })
  })
})
