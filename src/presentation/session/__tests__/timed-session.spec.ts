import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  chooseShownDuration,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSession,
  renderSessionWith,
  startingOnC4,
  constant,
  type ManualClock,
  storageWithQuickMode,
} from '@/presentation/__tests__/screen'

// Feature session-summary, slice 1: a session on time. Between 50 and No limit the choice offers
// 3 min, 5 min and 10 min, each starting the session at once (criterion 1). Instead of the
// question number the session shows the time passed, "Time: 1:24", anew every second (criterion
// 2). Once the time is up the question begun can still be answered, and after its check Results
// stands instead of Next; in the quick mode a right answer opens the results at once. If the time
// runs out on the review of a checked question, Next turns into Results (criterion 3). Finish works
// as in the other lengths (criterion 4, edge case 3), the results show the same data (criterion 5).
// The time is read from the clock, so it goes on in a hidden tab (edge case 4). Texts in three
// languages (criterion 13). Decisions of 2026-10-13: once the time is up the time shown stops at
// the limit, "Time: 3:00"; the first question, begun and not yet checked, can still be answered,
// edge case 3 being Finish alone.

afterEach(cleanup)

const SECOND = 1000
const MINUTE = 60 * SECOND
const NBSP = ' '

const MINUTE_NAMES = {
  en: ['3 min', '5 min', '10 min'],
  ru: ['3 мин', '5 мин', '10 мин'],
  es: ['3 min', '5 min', '10 min'],
} as const satisfies Record<Locale, readonly string[]>

const LENGTHS: readonly string[] = ['10', '20', '50', '3 min', '5 min', '10 min', 'No limit']

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const queryText = (text: string) => screen.queryByText(text)
// The default normalizer turns any whitespace into a plain space, which would hide a missing
// non-breaking space.
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })
const choiceHeading = () => screen.queryByRole('heading', { name: 'Session length' })
const resultsHeading = () => screen.queryByRole('heading', { name: 'Results' })
const questionNumber = () => screen.queryByText(/^Question \d+/)

// A constant 0 alternates questions: odd ones are C4 (do), even ones D4 (re).
const rightName = (number: number) => (number % 2 === 1 ? 'do' : 're')

async function answer(name: string) {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button('Check'))
}

// Both attempts wrong on the name, the duration right: one point of two, the review opens.
async function answerWrong() {
  await answer('mi')
  await answer('fa')
}

async function pressQuick(name: string) {
  await chooseShownDuration()
  await fireEvent.click(button(name))
}

async function startOnTime(length = '3 min', clock: ManualClock = createManualClock()) {
  renderSession(startingOnC4(), clock)
  await chooseLength(length)
  return clock
}

// Feature navigation-and-settings, slice 1: the quick mode is ticked on the settings screen only.
async function startQuickOnTime(clock: ManualClock = createManualClock()) {
  renderSessionWith({
    random: startingOnC4(),
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor(['en'], storageWithQuickMode()),
  })
  await chooseLength('3 min')
  return clock
}

