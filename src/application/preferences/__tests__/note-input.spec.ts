import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'

// Feature piano-keyboard, criteria 1 and 16: the note input of Read notes, the names of the notes
// by default or the piano keyboard, is saved like the other preferences and taken from a file.

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

describe('the note input', () => {
  it('is the names of the notes before the user chooses one', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).noteInput).toBe('names')
  })

  it('saves nothing before the user chooses one', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('becomes the chosen one', () => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    preferences.chooseNoteInput('keyboard')

    expect(preferences.noteInput).toBe('keyboard')
  })

  it('is saved at once, so the next load starts with it', () => {
    const { storage } = memoryStorage()
    createPreferences(storage, ['en']).chooseNoteInput('keyboard')

    expect(createPreferences(storage, ['en']).noteInput).toBe('keyboard')
  })

  it('is saved under puntillo.noteInput', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en']).chooseNoteInput('keyboard')

    expect(entries.get('puntillo.noteInput')).toBe('keyboard')
  })

  it('can go back to the names and keep them', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseNoteInput('keyboard')

    preferences.chooseNoteInput('names')

    expect(createPreferences(storage, ['en']).noteInput).toBe('names')
  })

  it('keeps the other preferences', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseLanguage('ru')
    preferences.chooseNoteNaming('letter')
    preferences.chooseExercise('write')

    preferences.chooseNoteInput('keyboard')

    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.language).toBe('ru')
    expect(reloaded.noteNaming).toBe('letter')
    expect(reloaded.exercise).toBe('write')
    expect(reloaded.noteInput).toBe('keyboard')
  })

  it('is kept when another preference is chosen', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseNoteInput('keyboard')

    preferences.chooseNoteNaming('letter')
    preferences.chooseExercise('write')

    expect(createPreferences(storage, ['en']).noteInput).toBe('keyboard')
  })

  it.each(['', 'Keyboard', 'piano', 'true', '"keyboard"', 'undefined'])(
    'is the names for a saved value that is not a note input: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).noteInput).toBe('names')
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseNoteInput('keyboard')

    expect(preferences.noteInput).toBe('keyboard')
    expect(createPreferences(storage, ['en']).noteInput).toBe('names')
  })

  describe('replaced by saved preferences', () => {
    it('takes the note input saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.replace({ noteInput: 'keyboard' })

      expect(preferences.noteInput).toBe('keyboard')
      expect(createPreferences(storage, ['en']).noteInput).toBe('keyboard')
    })

    it('takes the names when none is saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.chooseNoteInput('keyboard')

      preferences.replace({})

      expect(preferences.noteInput).toBe('names')
      expect(createPreferences(storage, ['en']).noteInput).toBe('names')
    })
  })
})
