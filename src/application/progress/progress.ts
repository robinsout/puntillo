import {
  hardestNotes,
  NO_HISTORY,
  NO_STATISTICS,
  parseHistory,
  parseSavedSession,
  parseStatistics,
  recentSessions,
  recordAnswers,
  recordSession,
  serializeHistory,
  serializeSavedSession,
  serializeStatistics,
  type ItemAnswer,
  type ItemStats,
  type SavedSession,
  type SessionRecord,
  type SessionSummary,
} from '@/domain/progress'
import type { KeyValueStorage, WallClock } from '@/application/ports'

const STATISTICS_KEY = 'puntillo.statistics'
const HISTORY_KEY = 'puntillo.history'
const SESSION_KEY = 'puntillo.session'
// The storage port cannot remove a key: a discarded session is written as a text read as none.
const NO_SESSION = 'null'

export interface Progress {
  readonly hardestNotes: readonly ItemStats[]
  readonly recentSessions: readonly SessionRecord[]
  recordAnswers(answers: readonly ItemAnswer[]): void
  recordSession(summary: SessionSummary): void
  readonly unfinishedSession: SavedSession | null
  saveSession(saved: SavedSession): void
  discardSession(): void
  readonly canSave: boolean
}

function readSaved<T>(storage: KeyValueStorage, key: string, parse: (text: string) => T | null) {
  const saved = storage.get(key)
  return saved === null ? null : parse(saved)
}

// Without a storage that saves, the statistics, the history and the session not finished are kept until the page is closed,
// as the preferences are.
export function createProgress(storage: KeyValueStorage, clock: WallClock): Progress {
  let statistics = readSaved(storage, STATISTICS_KEY, parseStatistics) ?? NO_STATISTICS
  let history = readSaved(storage, HISTORY_KEY, parseHistory) ?? NO_HISTORY
  let unfinishedSession = readSaved(storage, SESSION_KEY, parseSavedSession)
  return {
    get hardestNotes() {
      return hardestNotes(statistics)
    },
    get recentSessions() {
      return recentSessions(history, clock.now())
    },
    get canSave() {
      return storage.canSave()
    },
    recordAnswers(answers) {
      statistics = recordAnswers(statistics, answers, clock.now())
      storage.set(STATISTICS_KEY, serializeStatistics(statistics))
    },
    recordSession(summary) {
      history = recordSession(history, { finishedAt: clock.now(), ...summary })
      storage.set(HISTORY_KEY, serializeHistory(history))
    },
    get unfinishedSession() {
      return unfinishedSession
    },
    saveSession(saved) {
      unfinishedSession = saved
      storage.set(SESSION_KEY, serializeSavedSession(saved))
    },
    discardSession() {
      unfinishedSession = null
      storage.set(SESSION_KEY, NO_SESSION)
    },
  }
}
