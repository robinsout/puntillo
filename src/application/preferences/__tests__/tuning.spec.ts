import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'

// Feature microphone-input, slice 3, criterion 2: the instrument played into the microphone, in C
// by default or in B♭, is saved like the other preferences and taken from a file. It is kept
// whatever the note input, so it is there again when Microphone is chosen.

// A reload is a new scenario over the same storage. The key is checked once: it is the one the
// stores of the browser keep.
function memoryStorage() {
  const entries = new Map<string, string>()
  const storage: KeyValueStorage = {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
    canSave: () => true,
  }
  return { storage, entries }
}

// Whatever key is read, the value is the given one.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

const unavailableStorage = (): KeyValueStorage => ({
  get: () => null,
  set: () => {},
  canSave: () => false,
})

describe('the tuning of the instrument', () => {
  it('is C before the user chooses one', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).tuning).toBe('c')
  })

  it('saves nothing before the user chooses one', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('becomes the chosen one', () => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    preferences.chooseTuning('b-flat')

    expect(preferences.tuning).toBe('b-flat')
  })

  it('is saved at once under puntillo.tuning, so the next load starts with it', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en']).chooseTuning('b-flat')

    expect(entries.get('puntillo.tuning')).toBe('b-flat')
    expect(createPreferences(storage, ['en']).tuning).toBe('b-flat')
  })

  it('can go back to C and keep it', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseTuning('b-flat')

    preferences.chooseTuning('c')

    expect(createPreferences(storage, ['en']).tuning).toBe('c')
  })

  it('is kept when another note input is chosen', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseNoteInput('microphone')
    preferences.chooseTuning('b-flat')

    preferences.chooseNoteInput('keyboard')
    preferences.chooseNoteInput('microphone')

    expect(preferences.tuning).toBe('b-flat')
    expect(createPreferences(storage, ['en']).tuning).toBe('b-flat')
  })

  it('keeps the other preferences', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseLanguage('ru')
    preferences.chooseNoteInput('microphone')

    preferences.chooseTuning('b-flat')

    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.language).toBe('ru')
    expect(reloaded.noteInput).toBe('microphone')
  })

  it.each(['', 'C', 'B-flat', 'bb', 'e-flat', 'true', '"b-flat"', 'undefined'])(
    'is C for a saved value that is not a tuning: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).tuning).toBe('c')
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseTuning('b-flat')

    expect(preferences.tuning).toBe('b-flat')
    expect(createPreferences(storage, ['en']).tuning).toBe('c')
  })

  describe('replaced by saved preferences', () => {
    it('takes the tuning saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.replace({ tuning: 'b-flat' })

      expect(preferences.tuning).toBe('b-flat')
      expect(createPreferences(storage, ['en']).tuning).toBe('b-flat')
    })

    it('takes C when none is saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.chooseTuning('b-flat')

      preferences.replace({})

      expect(preferences.tuning).toBe('c')
      expect(createPreferences(storage, ['en']).tuning).toBe('c')
    })
  })
})
