import { isLocale, pickLocale, type Locale } from '@/domain/language'
import { isNoteNaming, isSeventhNote, type NoteNaming, type SeventhNote } from '@/domain/naming'
import type { KeyValueStorage } from '@/application/ports'

const LANGUAGE_KEY = 'puntillo.language'
const NOTE_NAMING_KEY = 'puntillo.noteNaming'
const SEVENTH_NOTE_KEY = 'puntillo.seventhNote'

export interface Preferences {
  readonly language: Locale
  readonly noteNaming: NoteNaming
  readonly seventhNote: SeventhNote
  chooseLanguage(language: Locale): void
  chooseNoteNaming(naming: NoteNaming): void
  chooseSeventhNote(note: SeventhNote): void
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
  }
}
