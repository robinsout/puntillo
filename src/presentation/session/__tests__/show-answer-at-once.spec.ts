import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/vue'
import type { Locale } from '@/infrastructure/i18n'
import {
  chooseLength,
  NAMES,
  renderSession,
  startingOnC4,
  startingOnG4,
} from '@/presentation/__tests__/screen'

// Feature mistake-review, slice 2: the box "Show the right answer at once" on the length choice.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const AT_ONCE = 'Show the right answer at once'

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = () => screen.getByRole('status').textContent?.trim()
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const atOnceBox = (name = AT_ONCE) => screen.getByRole('checkbox', { name })
const queryAtOnceBox = (name = AT_ONCE) => screen.queryByRole('checkbox', { name })
const isTicked = (box: HTMLElement) => (box as HTMLInputElement).checked

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

async function answer(name: string) {
  await fireEvent.click(button(name))
  await fireEvent.click(button('Check'))
}

// A constant 0 alternates C4 (do) and D4 (re).
async function startAtOnce(length = 'No limit') {
  renderSession(startingOnC4())
  await fireEvent.click(atOnceBox())
  await chooseLength(length)
}

describe('the box "Show the right answer at once"', () => {
  describe('on the length choice', () => {
    it.each<{ locale: Locale; name: string }>([
      { locale: 'en', name: 'Show the right answer at once' },
      { locale: 'ru', name: 'Сразу показывать правильный ответ' },
      { locale: 'es', name: 'Mostrar la respuesta correcta de inmediato' },
    ])('is shown unticked in $locale', ({ locale, name }) => {
      renderSession(startingOnC4(), undefined, locale)

      expect(isTicked(atOnceBox(name))).toBe(false)
    })

    it('can be ticked and unticked again', async () => {
      renderSession()

      await fireEvent.click(atOnceBox())
      expect(isTicked(atOnceBox())).toBe(true)

      await fireEvent.click(atOnceBox())
      expect(isTicked(atOnceBox())).toBe(false)
    })
  })

  describe('elsewhere', () => {
    it('is not on the question screen', async () => {
      await startAtOnce()

      expect(queryAtOnceBox()).toBeNull()
    })

    it('is not on the results', async () => {
      await startAtOnce()
      await answer('do')

      await fireEvent.click(button('Finish'))

      expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeNull()
      expect(queryAtOnceBox()).toBeNull()
    })
  })

  // Criterion 5: a wrong first answer shows the review at once, as after a wrong second one.
  describe('ticked: a wrong first answer', () => {
    it('explains the note at once, naming the chosen name', async () => {
      await startAtOnce()

      await answer('re')

      expect(status()).toBe(
        'You chose re. This is do: the note on the first ledger line below the staff.',
      )
    })

    it('marks the right name as correct and the chosen one as incorrect', async () => {
      await startAtOnce()

      await answer('re')

      expect(described('Correct')).toEqual(['do'])
      expect(described('Incorrect')).toEqual(['re'])
    })

    it('disables every name, so there is no second attempt', async () => {
      await startAtOnce()

      await answer('re')

      expect(disabled()).toEqual(NAMES)
    })

    it('replaces Check with Next and moves the keyboard focus to it', async () => {
      await startAtOnce()
      await fireEvent.click(button('re'))
      button('Check').focus()

      await fireEvent.click(button('Check'))

      expect(queryButton('Check')).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(queryButton('Next')))
    })

    it('opens the next note on Next with nothing marked, selected or disabled', async () => {
      await startAtOnce()
      await answer('re')

      await fireEvent.click(button('Next'))

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('')
      expect(pressed()).toEqual([])
      expect(disabled()).toEqual([])
      expect(described('Incorrect')).toEqual([])
      expect(described('Correct')).toEqual([])
      expect(queryButton('Check')).not.toBeNull()
    })

    it('shows Results instead of Next on the last question', async () => {
      await startAtOnce('10')
      for (let number = 1; number <= 9; number++) {
        await answer(number % 2 === 1 ? 'do' : 're')
        await fireEvent.click(button('Next'))
      }
      expect(screen.queryByText('Question 10 of 10')).not.toBeNull()

      await answer('mi')

      expect(queryButton('Results')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })

    it('explains the note in Russian', async () => {
      renderSession(startingOnC4(), undefined, 'ru')
      await fireEvent.click(atOnceBox('Сразу показывать правильный ответ'))
      await chooseLength('Без ограничения')

      await fireEvent.click(button('re'))
      await fireEvent.click(button('Проверить'))

      expect(status()).toBe('Вы выбрали re. Это do — нота на первой добавочной линейке снизу.')
      expect(queryButton('Далее')).not.toBeNull()
    })
  })

  describe('ticked: a right first answer', () => {
    it('says "Correct" and offers Next', async () => {
      await startAtOnce()

      await answer('do')

      expect(status()).toBe('Correct')
      expect(queryButton('Next')).not.toBeNull()
    })
  })

  // Criterion 4: the score and the time stay as they were.
  describe('ticked: the score', () => {
    it('counts the wrong answer once', async () => {
      await startAtOnce()
      await answer('do')
      await fireEvent.click(button('Next'))

      await answer('mi')

      expect(screen.queryByText('Correct: 1 of 2')).not.toBeNull()
      expect(screen.queryByText('Streak: 0')).not.toBeNull()
    })
  })

  // Criterion 3: unticked, the second attempt of slice 1 stays.
  describe('unticked', () => {
    it('asks to try again after a wrong first answer', async () => {
      renderSession(startingOnC4())
      await chooseLength('No limit')

      await answer('re')

      expect(status()).toBe('Incorrect. Try again.')
      expect(queryButton('Check')).not.toBeNull()
      expect(queryButton('Next')).toBeNull()
    })
  })

  // Criterion 1: the box keeps its state between sessions until the page is reloaded.
  describe('in a new session', () => {
    async function newSessionAfterTicked() {
      await startAtOnce()
      await answer('do')
      await fireEvent.click(button('Finish'))
      await fireEvent.click(button('New session'))
    }

    // The generator lives as long as the page and never repeats the previous note, so the new
    // session may open on any note but the last one; the review is taken for the note shown.
    // mi is wrong for every note a constant 0 brings (C4, D4).
    const REVIEWS: Record<string, string> = {
      C4: 'You chose mi. This is do: the note on the first ledger line below the staff.',
      D4: 'You chose mi. This is re: the note just below the staff.',
    }

    function reviewOfShownNote(): string {
      const pitch = shownPitch() ?? ''
      const review = REVIEWS[pitch]
      if (!review) throw new Error(`no review prepared for ${pitch}`)
      return review
    }

    it('stays ticked on the length choice', async () => {
      await newSessionAfterTicked()

      expect(isTicked(atOnceBox())).toBe(true)
    })

    it('still shows the right answer at once', async () => {
      await newSessionAfterTicked()
      await chooseLength('No limit')
      const review = reviewOfShownNote()

      await answer('mi')

      expect(status()).toBe(review)
      expect(queryButton('Next')).not.toBeNull()
    })

    it('gives the second attempt again once unticked', async () => {
      await newSessionAfterTicked()
      await fireEvent.click(atOnceBox())
      await chooseLength('No limit')
      expect(Object.keys(REVIEWS)).toContain(shownPitch())

      await answer('mi')

      expect(status()).toBe('Incorrect. Try again.')
    })
  })

  // Criterion 5 of the slice: the quick mode is left as it is; their pairing is slice 3.
  describe('ticked, in the quick mode', () => {
    it('still opens the next note at once on a wrong answer', async () => {
      await startAtOnce()
      await fireEvent.click(
        screen.getByRole('checkbox', { name: 'Open next question automatically' }),
      )

      await fireEvent.click(button('re'))

      expect(shownPitch()).toBe('D4')
      expect(status()).toBe('Incorrect')
      expect(disabled()).toEqual([])
    })
  })
})

describe('the box with a note other than C4', () => {
  it('explains G4 on the 2nd line', async () => {
    renderSession(startingOnG4())
    await fireEvent.click(atOnceBox())
    await chooseLength('No limit')

    await answer('mi')

    expect(status()).toBe('You chose mi. This is sol: the note on the 2nd line.')
    expect(described('Correct')).toEqual(['sol'])
  })
})
