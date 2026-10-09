import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  constant,
  createManualClock,
  drawStaff,
  failStaffLoading,
  NAMES,
  preferencesFor,
  renderSession,
  renderSessionWith,
  startingOnC4,
  startingOnC5,
  startingOnG4,
} from '@/presentation/__tests__/screen'

// The m1-one-note behaviour must survive inside a session. The screen is opened via the
// length choice, as a user would, with No limit so that questions never run out.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }

// By default the screen opens on C4 (do), and Next brings D4 (re).
async function renderTrainer(
  random: Random = startingOnC4(),
  clock = createManualClock(),
  locale: Locale = 'en',
) {
  renderSession(random, clock, locale)
  await chooseLength(NO_LIMIT[locale])
  return clock
}

const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const shownDuration = () =>
  screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-duration')

const nameButton = (name: string) => screen.getByRole('button', { name })
const checkButton = () => screen.getByRole('button', { name: 'Check' })
const queryCheck = () => screen.queryByRole('button', { name: 'Check' })
const queryNext = () => screen.queryByRole('button', { name: 'Next' })
const status = () => screen.queryByRole('status')
const queryResult = () => screen.queryByText(/^(Correct|Incorrect)$/)
const queryHint = () => screen.queryByText('Choose a note name first')
const autoNext = () =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: 'Open next question automatically' })
const nextButton = () => screen.getByRole('button', { name: 'Next' })

const pressed = () =>
  NAMES.filter((name) => nameButton(name).getAttribute('aria-pressed') === 'true')
const disabled = () => NAMES.filter((name) => nameButton(name).matches(':disabled'))

async function answer(name: string) {
  await fireEvent.click(nameButton(name))
  await fireEvent.click(checkButton())
}

