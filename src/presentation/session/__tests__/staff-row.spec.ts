import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  queryProgressBar,
  renderSessionWith,
  startingOnC4,
  startSession,
  statusText,
  storageWithAnswerAtOnce,
  storageWithOneNoteReading,
  storageWithQuickMode,
} from '@/presentation/__tests__/screen'

// Feature staff-progress-row, slice 2: in Read notes with questions of one note the staff is a row
// of ten questions. The staff gets the notes passed in the row before the current question
// (data-passed of the stub), the length of the row, 10 (data-row-length), and its end: "final" in
// the last row of a session of 10, 20 or 50 questions, "single" otherwise (data-row-end)
// (criteria 1–4). The result of the current note is drawn as before, its marks and ghosts going by
// the notes of the question; the caption under a wrong note is not shown, the card of the result
// says it (criterion 10). The staff keeps its name, the bar of the session its progress, and the
// passed notes give no targets to the focus (criteria 14, 15). Questions of several notes and Write
// notes have no row (edge case 1). In the quick mode the note passes at once (edge case 3).
//
// Unless said otherwise the session runs in Confident reading with one note in 4/4, the duration
// asked: the questions alternate C4 (do), D4 (re), whole notes.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const shown = (attribute: string) => staff().getAttribute(attribute)

async function start(length: string, storage: KeyValueStorage = storageWithOneNoteReading()) {
  renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
  })
  await startSession(length)
}

// The note of the question: do on the odd questions, re on the even ones.
const rightName = () => (shown('data-pitch') === 'C4' ? 'do' : 're')

async function answerRight() {
  await press(rightName())
  await press('1/1')
  await press('Check')
}

async function answerAndGoOn(count: number) {
  for (let index = 0; index < count; index++) {
    await answerRight()
    await press('Next')
  }
}

// The texts hidden from screen readers by the staff, the captions under its notes among them.
const captionLines = () =>
  [...document.querySelectorAll('[aria-hidden="true"], [aria-hidden="true"] *')]
    .filter((element) => !element.closest('svg') && element.children.length === 0)
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)

describe('the row on the staff (criteria 1–4)', () => {
  it('has no passed notes on the first question', async () => {
    await start('10')

    expect(shown('data-passed')).toBe('')
    expect(shown('data-row-length')).toBe('10')
    expect(shown('data-pitch')).toBe('C4')
  })

  it('gives the notes passed in the row before the current one', async () => {
    await start('10')

    await answerAndGoOn(3)

    expect(shown('data-passed')).toBe('C4 D4 C4')
    expect(shown('data-pitch')).toBe('D4')
  })

  it('leaves the current note out of the passed ones once it is checked', async () => {
    await start('10')
    await answerAndGoOn(1)

    await answerRight()

    expect(shown('data-passed')).toBe('C4')
  })

  it('ends the only row of a session of 10 with the final bar line, to its last question', async () => {
    await start('10')
    expect(shown('data-row-end')).toBe('final')

    await answerAndGoOn(9)

    expect(queryProgressBar('Question 10 of 10')).not.toBeNull()
    expect(shown('data-passed')?.split(' ')).toHaveLength(9)
    expect(shown('data-row-end')).toBe('final')
  })

  it('opens a new row on the eleventh question, the last of a session of 20', async () => {
    await start('20')
    expect(shown('data-row-end')).toBe('single')

    await answerAndGoOn(10)

    expect(queryProgressBar('Question 11 of 20')).not.toBeNull()
    expect(shown('data-passed')).toBe('')
    expect(shown('data-row-end')).toBe('final')
  })

  it('goes by rows of ten ending with a single bar line without a limit', async () => {
    await start('No limit')
    expect(shown('data-row-end')).toBe('single')

    await answerAndGoOn(10)

    expect(screen.getByText('Question 11')).not.toBeNull()
    expect(shown('data-passed')).toBe('')
    expect(shown('data-row-length')).toBe('10')
    expect(shown('data-row-end')).toBe('single')
  })

  it('passes a note answered right at once in the quick mode (edge case 3)', async () => {
    await start('10', storageWithQuickMode())

    await press('1/1')
    await press('do')

    expect(statusText()).toBe('Correct')
    expect(shown('data-pitch')).toBe('D4')
    expect(shown('data-passed')).toBe('C4')
  })
})

