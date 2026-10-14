import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import {
  chooseShownDuration,
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSession,
  renderSessionWith,
  startingOnC4,
  startSession,
  type ManualClock,
} from '@/presentation/__tests__/screen'

// Feature design-system, slice 2, criterion 12: the bar at the top of a question, the same in Read
// notes and Write notes. On its left Finish, a button that shows the icon × and is named by the text
// Finish; then the progress bar, named "Question 1 of 10" and shown as "1 / 10"; in a session on
// time the bar is the share of the time passed, named "Time: 1:24" and shown as "1:24"; without a
// limit no bar, "Question 7" as text. Under it the accuracy by the points, rounded as in the results,
// "Accuracy —" before the first check, and the streak. The points of the old line are not shown.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SECOND = 1000
const MINUTE = 60 * SECOND
// Russian and Spanish keep the percent sign on the line of its number.
const NBSP = ' '

const TEXTS = {
  en: {
    finish: 'Finish',
    check: 'Check',
    next: 'Next',
    noLimit: 'No limit',
    questionOf: (number: number, length: number) => `Question ${number} of ${length}`,
    question: (number: number) => `Question ${number}`,
    time: (time: string) => `Time: ${time}`,
    noAccuracy: 'Accuracy —',
    accuracy: (percent: number) => `Accuracy ${percent}%`,
    streak: (count: number) => `Streak: ${count}`,
    choose: 'Session length',
    results: 'Results',
    write: 'Write notes',
    exercise: 'Exercise',
  },
  ru: {
    finish: 'Завершить',
    check: 'Проверить',
    next: 'Далее',
    noLimit: 'Без ограничения',
    questionOf: (number: number, length: number) => `Вопрос ${number} из ${length}`,
    question: (number: number) => `Вопрос ${number}`,
    time: (time: string) => `Время: ${time}`,
    noAccuracy: 'Точность —',
    accuracy: (percent: number) => `Точность ${percent}${NBSP}%`,
    streak: (count: number) => `Серия: ${count}`,
    choose: 'Длина сессии',
    results: 'Результаты',
    write: 'Записывать ноты',
    exercise: 'Упражнение',
  },
  es: {
    finish: 'Terminar',
    check: 'Comprobar',
    next: 'Siguiente',
    noLimit: 'Sin límite',
    questionOf: (number: number, length: number) => `Pregunta ${number} de ${length}`,
    question: (number: number) => `Pregunta ${number}`,
    time: (time: string) => `Tiempo: ${time}`,
    noAccuracy: 'Precisión —',
    accuracy: (percent: number) => `Precisión ${percent}${NBSP}%`,
    streak: (count: number) => `Racha: ${count}`,
    choose: 'Duración de la sesión',
    results: 'Resultados',
    write: 'Escribir notas',
    exercise: 'Ejercicio',
  },
} as const satisfies Record<Locale, unknown>

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const progressBar = () => screen.queryByRole('progressbar')
// The default normalizer turns any whitespace into a plain space, which would hide a missing
// non-breaking space.
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })
const follows = (earlier: Element, later: Element) =>
  (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const valueOf = (bar: HTMLElement, attribute: 'aria-valuenow' | 'aria-valuemax') =>
  Number(bar.getAttribute(attribute))

// A constant 0 alternates questions: odd ones are C4 (do), even ones D4 (re). The duration is the
// one shown, so a wrong name still earns one point of two.
async function answer(name: string, check = 'Check') {
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button(check))
}

async function startReading(length: string, locale: Locale = 'en') {
  const clock = createManualClock()
  renderSession(startingOnC4(), clock, locale)
  await startSession(length)
  return clock
}