describe('TrainerView in a session', () => {
  describe('on open', () => {
    it('shows the staff as an image named "Music staff"', async () => {
      await renderTrainer()

      expect(screen.getByRole('img', { name: 'Music staff' })).toBeTruthy()
    })

    it('shows seven note name buttons from do to si in order', async () => {
      await renderTrainer()

      const names = screen
        .getAllByRole('button')
        .map((button) => button.textContent?.trim())
        .filter((text) => text !== undefined && NAMES.includes(text))
      expect(names).toEqual(NAMES)
    })

    it('has no note name selected', async () => {
      await renderTrainer()

      for (const name of NAMES) {
        expect(nameButton(name).getAttribute('aria-pressed')).toBe('false')
      }
    })

    it('has the heading "Name the note"', async () => {
      await renderTrainer()

      expect(screen.getByRole('heading', { name: 'Name the note' })).toBeTruthy()
    })

    it('shows Check and no Next, result or hint', async () => {
      await renderTrainer()

      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
      expect(queryResult()).toBeNull()
      expect(queryHint()).toBeNull()
    })
  })

  describe('choosing a note name', () => {
    it('selects the pressed name only', async () => {
      await renderTrainer()

      await fireEvent.click(nameButton('mi'))

      expect(pressed()).toEqual(['mi'])
    })

    it('moves the selection to another name', async () => {
      await renderTrainer()

      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(nameButton('la'))

      expect(pressed()).toEqual(['la'])
    })
  })

  describe('checking the answer', () => {
    it('says "Correct" in a status message for the right name', async () => {
      await renderTrainer()

      await answer('do')

      expect(status()?.textContent).toContain('Correct')
      expect(status()?.textContent).not.toContain('Incorrect')
    })

    // Feature mistake-review: a wrong first answer gives a second try, so it is not the result.
    it('says "Incorrect. Try again." in a status message for a wrong name, without the right answer', async () => {
      await renderTrainer()

      await answer('re')

      expect(status()?.textContent?.trim()).toBe('Incorrect. Try again.')
      expect(status()?.textContent).not.toMatch(/\bdo\b/)
    })

    it('replaces Check with Next', async () => {
      await renderTrainer()

      await answer('do')

      expect(queryCheck()).toBeNull()
      expect(queryNext()).not.toBeNull()
    })

    it('moves the keyboard focus to Next', async () => {
      await renderTrainer()
      await fireEvent.click(nameButton('do'))
      checkButton().focus()

      await fireEvent.click(checkButton())

      await waitFor(() => expect(document.activeElement).toBe(queryNext()))
    })

    it('keeps the selection and the message when another name is pressed after the result', async () => {
      await renderTrainer()
      await answer('do')

      await fireEvent.click(nameButton('re'))

      expect(pressed()).toEqual(['do'])
      expect(status()?.textContent?.trim()).toBe('Correct')
    })
  })

  describe('note name buttons after the result', () => {
    it('are all disabled after a right answer, the chosen one still pressed', async () => {
      await renderTrainer()

      await answer('do')

      expect(disabled()).toEqual(NAMES)
      expect(pressed()).toEqual(['do'])
    })

    it('are all disabled after a wrong second answer', async () => {
      await renderTrainer()

      await answer('re')
      await answer('mi')

      expect(disabled()).toEqual(NAMES)
    })

    it('are all enabled and none pressed after Next', async () => {
      await renderTrainer()
      await answer('re')
      await answer('mi')

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(disabled()).toEqual([])
      expect(pressed()).toEqual([])
    })

    it('are enabled before the check', async () => {
      await renderTrainer()
      expect(disabled()).toEqual([])

      await fireEvent.click(nameButton('mi'))

      expect(disabled()).toEqual([])
    })

    it('stay enabled when Check without a name shows the hint', async () => {
      await renderTrainer()

      await fireEvent.click(checkButton())

      expect(queryHint()).not.toBeNull()
      expect(disabled()).toEqual([])
    })
  })

  describe('checking without a note name', () => {
    it('shows the hint in the status message and no result', async () => {
      await renderTrainer()

      await fireEvent.click(checkButton())

      expect(status()?.textContent?.trim()).toBe('Choose a note name first')
      expect(queryResult()).toBeNull()
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
    })

    it('hides the hint once a note name is chosen', async () => {
      await renderTrainer()
      await fireEvent.click(checkButton())

      await fireEvent.click(nameButton('fa'))

      expect(queryHint()).toBeNull()
      expect(pressed()).toEqual(['fa'])
    })
  })

  describe('going to the next question', () => {
    it('clears the selection and the message and shows Check again', async () => {
      await renderTrainer()
      await answer('do')

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(pressed()).toEqual([])
      expect(queryResult()).toBeNull()
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
    })

    it('moves the keyboard focus to Check', async () => {
      await renderTrainer()
      await answer('do')
      screen.getByRole('button', { name: 'Next' }).focus()

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      await waitFor(() => expect(document.activeElement).toBe(queryCheck()))
    })

    it('grades the new question', async () => {
      await renderTrainer(startingOnC4())
      await answer('re')
      await answer('mi')
      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      // The second question is D4: do would be right only for the previous C4.
      await answer('re')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })
  })

  describe('notes from C4 to C5', () => {
    it('shows the note picked by the injected random source', async () => {
      await renderTrainer(startingOnG4())

      expect(shownPitch()).toBe('G4')
    })

    it('says "Correct" for sol on G4', async () => {
      await renderTrainer(startingOnG4())

      await answer('sol')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    it('says "Incorrect. Try again." for do on G4', async () => {
      await renderTrainer(startingOnG4())

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Incorrect. Try again.')
    })

    it('says "Correct" for do on C5', async () => {
      await renderTrainer(startingOnC5())
      expect(shownPitch()).toBe('C5')

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    it('shows a note of another pitch after Next', async () => {
      await renderTrainer(startingOnC4())
      expect(shownPitch()).toBe('C4')
      await answer('do')

      await fireEvent.click(screen.getByRole('button', { name: 'Next' }))

      expect(shownPitch()).toBe('D4')
    })
  })

  describe('note durations', () => {
    // A constant source picks the pitch and the duration with the same value.
    it.each([
      [0, 'C4', 'whole'],
      [0.3, 'E4', 'half'],
      [0.6, 'G4', 'quarter'],
      [0.9, 'C5', 'eighth'],
    ])('shows the note picked by the source %f: %s, %s', async (value, pitch, duration) => {
      await renderTrainer(constant(value))

      expect(shownPitch()).toBe(pitch)
      expect(shownDuration()).toBe(duration)
    })

    it('grades only the note name, whatever the duration', async () => {
      await renderTrainer(constant(0.9))
      expect(shownDuration()).toBe('eighth')

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    it('adds no duration buttons yet', async () => {
      await renderTrainer(constant(0.9))

      for (const name of ['Whole note', 'Half note', 'Quarter note', 'Eighth note']) {
        expect(screen.queryByRole('button', { name })).toBeNull()
      }
    })
  })

  // Spec §13: randomness comes from the composition root; without it the screen must not
  // silently fall back to Math.random.
  describe('without a random source', () => {
    it('fails with an error naming the missing random source', async () => {
      const { clock } = createManualClock()
      expect(() => renderSessionWith({ clock, preferences: preferencesFor() })).toThrow(/random/i)
    })
  })

  // Spec §13: the clock that times the answers comes from the composition root too.
  describe('without a clock', () => {
    it('fails with an error naming the missing clock', async () => {
      expect(() =>
        renderSessionWith({ random: startingOnC4(), preferences: preferencesFor() }),
      ).toThrow(/clock/i)
    })
  })

  // Spec §13: the stored preferences come from the composition root as well.
  describe('without preferences', () => {
    it('fails with an error naming the missing preferences', async () => {
      const { clock } = createManualClock()
      expect(() => renderSessionWith({ random: startingOnC4(), clock })).toThrow(/preferences/i)
    })
  })

  describe('the "Open next question automatically" box', () => {
    it('is a checkbox shown next to Check, unticked on open', async () => {
      await renderTrainer()

      expect(autoNext().checked).toBe(false)
      expect(queryCheck()).not.toBeNull()
    })

    it('is still shown next to Next after the check', async () => {
      await renderTrainer()

      await answer('do')

      expect(queryNext()).not.toBeNull()
      expect(autoNext()).toBeTruthy()
    })

    it('is ticked and unticked by pressing it', async () => {
      await renderTrainer()

      await fireEvent.click(autoNext())
      expect(autoNext().checked).toBe(true)

      await fireEvent.click(autoNext())
      expect(autoNext().checked).toBe(false)
    })
  })

  // Feature one-tap-answer: with the box ticked one press of a name is one answer.
  describe('the quick mode', () => {
    async function renderQuickTrainer(random: Random = startingOnC4()) {
      await renderTrainer(random)
      await fireEvent.click(autoNext())
    }

    it('shows the note names and no Check or Next', async () => {
      await renderQuickTrainer()

      expect(queryCheck()).toBeNull()
      expect(queryNext()).toBeNull()
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
    })

    it('shows no message before the first answer', async () => {
      await renderQuickTrainer()

      expect(status()?.textContent?.trim()).toBe('')
    })

    it('opens a new question at once when a note name is pressed', async () => {
      await renderQuickTrainer()

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(queryCheck()).toBeNull()
      expect(queryNext()).toBeNull()
      expect(autoNext().checked).toBe(true)
    })

    it('says "Correct" for the previous answer on the new question', async () => {
      await renderQuickTrainer()

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    // Feature mistake-review, slice 3: a wrong press stops on the note for the second try.
    it('says "Correct on the second try" for a previous answer right on the second press', async () => {
      await renderQuickTrainer()

      await fireEvent.click(nameButton('re'))
      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Correct on the second try')
    })

    it('grades by the note that was shown: sol on G4 is correct', async () => {
      await renderQuickTrainer(startingOnG4())

      await fireEvent.click(nameButton('sol'))

      expect(shownPitch()).not.toBe('G4')
      expect(status()?.textContent?.trim()).toBe('Correct')
    })

    it('has no note name selected and every one enabled on the new question', async () => {
      await renderQuickTrainer()

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
    })

    it('keeps the previous result until the next answer and then shows the new one', async () => {
      await renderQuickTrainer()
      await fireEvent.click(nameButton('do'))
      expect(status()?.textContent?.trim()).toBe('Correct')

      // D4: mi is wrong, re is right on the second press.
      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(nameButton('re'))

      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Correct on the second try')
    })

    it('keeps going question after question', async () => {
      await renderQuickTrainer()

      await fireEvent.click(nameButton('do'))
      await fireEvent.click(nameButton('re'))
      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryCheck()).toBeNull()
    })

    // Edge case 1: an answer without a name is impossible, so the hint has no place.
    it('never shows the hint', async () => {
      await renderQuickTrainer()

      await fireEvent.click(nameButton('do'))

      expect(queryHint()).toBeNull()
    })

    it('hides the hint shown before the box was ticked', async () => {
      await renderTrainer()
      await fireEvent.click(checkButton())
      expect(queryHint()).not.toBeNull()

      await fireEvent.click(autoNext())

      expect(queryHint()).toBeNull()
      expect(queryCheck()).toBeNull()
      expect(shownPitch()).toBe('C4')
    })

    it('answers with the pressed name even when another one was selected before', async () => {
      await renderTrainer()
      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(autoNext())

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Correct')
    })
  })

  // Criterion 7: ticking the box on a shown result acts as Next at once.
  describe('ticking the box on a shown result', () => {
    it('opens the next question at once and keeps "Correct" in the message', async () => {
      await renderTrainer()
      await answer('do')

      await fireEvent.click(autoNext())

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).toBeNull()
      expect(queryCheck()).toBeNull()
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
    })

    it('keeps "Incorrect" in the message after a wrong answer', async () => {
      await renderTrainer()
      await answer('re')
      await answer('mi')

      await fireEvent.click(autoNext())

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Incorrect')
    })

    it('goes on in the quick mode', async () => {
      await renderTrainer()
      await answer('do')
      await fireEvent.click(autoNext())

      await fireEvent.click(nameButton('re'))

      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Correct')
    })
  })

  // Criterion 8: "Correct" next to Check would read as the result of the current question.
  describe('unticking the box during a question', () => {
    async function afterQuickAnswer() {
      await renderTrainer()
      await fireEvent.click(autoNext())
      await fireEvent.click(nameButton('do'))
      expect(status()?.textContent?.trim()).toBe('Correct')
    }

    it('shows Check again on the same question, without Next', async () => {
      await afterQuickAnswer()

      await fireEvent.click(autoNext())

      expect(shownPitch()).toBe('D4')
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
      expect(autoNext().checked).toBe(false)
    })

    it('clears the message of the previous answer', async () => {
      await afterQuickAnswer()

      await fireEvent.click(autoNext())

      expect(status()?.textContent?.trim()).toBe('')
    })

    it('leaves no name selected and every one enabled', async () => {
      await afterQuickAnswer()

      await fireEvent.click(autoNext())

      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
    })

    it('does not bring back the hint shown before the box was ticked', async () => {
      await renderTrainer()
      await fireEvent.click(checkButton())
      await fireEvent.click(autoNext())

      await fireEvent.click(autoNext())

      expect(shownPitch()).toBe('C4')
      expect(queryHint()).toBeNull()
      expect(status()?.textContent?.trim()).toBe('')
      expect(queryCheck()).not.toBeNull()
    })

    it('unselects the name chosen before the box was ticked', async () => {
      await renderTrainer()
      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(autoNext())

      await fireEvent.click(autoNext())

      expect(shownPitch()).toBe('C4')
      expect(pressed()).toEqual([])
      expect(queryCheck()).not.toBeNull()
    })

    it('goes on in the normal mode: a name is selected and Check grades it', async () => {
      await afterQuickAnswer()
      await fireEvent.click(autoNext())

      await fireEvent.click(nameButton('re'))
      expect(shownPitch()).toBe('D4')
      expect(pressed()).toEqual(['re'])

      await fireEvent.click(checkButton())

      expect(shownPitch()).toBe('D4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()
    })
  })

  // Edge case 2: a live region speaks on a change of its content. The same text put in place
  // of the same text is not a change, so the second "Correct" would be silent. A new node
  // with the text inside the same region is a change that screen readers announce.
  describe('announcing the result in the quick mode', () => {
    const resultNode = () =>
      within(screen.getByRole('status')).getByText(/^(Correct|Correct on the second try)$/)

    it('puts the same result of the next answer in a new node', async () => {
      await renderTrainer()
      await fireEvent.click(autoNext())
      await fireEvent.click(nameButton('do'))
      const first = resultNode()

      // D4: re is right again.
      await fireEvent.click(nameButton('re'))

      expect(resultNode().textContent?.trim()).toBe('Correct')
      expect(resultNode()).not.toBe(first)
    })

    it('puts "Correct on the second try" after the same one in a new node too', async () => {
      await renderTrainer()
      await fireEvent.click(autoNext())
      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(nameButton('do'))
      const first = resultNode()

      // D4: mi is wrong, re is right on the second press.
      await fireEvent.click(nameButton('mi'))
      await fireEvent.click(nameButton('re'))

      expect(resultNode().textContent?.trim()).toBe('Correct on the second try')
      expect(resultNode()).not.toBe(first)
    })

    // A region added together with its content is not announced, so it must outlive the answer.
    it('keeps the status region itself in place', async () => {
      await renderTrainer()
      await fireEvent.click(autoNext())
      await fireEvent.click(nameButton('do'))
      const region = screen.getByRole('status')

      await fireEvent.click(nameButton('re'))

      expect(screen.getByRole('status')).toBe(region)
    })
  })

  // Edge case 3: the name buttons stay in place between questions, so the focus can stay too.
  describe('keyboard focus in the quick mode', () => {
    it('stays on the pressed note name button after the answer', async () => {
      await renderTrainer()
      await fireEvent.click(autoNext())
      nameButton('do').focus()

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      // Let any focus move scheduled after re-render happen before checking the focus stayed.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.activeElement).toBe(nameButton('do'))
    })

    // A wrong press moves the focus off the disabled name: see quick-mode-review.spec.ts.
    it('stays on the pressed button after an answer right on the second press', async () => {
      await renderTrainer()
      await fireEvent.click(autoNext())
      await fireEvent.click(nameButton('fa'))
      nameButton('do').focus()

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.activeElement).toBe(nameButton('do'))
    })

    it('stays on the box when it is ticked on a shown result', async () => {
      await renderTrainer()
      await answer('do')
      autoNext().focus()

      await fireEvent.click(autoNext())

      expect(shownPitch()).toBe('D4')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.activeElement).toBe(autoNext())
    })
  })

  // Feature decision 2026-10-08: no answer before the note is on the staff, so the answer
  // time never includes loading. The place is kept so that the layout does not jump.
  describe('before the staff has drawn the note', () => {
    async function renderTrainerWhileLoading() {
      renderSession(startingOnC4(), createManualClock(), 'en', 'held')
      await chooseLength('No limit')
    }

    // jsdom has no layout, so the reserved space is checked as an element kept in place.
    const answerControls = () => screen.getByTestId('answer-controls')
    const queryNames = () => NAMES.filter((name) => screen.queryByRole('button', { name }))

    it('shows no note name buttons and no Check', async () => {
      await renderTrainerWhileLoading()

      expect(queryNames()).toEqual([])
      expect(queryCheck()).toBeNull()
    })

    it('keeps the place for them', async () => {
      await renderTrainerWhileLoading()

      expect(within(answerControls()).queryAllByRole('button')).toEqual([])
    })

    it('shows the staff, the box and Finish', async () => {
      await renderTrainerWhileLoading()

      expect(screen.queryByRole('img', { name: 'Music staff' })).not.toBeNull()
      expect(autoNext()).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeNull()
    })

    it('shows them in the kept place once the note is drawn', async () => {
      await renderTrainerWhileLoading()
      const place = answerControls()

      drawStaff()

      await waitFor(() => expect(queryCheck()).not.toBeNull())
      expect(answerControls()).toBe(place)
      for (const name of NAMES) {
        expect(within(place).queryByRole('button', { name })).not.toBeNull()
      }
      expect(within(place).queryByRole('button', { name: 'Check' })).not.toBeNull()
    })

    // Later notes are drawn at once with VexFlow loaded; the buttons must not blink meanwhile.
    it('keeps them shown on the next questions without waiting for the staff', async () => {
      await renderTrainerWhileLoading()
      drawStaff()
      await waitFor(() => expect(queryCheck()).not.toBeNull())
      await answer('do')

      await fireEvent.click(nextButton())

      expect(queryNames()).toEqual(NAMES)
      expect(queryCheck()).not.toBeNull()
    })

    it('keeps them shown on the question opened by a quick answer', async () => {
      await renderTrainerWhileLoading()
      drawStaff()
      await waitFor(() => expect(queryCheck()).not.toBeNull())
      await fireEvent.click(autoNext())

      await fireEvent.click(nameButton('do'))

      expect(shownPitch()).toBe('D4')
      expect(queryNames()).toEqual(NAMES)
    })

    it('shows the note names and no Check once the note is drawn in the quick mode', async () => {
      await renderTrainerWhileLoading()
      await fireEvent.click(autoNext())

      drawStaff()

      await waitFor(() => expect(queryNames()).toEqual(NAMES))
      expect(queryCheck()).toBeNull()
    })

    it('shows the reload message, no buttons and Finish when loading fails', async () => {
      await renderTrainerWhileLoading()

      failStaffLoading()

      expect(await screen.findByText("Couldn't load the staff. Reload the page.")).toBeTruthy()
      expect(queryNames()).toEqual([])
      expect(queryCheck()).toBeNull()
      expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeNull()
    })
  })

  describe('when the staff fails to load', () => {
    it('shows a reload message in place of the staff', async () => {
      await renderTrainer()

      failStaffLoading()

      expect(await screen.findByText("Couldn't load the staff. Reload the page.")).toBeTruthy()
      expect(screen.queryByRole('img', { name: 'Music staff' })).toBeNull()
    })

    it('hides the note name buttons and Check', async () => {
      await renderTrainer()

      failStaffLoading()

      await screen.findByText("Couldn't load the staff. Reload the page.")
      for (const name of NAMES) {
        expect(screen.queryByRole('button', { name })).toBeNull()
      }
      expect(queryCheck()).toBeNull()
      expect(queryNext()).toBeNull()
    })

    it('shows the reload message, no note names and Finish in the quick mode', async () => {
      await renderTrainer()
      await fireEvent.click(autoNext())

      failStaffLoading()

      expect(await screen.findByText("Couldn't load the staff. Reload the page.")).toBeTruthy()
      for (const name of NAMES) {
        expect(screen.queryByRole('button', { name })).toBeNull()
      }
      expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeNull()
    })
  })

  // Guards against hard-coded English. The exact texts are slice 4 decisions in the feature file.
  describe.each([
    {
      locale: 'ru' as const,
      heading: 'Назовите ноту',
      staffLabel: 'Нотоносец',
      check: 'Проверить',
      next: 'Далее',
      correct: 'Верно',
      incorrectTryAgain: 'Неверно. Попробуйте ещё раз.',
      review: 'Вы выбрали fa. Это re — нота под нотоносцем.',
      hint: 'Сначала выберите название ноты',
      loadError: 'Не удалось загрузить нотоносец. Перезагрузите страницу.',
      autoNext: 'Автоматически открывать следующий вопрос',
    },
    {
      locale: 'es' as const,
      heading: 'Nombra la nota',
      staffLabel: 'Pentagrama',
      check: 'Comprobar',
      next: 'Siguiente',
      correct: 'Correcto',
      incorrectTryAgain: 'Incorrecto. Inténtalo de nuevo.',
      review: 'Elegiste fa. Es re: la nota justo debajo del pentagrama.',
      hint: 'Primero elige el nombre de la nota',
      loadError: 'No se pudo cargar el pentagrama. Recarga la página.',
      autoNext: 'Abrir automáticamente la siguiente pregunta',
    },
  ])('in the $locale language', (texts) => {
    const renderIn = () => renderTrainer(startingOnC4(), createManualClock(), texts.locale)
    const button = (name: string) => screen.getByRole('button', { name })

    it('shows the heading, the staff, the note names, Check and the box', async () => {
      await renderIn()

      expect(screen.getByRole('heading', { name: texts.heading })).toBeTruthy()
      expect(screen.getByRole('img', { name: texts.staffLabel })).toBeTruthy()
      for (const name of NAMES) expect(button(name)).toBeTruthy()
      expect(button(texts.check)).toBeTruthy()
      expect(screen.getByRole('checkbox', { name: texts.autoNext })).toBeTruthy()
    })

    it('shows the hint, the results and Next', async () => {
      await renderIn()

      await fireEvent.click(button(texts.check))
      expect(status()?.textContent?.trim()).toBe(texts.hint)

      // C4: do is correct.
      await fireEvent.click(button('do'))
      await fireEvent.click(button(texts.check))
      expect(status()?.textContent?.trim()).toBe(texts.correct)
      await fireEvent.click(button(texts.next))

      // D4: mi and fa are wrong.
      await fireEvent.click(button('mi'))
      await fireEvent.click(button(texts.check))
      expect(status()?.textContent?.trim()).toBe(texts.incorrectTryAgain)
      await fireEvent.click(button('fa'))
      await fireEvent.click(button(texts.check))
      expect(status()?.textContent?.trim()).toBe(texts.review)
      expect(button(texts.next)).toBeTruthy()
    })

    it('shows the reload message when the staff fails to load', async () => {
      await renderIn()

      failStaffLoading()

      expect(await screen.findByText(texts.loadError)).toBeTruthy()
    })

    it('shows no English text', async () => {
      await renderIn()
      await fireEvent.click(button(texts.check))

      const text = document.body.textContent ?? ''
      for (const english of [
        'Name the note',
        'Check',
        'Choose a note name first',
        'Open next question automatically',
      ]) {
        expect(text).not.toContain(english)
      }
      expect(screen.queryByRole('img', { name: 'Music staff' })).toBeNull()
    })
  })
})
