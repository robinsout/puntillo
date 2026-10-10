import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  chooseShownDuration,
  constant,
  createManualClock,
  NAMES,
  renderSession,
  startingOnC4,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature mistake-review, slice 1: the normal mode, the box of the quick mode unticked.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }

// The first note is the k-th of the twelve C4–G5 for a constant k/12.
const startingOn = (index: number): Random => constant(index / 12)

// By default the screen opens on C4 (do), and Next brings D4 (re).
async function renderTrainer(random: Random = startingOnC4(), locale: Locale = 'en') {
  const clock = createManualClock()
  renderSession(random, clock, locale)
  await chooseLength(NO_LIMIT[locale])
  return clock
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = statusText
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')

const pressed = () => NAMES.filter((name) => button(name).getAttribute('aria-pressed') === 'true')
const disabled = () => NAMES.filter((name) => button(name).matches(':disabled'))

// The mark must reach a screen reader too, not only the eye, so it is the accessible
// description of the button: its name stays the note name.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const described = (text: string) => NAMES.filter((name) => description(button(name)) === text)

// The duration is always the right one here, so only the name is tried again;
// duration-input.spec.ts covers a wrong duration.
async function answer(name: string, check = 'Check') {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button(check))
}

describe('the second attempt after a wrong answer', () => {
  describe('a wrong first answer', () => {
    it('says "Incorrect. Try again." in the status message, without the right name', async () => {
      await renderTrainer()

      await answer('re')

      expect(status()).toBe('Incorrect. Try again.')
      expect(status()).not.toMatch(/\bdo\b/)
    })

    it('marks the chosen name as incorrect and disables it', async () => {
      await renderTrainer()

      await answer('re')

      expect(described('Incorrect')).toEqual(['re'])
      expect(disabled()).toEqual(['re'])
    })

    it('marks no name as correct, so the right answer is not shown', async () => {
      await renderTrainer()

      await answer('re')

      expect(described('Correct')).toEqual([])
    })

    it('leaves the other names enabled and none selected', async () => {
      await renderTrainer()

      await answer('re')

      expect(pressed()).toEqual([])
      expect(disabled()).toEqual(['re'])
    })

    it('keeps Check and shows no Next', async () => {
      await renderTrainer()

      await answer('re')

      expect(queryButton('Check')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('stays on the same note', async () => {
      await renderTrainer()

      await answer('re')

      expect(shownPitch()).toBe('C4')
    })

    it('lets another name be selected', async () => {
      await renderTrainer()
      await answer('re')

      await fireEvent.click(button('mi'))

      expect(pressed()).toEqual(['mi'])
    })
  })

  // Edge case 1: Check without a name in the second attempt.
  describe('Check without a name in the second attempt', () => {
    it('shows the hint and keeps the second attempt', async () => {
      await renderTrainer()
      await answer('re')

      await fireEvent.click(button('Check'))

      expect(status()).toBe('Choose a note name and a duration')
      expect(queryButton('Check')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
      expect(described('Incorrect')).toEqual(['re'])
      expect(disabled()).toEqual(['re'])
    })

    it('still grades the second answer after the hint', async () => {
      await renderTrainer()
      await answer('re')
      await fireEvent.click(button('Check'))

      await answer('do')

      expect(status()).toBe('Correct on the second try')
    })
  })

  describe('a right second answer', () => {
    it('says "Correct on the second try" in the status message', async () => {
      await renderTrainer()
      await answer('re')

      await answer('do')

      expect(status()).toBe('Correct on the second try')
    })

    it('replaces Check with Next and moves the keyboard focus to it', async () => {
      await renderTrainer()
      await answer('re')
      await fireEvent.click(button('do'))
      button('Check').focus()

      await fireEvent.click(button('Check'))

      expect(queryButton('Check')).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(queryButton('Next')))
    })

    it('disables every name', async () => {
      await renderTrainer()
      await answer('re')

      await answer('do')

      expect(disabled()).toEqual(NAMES)
    })

    it('opens the next note on Next with nothing marked, selected or disabled', async () => {
      await renderTrainer()
      await answer('re')
      await answer('do')

      await fireEvent.click(button('Next'))

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('')
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
      expect(described('Incorrect')).toEqual([])
      expect(queryButton('Check')).not.toBeNull()
    })
  })

  describe('a wrong second answer', () => {
    // The note, its name, the two wrong names tried and the place from criterion 11.
    it.each([
      { index: 0, pitch: 'C4', right: 'do', place: 'on the first ledger line below the staff' },
      { index: 1, pitch: 'D4', right: 're', place: 'just below the staff' },
      { index: 2, pitch: 'E4', right: 'mi', place: 'on the 1st line' },
      { index: 3, pitch: 'F4', right: 'fa', place: 'in the 1st space' },
      { index: 4, pitch: 'G4', right: 'sol', place: 'on the 2nd line' },
      { index: 5, pitch: 'A4', right: 'la', place: 'in the 2nd space' },
      { index: 6, pitch: 'B4', right: 'si', place: 'on the 3rd line' },
      { index: 7, pitch: 'C5', right: 'do', place: 'in the 3rd space' },
      { index: 8, pitch: 'D5', right: 're', place: 'on the 4th line' },
      { index: 9, pitch: 'E5', right: 'mi', place: 'in the 4th space' },
      { index: 10, pitch: 'F5', right: 'fa', place: 'on the 5th line' },
      { index: 11, pitch: 'G5', right: 'sol', place: 'just above the staff' },
    ])('explains $pitch: the second name chosen, $right and its place', async (note) => {
      await renderTrainer(startingOn(note.index))
      expect(shownPitch()).toBe(note.pitch)
      const [first, second] = NAMES.filter((name) => name !== note.right)
      if (!first || !second) throw new Error('fewer than two wrong names')

      await answer(first)
      await answer(second)

      expect(status()).toBe(`You chose ${second}. This is ${note.right}: the note ${note.place}.`)
    })

    it('marks the right name as correct', async () => {
      await renderTrainer(startingOn(4))
      await answer('re')

      await answer('mi')

      expect(described('Correct')).toEqual(['sol'])
    })

    it('marks both wrong names as incorrect', async () => {
      await renderTrainer(startingOn(4))
      await answer('re')

      await answer('mi')

      expect(described('Incorrect')).toEqual(['re', 'mi'])
      expect(disabled()).toEqual(NAMES)
    })

    it('disables every name', async () => {
      await renderTrainer()
      await answer('re')

      await answer('mi')

      expect(disabled()).toEqual(NAMES)
    })

    it('replaces Check with Next and moves the keyboard focus to it', async () => {
      await renderTrainer()
      await answer('re')
      await fireEvent.click(button('mi'))
      button('Check').focus()

      await fireEvent.click(button('Check'))

      expect(queryButton('Check')).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(queryButton('Next')))
    })

    it('opens the next note on Next with nothing marked, selected or disabled', async () => {
      await renderTrainer()
      await answer('re')
      await answer('mi')

      await fireEvent.click(button('Next'))

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('')
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
      expect(described('Incorrect')).toEqual([])
      expect(described('Correct')).toEqual([])
    })
  })

  describe('on the last question', () => {
    // A constant 0 alternates C4 (do) and D4 (re), so question 10 is D4.
    async function openLastQuestion() {
      renderSession()
      await chooseLength('10')
      for (let number = 1; number <= 9; number++) {
        await answer(number % 2 === 1 ? 'do' : 're')
        await fireEvent.click(button('Next'))
      }
      expect(screen.queryByText('Question 10 of 10')).not.toBeNull()
    }

    it('shows Results after a right second answer', async () => {
      await openLastQuestion()
      await answer('mi')
      expect(queryButton('Results')).toBeNull()

      await answer('re')

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('shows Results after a wrong second answer', async () => {
      await openLastQuestion()
      await answer('mi')

      await answer('fa')

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })
  })

  // Criterion 6: the score is the first attempt's; the second one is for learning.
  describe('the score', () => {
    // A wrong name with the right duration earns one point of two.
    const expectProgress = (points: number, maxPoints: number, streak: number) => {
      expect(screen.queryByText(`Points: ${points} of ${maxPoints}`)).not.toBeNull()
      expect(screen.queryByText(`Streak: ${streak}`)).not.toBeNull()
    }

    it('counts a wrong first answer at once', async () => {
      await renderTrainer()
      await answer('do')
      await fireEvent.click(button('Next'))

      await answer('mi')

      expectProgress(3, 4, 0)
    })

    it('stays wrong for a right second answer', async () => {
      await renderTrainer()
      await answer('do')
      await fireEvent.click(button('Next'))
      await answer('mi')

      await answer('re')

      expectProgress(3, 4, 0)
    })

    it('stays wrong for a wrong second answer, counted once', async () => {
      await renderTrainer()
      await answer('mi')

      await answer('fa')

      expectProgress(1, 2, 0)
    })

    it('gives the results of first answers only', async () => {
      renderSession()
      await chooseLength('10')
      // C4: right; D4: wrong, then right; C4: wrong, then wrong.
      await answer('do')
      await fireEvent.click(button('Next'))
      await answer('mi')
      await answer('re')
      await fireEvent.click(button('Next'))
      await answer('mi')
      await answer('fa')

      await fireEvent.click(button('Finish'))

      expect(screen.queryByText('Accuracy: 67% (4 of 6 points)')).not.toBeNull()
      expect(screen.queryByText('Questions: 3')).not.toBeNull()
      expect(screen.queryByText('Best streak: 1')).not.toBeNull()
    })
  })

  // Criterion 7: the time runs from the drawn note to the first counted check.
  describe('the answer time', () => {
    it('leaves out the time of the second attempt', async () => {
      const clock = await renderTrainer()
      await clock.elapse(2000)
      await answer('mi')
      await clock.elapse(5000)
      await answer('do')

      await fireEvent.click(button('Finish'))

      expect(
        screen.queryByText('Average time: 2.0 s', { normalizer: (raw) => raw.trim() }),
      ).not.toBeNull()
    })
  })

  // Edge case 2: the first attempt is checked, so Finish counts the question as wrong.
  describe('Finish during the second attempt', () => {
    it('opens the results with the question counted as wrong', async () => {
      await renderTrainer()
      await answer('do')
      await fireEvent.click(button('Next'))
      await answer('mi')

      await fireEvent.click(button('Finish'))

      expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeNull()
      expect(screen.queryByText('Accuracy: 75% (3 of 4 points)')).not.toBeNull()
      expect(screen.queryByText('Questions: 2')).not.toBeNull()
    })

    it('counts the question even with a name selected but not checked', async () => {
      await renderTrainer()
      await answer('mi')
      await fireEvent.click(button('do'))

      await fireEvent.click(button('Finish'))

      expect(screen.queryByText('Accuracy: 50% (1 of 2 points)')).not.toBeNull()
    })
  })

  // Edge case 4: the status line is a live region, so a change of its text is announced.
  describe('announcing', () => {
    it('puts "Incorrect. Try again." and then the explanation in the same status region', async () => {
      await renderTrainer()
      const region = screen.getByRole('status')

      await answer('re')
      expect(region.textContent?.trim()).toBe('Incorrect. Try again.')

      await answer('mi')
      expect(screen.getByRole('status')).toBe(region)
      expect(status()).toBe(
        'You chose mi. This is do: the note on the first ledger line below the staff.',
      )
    })
  })

  describe.each([
    {
      locale: 'ru' as const,
      check: 'Проверить',
      next: 'Далее',
      incorrect: 'Неверно',
      correct: 'Верно',
      tryAgain: 'Неверно. Попробуйте ещё раз.',
      secondTry: 'Верно со второй попытки',
      belowStaff: 'Вы выбрали fa. Это re — нота под нотоносцем.',
      onLine: 'Вы выбрали fa. Это sol — нота на второй линейке.',
      inSpace: 'Вы выбрали re. Это la — нота во втором промежутке.',
      ledgerLine: 'Вы выбрали mi. Это do — нота на первой добавочной линейке снизу.',
    },
    {
      locale: 'es' as const,
      check: 'Comprobar',
      next: 'Siguiente',
      incorrect: 'Incorrecto',
      correct: 'Correcto',
      tryAgain: 'Incorrecto. Inténtalo de nuevo.',
      secondTry: 'Correcta en el segundo intento',
      belowStaff: 'Elegiste fa. Es re: la nota justo debajo del pentagrama.',
      onLine: 'Elegiste fa. Es sol: la nota en la segunda línea.',
      inSpace: 'Elegiste re. Es la: la nota en el segundo espacio.',
      ledgerLine: 'Elegiste mi. Es do: la nota en la primera línea adicional inferior.',
    },
  ])('in the $locale language', (texts) => {
    it('says "Try again", then "Correct on the second try"', async () => {
      await renderTrainer(startingOnC4(), texts.locale)

      await answer('re', texts.check)
      expect(status()).toBe(texts.tryAgain)
      expect(described(texts.incorrect)).toEqual(['re'])

      await answer('do', texts.check)
      expect(status()).toBe(texts.secondTry)
      expect(queryButton(texts.next)).not.toBeNull()
    })

    it('explains a note just below the staff and marks the right name', async () => {
      await renderTrainer(startingOn(1), texts.locale)

      await answer('mi', texts.check)
      await answer('fa', texts.check)

      expect(status()).toBe(texts.belowStaff)
      expect(described(texts.correct)).toEqual(['re'])
      expect(queryButton(texts.next)).not.toBeNull()
    })

    it('explains a note on a line', async () => {
      await renderTrainer(startingOn(4), texts.locale)

      await answer('mi', texts.check)
      await answer('fa', texts.check)

      expect(status()).toBe(texts.onLine)
    })

    it('explains a note in a space', async () => {
      await renderTrainer(startingOn(5), texts.locale)

      await answer('do', texts.check)
      await answer('re', texts.check)

      expect(status()).toBe(texts.inSpace)
    })

    it('explains a note on a ledger line', async () => {
      await renderTrainer(startingOnC4(), texts.locale)

      await answer('re', texts.check)
      await answer('mi', texts.check)

      expect(status()).toBe(texts.ledgerLine)
    })
  })
})
