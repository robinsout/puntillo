import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import {
  chooseLength,
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
} from '@/presentation/__tests__/screen'

// Feature multi-note-questions, slice 3: questions of bars on the trainer screen (criteria 2, 4
// and 5). A question of bars is answered as one of 2–4 notes: note by note, the notes numbered
// through all the bars.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// Confident reading: a bar of 4/4 or 3/4. A constant 0.9 picks 3/4, then F5, E5, F5… as eighth
// notes, the 3rd of half, quarter and eighth that fit the bar: six of them fill it.
const SIX_EIGHTHS = () => constant(0.9)
const FA_MI = ['fa', 'mi', 'fa', 'mi', 'fa', 'mi']

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

async function renderTrainer(storage: KeyValueStorage, random: Random = SIX_EIGHTHS()) {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
  })
  await chooseLength('No limit')
}

// Without rests, as before slice 4: a constant 0.9 would make every other element a rest.
const confidentReading = (showAnswerAtOnce = false) =>
  storageWith((preferences) => {
    preferences.choosePreset('confident-reading')
    preferences.customize({ rests: false })
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
  })

const button = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const targets = () => screen.queryAllByRole('button', { name: /^Note \d+$/ })
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const status = () => screen.getByRole('status').textContent?.trim()

async function answerAll(...answers: [string, string][]) {
  for (const [name, duration] of answers) {
    await press(name)
    await press(duration)
  }
}

describe('a question of one bar', () => {
  it('is a bar of 3/4 in Confident reading, six eighths with a target each', async () => {
    await renderTrainer(confidentReading())

    expect(staff().getAttribute('data-time-signature')).toBe('3/4')
    expect(staff().getAttribute('data-pitch')).toBe('F5 E5 F5 E5 F5 E5')
    expect(staff().getAttribute('data-duration')).toBe(Array(6).fill('eighth').join(' '))
    expect(targets().map((target) => target.getAttribute('aria-label'))).toEqual([
      'Note 1',
      'Note 2',
      'Note 3',
      'Note 4',
      'Note 5',
      'Note 6',
    ])
    expect(button('Note 1').getAttribute('aria-current')).toBe('true')
  })

  it('is checked whole: two points a note', async () => {
    await renderTrainer(confidentReading())

    await answerAll(...FA_MI.map((name): [string, string] => [name, '1/8']))
    await press('Check')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 12 of 12')).toBeTruthy()
  })

  it('reviews the wrong notes by their number in the bar', async () => {
    await renderTrainer(confidentReading(true))

    await answerAll(
      ['fa', '1/8'],
      ['mi', '1/8'],
      ['fa', '1/8'],
      ['mi', '1/8'],
      ['fa', '1/4'],
      ['re', '1/8'],
    )
    await press('Check')

    expect(status()).toBe(
      'Note 5: You chose a quarter note. This is an eighth note. ' +
        'Note 6: You chose re. This is mi: the note in the 4th space.',
    )
    expect(screen.getByText('Points: 10 of 12')).toBeTruthy()
  })
})

describe('a question of two bars', () => {
  // From First steps: two bars of 2/4 in sixteenths, the most notes a question holds.
  const sixteenSixteenths = () =>
    storageWith((preferences) => {
      preferences.customize({ duration: 'sixteenth', on: true })
      preferences.customize({ duration: 'half', on: false })
      preferences.customize({ duration: 'quarter', on: false })
      preferences.customize({ timeSignature: { beats: 2, beatValue: 4 }, on: true })
      preferences.customize({ timeSignature: { beats: 4, beatValue: 4 }, on: false })
      preferences.customize({ questionLength: 'two-bars' })
    })

  it('numbers its sixteen notes through both bars', async () => {
    await renderTrainer(sixteenSixteenths(), constant(0))

    expect(staff().getAttribute('data-time-signature')).toBe('2/4')
    expect(targets()).toHaveLength(16)
    expect(targets().at(-1)?.getAttribute('aria-label')).toBe('Note 16')
  })

  it('moves from the last note of the first bar to the first of the second', async () => {
    await renderTrainer(sixteenSixteenths(), constant(0))

    for (let step = 0; step < 8; step++) await press('Next note')

    expect(button('Note 9').getAttribute('aria-current')).toBe('true')
    await press('Note 16')
    expect(button('Note 16').getAttribute('aria-current')).toBe('true')
    expect((button('Next note') as HTMLButtonElement).disabled).toBe(true)
  })
})
