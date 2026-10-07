import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import type { Locale } from '@/infrastructure/i18n'
import {
  chooseLength,
  createManualClock,
  failStaffLoading,
  NAMES,
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

    it('says "Incorrect" in a status message for a wrong name, without the right answer', async () => {
      await renderTrainer()

      await answer('re')

      expect(status()?.textContent?.trim()).toBe('Incorrect')
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
      await answer('re')

      await fireEvent.click(nameButton('do'))

      expect(pressed()).toEqual(['re'])
      expect(status()?.textContent?.trim()).toBe('Incorrect')
    })
  })

  describe('note name buttons after the result', () => {
    it('are all disabled after a right answer, the chosen one still pressed', async () => {
      await renderTrainer()

      await answer('do')

      expect(disabled()).toEqual(NAMES)
      expect(pressed()).toEqual(['do'])
    })

    it('are all disabled after a wrong answer, the chosen one still pressed', async () => {
      await renderTrainer()

      await answer('re')

      expect(disabled()).toEqual(NAMES)
      expect(pressed()).toEqual(['re'])
    })

    it('are all enabled and none pressed after Next', async () => {
      await renderTrainer()
      await answer('re')

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

    it('says "Incorrect" for do on G4', async () => {
      await renderTrainer(startingOnG4())

      await answer('do')

      expect(status()?.textContent?.trim()).toBe('Incorrect')
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

  // Spec §13: randomness comes from the composition root; without it the screen must not
  // silently fall back to Math.random.
  describe('without a random source', () => {
    it('fails with an error naming the missing random source', async () => {
      expect(() => renderSessionWith({ scheduler: createManualClock().scheduler })).toThrow(
        /random/i,
      )
    })
  })

  // Spec §13: the scheduler comes from the composition root too.
  describe('without a scheduler', () => {
    it('fails with an error naming the missing scheduler', async () => {
      expect(() => renderSessionWith({ random: startingOnC4() })).toThrow(/scheduler/i)
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

  describe('opening the next question automatically', () => {
    it('keeps the result and Next for 1.5 seconds after Check', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await clock.elapse(1499)

      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()
      expect(shownPitch()).toBe('C4')
    })

    it('opens a new question 1.5 seconds after Check with the selection and the message cleared', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('D4'))
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
      expect(status()?.textContent?.trim()).toBe('')
      expect(queryCheck()).not.toBeNull()
      expect(queryNext()).toBeNull()
      expect(autoNext().checked).toBe(true)
    })

    it('works after a wrong answer too', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('re')

      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('D4'))
      expect(queryCheck()).not.toBeNull()
    })

    it('keeps going question after question while ticked', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')
      await clock.elapse(1500)
      await waitFor(() => expect(shownPitch()).toBe('D4'))

      await answer('re')
      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('C4'))
      expect(queryCheck()).not.toBeNull()
    })

    it('goes to the next question once when Next is pressed during the pause', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await fireEvent.click(nextButton())
      expect(shownPitch()).toBe('D4')
      await clock.elapse(1500)

      // A second advance would bring C4 back and reset the screen again.
      expect(shownPitch()).toBe('D4')
      expect(queryCheck()).not.toBeNull()
      expect(clock.pending()).toBe(0)
    })

    it('does not start after Check without a note name', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())

      await fireEvent.click(checkButton())
      await clock.elapse(1500)

      expect(clock.pending()).toBe(0)
      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Choose a note name first')
    })

    it('does not act on a result already shown when the box is ticked', async () => {
      const clock = await renderTrainer()
      await answer('do')

      await fireEvent.click(autoNext())
      await clock.elapse(1500)

      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()
    })

    it('acts from the next check after being ticked on a shown result', async () => {
      const clock = await renderTrainer()
      await answer('do')
      await fireEvent.click(autoNext())
      await fireEvent.click(nextButton())

      await answer('re')
      await clock.elapse(1500)

      await waitFor(() => expect(shownPitch()).toBe('C4'))
      expect(queryCheck()).not.toBeNull()
    })

    it('is cancelled when the box is unticked during the pause', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')

      await fireEvent.click(autoNext())
      await clock.elapse(1500)

      expect(shownPitch()).toBe('C4')
      expect(status()?.textContent?.trim()).toBe('Correct')
      expect(queryNext()).not.toBeNull()

      await fireEvent.click(nextButton())
      expect(shownPitch()).toBe('D4')
    })

    it('does not happen while the box is unticked', async () => {
      const clock = await renderTrainer()

      await answer('do')
      await clock.elapse(10_000)

      expect(clock.pending()).toBe(0)
      expect(shownPitch()).toBe('C4')
      expect(queryNext()).not.toBeNull()
    })
  })

  describe('keyboard focus after opening the next question automatically', () => {
    it('moves from Next to Check', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')
      nextButton().focus()

      await clock.elapse(1500)

      await waitFor(() => expect(document.activeElement).toBe(queryCheck()))
    })

    it('stays on the box when it is focused', async () => {
      const clock = await renderTrainer()
      await fireEvent.click(autoNext())
      await answer('do')
      autoNext().focus()

      await clock.elapse(1500)

      await waitFor(() => expect(queryCheck()).not.toBeNull())
      // The focus moves after re-render, so let it happen before checking the focus stayed.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(document.activeElement).toBe(autoNext())
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
      incorrect: 'Неверно',
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
      incorrect: 'Incorrecto',
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

      // D4: mi is wrong.
      await fireEvent.click(button('mi'))
      await fireEvent.click(button(texts.check))
      expect(status()?.textContent?.trim()).toBe(texts.incorrect)
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