describe('a session on time', () => {
  describe('the choice of length', () => {
    it('offers 3 min, 5 min and 10 min between 50 and No limit', () => {
      renderSession()

      const names = screen
        .getAllByRole('button')
        .map((element) => element.textContent?.trim())
        .filter((name) => name !== undefined && LENGTHS.includes(name))
      expect(names).toEqual(LENGTHS)
    })

    it.each(['3 min', '5 min', '10 min'])(
      'starts the session with the first question at once on %s',
      async (name) => {
        renderSession()

        await chooseLength(name)

        expect(screen.queryByRole('img', { name: 'Music staff' })).not.toBeNull()
        expect(queryButton('do')).not.toBeNull()
        expect(queryButton('Check')).not.toBeNull()
        expect(choiceHeading()).toBeNull()
      },
    )

    it.each(['ru', 'es'] as const)('names the time limits in %s', (locale) => {
      renderSession(startingOnC4(), createManualClock(), locale)

      for (const name of MINUTE_NAMES[locale]) expect(queryButton(name)).not.toBeNull()
    })
  })

  describe('the time passed', () => {
    it('stands instead of the question number, from 0:00', async () => {
      await startOnTime()

      expect(queryText('Time: 0:00')).not.toBeNull()
      expect(questionNumber()).toBeNull()
    })

    it('grows every second without any action', async () => {
      const clock = await startOnTime()

      await clock.elapse(SECOND)
      expect(queryText('Time: 0:01')).not.toBeNull()

      await clock.elapse(SECOND)
      expect(queryText('Time: 0:02')).not.toBeNull()
      expect(queryText('Time: 0:01')).toBeNull()
    })

    it('shows minutes and seconds: 1:24', async () => {
      const clock = await startOnTime()

      await clock.elapse(84 * SECOND)

      expect(queryText('Time: 1:24')).not.toBeNull()
    })

    it('goes from 0:59 to 1:00', async () => {
      const clock = await startOnTime()

      await clock.elapse(59 * SECOND)
      expect(queryText('Time: 0:59')).not.toBeNull()

      await clock.elapse(SECOND)
      expect(queryText('Time: 1:00')).not.toBeNull()
    })

    it('shows whole seconds passed, not rounded up', async () => {
      const clock = await startOnTime()

      await clock.elapse(1999)

      expect(queryText('Time: 0:01')).not.toBeNull()
    })

    it('reaches 9:59 in a session of 10 minutes', async () => {
      const clock = await startOnTime('10 min')

      await clock.elapse(10 * MINUTE - SECOND)

      expect(queryText('Time: 9:59')).not.toBeNull()
    })

    it('runs on through the questions', async () => {
      const clock = await startOnTime()
      await clock.elapse(10 * SECOND)
      await answer('do')
      await clock.elapse(2 * SECOND)

      await fireEvent.click(button('Next'))

      expect(queryText('Time: 0:12')).not.toBeNull()
      expect(questionNumber()).toBeNull()
    })

    // Edge case 4: a hidden tab holds the timer back, but the time is read from the clock.
    it('counts the time while the tab was hidden on the first tick after it', async () => {
      const clock = await startOnTime()
      await clock.elapse(10 * SECOND)

      await clock.elapseHidden(74 * SECOND)
      await clock.elapse(SECOND)

      expect(queryText('Time: 1:25')).not.toBeNull()
    })

    it('stops at the limit once the time is up', async () => {
      const clock = await startOnTime()

      await clock.elapse(3 * MINUTE + 5 * SECOND)

      expect(queryText('Time: 3:00')).not.toBeNull()
      expect(queryText('Time: 3:05')).toBeNull()
    })

    it('stops at 10:00 in a session of 10 minutes', async () => {
      const clock = await startOnTime('10 min')

      await clock.elapse(10 * MINUTE + 30 * SECOND)

      expect(queryText('Time: 10:00')).not.toBeNull()
    })

    it('stays at the limit through the check of the question begun', async () => {
      const clock = await startOnTime()
      await clock.elapse(3 * MINUTE + 2 * SECOND)

      await answer('do')
      await clock.elapse(10 * SECOND)

      expect(queryText('Time: 3:00')).not.toBeNull()
    })

    it('stops at the limit when the time ran out while the tab was hidden', async () => {
      const clock = await startOnTime()

      await clock.elapseHidden(4 * MINUTE)
      await clock.elapse(SECOND)

      expect(queryText('Time: 3:00')).not.toBeNull()
    })

    it('starts from 0:00 again in a new session', async () => {
      const clock = await startOnTime()
      await clock.elapse(30 * SECOND)
      await answer('do')
      await fireEvent.click(button('Finish'))
      await fireEvent.click(button('New session'))

      await chooseLength('5 min')

      expect(queryText('Time: 0:00')).not.toBeNull()
    })

    it.each([
      ['ru', '3 мин', 'Время: 1:24'],
      ['es', '3 min', 'Tiempo: 1:24'],
    ] as const)('reads in %s', async (locale, length, shown) => {
      const clock = createManualClock()
      renderSession(startingOnC4(), clock, locale)
      await chooseLength(length)

      await clock.elapse(84 * SECOND)

      expect(queryText(shown)).not.toBeNull()
    })

    it('stands instead of the question number in Write notes too', async () => {
      const clock = createManualClock()
      // First steps, which a new user starts in, writes one note without the duration; 0.45 asks
      // for G4.
      renderSessionWith({
        random: constant(0.45),
        clock: clock.clock,
        timer: clock.timer,
        preferences: preferencesFor(['en'], createMemoryStorage()),
      })
      const exercise =
        screen.queryByRole('group', { name: 'Exercise' }) ??
        screen.getByRole('radiogroup', { name: 'Exercise' })
      await fireEvent.click(within(exercise).getByRole('radio', { name: 'Write notes' }))
      await chooseLength('3 min')

      await clock.elapse(84 * SECOND)

      expect(screen.queryByRole('heading', { name: 'Write the notes' })).not.toBeNull()
      expect(queryText('Time: 1:24')).not.toBeNull()
      expect(questionNumber()).toBeNull()
    })
  })

  describe('before the time is up', () => {
    it('goes on with Next after a check', async () => {
      const clock = await startOnTime()
      await clock.elapse(MINUTE)

      await answer('do')

      expect(queryButton('Next')).not.toBeNull()
      expect(queryButton('Results')).toBeNull()
    })
  })

  describe('once the time is up', () => {
    it('keeps the question begun open for its answer', async () => {
      const clock = await startOnTime()
      await answer('do')
      await fireEvent.click(button('Next'))

      await clock.elapse(3 * MINUTE)

      expect(resultsHeading()).toBeNull()
      expect(screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')).toBe('D4')
      expect(queryButton('re')).not.toBeNull()
      expect(queryButton('Check')).not.toBeNull()
    })

    it('shows Results instead of Next after the check of the question begun', async () => {
      const clock = await startOnTime()
      await clock.elapse(3 * MINUTE)

      await answer('do')

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    // Decision of 2026-10-13: edge case 3 is Finish alone, not the time running out.
    it('lets the first question, not yet checked, be answered, then shows Results', async () => {
      const clock = await startOnTime()
      await clock.elapse(3 * MINUTE)
      expect(choiceHeading()).toBeNull()

      await answer('do')

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
      await fireEvent.click(button('Results'))
      expect(resultsHeading()).not.toBeNull()
      expect(queryText('Questions: 1')).not.toBeNull()
      expect(exactText('Accuracy: 100% (2 of 2 points)')).not.toBeNull()
    })

    it('opens the results on Results', async () => {
      const clock = await startOnTime()
      await answer('do')
      await fireEvent.click(button('Next'))
      await clock.elapse(3 * MINUTE)
      await answer('re')

      await fireEvent.click(button('Results'))

      expect(resultsHeading()).not.toBeNull()
      expect(queryText('Questions: 2')).not.toBeNull()
    })

    it('turns Next into Results when the time runs out on the review of a checked question', async () => {
      const clock = await startOnTime()
      await clock.elapse(MINUTE)
      await answerWrong()
      expect(queryButton('Next')).not.toBeNull()

      await clock.elapse(2 * MINUTE)

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
      await fireEvent.click(button('Results'))
      expect(resultsHeading()).not.toBeNull()
    })

    it('opens the results at once after a right answer in the quick mode', async () => {
      const clock = await startQuickOnTime()
      await pressQuick(rightName(1))
      await clock.elapse(3 * MINUTE)

      await pressQuick(rightName(2))

      expect(resultsHeading()).not.toBeNull()
      expect(queryText('Questions: 2')).not.toBeNull()
    })

    it('stops the quick mode on the review of the question begun, with Results', async () => {
      const clock = await startQuickOnTime()
      await clock.elapse(3 * MINUTE)

      await pressQuick('mi')
      await fireEvent.click(button('fa'))

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })
  })

  // Criterion 4 and edge case 3.
  describe('Finish', () => {
    it('is shown during the session', async () => {
      await startOnTime()

      expect(queryButton('Finish')).not.toBeNull()
    })

    it('opens the results of the checked questions', async () => {
      const clock = await startOnTime()
      await answer('do')
      await fireEvent.click(button('Next'))
      await clock.elapse(MINUTE)

      await fireEvent.click(button('Finish'))

      expect(resultsHeading()).not.toBeNull()
      expect(queryText('Questions: 1')).not.toBeNull()
    })

    it('opens the choice of length when nothing is checked', async () => {
      const clock = await startOnTime()
      await clock.elapse(MINUTE)

      await fireEvent.click(button('Finish'))

      expect(choiceHeading()).not.toBeNull()
      expect(resultsHeading()).toBeNull()
    })

    it('opens the choice of length when the time is up and nothing is checked', async () => {
      const clock = await startOnTime()
      await clock.elapse(3 * MINUTE)

      await fireEvent.click(button('Finish'))

      expect(choiceHeading()).not.toBeNull()
      expect(resultsHeading()).toBeNull()
    })
  })

  // Criterion 5: the same data as the results of any other session.
  describe('the results', () => {
    // Answers take 2 s, 4 s and, the third one begun at 0:06 and checked at 3:06, 180 s.
    it('show the accuracy, the questions, the best streak and the average time', async () => {
      const clock = await startOnTime()
      await clock.elapse(2 * SECOND)
      await answer('do')
      await fireEvent.click(button('Next'))
      await clock.elapse(4 * SECOND)
      await answer('re')
      await fireEvent.click(button('Next'))
      await clock.elapse(3 * MINUTE)
      await answerWrong()
      await fireEvent.click(button('Results'))

      expect(resultsHeading()).not.toBeNull()
      expect(exactText('Accuracy: 83% (5 of 6 points)')).not.toBeNull()
      expect(queryText('Questions: 3')).not.toBeNull()
      expect(queryText('Best streak: 2')).not.toBeNull()
      expect(exactText(`Average time: 62.0${NBSP}s`)).not.toBeNull()
      expect(screen.queryByText(/^Time: /)).toBeNull()
    })
  })
})
