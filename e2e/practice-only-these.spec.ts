import { expect, test, type Locator, type Page } from '@playwright/test'
import { startSession } from './session-length'
import { resultStats } from './results'

// Feature session-summary, slice 3: Practice only these in a real session (criteria 10–12, edge
// cases 1, 2 and 6). As in most-mistakes.spec.ts the page starts in Confident reading with one
// note in 4/4, as if chosen on an earlier visit, and Math.random is fixed at 0, so the questions
// are whole notes, C4 (do), D4 (re), C4… C4 wrong, then D4 wrong, gives Most mistakes re4, then
// do4; the session of Practice only these starts on re4, which it can only have from the list.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const TEXTS = {
  en: {
    browser: 'en-US',
    noLimit: 'No limit',
    check: 'Check',
    next: 'Next',
    finish: 'Finish',
    results: 'Results',
    correct: 'Correct',
    mostMistakes: 'Most mistakes',
    none: 'No mistakes',
    practice: 'Practice only these',
    question: 'Name the note',
  },
  ru: {
    browser: 'ru-RU',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    next: 'Далее',
    finish: 'Завершить',
    results: 'Результаты',
    correct: 'Верно',
    mostMistakes: 'Больше всего ошибок',
    none: 'Ошибок нет',
    practice: 'Потренировать только их',
    question: 'Назовите ноту',
  },
} as const

type Texts = (typeof TEXTS)[keyof typeof TEXTS]
const EN = TEXTS.en

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.locator('[role="img"]').first()
const mostMistakes = (page: Page, texts: Texts = EN) =>
  page.getByRole('list', { name: texts.mostMistakes, exact: true })
const items = (page: Page, texts: Texts = EN) => mostMistakes(page, texts).getByRole('listitem')

// Layout is fractional: Firefox reports 2.75rem as 43.99997px.
async function expectTarget(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const { x, width, height } = box ?? { x: 0, width: 0, height: 0 }
  expect(width).toBeGreaterThanOrEqual(44 - 0.01)
  expect(height).toBeGreaterThanOrEqual(44 - 0.01)
  expect(x).toBeGreaterThanOrEqual(0)
  expect(x + width).toBeLessThanOrEqual(360)
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// Feature staff-progress-row: the notes passed in the row stand left of the current one, so the
// question `number` of a row draws that many notes.
async function expectNoteDrawn(page: Page, number = 1) {
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(number)
}

async function answer(page: Page, texts: Texts, name: string, duration = true) {
  await button(page, name).click()
  if (duration) await button(page, '1/1').click()
  await button(page, texts.check).click()
}

// Both attempts wrong on the name, the duration right.
async function answerWrong(page: Page, texts: Texts) {
  await answer(page, texts, 'mi')
  await answer(page, texts, 'fa', false)
  await expect(button(page, texts.next)).toBeVisible()
}

async function answerRight(page: Page, texts: Texts, name: string) {
  await answer(page, texts, name)
  await expect(page.getByRole('status')).toHaveText(texts.correct)
}

// C4 wrong, then D4 wrong, in a session of the given length ended by Finish.
async function resultsWithMistakes(page: Page, texts: Texts = EN, length: string = texts.noLimit) {
  await page.goto('/')
  await startSession(page, length)
  await expectNoteDrawn(page)
  await answerWrong(page, texts)
  await button(page, texts.next).click()
  await expectNoteDrawn(page, 2)
  await answerWrong(page, texts)
  await button(page, texts.finish).click()
  await expect(heading(page, texts.results)).toBeVisible()
  await expect(items(page, texts)).toHaveCount(2)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0
  })
  await page.addInitScript((difficulty) => {
    if (localStorage.getItem('puntillo.preset') !== null) return
    localStorage.setItem('puntillo.preset', 'confident-reading')
    localStorage.setItem('puntillo.difficulty', difficulty)
  }, ONE_NOTE_READING)
})

test.describe('Practice only these', () => {
  // Assertions use English texts, and WebKit without a locale falls back to the system language.
  test.use({ locale: EN.browser })

  test('starts a session with no limit on the notes of the list, in its order', async ({
    page,
  }) => {
    await resultsWithMistakes(page)

    await button(page, EN.practice).click()

    await expect(heading(page, EN.question)).toBeAttached()
    await expect(page.getByText('Question 1', { exact: true })).toBeVisible()
    await expectNoteDrawn(page)
    await answerRight(page, EN, 're')
    await button(page, EN.next).click()
    await expect(page.getByText('Question 2', { exact: true })).toBeVisible()
    await expectNoteDrawn(page, 2)
    await answerRight(page, EN, 'do')

    await button(page, EN.finish).click()

    await expect(heading(page, EN.results)).toBeVisible()
    await expect.poll(() => resultStats(page)).toMatchObject({ Questions: '2' })
    await expect(page.getByText(EN.none, { exact: true })).toBeVisible()
    await expect(button(page, EN.practice)).toHaveCount(0)
  })

  test('starts a session of 10 after a session of 10', async ({ page }) => {
    await resultsWithMistakes(page, EN, '10')

    await button(page, EN.practice).click()

    await expect(
      page.getByRole('progressbar', { name: 'Question 1 of 10', exact: true }),
    ).toBeVisible()
    await expectNoteDrawn(page)
    await answerRight(page, EN, 're')
  })

  test('is not offered after a session without mistakes', async ({ page }) => {
    await page.goto('/')
    await startSession(page, EN.noLimit)
    await expectNoteDrawn(page)
    await answerRight(page, EN, 'do')
    await button(page, EN.finish).click()

    await expect(heading(page, EN.results)).toBeVisible()
    await expect(page.getByText(EN.none, { exact: true })).toBeVisible()
    await expect(button(page, EN.practice)).toHaveCount(0)
  })

  test('moves the focus to the heading of the question', async ({ page }) => {
    await resultsWithMistakes(page)

    await button(page, EN.practice).click()

    await expect(heading(page, EN.question)).toBeFocused()
  })
})

test.describe('Practice only these on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  for (const lang of ['en', 'ru'] as const) {
    const texts = TEXTS[lang]

    test.describe(`in ${lang}`, () => {
      test.use({ locale: texts.browser })

      test('fits the results with the button large enough', async ({ page }) => {
        await resultsWithMistakes(page, texts)

        const practice = button(page, texts.practice)
        await practice.scrollIntoViewIfNeeded()
        await expect(practice).toBeVisible()
        await expectTarget(practice)
        await expectNoHorizontalScroll(page)
      })
    })
  }
})
