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
import { isExercise, isNoteInput, type Exercise, type NoteInput } from '@/domain/session'
import { isLocale, pickLocale, type Locale } from '@/domain/language'
import { isNoteNaming, isSeventhNote, type NoteNaming, type SeventhNote } from '@/domain/naming'
import type { SavedPreferences } from '@/domain/progress'
import type { KeyValueStorage } from '@/application/ports'

const LANGUAGE_KEY = 'puntillo.language'
const NOTE_NAMING_KEY = 'puntillo.noteNaming'
const SEVENTH_NOTE_KEY = 'puntillo.seventhNote'
const AUTO_ADVANCE_KEY = 'puntillo.autoAdvance'
const SHOW_ANSWER_AT_ONCE_KEY = 'puntillo.showAnswerAtOnce'
const PRESET_KEY = 'puntillo.preset'
const DIFFICULTY_KEY = 'puntillo.difficulty'
const EXERCISE_KEY = 'puntillo.exercise'
const SHOW_NOTE_NAMES_KEY = 'puntillo.showNoteNames'
const NOTE_INPUT_KEY = 'puntillo.noteInput'
const PLAY_KEYS_KEY = 'puntillo.playKeys'
const SHORTCUTS_HINT_CLOSED_KEY = 'puntillo.shortcutsHintClosed'
const USE_MIDI_KEY = 'puntillo.useMidi'
const MIDI_SOUND_KEY = 'puntillo.midiSound'

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
  readonly exercise: Exercise
  chooseExercise(exercise: Exercise): void
  // A hint for a beginner in Write notes: the written note named on the staff.
  readonly showNoteNames: boolean
  chooseShowNoteNames(on: boolean): void
  // How Read notes is answered: with the names of the notes or on the piano keyboard.
  readonly noteInput: NoteInput
  chooseNoteInput(input: NoteInput): void
  // Whether a piano key pressed sounds.
  readonly playKeys: boolean
  choosePlayKeys(on: boolean): void
  // The hint about the keys on the question screen, shown until it is closed.
  readonly shortcutsHintClosed: boolean
  closeShortcutsHint(): void
  // Whether Read notes on the piano keyboard is also answered from a MIDI instrument.
  readonly useMidi: boolean
  chooseUseMidi(on: boolean): void
  // Whether a key pressed on the MIDI instrument sounds.
  readonly midiSound: boolean
  chooseMidiSound(on: boolean): void
  // Puts the saved preferences in place of all of them: one left out takes its default.
  replace(saved: SavedPreferences): void
}

const DEFAULT_PRESET: Preset = 'first-steps'
const DEFAULT_NOTE_NAMING: NoteNaming = 'latin-syllable'
const DEFAULT_SEVENTH_NOTE: SeventhNote = 'B'
const DEFAULT_EXERCISE: Exercise = 'read'
const DEFAULT_NOTE_INPUT: NoteInput = 'names'

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
    savedNaming !== null && isNoteNaming(savedNaming) ? savedNaming : DEFAULT_NOTE_NAMING
  const savedSeventh = storage.get(SEVENTH_NOTE_KEY)
  let seventhNote: SeventhNote =
    savedSeventh !== null && isSeventhNote(savedSeventh) ? savedSeventh : DEFAULT_SEVENTH_NOTE
  let autoAdvance = storage.get(AUTO_ADVANCE_KEY) === 'true'
  let showAnswerAtOnce = storage.get(SHOW_ANSWER_AT_ONCE_KEY) === 'true'
  let showNoteNames = storage.get(SHOW_NOTE_NAMES_KEY) === 'true'
  let { preset, difficulty } = loadDifficulty(storage)
  const savedExercise = storage.get(EXERCISE_KEY)
  let exercise: Exercise =
    savedExercise !== null && isExercise(savedExercise) ? savedExercise : DEFAULT_EXERCISE
  const savedInput = storage.get(NOTE_INPUT_KEY)
  let noteInput: NoteInput =
    savedInput !== null && isNoteInput(savedInput) ? savedInput : DEFAULT_NOTE_INPUT
  let playKeys = storage.get(PLAY_KEYS_KEY) !== 'false'
  let shortcutsHintClosed = storage.get(SHORTCUTS_HINT_CLOSED_KEY) === 'true'
  let useMidi = storage.get(USE_MIDI_KEY) === 'true'
  let midiSound = storage.get(MIDI_SOUND_KEY) === 'true'
  function setShortcutsHintClosed(closed: boolean) {
    shortcutsHintClosed = closed
    storage.set(SHORTCUTS_HINT_CLOSED_KEY, String(closed))
  }
  const preferences: Preferences = {
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
    get showNoteNames() {
      return showNoteNames
    },
    get exercise() {
      return exercise
    },
    get noteInput() {
      return noteInput
    },
    get playKeys() {
      return playKeys
    },
    get shortcutsHintClosed() {
      return shortcutsHintClosed
    },
    get useMidi() {
      return useMidi
    },
    get midiSound() {
      return midiSound
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
    chooseShowNoteNames(on) {
      showNoteNames = on
      storage.set(SHOW_NOTE_NAMES_KEY, String(on))
    },
    chooseExercise(chosen) {
      exercise = chosen
      storage.set(EXERCISE_KEY, chosen)
    },
    chooseNoteInput(chosen) {
      noteInput = chosen
      storage.set(NOTE_INPUT_KEY, chosen)
    },
    choosePlayKeys(on) {
      playKeys = on
      storage.set(PLAY_KEYS_KEY, String(on))
    },
    chooseUseMidi(on) {
      useMidi = on
      storage.set(USE_MIDI_KEY, String(on))
    },
    chooseMidiSound(on) {
      midiSound = on
      storage.set(MIDI_SOUND_KEY, String(on))
    },
    closeShortcutsHint() {
      setShortcutsHintClosed(true)
    },
    customize(change) {
      if (!canChange(difficulty, change)) return
      difficulty = changeDifficulty(difficulty, change)
      storage.set(DIFFICULTY_KEY, serializeDifficulty(difficulty))
    },
    replace(saved) {
      preferences.chooseLanguage(saved.language ?? pickLocale(browserLanguages))
      preferences.chooseNoteNaming(saved.noteNaming ?? DEFAULT_NOTE_NAMING)
      preferences.chooseSeventhNote(saved.seventhNote ?? DEFAULT_SEVENTH_NOTE)
      preferences.chooseAutoAdvance(saved.autoAdvance ?? false)
      preferences.chooseShowAnswerAtOnce(saved.showAnswerAtOnce ?? false)
      preferences.choosePreset(saved.preset ?? DEFAULT_PRESET)
      if (saved.difficulty) {
        difficulty = saved.difficulty
        storage.set(DIFFICULTY_KEY, serializeDifficulty(difficulty))
      }
      preferences.chooseExercise(saved.exercise ?? DEFAULT_EXERCISE)
      preferences.chooseShowNoteNames(saved.showNoteNames ?? false)
      preferences.chooseNoteInput(saved.noteInput ?? DEFAULT_NOTE_INPUT)
      preferences.choosePlayKeys(saved.playKeys ?? true)
      setShortcutsHintClosed(saved.shortcutsHintClosed ?? false)
      preferences.chooseUseMidi(saved.useMidi ?? false)
      preferences.chooseMidiSound(saved.midiSound ?? false)
    },
  }
  return preferences
}
