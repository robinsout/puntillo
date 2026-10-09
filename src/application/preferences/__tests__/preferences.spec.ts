import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { LOCALES } from '@/domain/language'
import { NOTE_NAMINGS, SEVENTH_NOTES } from '@/domain/naming'

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

  describe('note naming before the user chooses one', () => {
    it('is do, re, mi whatever the language', () => {
      for (const browser of [['en'], ['ru'], ['es'], ['de']]) {
        expect(createPreferences(memoryStorage().storage, browser).noteNaming).toBe(
          'latin-syllable',
        )
      }
    })

    it('saves nothing', () => {
      const { storage, entries } = memoryStorage()

      const preferences = createPreferences(storage, ['ru'])

      expect(preferences.noteNaming).toBe('latin-syllable')
      expect(entries.size).toBe(0)
    })
  })

  describe('choosing a note naming', () => {
    it.each(NOTE_NAMINGS)('makes %s the current naming', (naming) => {
      const preferences = createPreferences(memoryStorage().storage, ['en'])

      preferences.chooseNoteNaming(naming)

      expect(preferences.noteNaming).toBe(naming)
    })

    it.each(NOTE_NAMINGS)('saves %s at once, so the next load starts with it', (naming) => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['en']).chooseNoteNaming(naming)

      expect(createPreferences(storage, ['en']).noteNaming).toBe(naming)
    })

    it('saves the last of several choices', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseNoteNaming('letter')
      preferences.chooseNoteNaming('cyrillic-syllable')

      expect(createPreferences(storage, ['en']).noteNaming).toBe('cyrillic-syllable')
    })

    it('can go back to do, re, mi and keep it', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseNoteNaming('letter')
      preferences.chooseNoteNaming('latin-syllable')

      expect(createPreferences(storage, ['en']).noteNaming).toBe('latin-syllable')
    })
  })

  // Feature criterion 6: the naming and the language are chosen independently.
  describe('note naming and language', () => {
    it('keeps the language when a naming is chosen', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['es'])

      preferences.chooseNoteNaming('cyrillic-syllable')

      expect(preferences.language).toBe('es')
    })

    it('keeps the naming when a language is chosen', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.chooseNoteNaming('letter')

      preferences.chooseLanguage('ru')

      expect(preferences.noteNaming).toBe('letter')
    })

    it('saves both side by side', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseLanguage('ru')
      preferences.chooseNoteNaming('letter')
      preferences.chooseLanguage('es')

      const reloaded = createPreferences(storage, ['en'])
      expect(reloaded.language).toBe('es')
      expect(reloaded.noteNaming).toBe('letter')
    })

    it('does not save the browser language when only a naming is chosen', () => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['ru']).chooseNoteNaming('letter')

      expect(createPreferences(storage, ['es']).language).toBe('es')
    })
  })

  describe('a saved value that is not a note naming', () => {
    it.each(['', 'Letter', 'C, D, E', 'do, re, mi', ' letter', '"letter"', 'ru', 'undefined'])(
      'is ignored in favour of do, re, mi: %j',
      (value) => {
        expect(createPreferences(storageHolding(value), ['en']).noteNaming).toBe('latin-syllable')
      },
    )

    it('is replaced by the next choice', () => {
      const { storage, entries } = memoryStorage()
      createPreferences(storage, ['en']).chooseNoteNaming('letter')
      for (const key of entries.keys()) entries.set(key, 'klingon')

      createPreferences(storage, ['en']).chooseNoteNaming('cyrillic-syllable')

      expect(createPreferences(storage, ['en']).noteNaming).toBe('cyrillic-syllable')
    })
  })

  describe('note naming with an unavailable storage', () => {
    it('is do, re, mi', () => {
      expect(createPreferences(unavailableStorage(), ['ru']).noteNaming).toBe('latin-syllable')
    })

    it('keeps the chosen naming until the next load', () => {
      const storage = unavailableStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseNoteNaming('letter')

      expect(preferences.noteNaming).toBe('letter')
      expect(createPreferences(storage, ['en']).noteNaming).toBe('latin-syllable')
    })
  })

  // Feature criteria 7 and 8: B or H, remembered whatever the naming.
  describe('seventh note before the user chooses one', () => {
    it('is B whatever the language', () => {
      for (const browser of [['en'], ['ru'], ['es'], ['de']]) {
        expect(createPreferences(memoryStorage().storage, browser).seventhNote).toBe('B')
      }
    })

    it('saves nothing', () => {
      const { storage, entries } = memoryStorage()

      expect(createPreferences(storage, ['de']).seventhNote).toBe('B')
      expect(entries.size).toBe(0)
    })
  })

  describe('choosing a seventh note', () => {
    it.each(SEVENTH_NOTES)('makes %s the current one', (note) => {
      const preferences = createPreferences(memoryStorage().storage, ['en'])
      preferences.chooseNoteNaming('letter')

      preferences.chooseSeventhNote(note)

      expect(preferences.seventhNote).toBe(note)
    })

    it.each(SEVENTH_NOTES)('saves %s at once, so the next load starts with it', (note) => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['en']).chooseSeventhNote(note)

      expect(createPreferences(storage, ['en']).seventhNote).toBe(note)
    })

    it('can go back to B and keep it', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseSeventhNote('H')
      preferences.chooseSeventhNote('B')

      expect(createPreferences(storage, ['en']).seventhNote).toBe('B')
    })

    it('does not save the browser language', () => {
      const { storage } = memoryStorage()
      createPreferences(storage, ['ru']).chooseSeventhNote('H')

      expect(createPreferences(storage, ['es']).language).toBe('es')
    })
  })

  describe('seventh note and note naming', () => {
    it('keeps the naming when a seventh note is chosen', () => {
      const preferences = createPreferences(memoryStorage().storage, ['en'])
      preferences.chooseNoteNaming('letter')

      preferences.chooseSeventhNote('H')

      expect(preferences.noteNaming).toBe('letter')
    })

    it('is remembered while another naming is chosen', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.chooseNoteNaming('letter')
      preferences.chooseSeventhNote('H')

      preferences.chooseNoteNaming('cyrillic-syllable')
      expect(preferences.seventhNote).toBe('H')
      expect(createPreferences(storage, ['en']).seventhNote).toBe('H')

      preferences.chooseNoteNaming('letter')
      expect(preferences.seventhNote).toBe('H')
    })

    it('keeps the language when a seventh note is chosen', () => {
      const preferences = createPreferences(memoryStorage().storage, ['en'])
      preferences.chooseLanguage('ru')

      preferences.chooseSeventhNote('H')

      expect(preferences.language).toBe('ru')
    })

    it('is saved side by side with the language and the naming', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseNoteNaming('letter')
      preferences.chooseSeventhNote('H')
      preferences.chooseLanguage('es')

      const reloaded = createPreferences(storage, ['en'])
      expect(reloaded.language).toBe('es')
      expect(reloaded.noteNaming).toBe('letter')
      expect(reloaded.seventhNote).toBe('H')
    })
  })

  describe('a saved value that is not a seventh note', () => {
    it.each(['', 'h', 'b', ' H', 'H ', '"H"', '{"seventhNote":"H"}', 'letter', 'undefined'])(
      'is ignored in favour of B: %j',
      (value) => {
        expect(createPreferences(storageHolding(value), ['en']).seventhNote).toBe('B')
      },
    )

    it('is replaced by the next choice', () => {
      const { storage, entries } = memoryStorage()
      createPreferences(storage, ['en']).chooseSeventhNote('B')
      for (const key of entries.keys()) entries.set(key, 'klingon')

      createPreferences(storage, ['en']).chooseSeventhNote('H')

      expect(createPreferences(storage, ['en']).seventhNote).toBe('H')
    })
  })

  describe('seventh note with an unavailable storage', () => {
    it('is B', () => {
      expect(createPreferences(unavailableStorage(), ['en']).seventhNote).toBe('B')
    })

    it('keeps the chosen one until the next load', () => {
      const storage = unavailableStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.chooseSeventhNote('H')

      expect(preferences.seventhNote).toBe('H')
      expect(createPreferences(storage, ['en']).seventhNote).toBe('B')
    })
  })
})