describe('the bar of a question of Read notes', () => {
  describe('Finish', () => {
    it.each(['en', 'ru', 'es'] as const)('is a button named Finish in %s', async (locale) => {
      await startReading('10', locale)

      expect(queryButton(TEXTS[locale].finish)).not.toBeNull()
    })

    it('shows the icon ×, hidden from screen readers', async () => {
      await startReading('10')

      expect(button('Finish').querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    })

    it('stands first in the bar, before the progress bar and the staff', async () => {
      await startReading('10')

      expect(follows(button('Finish'), progressBar() as Element)).toBe(true)
      expect(follows(progressBar() as Element, staff())).toBe(true)
    })

    it('opens the results of the checked questions', async () => {
      await startReading('10')
      await answer('do')

      await fireEvent.click(button('Finish'))

      expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeNull()
    })

    it.each(['ru', 'es'] as const)(
      'opens the choice of length in %s when nothing is checked',
      async (locale) => {
        await startReading('10', locale)

        await fireEvent.click(button(TEXTS[locale].finish))

        expect(screen.queryByRole('heading', { name: TEXTS[locale].choose })).not.toBeNull()
      },
    )
  })

  describe('in a counted session', () => {
    it.each([
      ['10', 10],
      ['20', 20],
      ['50', 50],
    ] as const)('has a progress bar named "Question 1 of %s"', async (length, max) => {
      await startReading(length)

      const bar = screen.getByRole('progressbar', { name: `Question 1 of ${max}` })
      expect(valueOf(bar, 'aria-valuenow')).toBe(1)
      expect(valueOf(bar, 'aria-valuemax')).toBe(max)
    })

    it('shows "1 / 10" beside the bar', async () => {
      await startReading('10')

      expect(screen.queryByText('1 / 10')).not.toBeNull()
    })

    it('moves the bar and its count on with Next', async () => {
      await startReading('10')
      await answer('do')

      await fireEvent.click(button('Next'))

      const bar = screen.getByRole('progressbar', { name: 'Question 2 of 10' })
      expect(valueOf(bar, 'aria-valuenow')).toBe(2)
      expect(screen.queryByText('2 / 10')).not.toBeNull()
      expect(screen.queryByText('1 / 10')).toBeNull()
    })

    it('shows no question number as text, only the count', async () => {
      await startReading('10')

      expect(screen.queryByText(/^Question \d+/)).toBeNull()
    })

    it.each(['ru', 'es'] as const)('names the bar in %s', async (locale) => {
      await startReading('10', locale)

      expect(
        screen.queryByRole('progressbar', { name: TEXTS[locale].questionOf(1, 10) }),
      ).not.toBeNull()
      expect(screen.queryByText('1 / 10')).not.toBeNull()
    })
  })

  describe('in a session on time', () => {
    async function startOnTime(length = '3 min', locale: Locale = 'en'): Promise<ManualClock> {
      return startReading(length, locale)
    }

    it('names the bar by the time passed, from 0:00, and shows the time', async () => {
      await startOnTime()

      expect(screen.queryByRole('progressbar', { name: 'Time: 0:00' })).not.toBeNull()
      expect(screen.queryByText('0:00')).not.toBeNull()
    })

    it('fills the bar by the share of the time passed', async () => {
      const clock = await startOnTime()

      await clock.elapse(84 * SECOND)

      const bar = screen.getByRole('progressbar', { name: 'Time: 1:24' })
      expect(valueOf(bar, 'aria-valuenow') / valueOf(bar, 'aria-valuemax')).toBeCloseTo(84 / 180, 2)
      expect(screen.queryByText('1:24')).not.toBeNull()
    })

    it('fills the bar by the share of a longer limit', async () => {
      const clock = await startOnTime('10 min')

      await clock.elapse(5 * MINUTE)

      const bar = screen.getByRole('progressbar', { name: 'Time: 5:00' })
      expect(valueOf(bar, 'aria-valuenow') / valueOf(bar, 'aria-valuemax')).toBeCloseTo(0.5, 2)
    })

    it('fills the bar whole once the time is up, and the time stays at the limit', async () => {
      const clock = await startOnTime()

      await clock.elapse(3 * MINUTE + 5 * SECOND)

      const bar = screen.getByRole('progressbar', { name: 'Time: 3:00' })
      expect(valueOf(bar, 'aria-valuenow')).toBe(valueOf(bar, 'aria-valuemax'))
      expect(screen.queryByText('3:00')).not.toBeNull()
    })

    it('shows no question number', async () => {
      await startOnTime()

      expect(screen.queryByText(/^Question \d+/)).toBeNull()
      expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull()
    })

    it.each(['ru', 'es'] as const)('names the bar by the time in %s', async (locale) => {
      const minutes = { ru: '3 мин', es: '3 min' }[locale]
      await startOnTime(minutes, locale)

      expect(screen.queryByRole('progressbar', { name: TEXTS[locale].time('0:00') })).not.toBeNull()
    })
  })

  describe('without a limit', () => {
    it('has no progress bar and shows "Question 1"', async () => {
      await startReading('No limit')

      expect(progressBar()).toBeNull()
      expect(screen.queryByText('Question 1')).not.toBeNull()
    })

    it('counts on: "Question 2" after Next', async () => {
      await startReading('No limit')
      await answer('do')

      await fireEvent.click(button('Next'))

      expect(screen.queryByText('Question 2')).not.toBeNull()
    })

    it.each(['ru', 'es'] as const)('shows the number in %s', async (locale) => {
      await startReading(TEXTS[locale].noLimit, locale)

      expect(screen.queryByText(TEXTS[locale].question(1))).not.toBeNull()
    })
  })

  describe('the accuracy and the streak', () => {
    it('are "Accuracy —" and "Streak: 0" before the first check', async () => {
      await startReading('10')

      expect(exactText('Accuracy —')).not.toBeNull()
      expect(exactText('Streak: 0')).not.toBeNull()
    })

    it('stay so on Check without a note name', async () => {
      await startReading('10')

      await fireEvent.click(button('Check'))

      expect(exactText('Accuracy —')).not.toBeNull()
    })

    it('are "Accuracy 100%" and "Streak: 1" after a right answer', async () => {
      await startReading('10')

      await answer('do')

      expect(exactText('Accuracy 100%')).not.toBeNull()
      expect(exactText('Streak: 1')).not.toBeNull()
    })

    // Question 2 is D4: mi wrong, the duration right, one point of two; 3 of 4 in all.
    it('give the share of the points in percent and drop the streak after a wrong answer', async () => {
      await startReading('10')
      await answer('do')
      await fireEvent.click(button('Next'))

      await answer('mi')

      expect(exactText('Accuracy 75%')).not.toBeNull()
      expect(exactText('Streak: 0')).not.toBeNull()
    })

    // 5 of 6 points is 83.3 %: rounded as in the results.
    it('round the percent as the results do', async () => {
      await startReading('10')
      await answer('do')
      await fireEvent.click(button('Next'))
      await answer('mi')
      await answer('fa')
      await fireEvent.click(button('Next'))

      await answer('do')

      expect(exactText('Accuracy 83%')).not.toBeNull()
    })

    it('stand after the progress bar', async () => {
      await startReading('10')

      expect(follows(progressBar() as Element, screen.getByText('Accuracy —'))).toBe(true)
      expect(follows(progressBar() as Element, screen.getByText('Streak: 0'))).toBe(true)
    })

    it('show no points', async () => {
      await startReading('10')
      await answer('do')

      expect(screen.queryByText(/Points/)).toBeNull()
    })

    it.each(['ru', 'es'] as const)(
      'are shown in %s with the percent sign on the line of its number',
      async (locale) => {
        const texts = TEXTS[locale]
        await startReading('10', locale)
        expect(exactText(texts.noAccuracy)).not.toBeNull()
        expect(exactText(texts.streak(0))).not.toBeNull()

        await answer('do', texts.check)

        expect(exactText(texts.accuracy(100))).not.toBeNull()
        expect(exactText(texts.streak(1))).not.toBeNull()
      },
    )
  })
})

// First steps, which a new user starts in, writes one note without its duration: 0.45 alternates
// G4 (sol4) and F4 (fa4). jsdom lays nothing out, so every element is a box 360 wide and 100 high,
// and the staff of the stub spans it: a touch at y = 60 writes G4, at y = 75 D4.
describe('the bar of a question of Write notes', () => {
  beforeEach(() => {
    const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      ...box,
      toJSON: () => box,
    } as DOMRect)
  })

  const ON_G4 = 0.45
  const AT_G4 = 60
  const AT_D4 = 75

  async function startWriting(length: string, locale: Locale = 'en') {
    const texts = TEXTS[locale]
    const clock = createManualClock()
    renderSessionWith({
      random: constant(ON_G4),
      clock: clock.clock,
      timer: clock.timer,
      preferences: preferencesFor([locale], createMemoryStorage()),
    })
    const group =
      screen.queryByRole('group', { name: texts.exercise }) ??
      screen.getByRole('radiogroup', { name: texts.exercise })
    await fireEvent.click(within(group).getByRole('radio', { name: texts.write }))
    await startSession(length)
    return clock
  }

  async function write(y: number) {
    await fireEvent.click(screen.getByRole('slider', { name: 'Note 1' }), {
      clientX: 180,
      clientY: y,
    })
    await fireEvent.click(button('Check'))
  }

  it.each(['en', 'ru', 'es'] as const)('has Finish with the icon × in %s', async (locale) => {
    await startWriting(TEXTS[locale].noLimit, locale)

    const finish = button(TEXTS[locale].finish)
    expect(finish.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('has Finish before the heading and the staff', async () => {
    await startWriting('10')

    expect(follows(button('Finish'), screen.getByRole('heading', { level: 1 }))).toBe(true)
    expect(follows(button('Finish'), staff())).toBe(true)
  })

  it('opens the choice of length with Finish when nothing is checked', async () => {
    await startWriting('10')

    await fireEvent.click(button('Finish'))

    expect(screen.queryByRole('heading', { name: 'Session length' })).not.toBeNull()
  })

  it('has the progress bar "Question 1 of 10" and the count "1 / 10"', async () => {
    await startWriting('10')

    const bar = screen.getByRole('progressbar', { name: 'Question 1 of 10' })
    expect(valueOf(bar, 'aria-valuenow')).toBe(1)
    expect(valueOf(bar, 'aria-valuemax')).toBe(10)
    expect(screen.queryByText('1 / 10')).not.toBeNull()
  })

  it('moves the bar on with Next', async () => {
    await startWriting('10')
    await write(AT_G4)

    await fireEvent.click(button('Next'))

    expect(screen.queryByRole('progressbar', { name: 'Question 2 of 10' })).not.toBeNull()
    expect(screen.queryByText('2 / 10')).not.toBeNull()
  })

  it('names the bar by the time passed in a session on time', async () => {
    const clock = await startWriting('3 min')

    await clock.elapse(84 * SECOND)

    expect(screen.queryByRole('progressbar', { name: 'Time: 1:24' })).not.toBeNull()
    expect(screen.queryByText('1:24')).not.toBeNull()
  })

  it('has no bar and shows "Question 1" without a limit', async () => {
    await startWriting('No limit')

    expect(progressBar()).toBeNull()
    expect(screen.queryByText('Question 1')).not.toBeNull()
  })

  it('shows "Accuracy —" and "Streak: 0" before the first check', async () => {
    await startWriting('10')

    expect(exactText('Accuracy —')).not.toBeNull()
    expect(exactText('Streak: 0')).not.toBeNull()
  })

  it('shows the accuracy and the streak after a check', async () => {
    await startWriting('10')

    await write(AT_G4)
    expect(exactText('Accuracy 100%')).not.toBeNull()
    expect(exactText('Streak: 1')).not.toBeNull()

    await fireEvent.click(button('Next'))
    // Question 2 is F4: D4 is wrong on both attempts.
    await write(AT_D4)
    await write(AT_D4)

    expect(exactText('Accuracy 50%')).not.toBeNull()
    expect(exactText('Streak: 0')).not.toBeNull()
  })

  it('shows no points', async () => {
    await startWriting('10')

    expect(screen.queryByText(/^Points/)).toBeNull()
  })

  it.each(['ru', 'es'] as const)('shows the accuracy and the streak in %s', async (locale) => {
    await startWriting(TEXTS[locale].noLimit, locale)

    expect(exactText(TEXTS[locale].noAccuracy)).not.toBeNull()
    expect(exactText(TEXTS[locale].streak(0))).not.toBeNull()
  })
})
