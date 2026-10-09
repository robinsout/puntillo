import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
} from '@/presentation/__tests__/screen'

// Feature multi-note-questions, slice 2: the quick mode on a question of several notes,
// criterion 19.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const AUTO_NEXT = 'Open next question automatically'

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// As in multi-note-trainer.spec.ts: C4 half (do 1/2), E4 quarter (mi 1/4), G4 quarter (sol 1/4),
// then the questions go on with C4 and D4 halves.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

interface Visit {
  quick?: boolean
  showAnswerAtOnce?: boolean
}

function storageWithSeveralNotes({ quick = true, showAnswerAtOnce }: Visit): KeyValueStorage {
  const storage = createMemoryStorage()
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  if (quick) preferences.chooseAutoAdvance(true)
  if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
  return storage
}

async function renderTrainer(visit: Visit = {}) {
  renderSessionWith({
    random: DO_MI_SOL(),
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storageWithSeveralNotes(visit)),
  })
  await chooseLength('No limit')
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const status = () => screen.getByRole('status').textContent?.trim()
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })
const autoNext = () => screen.getByRole<HTMLInputElement>('checkbox', { name: AUTO_NEXT })

const target = (number: number) => button(`Note ${number}`)
const isCurrent = (number: number) => target(number).getAttribute('aria-current') === 'true'

function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

async function answerNote(name: string, duration: string) {
  await press(name)
  await press(duration)
}

async function answerAll(...answers: [string, string][]) {
  for (const [name, duration] of answers) await answerNote(name, duration)
}

// A press from the keyboard: the button has the focus when it is pressed.
async function pressByKeyboard(name: string) {
  button(name).focus()
  await fireEvent.click(button(name))
  // Lets a focus move scheduled after the re-render happen before the focus is checked.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const RIGHT: [string, string][] = [
  ['do', '1/2'],
  ['mi', '1/4'],
  ['sol', '1/4'],
]

// Note 2 has a wrong name (fa for mi) and note 3 a wrong duration (1/2 for 1/4).
const WRONG: [string, string][] = [
  ['do', '1/2'],
  ['fa', '1/4'],
  ['sol', '1/2'],
]

