import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/vue'
import {
  chooseLength,
  createManualClock,
  NAMES,
  renderSession,
  startingOnC4,
  type ManualClock,
} from '@/presentation/__tests__/screen'

// Глобальных хуков Vitest нет, поэтому Testing Library не убирает экран сама.
afterEach(cleanup)

// При постоянном 0 вопросы чередуются: нечётные — C4 (do), чётные — D4 (re).
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

// Строки с неразрывным пробелом: штатный нормализатор Testing Library заменяет
// любые пробельные символы обычным пробелом, здесь символы сравниваются точно.
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

async function answer(name: string) {
  await fireEvent.click(button(name))
  await fireEvent.click(button('Check'))
}

// Отвечает на вопросы с первого по count, после каждого, кроме последнего, — Next.
// correct(number) решает, верен ли ответ на вопрос с этим номером.
async function answerQuestions(count: number, correct: (number: number) => boolean = () => true) {
  for (let number = 1; number <= count; number++) {
    await answer(correct(number) ? rightName(number) : wrongName())
    if (number < count) await fireEvent.click(button('Next'))
  }
}

// То же с включённой галкой: следующий вопрос открывается по таймеру.
async function answerQuestionsAutomatically(clock: ManualClock, count: number) {
  for (let number = 1; number <= count; number++) {
    await answer(rightName(number))
    if (number < count) {
      await clock.elapse(1500)
      await screen.findByRole('button', { name: 'Check' })
    }
  }
}

// Сессия из 10 вопросов, верны все, кроме третьего, шестого и девятого: 7 из 10.
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

      // Округление процента проверяется в домене: при длинах 10, 20 и 50
      // процент законченной сессии всегда целый.
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

  // Решения человека: заголовки выбора и итога — видимые h1; галка только во
  // время вопросов; при смене экрана фокус переходит на заголовок нового экрана.
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

  // Тексты среза — из таблицы «Тексты» файла фичи m1-session.
  // Между числом и «%» в русском и испанском — неразрывный пробел.
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
      newSession: 'Новая сессия',
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
      newSession: 'Nueva sesión',
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

    it('shows Results after the last question and the results', async () => {
      renderIn()
      await finishIn()

      await fireEvent.click(button(texts.results))

      expect(screen.getByRole('heading', { name: texts.results })).toBeTruthy()
      expect(exactText(texts.accuracy)).not.toBeNull()
      expect(queryText(texts.questions)).not.toBeNull()
      expect(queryButton(texts.newSession)).not.toBeNull()
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
        'New session',
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
