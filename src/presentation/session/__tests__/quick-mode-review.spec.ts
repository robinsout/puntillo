import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { renderApp, setQuickModeInSettings } from '@/presentation/__tests__/app'
import {
  startSession,
  chooseShownDuration,
  createManualClock,
  NAMES,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  statusText,
  storageWithAnswerAtOnce,
  storageWithOneNoteReading,
  storageWithQuickMode,
  queryProgressBar,
} from '@/presentation/__tests__/screen'

// Feature mistake-review, slice 3: the second attempt and the review in the quick mode.
// Feature navigation-and-settings, slice 1: the boxes are on the settings screen only.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const TRY_AGAIN = 'Incorrect. Try again.'
const SECOND_TRY = 'Correct on the second try'
const reviewOfC4 = (chosen: string) =>
  `You chose ${chosen}. This is do: the note on the first ledger line below the staff.`

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = statusText
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const queryText = (text: string) => screen.queryByText(text)

const pressed = () => NAMES.filter((name) => button(name).getAttribute('aria-pressed') === 'true')
const disabled = () => NAMES.filter((name) => button(name).matches(':disabled'))

// The mark is the accessible description of the button, as in the review of slice 1.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const described = (text: string) => NAMES.filter((name) => description(button(name)) === text)

// The duration is always the right one here; quick-mode-duration.spec.ts covers a wrong one.
async function answer(name: string) {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button('Check'))
}

// The right duration first, so the name press completes the answer: quick-mode-duration.spec.ts
// covers the other order and a wrong duration.
async function press(name: string) {
  await chooseShownDuration()
  await fireEvent.click(button(name))
}

