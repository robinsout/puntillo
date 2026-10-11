import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'

// Feature m2-write-notes, criterion 1: the exercise, Read notes (M1) by default or Write notes
// (M2), is saved like the other preferences.

// Tests do not depend on the storage keys: a reload is a new scenario over the same storage.
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

describe('the exercise', () => {
  it('is reading notes before the user chooses one', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).exercise).toBe('read')
  })

  it('saves nothing before the user chooses one', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('becomes the chosen one', () => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    preferences.chooseExercise('write')

    expect(preferences.exercise).toBe('write')
  })

  it('is saved at once, so the next load starts in it', () => {
    const { storage } = memoryStorage()
    createPreferences(storage, ['en']).chooseExercise('write')

    expect(createPreferences(storage, ['en']).exercise).toBe('write')
  })

  it('can go back to reading notes and keep it', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseExercise('write')

    preferences.chooseExercise('read')

    expect(createPreferences(storage, ['en']).exercise).toBe('read')
  })

  it('keeps the other preferences', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseLanguage('ru')
    preferences.chooseNoteNaming('letter')
    preferences.choosePreset('advanced')

    preferences.chooseExercise('write')

    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.language).toBe('ru')
    expect(reloaded.noteNaming).toBe('letter')
    expect(reloaded.preset).toBe('advanced')
    expect(reloaded.exercise).toBe('write')
  })

  it('is kept when another preference is chosen', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseExercise('write')

    preferences.chooseAutoAdvance(true)
    preferences.choosePreset('confident-reading')

    expect(createPreferences(storage, ['en']).exercise).toBe('write')
  })

  it.each(['', 'Write', 'm2', 'true', '"write"', 'undefined'])(
    'is reading notes for a saved value that is not an exercise: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).exercise).toBe('read')
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseExercise('write')

    expect(preferences.exercise).toBe('write')
    expect(createPreferences(storage, ['en']).exercise).toBe('read')
  })
})
