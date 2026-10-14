import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseShownDuration,
  createManualClock,
  renderSession,
  startingOnC4,
  startSession,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature design-system, slice 2, criterion 12: the result of a check is a card on the surface,
// found by data-testid="status-card". It holds the status region, whose texts and announcements
// are as before. A wrong answer is headed Incorrect with the icon × in a circle, outside the region
// so that the review is announced as before, and each sentence of the review is a line of its own
// with its own Why?; a right one is headed by Correct itself with the icon check. A hint is plain
// text, no card.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: { check: 'Check', noLimit: 'No limit', incorrect: 'Incorrect', why: 'Why?' },
  ru: { check: 'Проверить', noLimit: 'Без ограничения', incorrect: 'Неверно', why: 'Почему?' },
  es: { check: 'Comprobar', noLimit: 'Sin límite', incorrect: 'Incorrecto', why: '¿Por qué?' },
} as const satisfies Record<Locale, Record<string, string>>

const button = (name: string) => screen.getByRole('button', { name })
const card = () => screen.getByTestId('status-card')
const queryCard = () => screen.queryByTestId('status-card')
const icons = () => card().querySelectorAll('svg[aria-hidden="true"]')

async function startOnC4(locale: Locale = 'en') {
  renderSession(startingOnC4(), createManualClock(), locale)
  await startSession(TEXTS[locale].noLimit)
}

// Question 1 is C4: do is right; mi and then fa are wrong, which opens the review.
async function answer(name: string, check: string = TEXTS.en.check) {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button(check))
}

async function review(locale: Locale = 'en') {
  await startOnC4(locale)
  await answer('mi', TEXTS[locale].check)
  await answer('fa', TEXTS[locale].check)
}

// The element that holds both a sentence of the review and its Why?.
function lineOf(why: HTMLElement): HTMLElement {
  const sentence = document.getElementById(why.getAttribute('aria-describedby') ?? '')
  if (!sentence) throw new Error('a Why? describes no sentence')
  let line = why.parentElement
  while (line && !line.contains(sentence)) line = line.parentElement
  if (!line) throw new Error('no line holds the sentence and its Why?')
  return line
}

describe('the card of the result', () => {
  it('is not shown before the check', async () => {
    await startOnC4()

    expect(queryCard()).toBeNull()
  })

  it('is not shown for a hint: the hint is plain text', async () => {
    await startOnC4()

    await fireEvent.click(button('Check'))

    expect(statusText()).toBe('Choose a note name and a duration')
    expect(queryCard()).toBeNull()
  })

  describe('of a right answer', () => {
    it('holds the status, which says Correct', async () => {
      await startOnC4()

      await answer('do')

      expect(within(card()).getByRole('status')).toBe(screen.getByRole('status'))
      expect(statusText()).toBe('Correct')
    })

    it('shows the icon check', async () => {
      await startOnC4()

      await answer('do')

      expect(icons()).toHaveLength(1)
    })

    it('holds the status of a right second attempt', async () => {
      await startOnC4()
      await answer('mi')

      await answer('do')

      expect(within(card()).getByRole('status')).toBeTruthy()
      expect(statusText()).toBe('Correct on the second try')
    })
  })

  describe('of a wrong first attempt', () => {
    it('holds the status, which says Incorrect. Try again.', async () => {
      await startOnC4()

      await answer('mi')

      expect(within(card()).getByRole('status')).toBeTruthy()
      expect(statusText()).toBe('Incorrect. Try again.')
    })
  })

  describe('of the review', () => {
    it('is headed Incorrect, outside the status region', async () => {
      await review()

      const heading = within(card()).getByText('Incorrect', { exact: true })
      expect(screen.getByRole('status').contains(heading)).toBe(false)
    })

    it('leaves the review in the status region as it was', async () => {
      await review()

      expect(within(card()).getByRole('status')).toBe(screen.getByRole('status'))
      expect(statusText()).toBe(
        'You chose fa. This is do: the note on the first ledger line below the staff.',
      )
    })

    it('shows the icon × in a circle', async () => {
      await review()

      expect(icons()).toHaveLength(1)
    })

    it('holds a Why? for each sentence, on a line of its own', async () => {
      await review()

      const whys = within(card()).getAllByRole('button', { name: 'Why?' })
      expect(whys.length).toBeGreaterThan(0)
      const lines = whys.map(lineOf)
      expect(new Set(lines).size).toBe(whys.length)
      for (const line of lines) expect(within(line).getAllByRole('button')).toHaveLength(1)
    })

    it('is gone on the next question', async () => {
      await review()

      await fireEvent.click(button('Next'))

      expect(queryCard()).toBeNull()
    })

    it.each(['ru', 'es'] as const)('is headed in %s', async (locale) => {
      await review(locale)

      expect(within(card()).getByText(TEXTS[locale].incorrect, { exact: true })).toBeTruthy()
      expect(within(card()).getAllByRole('button', { name: TEXTS[locale].why }).length).toBe(
        within(card()).getAllByRole('button').length,
      )
    })
  })
})
