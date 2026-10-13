import {
  hardestNotes,
  NO_STATISTICS,
  parseStatistics,
  recordAnswers,
  serializeStatistics,
  type ItemAnswer,
  type ItemStats,
} from '@/domain/progress'
import type { KeyValueStorage, WallClock } from '@/application/ports'

const STATISTICS_KEY = 'puntillo.statistics'

export interface Progress {
  readonly hardestNotes: readonly ItemStats[]
  recordAnswers(answers: readonly ItemAnswer[]): void
  readonly canSave: boolean
}

// Without a storage that saves, the statistics are kept until the page is closed, as the
// preferences are.
export function createProgress(storage: KeyValueStorage, clock: WallClock): Progress {
  const saved = storage.get(STATISTICS_KEY)
  let statistics = (saved === null ? null : parseStatistics(saved)) ?? NO_STATISTICS
  return {
    get hardestNotes() {
      return hardestNotes(statistics)
    },
    get canSave() {
      return storage.canSave()
    },
    recordAnswers(answers) {
      statistics = recordAnswers(statistics, answers, clock.now())
      storage.set(STATISTICS_KEY, serializeStatistics(statistics))
    },
  }
}
