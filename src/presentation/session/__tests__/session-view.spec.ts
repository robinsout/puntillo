import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/vue'
import {
  chooseLength,
  createManualClock,
  drawStaff,
  failStaffLoading,
  NAMES,
  renderSession,
  startingOnC4,
  type ManualClock,
} from '@/presentation/__tests__/screen'

// Seconds stay on the line of their number.
const NBSP = '\u00A0'

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// A constant 0 alternates questions: odd ones are C4 (do), even ones D4 (re).
const rightName = (number: number) => (number % 2 === 1 ? 'do' : 're')
const wrongName = () => 'mi'

const LENGTHS = ['10', '20', '50', 'No limit']

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const choiceHeading = () => screen.queryByRole('heading', { name: 'How many questions?' })
const resultsHeading = () => screen.queryByRole('heading', { name: 'Results' })
const staff = () => screen.queryByRole('img', { name: 'Music staff' })
const autoNext = () =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: 'Open next question automatically' })
const queryText = (text: string) => screen.queryByText(text)

// The default normalizer turns any whitespace into a plain space, which would hide a missing
// non-breaking space.
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

async function answer(name: string) {
  await fireEvent.click(button(name))
  await fireEvent.click(button('Check'))
}

async function answerQuestions(count: number, correct: (number: number) => boolean = () => true) {
  for (let number = 1; number <= count; number++) {
    await answer(correct(number) ? rightName(number) : wrongName())
    if (number < count) await fireEvent.click(button('Next'))
  }
}

async function answerQuestionsAutomatically(clock: ManualClock, count: number) {
  for (let number = 1; number <= count; number++) {
    await answer(rightName(number))
    if (number < count) {
      await clock.elapse(1500)
      await screen.findByRole('button', { name: 'Check' })
    }
  }
}

const sevenOfTen = (number: number) => ![3, 6, 9].includes(number)

async function finishSessionOfTen() {
  await chooseLength('10')
  await answerQuestions(10, sevenOfTen)
  await fireEvent.click(button('Results'))
}

