import { isLocale, pickLocale, type Locale } from '@/domain/language'
import { isNoteNaming, type NoteNaming } from '@/domain/naming'
import type { KeyValueStorage } from '@/application/ports'

const LANGUAGE_KEY = 'puntillo.language'
const NOTE_NAMING_KEY = 'puntillo.noteNaming'

export interface Preferences {
  readonly language: Locale
  readonly noteNaming: NoteNaming
  chooseLanguage(language: Locale): void
  chooseNoteNaming(naming: NoteNaming): void
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
  return {
    get language() {
      return language
    },
    get noteNaming() {
      return noteNaming
    },
    chooseLanguage(chosen) {
      language = chosen
      storage.set(LANGUAGE_KEY, chosen)
    },
    chooseNoteNaming(chosen) {
      noteNaming = chosen
      storage.set(NOTE_NAMING_KEY, chosen)
    },
  }
}
