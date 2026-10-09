import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { LOCALES } from '@/domain/language'

// Tests do not depend on the storage keys: a reload is a new scenario over the same storage.
function memoryStorage() {
  const entries = new Map<string, string>()
  const storage: KeyValueStorage = {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
  }
  return { storage, entries }
}

// Whatever key is read, the value is the given one.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
})

// What the storage port promises when the browser storage is unavailable.
const unavailableStorage = (): KeyValueStorage => ({
  get: () => null,
  set: () => {},
})

describe('preferences', () => {
  describe('language before the user chooses one', () => {
    it.each([
      [['ru-RU', 'en'], 'ru'],
      [['es-MX'], 'es'],
      [['de-DE', 'en-GB'], 'en'],
      [['de-DE'], 'en'],
      [[], 'en'],
    ])('follows the browser languages %j: %s', (browser, language) => {
      const { storage } = memoryStorage()

      expect(createPreferences(storage, browser).language).toBe(language)
    })

    it('does not save the language taken from the browser', () => {
      const { storage, entries } = memoryStorage()

      createPreferences(storage, ['ru'])

      expect(entries.size).toBe(0)
    })

    it('follows a changed browser language on the next load', () => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['ru'])

      expect(createPreferences(storage, ['es']).language).toBe('es')
    })
  })

  describe('choosing a language', () => {
    it.each(LOCALES)('makes %s the current language', (language) => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseLanguage(language)

      expect(preferences.language).toBe(language)
    })

    it('saves the language at once, so the next load starts in it', () => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['en']).chooseLanguage('es')

      expect(createPreferences(storage, ['en']).language).toBe('es')
    })

    it('puts the saved language above the browser language', () => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['en']).chooseLanguage('ru')

      expect(createPreferences(storage, ['es-ES', 'en']).language).toBe('ru')
    })

    it('saves a language even when it is the browser one', () => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['ru']).chooseLanguage('ru')

      expect(createPreferences(storage, ['es']).language).toBe('ru')
    })

    it('saves the last of several choices', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseLanguage('ru')
      preferences.chooseLanguage('es')

      expect(createPreferences(storage, ['en']).language).toBe('es')
    })
  })

  describe('a saved value that is not a supported language', () => {
    it.each(['', 'de', 'EN', 'ru-RU', ' ru', '"ru"', '{"language":"ru"}', 'undefined'])(
      'is ignored in favour of the browser language: %j',
      (value) => {
        expect(createPreferences(storageHolding(value), ['es']).language).toBe('es')
      },
    )

    it('is replaced by the next choice', () => {
      const { storage, entries } = memoryStorage()
      createPreferences(storage, ['en']).chooseLanguage('ru')
      for (const key of entries.keys()) entries.set(key, 'klingon')

      createPreferences(storage, ['en']).chooseLanguage('es')

      expect(createPreferences(storage, ['ru']).language).toBe('es')
    })
  })

  describe('with an unavailable storage', () => {
    it('takes the language from the browser', () => {
      expect(createPreferences(unavailableStorage(), ['ru']).language).toBe('ru')
    })

    it('keeps the chosen language until the next load', () => {
      const storage = unavailableStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseLanguage('es')

      expect(preferences.language).toBe('es')
      expect(createPreferences(storage, ['en']).language).toBe('en')
    })
  })
})
