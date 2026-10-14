import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { LETTERS } from '@/domain/pitch'
import { DURATION_VALUES } from '@/domain/question'
import {
  startSession,
  createManualClock,
  createMemoryStorage,
  DURATION_NAMES,
  NAMES,
  preferencesFor,
  renderSessionWith,
} from '@/presentation/__tests__/screen'

// Feature review-queue, slice 2: in questions of two to four notes each note wrong in both
// attempts comes back 3 to 5 questions later (criteria 1, 4 and 6). The screen runs in Confident
// reading with 2–4 notes in 4/4, no key signature and no accidentals, so every note fits every
// question. Several notes come due together; a question with fewer notes than are due passes the
// rest on to the next ones (criterion 7), so all of them are back within the next eight questions.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// mulberry32: a deterministic seeded generator.
function seeded(seed: number): Random {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

function storageWithSeveralNotes(): KeyValueStorage {
  const storage = createMemoryStorage()
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
  return storage
}

async function renderSeveralNotes(random: Random) {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storageWithSeveralNotes()),
  })
  await startSession('No limit')
}

const staff = () => screen.getByRole('img', { name: 'Music staff' })
const listed = (attribute: 'data-pitch' | 'data-duration') =>
  (staff().getAttribute(attribute) ?? '').split(' ').filter(Boolean)
const shownNotes = () => {
  const durations = listed('data-duration')
  return listed('data-pitch').map((pitch, index) => `${pitch}/${durations[index] ?? ''}`)
}

const button = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const target = (index: number) => button(`Note ${index + 1}`)

// No signs here, so a pitch is a letter and an octave: "C4".
function nameOf(pitch: string): string {
  const name = NAMES[LETTERS.findIndex((letter) => letter === pitch.charAt(0))]
  if (!name) throw new Error(`no note name for ${pitch}`)
  return name
}

function durationNameOf(duration: string): string {
  const value = DURATION_VALUES.find((each) => each === duration)
  if (!value) throw new Error(`no duration ${duration}`)
  return DURATION_NAMES[value]
}

const wrongNames = (pitch: string) => NAMES.filter((name) => name !== nameOf(pitch))

async function answerRight() {
  const durations = listed('data-duration')
  for (const [index, pitch] of listed('data-pitch').entries()) {
    await fireEvent.click(target(index))
    await press(nameOf(pitch))
    await press(durationNameOf(durations[index] ?? ''))
  }
  await press('Check')
}

async function answerEveryNoteWrongTwice() {
  const pitches = listed('data-pitch')
  const durations = listed('data-duration')
  for (const [index, pitch] of pitches.entries()) {
    await fireEvent.click(target(index))
    await press(wrongNames(pitch)[0] ?? '')
    await press(durationNameOf(durations[index] ?? ''))
  }
  await press('Check')
  for (const [index, pitch] of pitches.entries()) {
    await fireEvent.click(target(index))
    await press(wrongNames(pitch)[1] ?? '')
  }
  await press('Check')
}

describe('review queue on the screen with questions of several notes', () => {
  it.each([1, 2, 3])(
    'seed %i: brings every note wrong twice back within the next eight questions',
    async (seed) => {
      await renderSeveralNotes(seeded(seed))
      const missed = shownNotes()
      await answerEveryNoteWrongTwice()
      await press('Next')

      const later: string[] = []
      for (let question = 2; question <= 9; question++) {
        later.push(...shownNotes())
        await answerRight()
        await press('Next')
      }

      expect(missed.length).toBeGreaterThan(1)
      expect(missed.filter((note) => !later.includes(note))).toEqual([])
    },
  )
})
