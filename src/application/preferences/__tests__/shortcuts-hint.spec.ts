import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'

// Feature keyboard-shortcuts, criterion 13 and edge case 6: the hint about the keys on the question
// screen is shown until it is closed, and closing it is saved as the preferences are; with the
// storage unavailable it comes back after a reload.

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

describe('the hint about the keys', () => {
  it('is not closed before the user closes it', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).shortcutsHintClosed).toBe(false)
  })

  it('saves nothing before the user closes it', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('can be closed', () => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    preferences.closeShortcutsHint()

    expect(preferences.shortcutsHintClosed).toBe(true)
  })

  it('stays closed on the next load', () => {
    const { storage } = memoryStorage()
    createPreferences(storage, ['en']).closeShortcutsHint()

    expect(createPreferences(storage, ['en']).shortcutsHintClosed).toBe(true)
  })

  it('is saved under puntillo.shortcutsHintClosed', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en']).closeShortcutsHint()

    expect(entries.get('puntillo.shortcutsHintClosed')).toBe('true')
  })

  it('stays closed when another preference changes', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.closeShortcutsHint()

    preferences.chooseExercise('write')
    preferences.choosePlayKeys(false)

    expect(createPreferences(storage, ['en']).shortcutsHintClosed).toBe(true)
  })

  it.each(['', 'True', 'yes', '1', '"true"', 'undefined'])(
    'is not closed for a saved value that is not a choice: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).shortcutsHintClosed).toBe(false)
    },
  )

  it('stays closed until the next load with an unavailable storage (edge case 6)', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.closeShortcutsHint()

    expect(preferences.shortcutsHintClosed).toBe(true)
    expect(createPreferences(storage, ['en']).shortcutsHintClosed).toBe(false)
  })

  describe('replaced by saved preferences', () => {
    it('takes the hint closed as saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.replace({ shortcutsHintClosed: true })

      expect(preferences.shortcutsHintClosed).toBe(true)
      expect(createPreferences(storage, ['en']).shortcutsHintClosed).toBe(true)
    })

    it('shows it again when the saved preferences have it shown', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.closeShortcutsHint()

      preferences.replace({ shortcutsHintClosed: false })

      expect(preferences.shortcutsHintClosed).toBe(false)
      expect(createPreferences(storage, ['en']).shortcutsHintClosed).toBe(false)
    })

    it('shows it again when none is saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.closeShortcutsHint()

      preferences.replace({})

      expect(preferences.shortcutsHintClosed).toBe(false)
      expect(createPreferences(storage, ['en']).shortcutsHintClosed).toBe(false)
    })
  })
})
