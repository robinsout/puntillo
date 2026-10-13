import {
  hardestNotes,
  NO_HISTORY,
  NO_STATISTICS,
  parseHistory,
  parseStatistics,
  recentSessions,
  recordAnswers,
  recordSession,
  serializeHistory,
  serializeStatistics,
  type ItemAnswer,
  type ItemStats,
  type SessionRecord,
  type SessionSummary,
} from '@/domain/progress'
import type { KeyValueStorage, WallClock } from '@/application/ports'

const STATISTICS_KEY = 'puntillo.statistics'
const HISTORY_KEY = 'puntillo.history'

export interface Progress {
  readonly hardestNotes: readonly ItemStats[]
  readonly recentSessions: readonly SessionRecord[]
  recordAnswers(answers: readonly ItemAnswer[]): void
  recordSession(summary: SessionSummary): void
  readonly canSave: boolean
}

function readSaved<T>(storage: KeyValueStorage, key: string, parse: (text: string) => T | null) {
  const saved = storage.get(key)
  return saved === null ? null : parse(saved)
}

// Without a storage that saves, the statistics and the history are kept until the page is closed,
// as the preferences are.
export function createProgress(storage: KeyValueStorage, clock: WallClock): Progress {
  let statistics = readSaved(storage, STATISTICS_KEY, parseStatistics) ?? NO_STATISTICS
  let history = readSaved(storage, HISTORY_KEY, parseHistory) ?? NO_HISTORY
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
  }
}
