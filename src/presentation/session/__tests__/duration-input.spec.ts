import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  ALL_DURATIONS,
  chooseLength,
  constant,
  createManualClock,
  cycle,
  drawStaff,
  DURATION_NAMES,
  DURATIONS,
  failStaffLoading,
  NAMES,
  renderSession,
  startingOnC4,
} from '@/presentation/__tests__/screen'

// Feature duration-input, slice 2: the row of duration buttons in the normal mode.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const { whole, half, quarter, eighth } = DURATION_NAMES

const NBSP = ' '

const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }
const AT_ONCE = 'Show the right answer at once'
const TRY_AGAIN = 'Incorrect. Try again.'
const SECOND_TRY = 'Correct on the second try'
const HINT = 'Choose a note name and a duration'

// 2.5/12 picks E4 (mi), a note on the 1st line, then F4, E4…; 0.3 makes every note a half note.
const halfNoteOnE4 = (): Random => cycle(2.5 / 12, 0.3)
const REVIEW_OF_E4 = (chosen: string) =>
  `You chose ${chosen}. This is mi: the note on the 1st line.`

async function renderTrainer(
  random: Random = halfNoteOnE4(),
  { locale = 'en', atOnce = false }: { locale?: Locale; atOnce?: boolean } = {},
) {
  renderSession(random, createManualClock(), locale)
  if (atOnce) await fireEvent.click(screen.getByRole('checkbox', { name: AT_ONCE }))
  await chooseLength(NO_LIMIT[locale])
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = () => screen.getByRole('status').textContent?.trim()
const shownDuration = () =>
  screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-duration')
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')

const pressedOf = (names: readonly string[]) =>
  names.filter((name) => button(name).getAttribute('aria-pressed') === 'true')
const disabledOf = (names: readonly string[]) =>
  names.filter((name) => button(name).matches(':disabled'))

// The mark is the accessible description of the button, as for the note names.
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

async function choose(name: string, duration: string) {
  await fireEvent.click(button(name))
  await fireEvent.click(button(duration))
}

async function answer(name: string, duration: string, check = 'Check') {
  await choose(name, duration)
  await fireEvent.click(button(check))
}

const LETTER_NAMES: Record<string, string> = {
  C: 'do',
  D: 're',
  E: 'mi',
  F: 'fa',
  G: 'sol',
  A: 'la',
  B: 'si',
}
const rightName = () => LETTER_NAMES[shownPitch()?.charAt(0) ?? ''] ?? 'do'
const wrongName = () => (rightName() === 'do' ? 're' : 'do')

describe('the row of duration buttons', () => {
  // Feature difficulty-presets: the row holds the durations of the difficulty, here Confident
  // reading, which has no sixteenth.
  it('shows four buttons, from the whole note to the eighth', async () => {
    await renderTrainer()

    const shown = screen
      .getAllByRole('button')
      .map((element) => ALL_DURATIONS.find((name) => element === queryButton(name)))
      .filter((name) => name !== undefined)
    expect(shown).toEqual(['1/1', '1/2', '1/4', '1/8'])
  })

  it('comes after the note name buttons', async () => {
    await renderTrainer()

    const lastName = button('si')
    for (const name of DURATIONS) {
      expect(
        lastName.compareDocumentPosition(button(name)) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
  })

  it('has none chosen and all enabled on a new question', async () => {
    await renderTrainer()

    expect(pressedOf(DURATIONS)).toEqual([])
    expect(disabledOf(DURATIONS)).toEqual([])
    for (const name of DURATIONS) expect(button(name).getAttribute('aria-pressed')).toBe('false')
  })

  // Feature duration-fractions, criteria 1 and 2: the name is the fraction written on the button.
  it('writes the fraction on each button, the text being its name', async () => {
    await renderTrainer()

    for (const name of DURATIONS) expect(button(name).textContent?.trim()).toBe(name)
  })

  // Feature duration-fractions, edge case 2: no drawing and no glyph a font may lack.
  it('shows the fraction as plain digits and a slash, with no image', async () => {
    await renderTrainer()

    for (const name of DURATIONS) {
      expect(button(name).textContent?.trim()).toMatch(/^[0-9]+\/[0-9]+$/)
      expect(button(name).querySelector('svg, img')).toBeNull()
    }
  })

  it('is shown once the note is drawn, in the place kept for the answer', async () => {
    renderSession(halfNoteOnE4(), createManualClock(), 'en', 'held')
    await chooseLength('No limit')
    for (const name of DURATIONS) expect(queryButton(name)).toBeNull()

    drawStaff()

    await waitFor(() => expect(queryButton(whole)).not.toBeNull())
    const place = screen.getByTestId('answer-controls')
    for (const name of DURATIONS)
      expect(within(place).queryByRole('button', { name })).not.toBeNull()
  })

  it('is hidden when the staff fails to load', async () => {
    await renderTrainer()

    failStaffLoading()

    await screen.findByText("Couldn't load the staff. Reload the page.")
    for (const name of DURATIONS) expect(queryButton(name)).toBeNull()
  })
})

// Criterion 3.
describe('choosing a duration', () => {
  it('marks the pressed duration as chosen', async () => {
    await renderTrainer()

    await fireEvent.click(button(quarter))

    expect(pressedOf(DURATIONS)).toEqual([quarter])
  })

  it('replaces the chosen duration with another one', async () => {
    await renderTrainer()

    await fireEvent.click(button(quarter))
    await fireEvent.click(button(eighth))

    expect(pressedOf(DURATIONS)).toEqual([eighth])
  })

  it('keeps the chosen note name, and a name keeps the chosen duration', async () => {
    await renderTrainer()

    await fireEvent.click(button(half))
    await fireEvent.click(button('mi'))

    expect(pressedOf(NAMES)).toEqual(['mi'])
    expect(pressedOf(DURATIONS)).toEqual([half])

    await fireEvent.click(button(whole))

    expect(pressedOf(NAMES)).toEqual(['mi'])
    expect(pressedOf(DURATIONS)).toEqual([whole])
  })

  it('accepts the answer in either order', async () => {
    await renderTrainer()

    await fireEvent.click(button(half))
    await fireEvent.click(button('mi'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe('Correct')
  })

  it('does not check the answer by itself', async () => {
    await renderTrainer()

    await choose('mi', half)

    expect(status()).toBe('')
    expect(queryButton('Check')).not.toBeNull()
  })
})

// Criterion 4 and edge case 2: the hint is said in the status region.
describe('Check without a note name or a duration', () => {
  it('shows the hint when nothing is chosen', async () => {
    await renderTrainer()

    await fireEvent.click(button('Check'))

    expect(status()).toBe(HINT)
    expect(queryButton('Next')).toBeNull()
  })

  it('shows the hint when only a note name is chosen, keeping it', async () => {
    await renderTrainer()
    await fireEvent.click(button('mi'))

    await fireEvent.click(button('Check'))

    expect(status()).toBe(HINT)
    expect(pressedOf(NAMES)).toEqual(['mi'])
    expect(queryButton('Check')).not.toBeNull()
  })

  it('shows the hint when only a duration is chosen, keeping it', async () => {
    await renderTrainer()
    await fireEvent.click(button(half))

    await fireEvent.click(button('Check'))

    expect(status()).toBe(HINT)
    expect(pressedOf(DURATIONS)).toEqual([half])
    expect(queryButton('Check')).not.toBeNull()
  })

  it('does not count the question', async () => {
    await renderTrainer()
    await fireEvent.click(button('mi'))

    await fireEvent.click(button('Check'))

    expect(screen.queryByText('Points: 0 of 0')).not.toBeNull()
  })

  it('hides the hint once a duration is chosen', async () => {
    await renderTrainer()
    await fireEvent.click(button('mi'))
    await fireEvent.click(button('Check'))

    await fireEvent.click(button(half))

    expect(status()).toBe('')
  })

  it('still accepts the answer after the hint', async () => {
    await renderTrainer()
    await fireEvent.click(button('mi'))
    await fireEvent.click(button('Check'))

    await fireEvent.click(button(half))
    await fireEvent.click(button('Check'))

    expect(status()).toBe('Correct')
  })
})

// Criterion 5 and edge case 1.
describe('a right name and duration', () => {
  it('say "Correct" and disable both rows, the chosen buttons still pressed', async () => {
    await renderTrainer()

    await answer('mi', half)

    expect(status()).toBe('Correct')
    expect(disabledOf(DURATIONS)).toEqual(DURATIONS)
    expect(disabledOf(NAMES)).toEqual(NAMES)
    expect(pressedOf(DURATIONS)).toEqual([half])
    expect(pressedOf(NAMES)).toEqual(['mi'])
    expect(queryButton('Next')).not.toBeNull()
  })

  it('leave a clean row on the next question', async () => {
    await renderTrainer()
    await answer('mi', half)

    await fireEvent.click(button('Next'))

    expect(pressedOf(DURATIONS)).toEqual([])
    expect(disabledOf(DURATIONS)).toEqual([])
    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([])
    expect(describedOf(DURATIONS, 'Correct')).toEqual([])
  })
})

// Criteria 6–8 when only the duration is wrong.
describe('a right name with a wrong duration', () => {
  async function triedWrongDuration() {
    await renderTrainer()
    await answer('mi', quarter)
  }

  it('says "Incorrect. Try again." without the right answer', async () => {
    await triedWrongDuration()

    expect(status()).toBe(TRY_AGAIN)
    expect(describedOf(DURATIONS, 'Correct')).toEqual([])
    expect(queryButton('Check')).not.toBeNull()
    expect(queryButton('Next')).toBeNull()
    expect(shownDuration()).toBe('half')
  })

  it('marks the chosen duration as incorrect and disables it, clearing the choice', async () => {
    await triedWrongDuration()

    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
    expect(disabledOf(DURATIONS)).toEqual([quarter])
    expect(pressedOf(DURATIONS)).toEqual([])
  })

  it('keeps the right name chosen and does not let it change', async () => {
    await triedWrongDuration()

    expect(pressedOf(NAMES)).toEqual(['mi'])
    expect(disabledOf(NAMES)).toEqual(NAMES)
    expect(describedOf(NAMES, 'Incorrect')).toEqual([])
  })

  it('lets another duration be chosen', async () => {
    await triedWrongDuration()

    await fireEvent.click(button(whole))

    expect(pressedOf(DURATIONS)).toEqual([whole])
  })

  it('shows the hint on Check without a duration, keeping the second attempt', async () => {
    await triedWrongDuration()

    await fireEvent.click(button('Check'))

    expect(status()).toBe(HINT)
    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
    expect(pressedOf(NAMES)).toEqual(['mi'])
    expect(queryButton('Next')).toBeNull()
  })

  it('says "Correct on the second try" for the right duration, disabling both rows', async () => {
    await triedWrongDuration()

    await fireEvent.click(button(half))
    await fireEvent.click(button('Check'))

    expect(status()).toBe(SECOND_TRY)
    expect(disabledOf(DURATIONS)).toEqual(DURATIONS)
    expect(disabledOf(NAMES)).toEqual(NAMES)
    expect(queryButton('Next')).not.toBeNull()
  })

  it('explains the duration alone after a wrong second duration', async () => {
    await triedWrongDuration()

    await fireEvent.click(button(eighth))
    await fireEvent.click(button('Check'))

    expect(status()).toBe('You chose an eighth note. This is a half note.')
  })

  it('marks both wrong durations and the right one on the review, disabling everything', async () => {
    await triedWrongDuration()

    await fireEvent.click(button(eighth))
    await fireEvent.click(button('Check'))

    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter, eighth])
    expect(describedOf(DURATIONS, 'Correct')).toEqual([half])
    expect(disabledOf(DURATIONS)).toEqual(DURATIONS)
    expect(disabledOf(NAMES)).toEqual(NAMES)
    expect(queryButton('Next')).not.toBeNull()
  })
})

// Criteria 6–8 when only the name is wrong.
describe('a wrong name with a right duration', () => {
  async function triedWrongName() {
    await renderTrainer()
    await answer('re', half)
  }

  it('says "Incorrect. Try again." and marks the name only', async () => {
    await triedWrongName()

    expect(status()).toBe(TRY_AGAIN)
    expect(describedOf(NAMES, 'Incorrect')).toEqual(['re'])
    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([])
    expect(pressedOf(NAMES)).toEqual([])
  })

  it('keeps the right duration chosen and does not let it change', async () => {
    await triedWrongName()

    expect(pressedOf(DURATIONS)).toEqual([half])
    expect(disabledOf(DURATIONS)).toEqual(DURATIONS)
  })

  it('takes the second attempt by the name alone', async () => {
    await triedWrongName()

    await fireEvent.click(button('mi'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe(SECOND_TRY)
  })

  it('explains the name alone after a wrong second name', async () => {
    await triedWrongName()

    await fireEvent.click(button('fa'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe(REVIEW_OF_E4('fa'))
    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([])
  })
})

// Criteria 6–8 when both parts are wrong.
describe('a wrong name and a wrong duration', () => {
  async function triedBothWrong() {
    await renderTrainer()
    await answer('re', quarter)
  }

  it('marks both, disables them and clears both rows', async () => {
    await triedBothWrong()

    expect(status()).toBe(TRY_AGAIN)
    expect(describedOf(NAMES, 'Incorrect')).toEqual(['re'])
    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
    expect(disabledOf(NAMES)).toEqual(['re'])
    expect(disabledOf(DURATIONS)).toEqual([quarter])
    expect(pressedOf(NAMES)).toEqual([])
    expect(pressedOf(DURATIONS)).toEqual([])
  })

  it('asks for both again: one of them alone gives the hint', async () => {
    await triedBothWrong()

    await fireEvent.click(button('mi'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe(HINT)
  })

  it('says "Correct on the second try" when both are right', async () => {
    await triedBothWrong()

    await answer('mi', half)

    expect(status()).toBe(SECOND_TRY)
  })

  it('explains each wrong part in its own sentence, the name first', async () => {
    await triedBothWrong()

    await answer('fa', eighth)

    expect(status()).toBe(`${REVIEW_OF_E4('fa')} You chose an eighth note. This is a half note.`)
  })

  // The review names the last attempt: a part put right on it has nothing to explain.
  it('explains only the part still wrong on the second attempt', async () => {
    await triedBothWrong()

    await answer('mi', eighth)

    expect(status()).toBe('You chose an eighth note. This is a half note.')
    expect(describedOf(NAMES, 'Correct')).toEqual(['mi'])
    expect(describedOf(DURATIONS, 'Correct')).toEqual([half])
  })
})

// Criterion 9.
describe('with "Show the right answer at once" ticked', () => {
  it('explains a wrong duration at once, with Next and no second attempt', async () => {
    await renderTrainer(halfNoteOnE4(), { atOnce: true })

    await answer('mi', quarter)

    expect(status()).toBe('You chose a quarter note. This is a half note.')
    expect(describedOf(DURATIONS, 'Incorrect')).toEqual([quarter])
    expect(describedOf(DURATIONS, 'Correct')).toEqual([half])
    expect(pressedOf(DURATIONS)).toEqual([quarter])
    expect(disabledOf(DURATIONS)).toEqual(DURATIONS)
    expect(disabledOf(NAMES)).toEqual(NAMES)
    expect(queryButton('Next')).not.toBeNull()
    expect(queryButton('Check')).toBeNull()
  })

  it('explains both wrong parts at once', async () => {
    await renderTrainer(halfNoteOnE4(), { atOnce: true })

    await answer('re', whole)

    expect(status()).toBe(`${REVIEW_OF_E4('re')} You chose a whole note. This is a half note.`)
  })

  it('says "Correct" for a right answer', async () => {
    await renderTrainer(halfNoteOnE4(), { atOnce: true })

    await answer('mi', half)

    expect(status()).toBe('Correct')
  })
})

// Criteria 10–12: two points a note, by the first attempt.
describe('the points', () => {
  const expectProgress = (points: number, maxPoints: number, streak: number) => {
    expect(screen.queryByText(`Points: ${points} of ${maxPoints}`)).not.toBeNull()
    expect(screen.queryByText(`Streak: ${streak}`)).not.toBeNull()
  }

  it('are "Points: 0 of 0" before the first check', async () => {
    await renderTrainer()

    expectProgress(0, 0, 0)
    expect(screen.queryByText(/^Correct: /)).toBeNull()
  })

  it('grow by two for a right name and duration, and so does the streak', async () => {
    await renderTrainer()

    await answer('mi', half)

    expectProgress(2, 2, 1)
  })

  it('grow by one for a right name with a wrong duration, dropping the streak', async () => {
    await renderTrainer()
    await answer('mi', half)
    await fireEvent.click(button('Next'))

    await answer(rightName(), quarter)

    expectProgress(3, 4, 0)
  })

  it('grow by one for a right duration with a wrong name, dropping the streak', async () => {
    await renderTrainer()
    await answer('mi', half)
    await fireEvent.click(button('Next'))

    await answer(wrongName(), half)

    expectProgress(3, 4, 0)
  })

  it('do not grow for a wrong name and a wrong duration', async () => {
    await renderTrainer()

    await answer('re', quarter)

    expectProgress(0, 2, 0)
  })

  it('do not grow for a part put right on the second attempt', async () => {
    await renderTrainer()
    await answer('mi', quarter)

    await answer('mi', half)

    expectProgress(1, 2, 0)
  })

  it('give the accuracy in the results: "Accuracy: 83% (5 of 6 points)"', async () => {
    await renderTrainer()
    await answer('mi', half)
    await fireEvent.click(button('Next'))
    await answer(rightName(), whole)
    await fireEvent.click(button(half))
    await fireEvent.click(button('Check'))
    await fireEvent.click(button('Next'))
    await answer(rightName(), half)

    await fireEvent.click(button('Finish'))

    const exact = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })
    expect(exact('Accuracy: 83% (5 of 6 points)')).not.toBeNull()
    expect(exact('Questions: 3')).not.toBeNull()
    expect(exact('Best streak: 1')).not.toBeNull()
  })
})

// Edge case 2: the hint, "Incorrect. Try again." and the review go to one live region.
describe('announcing', () => {
  it('says the hint, the second attempt and the review in the same status region', async () => {
    await renderTrainer()
    const region = screen.getByRole('status')

    await fireEvent.click(button('mi'))
    await fireEvent.click(button('Check'))
    expect(region.textContent?.trim()).toBe(HINT)

    await fireEvent.click(button(quarter))
    await fireEvent.click(button('Check'))
    expect(region.textContent?.trim()).toBe(TRY_AGAIN)

    await fireEvent.click(button(eighth))
    await fireEvent.click(button('Check'))
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent?.trim()).toBe('You chose an eighth note. This is a half note.')
  })
})

describe.each([
  {
    locale: 'ru' as const,
    check: 'Проверить',
    atOnce: 'Сразу показывать правильный ответ',
    hint: 'Выберите название и длительность',
    tryAgain: 'Неверно. Попробуйте ещё раз.',
    incorrect: 'Неверно',
    correct: 'Верно',
    reviewQuarterForHalf: 'Вы выбрали четверть. Это половинная.',
    reviewEighthForHalf: 'Вы выбрали восьмую. Это половинная.',
    reviewWholeForHalf: 'Вы выбрали целую. Это половинная.',
    noPoints: 'Баллы: 0 из 0',
    points: 'Баллы: 1 из 2',
    accuracy: `Точность: 50${NBSP}% (1 из 2 баллов)`,
    finish: 'Завершить',
  },
  {
    locale: 'es' as const,
    check: 'Comprobar',
    atOnce: 'Mostrar la respuesta correcta de inmediato',
    hint: 'Elige el nombre y la duración',
    tryAgain: 'Incorrecto. Inténtalo de nuevo.',
    incorrect: 'Incorrecto',
    correct: 'Correcto',
    reviewQuarterForHalf: 'Elegiste una negra. Es una blanca.',
    reviewEighthForHalf: 'Elegiste una corchea. Es una blanca.',
    reviewWholeForHalf: 'Elegiste una redonda. Es una blanca.',
    noPoints: 'Puntos: 0 de 0',
    points: 'Puntos: 1 de 2',
    accuracy: `Precisión: 50${NBSP}% (1 de 2 puntos)`,
    finish: 'Terminar',
  },
])('in the $locale language', (texts) => {
  // The fractions are the same in every language.
  const names = DURATION_NAMES
  const durations = DURATIONS

  async function open({ atOnce = false } = {}) {
    renderSession(halfNoteOnE4(), createManualClock(), texts.locale)
    if (atOnce) await fireEvent.click(screen.getByRole('checkbox', { name: texts.atOnce }))
    await chooseLength(NO_LIMIT[texts.locale])
  }

  it('names the duration buttons by the same fractions, from the whole note to the eighth', async () => {
    await open()

    const shown = screen
      .getAllByRole('button')
      .map((element) => ALL_DURATIONS.find((name) => element === queryButton(name)))
      .filter((name) => name !== undefined)
    expect(shown).toEqual(['1/1', '1/2', '1/4', '1/8'])
  })

  it('shows the hint', async () => {
    await open()

    await fireEvent.click(button(texts.check))

    expect(status()).toBe(texts.hint)
  })

  it('marks a wrong duration and then explains it', async () => {
    await open()

    await answer('mi', names.quarter, texts.check)
    expect(status()).toBe(texts.tryAgain)
    expect(describedOf(durations, texts.incorrect)).toEqual([names.quarter])

    await answer('mi', names.eighth, texts.check)
    expect(status()).toBe(texts.reviewEighthForHalf)
    expect(describedOf(durations, texts.correct)).toEqual([names.half])
  })

  it.each([
    ['quarter', 'reviewQuarterForHalf'],
    ['whole', 'reviewWholeForHalf'],
  ] as const)('explains a %s note chosen for a half note', async (chosen, review) => {
    await open({ atOnce: true })

    await answer('mi', names[chosen], texts.check)

    expect(status()).toBe(texts[review])
  })

  it('counts the points and gives the accuracy by them', async () => {
    await open()
    expect(screen.queryByText(texts.noPoints)).not.toBeNull()

    await answer('mi', names.quarter, texts.check)
    expect(screen.queryByText(texts.points)).not.toBeNull()

    await fireEvent.click(button(texts.finish))

    expect(screen.queryByText(texts.accuracy, { normalizer: (raw) => raw.trim() })).not.toBeNull()
  })
})

describe('a note of another duration', () => {
  it.each([
    [startingOnC4(), 'do', whole, 'whole'],
    [constant(0.6), 'do', quarter, 'quarter'],
    [constant(0.9), 'fa', eighth, 'eighth'],
  ])('is graded by its own duration', async (random, name, duration, shown) => {
    await renderTrainer(random)
    expect(shownDuration()).toBe(shown)

    await answer(name, duration)

    expect(status()).toBe('Correct')
  })

  it('takes "1/2" as wrong for a whole note', async () => {
    await renderTrainer(startingOnC4())

    await answer('do', half)

    expect(status()).toBe(TRY_AGAIN)
  })
})
