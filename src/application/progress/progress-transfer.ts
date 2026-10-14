import type { Preferences } from '@/application/preferences'
import type { FileSaver, WallClock } from '@/application/ports'
import { parseProgressFile, serializeProgressFile, type ProgressFile } from '@/domain/progress'
import type { Progress } from './progress'

export interface ProgressTransfer {
  exportProgress(): void
  // Null when the text is not a whole progress file. Changes nothing.
  readProgressFile(text: string): ProgressFile | null
  importProgress(file: ProgressFile): void
}

const twoDigits = (value: number): string => String(value).padStart(2, '0')

// By the day of the device, as the person sees it, not the UTC one.
function fileName(at: number): string {
  const date = new Date(at)
  const day = `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`
  return `puntillo-progress-${day}.json`
}

export function createProgressTransfer(
  preferences: Preferences,
  progress: Progress,
  clock: WallClock,
  saver: FileSaver,
): ProgressTransfer {
  return {
    exportProgress() {
      const file: ProgressFile = {
        preferences: {
          language: preferences.language,
          noteNaming: preferences.noteNaming,
          seventhNote: preferences.seventhNote,
          autoAdvance: preferences.autoAdvance,
          showAnswerAtOnce: preferences.showAnswerAtOnce,
          preset: preferences.preset,
          difficulty: preferences.difficulty,
          exercise: preferences.exercise,
          showNoteNames: preferences.showNoteNames,
          noteInput: preferences.noteInput,
          playKeys: preferences.playKeys,
          shortcutsHintClosed: preferences.shortcutsHintClosed,
        },
        statistics: progress.statistics,
        history: progress.history,
        session: progress.unfinishedSession,
      }
      saver.save(fileName(clock.now()), serializeProgressFile(file))
    },
    readProgressFile: parseProgressFile,
    importProgress({ preferences: saved, statistics, history, session }) {
      preferences.replace(saved)
      progress.replace(statistics, history, session)
    },
  }
}
