import type { Exercise, SessionLength } from '../session'

export interface SessionRecord {
  // Epoch milliseconds.
  readonly finishedAt: number
  readonly exercise: Exercise
  readonly length: SessionLength
  // Checked ones.
  readonly questions: number
  // A whole percent.
  readonly accuracy: number
}

export type SessionSummary = Omit<SessionRecord, 'finishedAt'>

// A plain value, so that it is kept as JSON. The sessions are in the order recorded.
export interface SessionHistory {
  readonly sessions: readonly SessionRecord[]
}

export const NO_HISTORY: SessionHistory = { sessions: [] }

const RECENT_MS = 30 * 24 * 60 * 60 * 1000

const isRecent = (record: SessionRecord, now: number): boolean =>
  record.finishedAt >= now - RECENT_MS

export const recordSession = (
  { sessions }: SessionHistory,
  record: SessionRecord,
): SessionHistory => ({
  sessions: [...sessions.filter((each) => isRecent(each, record.finishedAt)), record],
})

// Reversed before the stable sort, so that of two finished at the same time the later recorded
// comes first.
export const recentSessions = (
  { sessions }: SessionHistory,
  now: number,
): readonly SessionRecord[] =>
  sessions
    .filter((each) => isRecent(each, now))
    .reverse()
    .sort((one, other) => other.finishedAt - one.finishedAt)