describe('SessionView', () => {
  describe('on open', () => {
    it('shows the heading "How many questions?"', () => {
      renderSession()

      expect(choiceHeading()).not.toBeNull()
    })

    it('offers four lengths as buttons: 10, 20, 50 and No limit', () => {
      renderSession()

      const names = screen.getAllByRole('button').map((element) => element.textContent?.trim())
      expect(names).toEqual(LENGTHS)
    })

    it('has no length chosen in advance', () => {
      renderSession()

      for (const name of LENGTHS) {
        expect(button(name).getAttribute('aria-pressed')).not.toBe('true')
      }
    })

    it('shows no question yet', () => {
      renderSession()

      expect(staff()).toBeNull()
      expect(queryButton('Check')).toBeNull()
      for (const name of NAMES) expect(queryButton(name)).toBeNull()
    })
  })

  describe('choosing a length', () => {
    it.each(LENGTHS)('starts the session with the first question at once on %s', async (name) => {
      renderSession()

      await chooseLength(name)

      expect(staff()?.getAttribute('data-pitch')).toBe('C4')
      for (const note of NAMES) expect(queryButton(note)).not.toBeNull()
      expect(queryButton('Check')).not.toBeNull()
      expect(choiceHeading()).toBeNull()
      for (const length of LENGTHS) expect(queryButton(length)).toBeNull()
    })
  })

  describe('the question number', () => {
    it.each([
      { length: '10', shown: 'Question 1 of 10' },
      { length: '20', shown: 'Question 1 of 20' },
      { length: '50', shown: 'Question 1 of 50' },
      { length: 'No limit', shown: 'Question 1' },
    ])('is "$shown" at the start of a $length session', async ({ length, shown }) => {
      renderSession()

      await chooseLength(length)

      expect(queryText(shown)).not.toBeNull()
    })

    it('grows by one after Next', async () => {
      renderSession()
      await chooseLength('10')

      await answer('do')
      expect(queryText('Question 1 of 10')).not.toBeNull()
      await fireEvent.click(button('Next'))

      expect(queryText('Question 2 of 10')).not.toBeNull()
      expect(queryText('Question 1 of 10')).toBeNull()
    })

    it('grows by one after a wrong answer too', async () => {
      renderSession()
      await chooseLength('10')

      await answer(wrongName())
      await fireEvent.click(button('Next'))

      expect(queryText('Question 2 of 10')).not.toBeNull()
    })

    it('grows by one after the next question opens automatically', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())

      await answer('do')
      await clock.elapse(1500)

      await waitFor(() => expect(queryText('Question 2 of 10')).not.toBeNull())
    })

    it('does not change on Check without a note name', async () => {
      renderSession()
      await chooseLength('10')

      await fireEvent.click(button('Check'))
      await fireEvent.click(button('Check'))

      expect(queryText('Question 1 of 10')).not.toBeNull()
    })

    it('counts without a limit: "Question 3"', async () => {
      renderSession()
      await chooseLength('No limit')

      await answerQuestions(2)
      await fireEvent.click(button('Next'))

      expect(queryText('Question 3')).not.toBeNull()
    })
  })

  describe('the progress during questions', () => {
    const expectProgress = (correct: number, checked: number, streak: number) => {
      expect(queryText(`Correct: ${correct} of ${checked}`)).not.toBeNull()
      expect(queryText(`Streak: ${streak}`)).not.toBeNull()
    }

    it.each(LENGTHS)(
      'is "Correct: 0 of 0" and "Streak: 0" before the first check on %s',
      async (length) => {
        renderSession()

        await chooseLength(length)

        expectProgress(0, 0, 0)
      },
    )

    it('counts a correct check at once: one more correct of one more, the streak grows', async () => {
      renderSession()
      await chooseLength('10')

      await answer('do')

      expectProgress(1, 1, 1)
    })

    it('counts a wrong check as one more checked and drops the streak to zero', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(2)
      await fireEvent.click(button('Next'))

      await answer(wrongName())

      expectProgress(2, 3, 0)
    })

    it('starts the streak over after a wrong check', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(4, (number) => number !== 2)

      expectProgress(3, 4, 2)
    })

    it('does not change on Check without a note name', async () => {
      renderSession()
      await chooseLength('10')
      await answer('do')
      await fireEvent.click(button('Next'))

      await fireEvent.click(button('Check'))
      await fireEvent.click(button('Check'))

      expectProgress(1, 1, 1)
    })

    it('does not change on Check without a note name before the first check', async () => {
      renderSession()
      await chooseLength('10')

      await fireEvent.click(button('Check'))

      expectProgress(0, 0, 0)
    })

    it('stays the same on the next question until it is checked', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(2)

      await fireEvent.click(button('Next'))

      expect(queryText('Question 3 of 10')).not.toBeNull()
      expectProgress(2, 2, 2)
    })

    it('carries over to the question opened automatically', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())

      await answerQuestionsAutomatically(clock, 2)

      expectProgress(2, 2, 2)
      await clock.elapse(1500)
      await waitFor(() => expect(queryText('Question 3 of 10')).not.toBeNull())
      expectProgress(2, 2, 2)
    })

    it('is shown on the last question after its check', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(10, sevenOfTen)

      expect(queryButton('Results')).not.toBeNull()
      expectProgress(7, 10, 1)
    })

    it('works without a limit', async () => {
      renderSession()
      await chooseLength('No limit')

      await answerQuestions(12, (number) => number !== 9)
      expectProgress(11, 12, 3)
      await fireEvent.click(button('Next'))
      await fireEvent.click(button('Check'))

      expect(queryText('Question 13')).not.toBeNull()
      expectProgress(11, 12, 3)
    })

    it('shows only the current values', async () => {
      renderSession()
      await chooseLength('10')

      await answer('do')

      expect(screen.queryAllByText(/^Correct: \d+ of \d+$/)).toHaveLength(1)
      expect(screen.queryAllByText(/^Streak: \d+$/)).toHaveLength(1)
    })
  })

  describe('the last question of a session', () => {
    it('shows Next, not Results, after the check of the question before the last', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(9)

      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Results')).toBeNull()
    })

    it('is numbered "Question 10 of 10"', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(9)
      await fireEvent.click(button('Next'))

      expect(queryText('Question 10 of 10')).not.toBeNull()
      expect(queryButton('Check')).not.toBeNull()
    })

    it('shows Results in place of Next after the check', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(10)

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
      expect(queryButton('Check')).toBeNull()
      expect(screen.getByRole('status').textContent?.trim()).toBe('Correct')
    })

    it('moves the keyboard focus to Results after the check', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(9)
      await fireEvent.click(button('Next'))
      await fireEvent.click(button('do'))
      button('Check').focus()

      await fireEvent.click(button('Check'))

      await waitFor(() => expect(document.activeElement).toBe(queryButton('Results')))
    })

    it('keeps Check after Check without a note name', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(9)
      await fireEvent.click(button('Next'))

      await fireEvent.click(button('Check'))

      expect(queryButton('Check')).not.toBeNull()
      expect(queryButton('Results')).toBeNull()
    })

    it('opens the results when Results is pressed', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(10)

      await fireEvent.click(button('Results'))

      expect(resultsHeading()).not.toBeNull()
      expect(staff()).toBeNull()
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Results')).toBeNull()
    })

    it('never comes without a limit', async () => {
      renderSession()
      await chooseLength('No limit')

      await answerQuestions(10)
      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Results')).toBeNull()
      await fireEvent.click(button('Next'))

      expect(queryText('Question 11')).not.toBeNull()
      expect(queryButton('Check')).not.toBeNull()
    })
  })

  describe('opening the results automatically', () => {
    it('keeps the result and Results for 1.5 seconds after the last check', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)

      await clock.elapse(1499)

      expect(resultsHeading()).toBeNull()
      expect(queryButton('Results')).not.toBeNull()
      expect(queryText('Question 10 of 10')).not.toBeNull()
    })

    it('opens the results 1.5 seconds after the last check', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)

      await clock.elapse(1500)

      await waitFor(() => expect(resultsHeading()).not.toBeNull())
      expect(exactText('Accuracy: 100% (10 of 10)')).not.toBeNull()
      expect(staff()).toBeNull()
    })

    it('opens the results at once when Results is pressed during the pause', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)

      await fireEvent.click(button('Results'))
      expect(resultsHeading()).not.toBeNull()
      await clock.elapse(1500)

      expect(resultsHeading()).not.toBeNull()
      expect(clock.pending()).toBe(0)
    })

    it('is cancelled when the box is unticked during the pause', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)

      await fireEvent.click(autoNext())
      await clock.elapse(1500)

      expect(resultsHeading()).toBeNull()
      expect(queryButton('Results')).not.toBeNull()

      await fireEvent.click(button('Results'))
      expect(resultsHeading()).not.toBeNull()
    })

    it('does not happen while the box is unticked', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerQuestions(10)

      await clock.elapse(10_000)

      expect(clock.pending()).toBe(0)
      expect(resultsHeading()).toBeNull()
      expect(queryButton('Results')).not.toBeNull()
    })
  })

  describe('the results', () => {
    it('show the heading "Results"', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(resultsHeading()).not.toBeNull()
    })

    it('show the accuracy in percent and as a fraction of the checked questions', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(exactText('Accuracy: 70% (7 of 10)')).not.toBeNull()
    })

    it('show the number of checked questions', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(queryText('Questions: 10')).not.toBeNull()
    })

    it('show the best streak of the session, even when the run was broken later', async () => {
      renderSession()
      await chooseLength('10')

      // Runs of 4, 1 and 3: the longest one is not the last.
      await answerQuestions(10, (number) => ![5, 7].includes(number))
      await fireEvent.click(button('Results'))

      expect(queryText('Best streak: 4')).not.toBeNull()
    })

    it('show the best streak when it is the last run', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(10, (number) => number !== 3)
      await fireEvent.click(button('Results'))

      expect(queryText('Best streak: 7')).not.toBeNull()
    })

    it('show "Best streak: 0" when no answer was correct', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(10, () => false)
      await fireEvent.click(button('Results'))

      expect(queryText('Best streak: 0')).not.toBeNull()
    })

    it('show the best streak when they open automatically', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)

      await clock.elapse(1500)

      await waitFor(() => expect(resultsHeading()).not.toBeNull())
      expect(queryText('Best streak: 10')).not.toBeNull()
    })

    it('do not count Check without a note name', async () => {
      renderSession()
      await chooseLength('10')

      for (let number = 1; number <= 10; number++) {
        await fireEvent.click(button('Check'))
        await answer(rightName(number))
        if (number < 10) await fireEvent.click(button('Next'))
      }
      await fireEvent.click(button('Results'))

      expect(queryText('Questions: 10')).not.toBeNull()
      expect(exactText('Accuracy: 100% (10 of 10)')).not.toBeNull()
    })

    it('count every question of a longer session', async () => {
      renderSession()
      await chooseLength('20')

      // Rounding is tested in the domain: with lengths 10, 20 and 50 a finished session
      // always gives a whole percent.
      await answerQuestions(20, (number) => number <= 13)
      await fireEvent.click(button('Results'))

      expect(exactText('Accuracy: 65% (13 of 20)')).not.toBeNull()
      expect(queryText('Questions: 20')).not.toBeNull()
    })

    it('offer New session and nothing of the question', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(queryButton('New session')).not.toBeNull()
      expect(staff()).toBeNull()
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
      for (const name of NAMES) expect(queryButton(name)).toBeNull()
      expect(screen.queryByText(/^Question \d+/)).toBeNull()
    })
  })

  describe('New session', () => {
    it('opens the choice of length with nothing chosen', async () => {
      renderSession()
      await finishSessionOfTen()

      await fireEvent.click(button('New session'))

      expect(choiceHeading()).not.toBeNull()
      for (const name of LENGTHS) {
        expect(button(name).getAttribute('aria-pressed')).not.toBe('true')
      }
      expect(resultsHeading()).toBeNull()
      expect(queryButton('New session')).toBeNull()
    })

    it('starts a fresh session from question 1', async () => {
      renderSession()
      await finishSessionOfTen()
      await fireEvent.click(button('New session'))

      await chooseLength('20')

      expect(queryText('Question 1 of 20')).not.toBeNull()
      expect(queryButton('Check')).not.toBeNull()
    })

    it('counts the new session from zero', async () => {
      renderSession()
      await finishSessionOfTen()
      await fireEvent.click(button('New session'))
      await chooseLength('10')

      await answerQuestions(10)
      await fireEvent.click(button('Results'))

      expect(exactText('Accuracy: 100% (10 of 10)')).not.toBeNull()
      expect(queryText('Questions: 10')).not.toBeNull()
    })

    it('starts "Correct" and the streak from zero', async () => {
      renderSession()
      await finishSessionOfTen()
      await fireEvent.click(button('New session'))

      await chooseLength('10')

      expect(queryText('Correct: 0 of 0')).not.toBeNull()
      expect(queryText('Streak: 0')).not.toBeNull()
    })

    it('carries no streak over from the previous session', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(10)
      await fireEvent.click(button('Results'))
      await fireEvent.click(button('New session'))
      await chooseLength('10')

      await answer('do')

      expect(queryText('Correct: 1 of 1')).not.toBeNull()
      expect(queryText('Streak: 1')).not.toBeNull()
    })

    it('counts the best streak of the new session only', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(10)
      await fireEvent.click(button('Results'))
      await fireEvent.click(button('New session'))
      await chooseLength('10')

      await answerQuestions(10, sevenOfTen)
      await fireEvent.click(button('Results'))

      expect(queryText('Best streak: 2')).not.toBeNull()
    })
  })

  describe('the "Open next question automatically" box between sessions', () => {
    it('stays ticked in the next session', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)
      await clock.elapse(1500)
      await waitFor(() => expect(resultsHeading()).not.toBeNull())
      await fireEvent.click(button('New session'))

      await chooseLength('10')

      expect(autoNext().checked).toBe(true)
    })

    it('keeps opening the next question automatically in the next session', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestions(10)
      await fireEvent.click(button('Results'))
      await fireEvent.click(button('New session'))
      await chooseLength('10')

      await answer('do')
      await clock.elapse(1500)

      await waitFor(() => expect(queryText('Question 2 of 10')).not.toBeNull())
    })

    it('stays unticked in the next session once unticked', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await fireEvent.click(autoNext())
      await answerQuestions(10)
      await fireEvent.click(button('Results'))
      await fireEvent.click(button('New session'))
      await chooseLength('10')

      await answer('do')
      await clock.elapse(1500)

      expect(autoNext().checked).toBe(false)
      expect(clock.pending()).toBe(0)
      expect(queryText('Question 1 of 10')).not.toBeNull()
    })
  })

  describe('Finish', () => {
    const queryFinish = () => queryButton('Finish')
    const finish = () => fireEvent.click(button('Finish'))
    const h1 = (name: string) => screen.queryByRole('heading', { level: 1, name })

    // Questions 1 and 2 are correct, 3 is wrong: 2 of 3, the best streak is 2, the current 0.
    const twoOfThree = (number: number) => number !== 3
    const expectResultsOfThree = () => {
      expect(resultsHeading()).not.toBeNull()
      expect(exactText('Accuracy: 67% (2 of 3)')).not.toBeNull()
      expect(queryText('Questions: 3')).not.toBeNull()
      expect(queryText('Best streak: 2')).not.toBeNull()
    }

    it.each(LENGTHS)('is shown on the first question of a %s session', async (length) => {
      renderSession()

      await chooseLength(length)

      expect(queryFinish()).not.toBeNull()
    })

    it('is shown after the check, next to Next', async () => {
      renderSession()
      await chooseLength('10')

      await answer('do')

      expect(queryButton('Next')).not.toBeNull()
      expect(queryFinish()).not.toBeNull()
    })

    it('is shown on the last question next to Results', async () => {
      renderSession()
      await chooseLength('10')

      await answerQuestions(10)

      expect(queryButton('Results')).not.toBeNull()
      expect(queryFinish()).not.toBeNull()
    })

    it('is shown deep into a session without a limit', async () => {
      renderSession()
      await chooseLength('No limit')

      await answerQuestions(12)
      await fireEvent.click(button('Next'))

      expect(queryText('Question 13')).not.toBeNull()
      expect(queryFinish()).not.toBeNull()
    })

    it('is not shown on the choice of length', () => {
      renderSession()

      expect(queryFinish()).toBeNull()
    })

    it('is not shown on the results', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(queryFinish()).toBeNull()
    })

    // Owner's decision for slice 3: Finish sits at the bottom of the question screen, below
    // the box. Document order is checked rather than coordinates, which jsdom does not lay out.
    it('comes after the action button and the "Open next question automatically" box', async () => {
      renderSession()
      await chooseLength('10')

      const follows = (earlier: Element, later: Element) =>
        (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

      expect(follows(button('Check'), button('Finish'))).toBe(true)
      expect(follows(autoNext(), button('Finish'))).toBe(true)

      await answer('do')

      expect(follows(button('Next'), button('Finish'))).toBe(true)
      expect(follows(autoNext(), button('Finish'))).toBe(true)
    })

    it('opens the results of the checked questions at once, without a confirmation', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(3, twoOfThree)

      await finish()

      expectResultsOfThree()
      expect(staff()).toBeNull()
      expect(queryButton('Check')).toBeNull()
      expect(queryButton('Next')).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByText(/^Question \d+/)).toBeNull()
    })

    it('leaves out the question shown but not checked', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(3, twoOfThree)
      await fireEvent.click(button('Next'))
      // Question 4 is C4: do would be correct if it were counted.
      await fireEvent.click(button('do'))

      await finish()

      expectResultsOfThree()
    })

    it('leaves out Check without a note name on the shown question', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(3, twoOfThree)
      await fireEvent.click(button('Next'))
      await fireEvent.click(button('Check'))

      await finish()

      expectResultsOfThree()
    })

    it('opens the results without a limit, with every checked question', async () => {
      renderSession()
      await chooseLength('No limit')
      await answerQuestions(12, (number) => number !== 9)

      await finish()

      expect(resultsHeading()).not.toBeNull()
      expect(exactText('Accuracy: 92% (11 of 12)')).not.toBeNull()
      expect(queryText('Questions: 12')).not.toBeNull()
      expect(queryText('Best streak: 8')).not.toBeNull()
    })

    it('opens the results on the last question before Results is pressed', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(10, sevenOfTen)

      await finish()

      expect(exactText('Accuracy: 70% (7 of 10)')).not.toBeNull()
      expect(queryText('Questions: 10')).not.toBeNull()
    })

    it('opens the choice of length with no results when nothing is checked', async () => {
      renderSession()
      await chooseLength('10')

      await finish()

      expect(choiceHeading()).not.toBeNull()
      for (const length of LENGTHS) expect(queryButton(length)).not.toBeNull()
      expect(resultsHeading()).toBeNull()
      expect(staff()).toBeNull()
      expect(queryFinish()).toBeNull()
    })

    it('opens the choice of length when only Check without a note name was pressed', async () => {
      renderSession()
      await chooseLength('No limit')
      await fireEvent.click(button('Check'))

      await finish()

      expect(choiceHeading()).not.toBeNull()
      expect(resultsHeading()).toBeNull()
    })

    it('opens the choice of length when a note name is chosen but not checked', async () => {
      renderSession()
      await chooseLength('10')
      await fireEvent.click(button('do'))

      await finish()

      expect(choiceHeading()).not.toBeNull()
      expect(resultsHeading()).toBeNull()
    })

    // Criterion 8: Finish is available all through the session, the staff failing included.
    it('is shown and works when the staff fails to load', async () => {
      renderSession()
      await chooseLength('10')

      failStaffLoading()
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeNull())

      expect(queryButton('Check')).toBeNull()
      expect(
        screen.queryByRole('checkbox', { name: 'Open next question automatically' }),
      ).toBeNull()
      expect(queryFinish()).not.toBeNull()

      await finish()

      expect(choiceHeading()).not.toBeNull()
      expect(resultsHeading()).toBeNull()
    })

    it('starts the next session from zero', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(3, twoOfThree)
      await finish()
      await fireEvent.click(button('New session'))

      await chooseLength('10')

      expect(queryText('Question 1 of 10')).not.toBeNull()
      expect(queryText('Correct: 0 of 0')).not.toBeNull()
      expect(queryText('Streak: 0')).not.toBeNull()
    })

    describe('during the pause before the next question opens automatically', () => {
      it('opens the results and cancels the next question', async () => {
        const clock = renderSession()
        await chooseLength('10')
        await fireEvent.click(autoNext())
        await answerQuestionsAutomatically(clock, 3)

        await finish()
        expect(resultsHeading()).not.toBeNull()
        expect(clock.pending()).toBe(0)
        await clock.elapse(1500)

        expect(resultsHeading()).not.toBeNull()
        expect(exactText('Accuracy: 100% (3 of 3)')).not.toBeNull()
        expect(queryText('Questions: 3')).not.toBeNull()
        expect(queryText('Best streak: 3')).not.toBeNull()
        expect(staff()).toBeNull()
      })

      it('does not move the next session on later', async () => {
        const clock = renderSession()
        await chooseLength('10')
        await fireEvent.click(autoNext())
        await answer('do')
        await finish()
        await fireEvent.click(button('New session'))
        await chooseLength('10')

        await clock.elapse(1500)

        expect(queryText('Question 1 of 10')).not.toBeNull()
        expect(queryButton('Check')).not.toBeNull()
        expect(queryText('Correct: 0 of 0')).not.toBeNull()
      })

      it('cancels the results opening automatically after the last question', async () => {
        const clock = renderSession()
        await chooseLength('10')
        await fireEvent.click(autoNext())
        await answerQuestionsAutomatically(clock, 10)

        await finish()
        expect(clock.pending()).toBe(0)
        await fireEvent.click(button('New session'))
        await clock.elapse(1500)

        expect(choiceHeading()).not.toBeNull()
        expect(resultsHeading()).toBeNull()
      })

      it('keeps the box ticked for the next session', async () => {
        renderSession()
        await chooseLength('10')
        await fireEvent.click(autoNext())
        await answer('do')
        await finish()
        await fireEvent.click(button('New session'))

        await chooseLength('10')

        expect(autoNext().checked).toBe(true)
      })
    })

    describe('keyboard focus', () => {
      it('moves to the results heading', async () => {
        renderSession()
        await chooseLength('10')
        await answerQuestions(3, twoOfThree)
        button('Finish').focus()

        await finish()

        await waitFor(() => expect(document.activeElement).toBe(h1('Results')))
      })

      it('moves to the choice heading when nothing is checked', async () => {
        renderSession()
        await chooseLength('10')
        button('Finish').focus()

        await finish()

        await waitFor(() => expect(document.activeElement).toBe(h1('How many questions?')))
      })

      it('moves to the results heading when pressed during the pause', async () => {
        const clock = renderSession()
        await chooseLength('10')
        await fireEvent.click(autoNext())
        await answerQuestionsAutomatically(clock, 2)
        button('Finish').focus()

        await finish()

        await waitFor(() => expect(document.activeElement).toBe(h1('Results')))
      })
    })
  })

  // Criterion 10: an answer is timed from the moment its note is drawn to the counted check.
  // The stub draws each note as soon as it is shown, so only elapse() adds time.
  describe('the average answer time in the results', () => {
    const finish = () => fireEvent.click(button('Finish'))

    async function answerAfter(clock: ManualClock, ms: number, name: string) {
      await clock.elapse(ms)
      await answer(name)
    }

    it('averages the time of the checked questions: "Average time: 2.5 s"', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 2400, 'do')
      await fireEvent.click(button('Next'))
      await answerAfter(clock, 2600, 're')

      await finish()

      expect(exactText(`Average time: 2.5${NBSP}s`)).not.toBeNull()
    })

    it('counts a wrong answer too', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 3000, wrongName())

      await finish()

      expect(exactText(`Average time: 3.0${NBSP}s`)).not.toBeNull()
    })

    it('shows one digit after the point even for whole seconds', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 2000, 'do')

      await finish()

      expect(exactText(`Average time: 2.0${NBSP}s`)).not.toBeNull()
    })

    it('rounds to tenths of a second', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 2360, 'do')

      await finish()

      expect(exactText(`Average time: 2.4${NBSP}s`)).not.toBeNull()
    })

    it('keeps timing through Check without a note name', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await clock.elapse(1000)
      await fireEvent.click(button('Check'))
      await clock.elapse(1500)
      await answer('do')

      await finish()

      expect(exactText(`Average time: 2.5${NBSP}s`)).not.toBeNull()
    })

    it('includes the time between choosing a note name and Check', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await clock.elapse(1000)
      await fireEvent.click(button('do'))
      await clock.elapse(1500)
      await fireEvent.click(button('Check'))

      await finish()

      expect(exactText(`Average time: 2.5${NBSP}s`)).not.toBeNull()
    })

    it('leaves out the time after the check before Next', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 2000, 'do')
      await clock.elapse(5000)
      await fireEvent.click(button('Next'))
      await answerAfter(clock, 3000, 're')

      await finish()

      expect(exactText(`Average time: 2.5${NBSP}s`)).not.toBeNull()
    })

    it('leaves out the pause before the next question opens automatically', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerAfter(clock, 2000, 'do')
      await clock.elapse(1500)
      await screen.findByRole('button', { name: 'Check' })
      await answerAfter(clock, 3000, 're')

      await finish()

      expect(exactText(`Average time: 2.5${NBSP}s`)).not.toBeNull()
    })

    it('leaves out the time before the staff has drawn the note', async () => {
      const clock = createManualClock()
      renderSession(startingOnC4(), clock, 'en', 'held')
      await chooseLength('10')
      await clock.elapse(5000)
      drawStaff()
      await screen.findByRole('button', { name: 'Check' })
      await answerAfter(clock, 2400, 'do')

      await finish()

      expect(exactText(`Average time: 2.4${NBSP}s`)).not.toBeNull()
    })

    it('is shown when the results open after the last question', async () => {
      const clock = renderSession()
      await chooseLength('10')
      for (let number = 1; number <= 10; number++) {
        await answerAfter(clock, number % 2 === 1 ? 2000 : 3000, rightName(number))
        if (number < 10) await fireEvent.click(button('Next'))
      }

      await fireEvent.click(button('Results'))

      expect(exactText(`Average time: 2.5${NBSP}s`)).not.toBeNull()
    })

    it('leaves out the question shown but not checked on Finish', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 2400, 'do')
      await fireEvent.click(button('Next'))
      await clock.elapse(9000)
      await fireEvent.click(button('re'))

      await finish()

      expect(exactText(`Average time: 2.4${NBSP}s`)).not.toBeNull()
    })

    it('times the new session from zero', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await answerAfter(clock, 5000, 'do')
      await finish()
      await fireEvent.click(button('New session'))
      await clock.elapse(7000)
      await chooseLength('10')
      await answerAfter(clock, 2000, 'do')

      await finish()

      expect(exactText(`Average time: 2.0${NBSP}s`)).not.toBeNull()
    })
  })

  // Owner's decision: the choice and results headings are visible h1s, the auto-next box
  // is shown only during questions, and on a screen change the focus moves to its heading.
  describe('screen headings and focus', () => {
    const h1 = (name: string) => screen.queryByRole('heading', { level: 1, name })
    const queryAutoNext = () =>
      screen.queryByRole('checkbox', { name: 'Open next question automatically' })

    it('has "How many questions?" as the first-level heading of the choice', () => {
      renderSession()

      expect(h1('How many questions?')).not.toBeNull()
    })

    it('has "Results" as the first-level heading of the results', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(h1('Results')).not.toBeNull()
    })

    it('shows no "Open next question automatically" box on the choice of length', () => {
      renderSession()

      expect(queryAutoNext()).toBeNull()
    })

    it('shows no "Open next question automatically" box on the results', async () => {
      renderSession()

      await finishSessionOfTen()

      expect(queryAutoNext()).toBeNull()
    })

    it('moves the focus to the question heading when the session starts', async () => {
      renderSession()
      button('10').focus()

      await chooseLength('10')

      await waitFor(() => expect(document.activeElement).toBe(h1('Name the note')))
    })

    it('moves the focus to the results heading when Results is pressed', async () => {
      renderSession()
      await chooseLength('10')
      await answerQuestions(10)
      button('Results').focus()

      await fireEvent.click(button('Results'))

      await waitFor(() => expect(document.activeElement).toBe(h1('Results')))
    })

    it('moves the focus to the results heading when they open automatically', async () => {
      const clock = renderSession()
      await chooseLength('10')
      await fireEvent.click(autoNext())
      await answerQuestionsAutomatically(clock, 10)
      button('Results').focus()

      await clock.elapse(1500)

      await waitFor(() => expect(document.activeElement).toBe(h1('Results')))
    })

    it('moves the focus to the choice heading on New session', async () => {
      renderSession()
      await finishSessionOfTen()
      button('New session').focus()

      await fireEvent.click(button('New session'))

      await waitFor(() => expect(document.activeElement).toBe(h1('How many questions?')))
    })
  })

  // Texts come from the texts table in docs/features/m1-session.md.
  // Russian and Spanish put a non-breaking space before %.
  describe.each([
    {
      locale: 'ru' as const,
      choose: 'Сколько вопросов?',
      noLimit: 'Без ограничения',
      check: 'Проверить',
      next: 'Далее',
      first: 'Вопрос 1 из 10',
      firstUnlimited: 'Вопрос 1',
      results: 'Результаты',
      accuracy: 'Точность: 70 % (7 из 10)',
      questions: 'Вопросов: 10',
      noProgress: ['Верно: 0 из 0', 'Серия: 0'],
      progress: ['Верно: 1 из 1', 'Серия: 1'],
      bestStreak: 'Лучшая серия: 2',
      newSession: 'Новая сессия',
      finish: 'Завершить',
      questionsOfOne: 'Вопросов: 1',
      averageTime: `Среднее время: 2,5${NBSP}с`,
    },
    {
      locale: 'es' as const,
      choose: '¿Cuántas preguntas?',
      noLimit: 'Sin límite',
      check: 'Comprobar',
      next: 'Siguiente',
      first: 'Pregunta 1 de 10',
      firstUnlimited: 'Pregunta 1',
      results: 'Resultados',
      accuracy: 'Precisión: 70 % (7 de 10)',
      questions: 'Preguntas: 10',
      noProgress: ['Correctas: 0 de 0', 'Racha: 0'],
      progress: ['Correctas: 1 de 1', 'Racha: 1'],
      bestStreak: 'Mejor racha: 2',
      newSession: 'Nueva sesión',
      finish: 'Terminar',
      questionsOfOne: 'Preguntas: 1',
      averageTime: `Tiempo medio: 2,5${NBSP}s`,
    },
  ])('in the $locale language', (texts) => {
    const renderIn = () => renderSession(startingOnC4(), createManualClock(), texts.locale)

    async function finishIn() {
      await chooseLength('10')
      for (let number = 1; number <= 10; number++) {
        await fireEvent.click(button(sevenOfTen(number) ? rightName(number) : wrongName()))
        await fireEvent.click(button(texts.check))
        if (number < 10) await fireEvent.click(button(texts.next))
      }
    }

    it('shows the choice of length', () => {
      renderIn()

      expect(screen.getByRole('heading', { name: texts.choose })).toBeTruthy()
      const names = screen.getAllByRole('button').map((element) => element.textContent?.trim())
      expect(names).toEqual(['10', '20', '50', texts.noLimit])
    })

    it('shows the question number', async () => {
      renderIn()

      await chooseLength('10')

      expect(queryText(texts.first)).not.toBeNull()
    })

    it('shows the question number without a limit', async () => {
      renderIn()

      await chooseLength(texts.noLimit)

      expect(queryText(texts.firstUnlimited)).not.toBeNull()
    })

    it('shows "Correct" and the streak before and after the first check', async () => {
      renderIn()
      await chooseLength('10')

      for (const text of texts.noProgress) expect(queryText(text)).not.toBeNull()

      await fireEvent.click(button('do'))
      await fireEvent.click(button(texts.check))

      for (const text of texts.progress) expect(queryText(text)).not.toBeNull()
    })

    it('shows "Correct" and the streak without a limit', async () => {
      renderIn()

      await chooseLength(texts.noLimit)

      for (const text of texts.noProgress) expect(queryText(text)).not.toBeNull()
    })

    it('shows Results after the last question and the results', async () => {
      renderIn()
      await finishIn()

      await fireEvent.click(button(texts.results))

      expect(screen.getByRole('heading', { name: texts.results })).toBeTruthy()
      expect(exactText(texts.accuracy)).not.toBeNull()
      expect(queryText(texts.questions)).not.toBeNull()
      expect(queryText(texts.bestStreak)).not.toBeNull()
      expect(queryButton(texts.newSession)).not.toBeNull()
    })

    it('shows Finish during questions and opens the results with it', async () => {
      renderIn()
      await chooseLength(texts.noLimit)
      expect(queryButton(texts.finish)).not.toBeNull()

      await fireEvent.click(button('do'))
      await fireEvent.click(button(texts.check))
      await fireEvent.click(button(texts.finish))

      expect(screen.getByRole('heading', { name: texts.results })).toBeTruthy()
      expect(queryText(texts.questionsOfOne)).not.toBeNull()
    })

    it('shows the average time with the decimal comma', async () => {
      const clock = createManualClock()
      renderSession(startingOnC4(), clock, texts.locale)
      await chooseLength('10')
      await clock.elapse(2400)
      await fireEvent.click(button('do'))
      await fireEvent.click(button(texts.check))
      await fireEvent.click(button(texts.next))
      await clock.elapse(2600)
      await fireEvent.click(button('re'))
      await fireEvent.click(button(texts.check))

      await fireEvent.click(button(texts.finish))

      expect(exactText(texts.averageTime)).not.toBeNull()
    })

    it('opens the choice of length with Finish when nothing is checked', async () => {
      renderIn()
      await chooseLength('10')

      await fireEvent.click(button(texts.finish))

      expect(screen.getByRole('heading', { name: texts.choose })).toBeTruthy()
    })

    it('shows no English text', async () => {
      renderIn()
      const english = [
        'How many questions?',
        'No limit',
        'Question',
        'Results',
        'Accuracy',
        'Questions:',
        'Correct:',
        'Streak',
        'New session',
        'Finish',
        'Average time',
      ]
      const expectNoEnglish = () => {
        const text = document.body.textContent ?? ''
        for (const phrase of english) expect(text).not.toContain(phrase)
      }

      expectNoEnglish()
      await finishIn()
      expectNoEnglish()
      await fireEvent.click(button(texts.results))
      expectNoEnglish()
    })
  })
})
