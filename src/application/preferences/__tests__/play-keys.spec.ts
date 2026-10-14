import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'

// Feature piano-keyboard, criteria 2 and 16: the sound of the piano keys is on by default, and the
// choice is saved like the other preferences and taken from a file.

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

describe('the sound of the keys', () => {
  it('is on before the user chooses', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).playKeys).toBe(true)
  })

  it('saves nothing before the user chooses', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('can be turned off', () => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    preferences.choosePlayKeys(false)

    expect(preferences.playKeys).toBe(false)
  })

  it('is saved at once, so the next load starts with it', () => {
    const { storage } = memoryStorage()
    createPreferences(storage, ['en']).choosePlayKeys(false)

    expect(createPreferences(storage, ['en']).playKeys).toBe(false)
  })

  it('is saved under puntillo.playKeys', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en']).choosePlayKeys(false)

    expect(entries.get('puntillo.playKeys')).toBe('false')
  })

  it('can be turned on again and stay on', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.choosePlayKeys(false)

    preferences.choosePlayKeys(true)

    expect(preferences.playKeys).toBe(true)
    expect(createPreferences(storage, ['en']).playKeys).toBe(true)
  })

  it('is kept when the note input changes', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseNoteInput('keyboard')
    preferences.choosePlayKeys(false)

    preferences.chooseNoteInput('names')

    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.playKeys).toBe(false)
    expect(reloaded.noteInput).toBe('names')
  })

  it.each(['', 'False', 'off', '0', 'no', '"false"', 'undefined'])(
    'is on for a saved value that is not a choice: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).playKeys).toBe(true)
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.choosePlayKeys(false)

    expect(preferences.playKeys).toBe(false)
    expect(createPreferences(storage, ['en']).playKeys).toBe(true)
  })

  describe('replaced by saved preferences', () => {
    it('takes the sound of the keys saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])

      preferences.replace({ playKeys: false })

      expect(preferences.playKeys).toBe(false)
      expect(createPreferences(storage, ['en']).playKeys).toBe(false)
    })

    it('turns it on when none is saved', () => {
      const { storage } = memoryStorage()
      const preferences = createPreferences(storage, ['en'])
      preferences.choosePlayKeys(false)

      preferences.replace({})

      expect(preferences.playKeys).toBe(true)
      expect(createPreferences(storage, ['en']).playKeys).toBe(true)
    })
  })
})