// A press from the keyboard: the button has the focus when it is pressed.
async function pressByKeyboard(name: string) {
  if (NAMES.includes(name)) await chooseShownDuration()
  button(name).focus()
  await fireEvent.click(button(name))
  // Lets a focus move scheduled after the re-render happen before the focus is checked.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// A constant 0 alternates C4 (do) and D4 (re).
// Feature navigation-and-settings, slice 1: both boxes are ticked on the settings screen only.
const quickStorage = ({ atOnce = false } = {}) =>
  atOnce ? storageWithAnswerAtOnce(storageWithQuickMode()) : storageWithQuickMode()

async function startQuick(length = 'No limit', { atOnce = false } = {}) {
  const clock = createManualClock()
  renderSessionWith({
    random: startingOnC4(),
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor(['en'], quickStorage({ atOnce })),
  })
  await startSession(length)
}

// Criterion 9 of navigation-and-settings: changed in the settings in the middle of a session, the
// box acts once the user is back on the question. The question has no link to the settings in
// this slice, so the address is opened directly.
async function startInApp(storage: KeyValueStorage = storageWithOneNoteReading()) {
  const app = await renderApp({ storage, random: startingOnC4() })
  await startSession('No limit')
  return app
}

// Questions 1 to 9 of a session of 10 answered right: do on C4, re on D4. Question 10 is D4.
async function reachLastQuestion() {
  for (let number = 1; number < 10; number++) {
    await press(number % 2 === 1 ? 'do' : 're')
  }
  expect(queryProgressBar('Question 10 of 10')).not.toBeNull()
}

describe('the quick mode after a wrong answer', () => {
  describe('a right answer', () => {
    it('opens the next note at once with "Correct", as before', async () => {
      await startQuick()

      await press('do')

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('Correct')
    })
  })

  describe('a wrong first press', () => {
    it('stays on the note and says "Incorrect. Try again."', async () => {
      await startQuick()

      await press('re')

      expect(shownPitch()).toBe('C4')
      expect(queryText('Question 1')).not.toBeNull()
      expect(status()).toBe(TRY_AGAIN)
    })

    it('marks the pressed name as incorrect and disables it, the others stay enabled', async () => {
      await startQuick()

      await press('re')

      expect(described('Incorrect')).toEqual(['re'])
      expect(described('Correct')).toEqual([])
      expect(disabled()).toEqual(['re'])
      expect(pressed()).toEqual([])
    })

    it('shows neither Check nor Next', async () => {
      await startQuick()

      await press('re')

      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('counts the question as checked and wrong at once', async () => {
      await startQuick()

      await press('re')

      expect(queryText('Accuracy 50%')).not.toBeNull()
      expect(queryText('Streak: 0')).not.toBeNull()
    })
  })

  describe('a right second press', () => {
    it('opens the next note at once with "Correct on the second try"', async () => {
      await startQuick()
      await press('re')

      await press('do')

      expect(shownPitch()).toBe('D4')
      expect(queryText('Question 2')).not.toBeNull()
      expect(status()).toBe(SECOND_TRY)
    })

    it('leaves the new note clean: no marks, every name enabled, no Check or Next', async () => {
      await startQuick()
      await press('re')

      await press('do')

      expect(described('Incorrect')).toEqual([])
      expect(disabled()).toEqual([])
      expect(pressed()).toEqual([])
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    // Criterion 5 of the slice: the score goes by the first attempt.
    it('counts the question as wrong', async () => {
      await startQuick()
      await press('re')

      await press('do')

      expect(queryText('Accuracy 50%')).not.toBeNull()
      expect(queryText('Streak: 0')).not.toBeNull()
    })

    it('keeps "Correct on the second try" until the next answer, then shows the new one', async () => {
      await startQuick()
      await press('re')
      await press('do')

      // D4: re is right at once.
      await press('re')

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe('Correct')
    })

    it('opens the results at once on the last question', async () => {
      await startQuick('10')
      await reachLastQuestion()
      await press('mi')

      await press('re')

      expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeNull()
      expect(queryText('Accuracy: 95% (19 of 20 points)')).not.toBeNull()
    })
  })

  describe('a wrong second press', () => {
    it('shows the review on the same note', async () => {
      await startQuick()
      await press('re')

      await press('mi')

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe(reviewOfC4('mi'))
    })

    it('marks both wrong names and the right one, and disables every name', async () => {
      await startQuick()
      await press('re')

      await press('mi')

      expect(described('Incorrect')).toEqual(['re', 'mi'])
      expect(described('Correct')).toEqual(['do'])
      expect(disabled()).toEqual(NAMES)
    })

    it('shows Next and no Check, so that the review can be read', async () => {
      await startQuick()
      await press('re')

      await press('mi')

      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Check')).toBeNull()
    })

    it('opens the next note on Next and goes on in the quick mode', async () => {
      await startQuick()
      await press('re')
      await press('mi')

      await fireEvent.click(button('Next'))

      expect(shownPitch()).toBe('D4')
      expect(queryButton('Next')).toBeNull()
      expect(queryButton('Check')).toBeNull()
      expect(disabled()).toEqual([])

      await press('re')

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe('Correct')
    })

    it('shows Results instead of Next on the last question', async () => {
      await startQuick('10')
      await reachLastQuestion()
      await press('mi')

      await press('fa')

      expect(queryButton('Next')).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Results' })).toBeNull()

      await fireEvent.click(button('Results'))

      expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeNull()
      expect(queryText('Accuracy: 95% (19 of 20 points)')).not.toBeNull()
    })
  })

  // Criterion 4 of the slice.
  describe('with "Show the right answer at once" ticked', () => {
    it('shows the review and Next right after a wrong press', async () => {
      await startQuick('No limit', { atOnce: true })

      await press('re')

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe(reviewOfC4('re'))
      expect(described('Incorrect')).toEqual(['re'])
      expect(described('Correct')).toEqual(['do'])
      expect(disabled()).toEqual(NAMES)
      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Check')).toBeNull()
    })

    it('opens the next note on Next', async () => {
      await startQuick('No limit', { atOnce: true })
      await press('re')

      await fireEvent.click(button('Next'))

      expect(shownPitch()).toBe('D4')
      expect(disabled()).toEqual([])
    })

    it('shows Results instead of Next on the last question', async () => {
      await startQuick('10', { atOnce: true })
      await reachLastQuestion()

      await press('mi')

      expect(queryButton('Next')).toBeNull()
      expect(queryButton('Results')).not.toBeNull()
    })

    it('opens the next note at once on a right press', async () => {
      await startQuick('No limit', { atOnce: true })

      await press('do')

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('Correct')
    })
  })

  // Criterion 6 of the slice: ticking the box does not skip the second attempt.
  describe('ticking the box in the settings during the second attempt', () => {
    async function inSecondAttempt() {
      const app = await startInApp()
      await answer('re')
      expect(status()).toBe(TRY_AGAIN)
      return app
    }

    it('stays on the note, the wrong name still marked and disabled, without Check', async () => {
      const { router } = await inSecondAttempt()

      await setQuickModeInSettings(router, true)

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe(TRY_AGAIN)
      expect(described('Incorrect')).toEqual(['re'])
      expect(disabled()).toEqual(['re'])
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('takes the second attempt by a press: right opens the next note', async () => {
      const { router } = await inSecondAttempt()
      await setQuickModeInSettings(router, true)

      await press('do')

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe(SECOND_TRY)
      expect(queryText('Accuracy 50%')).not.toBeNull()
    })

    it('takes the second attempt by a press: wrong shows the review and Next', async () => {
      const { router } = await inSecondAttempt()
      await setQuickModeInSettings(router, true)

      await press('mi')

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe(reviewOfC4('mi'))
      expect(queryButton('Next')).not.toBeNull()
    })
  })

  // Criterion 7 of the slice, feature edge case 3.
  describe('unticking the box in the settings during the second attempt', () => {
    async function inQuickSecondAttempt() {
      const app = await startInApp(quickStorage())
      await press('re')
      return app
    }

    it('goes on with Check, the wrong name still marked and disabled', async () => {
      const { router } = await inQuickSecondAttempt()

      await setQuickModeInSettings(router, false)

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe(TRY_AGAIN)
      expect(described('Incorrect')).toEqual(['re'])
      expect(disabled()).toEqual(['re'])
      expect(queryButton('Check')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('takes the second attempt by Check and shows Next', async () => {
      const { router } = await inQuickSecondAttempt()
      await setQuickModeInSettings(router, false)

      await answer('do')

      expect(shownPitch()).toBe('C4')
      expect(status()).toBe(SECOND_TRY)
      expect(queryButton('Next')).not.toBeNull()
    })
  })

  // Criterion 8 of the slice: on a shown review the box acts as Next at once, as before.
  describe('ticking the box in the settings on the review', () => {
    it('opens the next note at once', async () => {
      const { router } = await startInApp()
      await answer('re')
      await answer('mi')

      await setQuickModeInSettings(router, true)

      expect(shownPitch()).toBe('D4')
      expect(queryButton('Next')).toBeNull()
      expect(disabled()).toEqual([])
    })
  })

  // Criterion 9 of the slice, decision of 2026-10-08: a disabled button cannot keep the focus.
  describe('keyboard focus', () => {
    it('moves from the wrong name to its neighbour on the right', async () => {
      await startQuick()

      await pressByKeyboard('re')

      expect(document.activeElement).toBe(button('mi'))
    })

    it('moves from si, the last name, to its neighbour on the left', async () => {
      await startQuick()

      await pressByKeyboard('si')

      expect(document.activeElement).toBe(button('la'))
    })

    it('stays on the pressed name after a right second press', async () => {
      await startQuick()
      await pressByKeyboard('re')

      await pressByKeyboard('do')

      expect(shownPitch()).toBe('D4')
      expect(document.activeElement).toBe(button('do'))
    })

    it('stays on the pressed name after a right first press', async () => {
      await startQuick()

      await pressByKeyboard('do')

      expect(shownPitch()).toBe('D4')
      expect(document.activeElement).toBe(button('do'))
    })

    it('moves to Next after the review', async () => {
      await startQuick()
      await pressByKeyboard('re')

      await pressByKeyboard('mi')

      expect(document.activeElement).toBe(button('Next'))
    })

    // Decision of the person: the Next button is gone, so the focus goes to the first name.
    it('moves to do, the first name, on Next after the review', async () => {
      await startQuick()
      await pressByKeyboard('re')
      await pressByKeyboard('mi')

      await pressByKeyboard('Next')

      expect(shownPitch()).toBe('D4')
      expect(document.activeElement).toBe(button('do'))
    })

    it('moves to do on Next after the review shown at once', async () => {
      await startQuick('No limit', { atOnce: true })
      await pressByKeyboard('re')

      await pressByKeyboard('Next')

      expect(shownPitch()).toBe('D4')
      expect(document.activeElement).toBe(button('do'))
    })

    it('moves to Results after the review of the last question', async () => {
      await startQuick('10')
      await reachLastQuestion()
      await pressByKeyboard('mi')

      await pressByKeyboard('fa')

      expect(document.activeElement).toBe(button('Results'))
    })

    it('moves to Next after the review shown at once', async () => {
      await startQuick('No limit', { atOnce: true })

      await pressByKeyboard('re')

      expect(document.activeElement).toBe(button('Next'))
    })
  })
})
