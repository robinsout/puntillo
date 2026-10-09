import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { presetDifficulty } from '@/domain/difficulty'

// Feature multi-note-questions, slice 3: the time signatures and the lengths of bars are values of
// the panel Customize, kept between loads like the others (criteria 1 and 2).

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

const FOUR_FOUR = { beats: 4, beatValue: 4 }
const THREE_FOUR = { beats: 3, beatValue: 4 }

describe('the time signatures in the preferences', () => {
  it('are 4/4 alone for a new user', () => {
    expect(createPreferences(memoryStorage(), ['en']).difficulty.timeSignatures).toEqual([
      FOUR_FOUR,
    ])
  })

  it('take one more, mark the preset modified and are kept after a reload', () => {
    const storage = memoryStorage()
    const preferences = createPreferences(storage, ['en'])

    preferences.customize({ timeSignature: THREE_FOUR, on: true })

    expect(preferences.difficulty.timeSignatures).toEqual([FOUR_FOUR, THREE_FOUR])
    expect(preferences.modified).toBe(true)
    const reloaded = createPreferences(storage, ['en'])
    expect(reloaded.difficulty.timeSignatures).toEqual([FOUR_FOUR, THREE_FOUR])
    expect(reloaded.modified).toBe(true)
  })

  it('keep the last one checked', () => {
    const preferences = createPreferences(memoryStorage(), ['en'])

    preferences.customize({ timeSignature: FOUR_FOUR, on: false })

    expect(preferences.difficulty.timeSignatures).toEqual([FOUR_FOUR])
  })

  it('come with a preset: 4/4 and 3/4 in Confident reading, with one bar', () => {
    const storage = memoryStorage()
    createPreferences(storage, ['en']).choosePreset('confident-reading')

    const reloaded = createPreferences(storage, ['en'])

    expect(reloaded.difficulty).toEqual(presetDifficulty('confident-reading'))
    expect(reloaded.difficulty.questionLength).toBe('one-bar')
    expect(reloaded.difficulty.timeSignatures).toEqual([FOUR_FOUR, THREE_FOUR])
    expect(reloaded.modified).toBe(false)
  })

  it('take two bars and keep them after a reload', () => {
    const storage = memoryStorage()
    createPreferences(storage, ['en']).customize({ questionLength: 'two-bars' })

    expect(createPreferences(storage, ['en']).difficulty.questionLength).toBe('two-bars')
  })

  // Values saved before the slice stay as they were: one note in 4/4, which now differs from
  // Confident reading.
  it('are 4/4 alone in values saved before they were offered', () => {
    const storage = memoryStorage()
    storage.set('puntillo.preset', 'confident-reading')
    storage.set(
      'puntillo.difficulty',
      JSON.stringify({
        low: 'C4',
        high: 'G5',
        ledgerLines: 1,
        durations: ['whole', 'half', 'quarter', 'eighth'],
        askDuration: true,
        questionLength: 'one-note',
      }),
    )

    const preferences = createPreferences(storage, ['en'])

    expect(preferences.preset).toBe('confident-reading')
    expect(preferences.difficulty).toEqual({
      ...presetDifficulty('confident-reading'),
      questionLength: 'one-note',
      timeSignatures: [FOUR_FOUR],
      rests: false,
    })
    expect(preferences.modified).toBe(true)
  })
})
