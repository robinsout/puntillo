import { isLocale, pickLocale, type Locale } from '@/domain/language'
import type { KeyValueStorage } from '@/application/ports'

const LANGUAGE_KEY = 'puntillo.language'

export interface Preferences {
  readonly language: Locale
  chooseLanguage(language: Locale): void
}

export function createPreferences(
  storage: KeyValueStorage,
  browserLanguages: readonly string[],
): Preferences {
  const saved = storage.get(LANGUAGE_KEY)
  let language = saved !== null && isLocale(saved) ? saved : pickLocale(browserLanguages)
  return {
    get language() {
      return language
    },
    chooseLanguage(chosen) {
      language = chosen
      storage.set(LANGUAGE_KEY, chosen)
    },
  }
}
