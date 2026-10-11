import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'

// Feature m2-write-notes, slice 4, criterion 14: the box Show note names on the staff, for a
// beginner in Write notes, off by default and saved like the other boxes.

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

describe('showing note names on the staff', () => {
  it('is off before the user chooses', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).showNoteNames).toBe(false)
  })

  it('saves nothing before the user chooses', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('is on once chosen, and saved for the next load', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseShowNoteNames(true)

    expect(preferences.showNoteNames).toBe(true)
    expect(createPreferences(storage, ['en']).showNoteNames).toBe(true)
  })

  it('stays off after a reload once turned off again', () => {
    const { storage } = memoryStorage()
    createPreferences(storage, ['en']).chooseShowNoteNames(true)

    createPreferences(storage, ['en']).chooseShowNoteNames(false)

    expect(createPreferences(storage, ['en']).showNoteNames).toBe(false)
  })

  it('is kept apart from the other boxes', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseShowNoteNames(true)

    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.showAnswerAtOnce).toBe(false)
    expect(reloaded.autoAdvance).toBe(false)
    expect(reloaded.exercise).toBe('read')
  })

  it('is kept when another box is chosen', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseShowNoteNames(true)

    preferences.chooseShowAnswerAtOnce(true)
    preferences.chooseExercise('write')

    expect(createPreferences(storage, ['en']).showNoteNames).toBe(true)
  })

  it.each(['', 'yes', '1', 'TRUE', '"true"'])(
    'is off for a saved value that is not true: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).showNoteNames).toBe(false)
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseShowNoteNames(true)

    expect(preferences.showNoteNames).toBe(true)
    expect(createPreferences(storage, ['en']).showNoteNames).toBe(false)
  })
})