describe('the current note in a row (criterion 10)', () => {
  it('shows the result of a wrong answer on the staff without a caption under the note', async () => {
    await start('10', storageWithAnswerAtOnce())
    await answerAndGoOn(2)

    await press('mi')
    await press('1/1')
    await press('Check')

    expect(shown('data-passed')).toBe('C4 D4')
    expect(shown('data-marks')).toBe('correct')
    expect(shown('data-ghosts')).toBe('E4')
    expect(captionLines()).toEqual([])
    expect(statusText()).toMatch(/You chose mi/)
  })

  it('has no caption under a wrong duration either', async () => {
    await start('10', storageWithAnswerAtOnce())

    await press('do')
    await press('1/2')
    await press('Check')

    expect(shown('data-marks')).toBe('correct')
    expect(captionLines()).toEqual([])
  })

  it('has no frame around the note: no target to choose', async () => {
    await start('10')
    await answerAndGoOn(3)

    expect(screen.queryAllByRole('button', { name: /^Note \d+$/ })).toEqual([])
  })
})

describe('the row and the screen reader (criteria 14, 15)', () => {
  it('keeps the name of the staff and the progress of the session', async () => {
    await start('10')

    await answerAndGoOn(3)

    expect(staff().getAttribute('aria-label')).toBe('Music staff')
    expect(queryProgressBar('Question 4 of 10')).not.toBeNull()
  })
})

// The lead's decision: the row is laid out by what the difficulty of the session may draw in it,
// not by the notes shown, so that its slots keep their places (criterion 5).
describe('the slots of the row', () => {
  it('have no signs and no flags in First steps', async () => {
    await start('10', createMemoryStorage())

    expect(shown('data-row-slots')).toBe('0 - -')
  })

  it('have flags in Confident reading with one note, its eighth notes among the durations', async () => {
    await start('10')

    expect(shown('data-row-slots')).toBe('0 - flags')
  })

  it('have the most key signs and signs before the notes of a difficulty with both', async () => {
    const storage = storageWithOneNoteReading()
    const preferences = createPreferences(storage, ['en'])
    preferences.customize({ keySignatures: 2 })
    preferences.customize({ accidentals: 'sharp-and-flat' })
    await start('10', storage)

    expect(shown('data-row-slots')).toBe('2 signs flags')
  })

  it('have signs before the notes for key signatures alone', async () => {
    const storage = storageWithOneNoteReading()
    createPreferences(storage, ['en']).customize({ keySignatures: 4 })
    await start('10', storage)

    expect(shown('data-row-slots')).toBe('4 signs flags')
  })

  it('have signs before the notes for accidentals alone', async () => {
    const storage = storageWithOneNoteReading()
    createPreferences(storage, ['en']).customize({ accidentals: 'sharp-and-flat' })
    await start('10', storage)

    expect(shown('data-row-slots')).toBe('0 signs flags')
  })

  it('stay the same from question to question', async () => {
    await start('10')
    const first = shown('data-row-slots')
    expect(first).not.toBeNull()

    await answerAndGoOn(3)

    expect(shown('data-row-slots')).toBe(first)
  })
})

// Edge case 1.
describe('no row', () => {
  it('for a question of several notes', async () => {
    const storage = storageWithOneNoteReading()
    createPreferences(storage, ['en']).customize({ questionLength: 'two-to-four-notes' })
    await start('10', storage)

    expect(staff().hasAttribute('data-row-length')).toBe(false)
    expect(staff().hasAttribute('data-passed')).toBe(false)
    expect(staff().hasAttribute('data-row-end')).toBe(false)
    expect(staff().hasAttribute('data-row-slots')).toBe(false)
  })

  it('in Write notes', async () => {
    renderSessionWith({
      random: startingOnC4(),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storageWithOneNoteReading()),
    })
    const group =
      screen.queryByRole('group', { name: 'Exercise' }) ??
      screen.getByRole('radiogroup', { name: 'Exercise' })
    await fireEvent.click(within(group).getByRole('radio', { name: 'Write notes' }))
    await startSession('10')

    expect(staff().hasAttribute('data-row-length')).toBe(false)
    expect(staff().hasAttribute('data-passed')).toBe(false)
  })
})
