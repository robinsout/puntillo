import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { SESSION_LENGTHS } from '@/domain/session'

// Feature navigation-and-settings, criterion 14: the session length is chosen on the start screen,
// 10 by default, and saved like the other preferences; with an unavailable storage it holds until
// the next load (edge case 3).

// Tests do not depend on the storage keys or on how a length is written: a reload is a new
// scenario over the same storage.
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

describe('the session length', () => {
  it('is 10 before the user chooses one', () => {
    expect(createPreferences(memoryStorage().storage, ['en']).sessionLength).toBe(10)
  })

  it('saves nothing before the user chooses one', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it.each(SESSION_LENGTHS)('becomes the chosen one: %j', (length) => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    preferences.chooseSessionLength(length)

    expect(preferences.sessionLength).toEqual(length)
  })

  it.each(SESSION_LENGTHS)('is saved at once, so the next load starts with it: %j', (length) => {
    const { storage } = memoryStorage()
    createPreferences(storage, ['en']).chooseSessionLength(length)

    expect(createPreferences(storage, ['en']).sessionLength).toEqual(length)
  })

  it('can go back to 10 and keep it', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseSessionLength({ minutes: 5 })

    preferences.chooseSessionLength(10)

    expect(createPreferences(storage, ['en']).sessionLength).toBe(10)
  })

  it('keeps the other preferences', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseExercise('write')
    preferences.choosePreset('advanced')

    preferences.chooseSessionLength('unlimited')

    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.exercise).toBe('write')
    expect(reloaded.preset).toBe('advanced')
  })

  it('is kept when the exercise and the preset change', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseSessionLength(50)

    preferences.chooseExercise('write')
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength: 'one-note' })

    expect(preferences.sessionLength).toBe(50)
    expect(createPreferences(storage, ['en']).sessionLength).toBe(50)
  })

  it.each(['', '15', '0', 'forever', 'Unlimited', '{"minutes":4}', '{}', '[]', 'null', 'true'])(
    'is 10 for a saved value that is not a length: %j',
    (value) => {
      expect(createPreferences(storageHolding(value), ['en']).sessionLength).toBe(10)
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.chooseSessionLength({ minutes: 3 })

    expect(preferences.sessionLength).toEqual({ minutes: 3 })
    expect(createPreferences(storage, ['en']).sessionLength).toBe(10)
  })
})

describe('replaced by saved preferences', () => {
  it('takes the session length saved', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.replace({ sessionLength: { minutes: 10 } })

    expect(preferences.sessionLength).toEqual({ minutes: 10 })
    expect(createPreferences(storage, ['en']).sessionLength).toEqual({ minutes: 10 })
  })

  it('takes 10 when none is saved, as in a file written before the choice (edge case 2)', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseSessionLength('unlimited')

    preferences.replace({})

    expect(preferences.sessionLength).toBe(10)
    expect(createPreferences(storage, ['en']).sessionLength).toBe(10)
  })
})