describe('the quick mode on a question of several notes', () => {
  describe('while a note has no answer', () => {
    it('chooses as without the box: the answer is written under the note, the next one is current', async () => {
      await renderTrainer()

      await answerAll(['do', '1/2'], ['mi', '1/4'])

      expect(shownPitch()).toBe('C4 E4 G4')
      expect(description(target(1))).toBe('do 1/2')
      expect(description(target(2))).toBe('mi 1/4')
      expect(isCurrent(3)).toBe(true)
      expect(status()).toBe('')
      expect(exactText('Points: 0 of 0')).not.toBeNull()
    })

    it('shows neither Check nor Next', async () => {
      await renderTrainer()

      await answerNote('do', '1/2')

      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('lets an answered note be changed without answering the question', async () => {
      await renderTrainer()
      await answerAll(['do', '1/2'], ['mi', '1/4'])
      await fireEvent.click(target(1))

      await press('re')

      expect(shownPitch()).toBe('C4 E4 G4')
      expect(description(target(1))).toBe('re 1/2')
      expect(status()).toBe('')
      expect(exactText('Points: 0 of 0')).not.toBeNull()
    })
  })

  describe('the last note without an answer', () => {
    it('opens the next question at once with "Correct" when every note is right', async () => {
      await renderTrainer()

      await answerAll(...RIGHT)

      expect(shownPitch()).toBe('C4 D4')
      expect(status()).toBe('Correct')
      expect(exactText('Points: 6 of 6')).not.toBeNull()
      expect(exactText('Streak: 1')).not.toBeNull()
      expect(isCurrent(1)).toBe(true)
      expect(description(target(1))).toBe('')
    })

    it('keeps "Correct" while the next question is being answered', async () => {
      await renderTrainer()
      await answerAll(...RIGHT)

      await answerNote('do', '1/2')

      expect(status()).toBe('Correct')
    })

    it('answers the question when it is the first note, answered last', async () => {
      await renderTrainer()
      await fireEvent.click(target(2))
      await answerAll(['mi', '1/4'], ['sol', '1/4'])
      await fireEvent.click(target(1))

      await answerNote('do', '1/2')

      expect(shownPitch()).toBe('C4 D4')
      expect(status()).toBe('Correct')
    })
  })

  describe('a wrong answer', () => {
    it('stops on the question with "Incorrect. Try again." and marks the wrong notes', async () => {
      await renderTrainer()

      await answerAll(...WRONG)

      expect(shownPitch()).toBe('C4 E4 G4')
      expect(status()).toBe('Incorrect. Try again.')
      expect(exactText('Points: 4 of 6')).not.toBeNull()
      expect(description(target(2))).toMatch(/\bIncorrect\b/)
      expect(description(target(3))).toMatch(/\bIncorrect\b/)
      expect(isCurrent(2)).toBe(true)
      expect(target(1).matches(':disabled')).toBe(true)
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('waits for every wrong note before grading the second attempt', async () => {
      await renderTrainer()
      await answerAll(...WRONG)

      await press('mi')

      expect(status()).toBe('Incorrect. Try again.')
      expect(isCurrent(3)).toBe(true)
      expect(queryButton('Next')).toBeNull()
    })

    it('opens the next question with "Correct on the second try" once the wrong parts are right', async () => {
      await renderTrainer()
      await answerAll(...WRONG)
      await press('mi')

      await press('1/4')

      expect(shownPitch()).toBe('C4 D4')
      expect(status()).toBe('Correct on the second try')
      expect(exactText('Points: 4 of 6')).not.toBeNull()
      expect(exactText('Streak: 0')).not.toBeNull()
    })

    it('explains the notes still wrong and shows Next, which opens the next question', async () => {
      await renderTrainer()
      await answerAll(...WRONG)
      await press('re')

      await press('1/8')

      expect(status()).toBe(
        'Note 2: You chose re. This is mi: the note on the 1st line. ' +
          'Note 3: You chose an eighth note. This is a quarter note.',
      )
      expect(queryButton('Next')).not.toBeNull()

      await press('Next')

      expect(shownPitch()).toBe('C4 D4')
      expect(status()).toBe('')
      expect(queryButton('Next')).toBeNull()
    })

    it('explains every wrong note at once with the right answer shown at once', async () => {
      await renderTrainer({ showAnswerAtOnce: true })

      await answerAll(...WRONG)

      expect(status()).toBe(
        'Note 2: You chose fa. This is mi: the note on the 1st line. ' +
          'Note 3: You chose a half note. This is a quarter note.',
      )
      expect(queryButton('Next')).not.toBeNull()
    })
  })

  // The box starts the choice over, as with one note: the question is clean, its highlight on the
  // first note still to answer.
  describe('the box ticked or unticked mid-question', () => {
    it('clears every answer and goes back to the first note when ticked', async () => {
      await renderTrainer({ quick: false })
      await answerAll(['do', '1/2'], ['mi', '1/4'])

      await fireEvent.click(autoNext())

      expect(description(target(1))).toBe('')
      expect(description(target(2))).toBe('')
      expect(isCurrent(1)).toBe(true)
      expect(queryButton('Check')).toBeNull()
    })

    it('clears every answer and goes back to the first note when unticked', async () => {
      await renderTrainer()
      await answerAll(['do', '1/2'], ['mi', '1/4'])

      await fireEvent.click(autoNext())

      expect(description(target(1))).toBe('')
      expect(description(target(2))).toBe('')
      expect(isCurrent(1)).toBe(true)
      expect(queryButton('Check')).not.toBeNull()
      expect(status()).toBe('')
    })
  })

  // The focus follows the rule of one note: it stays on the pressed button while it is enabled,
  // otherwise goes to its nearest enabled neighbour, or to the row left to answer.
  describe('keyboard focus', () => {
    it('stays on the pressed duration when the next question opens', async () => {
      await renderTrainer()
      await answerAll(['do', '1/2'], ['mi', '1/4'])
      await press('sol')

      await pressByKeyboard('1/4')

      expect(shownPitch()).toBe('C4 D4')
      expect(document.activeElement).toBe(button('1/4'))
    })

    // Note 2, current after the mistake, keeps its right duration: only its name is open.
    it('moves to the first name left on a mistake that makes a note with a settled duration current', async () => {
      await renderTrainer()
      await answerAll(['do', '1/2'], ['fa', '1/4'])
      await press('sol')

      await pressByKeyboard('1/2')

      expect(isCurrent(2)).toBe(true)
      expect(document.activeElement).toBe(button('do'))
    })

    it('moves to Next after the review', async () => {
      await renderTrainer()
      await answerAll(...WRONG)
      await press('re')

      await pressByKeyboard('1/8')

      expect(document.activeElement).toBe(button('Next'))
    })
  })
})
