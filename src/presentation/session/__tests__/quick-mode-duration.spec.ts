import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import {
  chooseLength,
  createManualClock,
  cycle,
  DURATION_NAMES,
  DURATIONS,
  NAMES,
  renderSession,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature duration-input, slice 3: the duration in the quick mode, criteria 13 and 14.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const { whole, half, quarter, eighth } = DURATION_NAMES

const AUTO_NEXT = 'Open next question automatically'
const AT_ONCE = 'Show the right answer at once'
const TRY_AGAIN = 'Incorrect. Try again.'
const SECOND_TRY = 'Correct on the second try'
const REVIEW_OF_E4 = (chosen: string) =>
  `You chose ${chosen}. This is mi: the note on the 1st line.`
const REVIEW_OF_HALF = (chosen: string) => `You chose ${chosen}. This is a half note.`

// Half notes only: E4 (mi), then F4 (fa), then E4 again…
const halfNotes = (): Random => cycle(2.5 / 12, 0.3)

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = statusText
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const autoNext = () => screen.getByRole<HTMLInputElement>('checkbox', { name: AUTO_NEXT })
const queryText = (text: string) => screen.queryByText(text)

const pressedOf = (names: readonly string[]) =>
  names.filter((name) => button(name).getAttribute('aria-pressed') === 'true')
const disabledOf = (names: readonly string[]) =>
  names.filter((name) => button(name).matches(':disabled'))

// The mark is the accessible description of the button, as in the normal mode.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const describedOf = (names: readonly string[], text: string) =>
  names.filter((name) => description(button(name)) === text)

async function startQuick({ atOnce = false } = {}) {
  renderSession(halfNotes(), createManualClock())
  if (atOnce) await fireEvent.click(screen.getByRole('checkbox', { name: AT_ONCE }))
  await chooseLength('No limit')
  await fireEvent.click(autoNext())
}

async function press(...names: string[]) {
  for (const name of names) await fireEvent.click(button(name))
}

// A press from the keyboard: the button has the focus when it is pressed.
async function pressByKeyboard(name: string) {
  button(name).focus()
  await fireEvent.click(button(name))
  // Lets a focus move scheduled after the re-render happen before the focus is checked.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('the quick mode with the duration', () => {
  // Criterion 13: one part alone is a choice, not an answer.
  describe('one part pressed', () => {
    it('marks a name pressed alone as chosen and stays on the note, saying nothing', async () => {
      await startQuick()

      await press('mi')

      expect(pressedOf(NAMES)).toEqual(['mi'])
      expect(pressedOf(DURATIONS)).toEqual([])
      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('')
      expect(queryText('Points: 0 of 0')).not.toBeNull()
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([])
    })

    it('marks a duration pressed alone as chosen and stays on the note, saying nothing', async () => {
      await startQuick()

      await press(half)

      expect(pressedOf(DURATIONS)).toEqual([half])
      expect(pressedOf(NAMES)).toEqual([])
      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('')
      expect(queryText('Points: 0 of 0')).not.toBeNull()
    })

    it('replaces the chosen name with another one, still without answering', async () => {
      await startQuick()

      await press('re', 'mi')

      expect(pressedOf(NAMES)).toEqual(['mi'])
      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('')
    })

    it('shows neither Check nor Next', async () => {
      await startQuick()

      await press('mi')

      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })
  })

  describe('a right answer', () => {
    it.each([
      ['the name first', ['mi', half]],
      ['the duration first', [half, 'mi']],
    ])('opens the next note at once with "Correct", %s', async (_order, presses) => {
      await startQuick()

      await press(...presses)

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe('Correct')
      expect(queryText('Points: 2 of 2')).not.toBeNull()
      expect(queryText('Streak: 1')).not.toBeNull()
    })

    it('leaves the next note clean: nothing chosen, both rows enabled', async () => {
      await startQuick()

      await press('mi', half)

      expect(pressedOf([...NAMES, ...DURATIONS])).toEqual([])
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([])
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('answers with the last name chosen before the duration', async () => {
      await startQuick()

      await press('re', 'mi', half)

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe('Correct')
    })

    it('keeps "Correct" while one part of the next answer is chosen', async () => {
      await startQuick()
      await press('mi', half)

      await press('fa')

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe('Correct')
    })
  })

  // Criterion 14 with the duration alone wrong.
  describe('a right name with a wrong duration', () => {
    it.each([
      ['the name first', ['mi', quarter]],
      ['the duration first', [quarter, 'mi']],
    ])('stops on the note with "Incorrect. Try again.", %s', async (_order, presses) => {
      await startQuick()

      await press(...presses)

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe(TRY_AGAIN)
      expect(queryText('Points: 1 of 2')).not.toBeNull()
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('marks and disables the wrong duration, keeps the name chosen and settled', async () => {
      await startQuick()

      await press('mi', quarter)

      expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
      expect(describedOf(DURATIONS, 'Correct')).toEqual([])
      expect(disabledOf(DURATIONS)).toEqual([quarter])
      expect(pressedOf(DURATIONS)).toEqual([])
      expect(pressedOf(NAMES)).toEqual(['mi'])
      expect(disabledOf(NAMES)).toEqual(NAMES)
    })

    it('opens the next note with "Correct on the second try" on the right duration', async () => {
      await startQuick()
      await press('mi', quarter)

      await press(half)

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe(SECOND_TRY)
      expect(queryText('Points: 1 of 2')).not.toBeNull()
      expect(queryText('Streak: 0')).not.toBeNull()
      expect(pressedOf([...NAMES, ...DURATIONS])).toEqual([])
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([])
    })

    it('shows the review of the duration and Next on another wrong duration', async () => {
      await startQuick()
      await press('mi', quarter)

      await press(eighth)

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe(REVIEW_OF_HALF('an eighth note'))
      expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter, eighth])
      expect(describedOf(DURATIONS, 'Correct')).toEqual([half])
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([...NAMES, ...DURATIONS])
      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Check')).toBeNull()
    })

    it('opens the next note on Next after the review and goes on in the quick mode', async () => {
      await startQuick()
      await press('mi', quarter, eighth)

      await press('Next')

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe('')
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([])

      await press('fa', half)

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('Correct')
    })
  })

  // Criterion 14 with the name alone wrong; quick-mode-review.spec.ts presses the name last.
  describe('a wrong name with a right duration, the duration pressed last', () => {
    it('stops on the note, marks the name and keeps the duration settled', async () => {
      await startQuick()

      await press('re', half)

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe(TRY_AGAIN)
      expect(describedOf(NAMES, 'Incorrect')).toEqual(['re'])
      expect(disabledOf(NAMES)).toEqual(['re'])
      expect(pressedOf(DURATIONS)).toEqual([half])
      expect(disabledOf(DURATIONS)).toEqual(DURATIONS)
    })

    it('opens the next note with "Correct on the second try" on the right name', async () => {
      await startQuick()
      await press('re', half)

      await press('mi')

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe(SECOND_TRY)
    })
  })

  // Criterion 14: the second attempt is graded once every marked row has a choice.
  describe('a wrong name with a wrong duration', () => {
    it('stops on the note, marking both and clearing both rows', async () => {
      await startQuick()

      await press('re', quarter)

      expect(status()).toBe(TRY_AGAIN)
      expect(describedOf(NAMES, 'Incorrect')).toEqual(['re'])
      expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
      expect(disabledOf(NAMES)).toEqual(['re'])
      expect(disabledOf(DURATIONS)).toEqual([quarter])
      expect(pressedOf([...NAMES, ...DURATIONS])).toEqual([])
      expect(queryText('Points: 0 of 2')).not.toBeNull()
    })

    it('does not grade the second attempt on one part: it is shown as chosen', async () => {
      await startQuick()
      await press('re', quarter)

      await press('mi')

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe(TRY_AGAIN)
      expect(pressedOf(NAMES)).toEqual(['mi'])
      expect(queryButton('Next')).toBeNull()
    })

    it('opens the next note with "Correct on the second try" once both are right', async () => {
      await startQuick()
      await press('re', quarter)

      await press(half, 'mi')

      expect(shownPitch()).toBe('F4')
      expect(status()).toBe(SECOND_TRY)
      expect(queryText('Points: 0 of 2')).not.toBeNull()
    })

    it('explains each part still wrong and shows Next', async () => {
      await startQuick()
      await press('re', quarter)

      await press('fa', eighth)

      expect(status()).toBe(`${REVIEW_OF_E4('fa')} ${REVIEW_OF_HALF('an eighth note')}`)
      expect(queryButton('Next')).not.toBeNull()
    })

    it('explains only the duration when the name is put right', async () => {
      await startQuick()
      await press('re', quarter)

      await press('mi', eighth)

      expect(status()).toBe(REVIEW_OF_HALF('an eighth note'))
      expect(describedOf(NAMES, 'Correct')).toEqual(['mi'])
      expect(describedOf(DURATIONS, 'Correct')).toEqual([half])
    })
  })

  describe('with "Show the right answer at once" ticked', () => {
    it('shows the review of the duration and Next right after a wrong duration', async () => {
      await startQuick({ atOnce: true })

      await press('mi', quarter)

      expect(shownPitch()).toBe('E4')
      expect(status()).toBe(REVIEW_OF_HALF('a quarter note'))
      expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
      expect(describedOf(DURATIONS, 'Correct')).toEqual([half])
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([...NAMES, ...DURATIONS])
      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Check')).toBeNull()
    })

    it('opens the next note on Next', async () => {
      await startQuick({ atOnce: true })
      await press('mi', quarter)

      await press('Next')

      expect(shownPitch()).toBe('F4')
      expect(disabledOf([...NAMES, ...DURATIONS])).toEqual([])
    })
  })

  // Feature one-tap-answer, criterion 8: unticked mid-question, the question starts over.
  describe('unticking the box with one part chosen', () => {
    it('shows Check with nothing chosen and an empty message', async () => {
      await startQuick()
      await press('mi')

      await fireEvent.click(autoNext())

      expect(queryButton('Check')).not.toBeNull()
      expect(pressedOf([...NAMES, ...DURATIONS])).toEqual([])
      expect(status()).toBe('')
      expect(shownPitch()).toBe('E4')
    })

    it('keeps the settled name during the second attempt on the duration', async () => {
      await startQuick()
      await press('mi', quarter)

      await fireEvent.click(autoNext())

      expect(status()).toBe(TRY_AGAIN)
      expect(pressedOf(NAMES)).toEqual(['mi'])
      expect(disabledOf(DURATIONS)).toEqual([quarter])
      expect(queryButton('Check')).not.toBeNull()
    })
  })

  // Like unticking, ticking mid-question starts the choice over.
  describe('ticking the box with a name chosen in the normal mode', () => {
    it('unselects the name, so a duration pressed then is only chosen', async () => {
      renderSession(halfNotes(), createManualClock())
      await chooseLength('No limit')
      await press('mi')
      await fireEvent.click(autoNext())

      await press(half)

      expect(pressedOf(NAMES)).toEqual([])
      expect(pressedOf(DURATIONS)).toEqual([half])
      expect(shownPitch()).toBe('E4')
      expect(status()).toBe('')
    })
  })

  // Decisions of mistake-review, slice 3: a disabled button cannot keep the focus.
  describe('keyboard focus', () => {
    it('stays on a name pressed alone', async () => {
      await startQuick()

      await pressByKeyboard('mi')

      expect(document.activeElement).toBe(button('mi'))
    })

    it('stays on the pressed duration after a right answer', async () => {
      await startQuick()
      await press('mi')

      await pressByKeyboard(half)

      expect(shownPitch()).toBe('F4')
      expect(document.activeElement).toBe(button(half))
    })

    it('moves from a wrong duration to its neighbour on the right', async () => {
      await startQuick()
      await press('mi')

      await pressByKeyboard(quarter)

      expect(document.activeElement).toBe(button(eighth))
    })

    it('moves from the eighth note, the last duration, to its neighbour on the left', async () => {
      await startQuick()
      await press('mi')

      await pressByKeyboard(eighth)

      expect(document.activeElement).toBe(button(quarter))
    })

    // The pressed row is settled, so its every button is disabled: the row to answer takes it.
    it('moves from a right name to the first duration left when the duration is wrong', async () => {
      await startQuick()
      await press(quarter)

      await pressByKeyboard('mi')

      expect(document.activeElement).toBe(button(whole))
    })

    it('moves from a right duration to the first name left when the name is wrong', async () => {
      await startQuick()
      await press('do')

      await pressByKeyboard(half)

      expect(document.activeElement).toBe(button('re'))
    })

    it('moves from a wrong duration to its neighbour when both are wrong', async () => {
      await startQuick()
      await press('re')

      await pressByKeyboard(quarter)

      expect(document.activeElement).toBe(button(eighth))
    })

    it('stays on the duration that puts the second attempt right', async () => {
      await startQuick()
      await press('mi', quarter)

      await pressByKeyboard(half)

      expect(shownPitch()).toBe('F4')
      expect(document.activeElement).toBe(button(half))
    })

    it('moves to Next after the review of the duration', async () => {
      await startQuick()
      await press('mi', quarter)

      await pressByKeyboard(eighth)

      expect(document.activeElement).toBe(button('Next'))
    })

    it('moves to do, the first name, on Next after the review', async () => {
      await startQuick()
      await press('mi', quarter, eighth)

      await pressByKeyboard('Next')

      expect(shownPitch()).toBe('F4')
      expect(document.activeElement).toBe(button('do'))
    })
  })
})
