import {
  canChange,
  changeDifficulty,
  isPreset,
  isSameDifficulty,
  parseDifficulty,
  presetDifficulty,
  serializeDifficulty,
  type Difficulty,
  type DifficultyChange,
  type Preset,
} from '@/domain/difficulty'
import { isLocale, pickLocale, type Locale } from '@/domain/language'
import { isNoteNaming, isSeventhNote, type NoteNaming, type SeventhNote } from '@/domain/naming'
import type { KeyValueStorage } from '@/application/ports'

const LANGUAGE_KEY = 'puntillo.language'
const NOTE_NAMING_KEY = 'puntillo.noteNaming'
const SEVENTH_NOTE_KEY = 'puntillo.seventhNote'
const AUTO_ADVANCE_KEY = 'puntillo.autoAdvance'
const SHOW_ANSWER_AT_ONCE_KEY = 'puntillo.showAnswerAtOnce'
const PRESET_KEY = 'puntillo.preset'
const DIFFICULTY_KEY = 'puntillo.difficulty'

export interface Preferences {
  readonly language: Locale
  readonly noteNaming: NoteNaming
  readonly seventhNote: SeventhNote
  chooseLanguage(language: Locale): void
  chooseNoteNaming(naming: NoteNaming): void
  readonly autoAdvance: boolean
  readonly showAnswerAtOnce: boolean
  readonly canSave: boolean
  chooseSeventhNote(note: SeventhNote): void
  chooseAutoAdvance(on: boolean): void
  chooseShowAnswerAtOnce(on: boolean): void
  readonly preset: Preset
  readonly difficulty: Difficulty
  readonly modified: boolean
  choosePreset(preset: Preset): void
  customize(change: DifficultyChange): void
}

const DEFAULT_PRESET: Preset = 'first-steps'

function loadDifficulty(storage: KeyValueStorage): { preset: Preset; difficulty: Difficulty } {
  const savedPreset = storage.get(PRESET_KEY)
  const savedDifficulty = storage.get(DIFFICULTY_KEY)
  const preset = savedPreset === null ? DEFAULT_PRESET : savedPreset
  const difficulty = savedDifficulty === null ? null : parseDifficulty(savedDifficulty)
  if (!isPreset(preset) || (savedDifficulty !== null && difficulty === null)) {
    return { preset: DEFAULT_PRESET, difficulty: presetDifficulty(DEFAULT_PRESET) }
  }
  return { preset, difficulty: difficulty ?? presetDifficulty(preset) }
}

export function createPreferences(
  storage: KeyValueStorage,
  browserLanguages: readonly string[],
): Preferences {
  const savedLanguage = storage.get(LANGUAGE_KEY)
  let language =
    savedLanguage !== null && isLocale(savedLanguage) ? savedLanguage : pickLocale(browserLanguages)
  const savedNaming = storage.get(NOTE_NAMING_KEY)
  let noteNaming: NoteNaming =
    savedNaming !== null && isNoteNaming(savedNaming) ? savedNaming : 'latin-syllable'
  const savedSeventh = storage.get(SEVENTH_NOTE_KEY)
  let seventhNote: SeventhNote =
    savedSeventh !== null && isSeventhNote(savedSeventh) ? savedSeventh : 'B'
  let autoAdvance = storage.get(AUTO_ADVANCE_KEY) === 'true'
  let showAnswerAtOnce = storage.get(SHOW_ANSWER_AT_ONCE_KEY) === 'true'
  let { preset, difficulty } = loadDifficulty(storage)
  return {
    get language() {
      return language
    },
    get noteNaming() {
      return noteNaming
    },
    get seventhNote() {
      return seventhNote
    },
    get autoAdvance() {
      return autoAdvance
    },
    get showAnswerAtOnce() {
      return showAnswerAtOnce
    },
    get preset() {
      return preset
    },
    get difficulty() {
      return difficulty
    },
    get modified() {
      return !isSameDifficulty(difficulty, presetDifficulty(preset))
    },
    get canSave() {
      return storage.canSave()
    },
    chooseLanguage(chosen) {
      language = chosen
      storage.set(LANGUAGE_KEY, chosen)
    },
    chooseNoteNaming(chosen) {
      noteNaming = chosen
      storage.set(NOTE_NAMING_KEY, chosen)
    },
    chooseSeventhNote(chosen) {
      seventhNote = chosen
      storage.set(SEVENTH_NOTE_KEY, chosen)
    },
    chooseAutoAdvance(on) {
      autoAdvance = on
      storage.set(AUTO_ADVANCE_KEY, String(on))
    },
    chooseShowAnswerAtOnce(on) {
      showAnswerAtOnce = on
      storage.set(SHOW_ANSWER_AT_ONCE_KEY, String(on))
    },
    choosePreset(chosen) {
      preset = chosen
      difficulty = presetDifficulty(chosen)
      storage.set(PRESET_KEY, chosen)
      storage.set(DIFFICULTY_KEY, serializeDifficulty(difficulty))
    },
    customize(change) {
      if (!canChange(difficulty, change)) return
      difficulty = changeDifficulty(difficulty, change)
      storage.set(DIFFICULTY_KEY, serializeDifficulty(difficulty))
    },
  }
}
