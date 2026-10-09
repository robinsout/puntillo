import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { presetDifficulty } from '@/domain/difficulty'

// Feature multi-note-questions, slice 1: the question length is a value of the panel Customize,
// kept between loads like the others (criterion 1).

function memoryStorage(): KeyValueStorage {
  const entries = new Map<string, string>()
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
    canSave: () => true,
  }
}

describe('the question length in the preferences', () => {
  it('is one note for a new user', () => {
    expect(createPreferences(memoryStorage(), ['en']).difficulty.questionLength).toBe('one-note')
  })

  it('changes to two to four notes, marks the preset modified and is kept after a reload', () => {
    const storage = memoryStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.customize({ questionLength: 'two-to-four-notes' })

    expect(preferences.difficulty).toEqual({
      ...presetDifficulty('first-steps'),
      questionLength: 'two-to-four-notes',
    })
    expect(preferences.modified).toBe(true)
    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.difficulty.questionLength).toBe('two-to-four-notes')
    expect(reloaded.modified).toBe(true)
  })

  it('goes back to one note with the preset chosen again', () => {
    const preferences = createPreferences(memoryStorage(), ['en'])
    preferences.customize({ questionLength: 'two-to-four-notes' })

    preferences.choosePreset('first-steps')

    expect(preferences.difficulty.questionLength).toBe('one-note')
    expect(preferences.modified).toBe(false)
  })

  it('is not changed to several notes with the whole note alone', () => {
    const preferences = createPreferences(memoryStorage(), ['en'])
    preferences.customize({ duration: 'whole', on: true })
    preferences.customize({ duration: 'half', on: false })
    preferences.customize({ duration: 'quarter', on: false })

    preferences.customize({ questionLength: 'two-to-four-notes' })

    expect(preferences.difficulty.questionLength).toBe('one-note')
  })
})
