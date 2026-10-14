import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'

// Feature midi-input, criteria 1 and 7: the MIDI keyboard and the sound of its keys are off by
// default, and each choice is saved like the other preferences and taken from a file.

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

interface Flag {
  readonly name: string
  readonly key: string
  readonly read: (preferences: Preferences) => boolean
  readonly choose: (preferences: Preferences, on: boolean) => void
}

const FLAGS: readonly Flag[] = [
  {
    name: 'the MIDI keyboard',
    key: 'puntillo.useMidi',
    read: (preferences) => preferences.useMidi,
    choose: (preferences, on) => preferences.chooseUseMidi(on),
  },
  {
    name: 'the sound of the MIDI keys',
    key: 'puntillo.midiSound',
    read: (preferences) => preferences.midiSound,
    choose: (preferences, on) => preferences.chooseMidiSound(on),
  },
]

describe.each(FLAGS)('$name', ({ key, read, choose }) => {
  it('is off before the user chooses', () => {
    expect(read(createPreferences(memoryStorage().storage, ['en']))).toBe(false)
  })

  it('saves nothing before the user chooses', () => {
    const { storage, entries } = memoryStorage()

    createPreferences(storage, ['en'])

    expect(entries.size).toBe(0)
  })

  it('can be turned on', () => {
    const preferences = createPreferences(memoryStorage().storage, ['en'])

    choose(preferences, true)

    expect(read(preferences)).toBe(true)
  })

  it('is saved at once, so the next load starts with it', () => {
    const { storage } = memoryStorage()
    choose(createPreferences(storage, ['en']), true)

    expect(read(createPreferences(storage, ['en']))).toBe(true)
  })

  it('is saved under its key', () => {
    const { storage, entries } = memoryStorage()

    choose(createPreferences(storage, ['en']), true)

    expect(entries.get(key)).toBe('true')
  })

  it('can be turned off again and stay off', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    choose(preferences, true)

    choose(preferences, false)

    expect(read(preferences)).toBe(false)
    expect(read(createPreferences(storage, ['en']))).toBe(false)
  })

  it('is kept when the note input and the exercise change', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseNoteInput('keyboard')
    choose(preferences, true)

    preferences.chooseNoteInput('names')
    preferences.chooseExercise('write')

    expect(read(createPreferences(storage, ['en']))).toBe(true)
  })

  it.each(['', 'True', 'on', '1', 'yes', '"true"', 'undefined'])(
    'is off for a saved value that is not a choice: %j',
    (value) => {
      expect(read(createPreferences(storageHolding(value), ['en']))).toBe(false)
    },
  )

  it('keeps the choice until the next load with an unavailable storage', () => {
    const storage = unavailableStorage()
    const preferences = createPreferences(storage, ['en'])

    choose(preferences, true)

    expect(read(preferences)).toBe(true)
    expect(read(createPreferences(storage, ['en']))).toBe(false)
  })
})

describe('replaced by saved preferences', () => {
  it('takes the MIDI keyboard and its sound saved', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.replace({ useMidi: true, midiSound: true })

    expect(preferences.useMidi).toBe(true)
    expect(preferences.midiSound).toBe(true)
    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.useMidi).toBe(true)
    expect(reloaded.midiSound).toBe(true)
  })

  it('turns them off when none is saved', () => {
    const { storage } = memoryStorage()
    const preferences = createPreferences(storage, ['en'])
    preferences.chooseUseMidi(true)
    preferences.chooseMidiSound(true)

    preferences.replace({})

    expect(preferences.useMidi).toBe(false)
    expect(preferences.midiSound).toBe(false)
    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.useMidi).toBe(false)
    expect(reloaded.midiSound).toBe(false)
  })
})
