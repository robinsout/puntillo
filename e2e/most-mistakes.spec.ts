import { expect, test, type Locator, type Page } from '@playwright/test'
import { startSession } from './session-length'

// Feature session-summary, slice 2: Most mistakes in the results of a real session, its links to
// the wiki and Back to the results (criteria 6–9, edge case 6). As in hints.spec.ts the page starts
// in Confident reading with one note in 4/4, as if chosen on an earlier visit, and Math.random is
// fixed at 0, so the questions are whole notes, C4 (do), D4 (re), C4… Each is answered wrong twice
// on the name: C4 twice and D4 once give do4 with two mistakes, then re4 with one.

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
    mostMistakes: 'Most mistakes',
    none: 'No mistakes',
    back: 'Back to the results',
    staff: 'Notes on the treble staff',
    items: ['do4, whole note — 2 mistakes', 're4, whole note — 1 mistake'],
  },
  ru: {
    browser: 'ru-RU',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    next: 'Далее',
    finish: 'Завершить',
    results: 'Результаты',
    mostMistakes: 'Больше всего ошибок',
    none: 'Ошибок нет',
    back: 'Назад к результатам',
    staff: 'Ноты на нотоносце в скрипичном ключе',
    items: ['do4, целая — 2 ошибки', 're4, целая — 1 ошибка'],
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
const staffLink = (page: Page, index: number, texts: Texts = EN) =>
  items(page, texts).nth(index).getByRole('link', { name: texts.staff, exact: true })
const backToResults = (page: Page, texts: Texts = EN) =>
  page
    .getByRole('link', { name: texts.back, exact: true })
    .or(page.getByRole('button', { name: texts.back, exact: true }))

// The text of each item without its links.
function itemTexts(page: Page, texts: Texts = EN) {
  return items(page, texts).evaluateAll((all) =>
    all.map((item) => {
      const copy = item.cloneNode(true) as HTMLElement
      for (const link of copy.querySelectorAll('a, [role="link"]')) link.remove()
      return copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    }),
  )
}

async function expectTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox()
  // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
  expect(box?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.x, `left edge of ${what}`).toBeGreaterThanOrEqual(0)
  expect(box && box.x + box.width, `right edge of ${what}`).toBeLessThanOrEqual(360)
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function openNoLimitSession(page: Page, texts: Texts) {
  await page.goto('/')
  await startSession(page, texts.noLimit)
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
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

async function resultsWithMistakes(page: Page, texts: Texts = EN) {
  await openNoLimitSession(page, texts)
  await answerWrong(page, texts)
  await button(page, texts.next).click()
  await answerWrong(page, texts)
  await button(page, texts.next).click()
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

test.describe('Most mistakes', () => {
  // Assertions use English texts, and WebKit without a locale falls back to the system language.
  test.use({ locale: EN.browser })

  test('lists the notes with most mistakes below the figures of the results', async ({ page }) => {
    await resultsWithMistakes(page)

    await expect(page.getByText('Best streak: 0', { exact: true })).toBeVisible()
    await expect(mostMistakes(page)).toBeVisible()
    expect(await itemTexts(page)).toEqual(EN.items)
    for (let index = 0; index < 2; index++) await expect(staffLink(page, index)).toBeVisible()
    await expect(page.getByText(EN.none, { exact: true })).toHaveCount(0)
  })

  test('leads to the article and back to the same results', async ({ page }) => {
    await resultsWithMistakes(page)
    const before = await itemTexts(page)

    await staffLink(page, 1).click()

    await expect(page).toHaveURL(/\/wiki\/treble-staff$/)
    await expect(heading(page, EN.staff)).toBeVisible()
    await expect(page.getByRole('main').getByRole('img').first()).toBeVisible()
    await expect(backToResults(page)).toBeVisible()
    await expect(button(page, 'Practice this')).toHaveCount(0)

    await backToResults(page).click()

    await expect(heading(page, EN.results)).toBeAttached()
    expect(new URL(page.url()).pathname).toBe('/')
    expect(await itemTexts(page)).toEqual(before)
    await expect(page.getByText('Questions: 3', { exact: true })).toBeVisible()
    await expect(staffLink(page, 1)).toBeFocused()
  })

  test('says "No mistakes" after a session without mistakes', async ({ page }) => {
    await openNoLimitSession(page, EN)
    await answer(page, EN, 'do')
    await expect(page.getByRole('status')).toHaveText('Correct')
    await button(page, EN.finish).click()

    await expect(heading(page, EN.results)).toBeVisible()
    await expect(page.getByRole('heading', { name: EN.mostMistakes, exact: true })).toBeVisible()
    await expect(page.getByText(EN.none, { exact: true })).toBeVisible()
    await expect(mostMistakes(page)).toHaveCount(0)
  })
})

test.describe('Most mistakes on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  for (const lang of ['en', 'ru'] as const) {
    const texts = TEXTS[lang]

    test.describe(`in ${lang}`, () => {
      test.use({ locale: texts.browser })

      test('fits the list with its links large enough', async ({ page }) => {
        await resultsWithMistakes(page, texts)
        expect(await itemTexts(page, texts)).toEqual(texts.items)

        for (let index = 0; index < 2; index++) {
          const link = staffLink(page, index, texts)
          await link.scrollIntoViewIfNeeded()
          await expectTarget(link, `${texts.staff} of item ${index + 1}`)
        }
        await expectNoHorizontalScroll(page)
      })

      test('fits the article with Back to the results large enough', async ({ page }) => {
        await resultsWithMistakes(page, texts)

        await staffLink(page, 0, texts).click()
        await expect(backToResults(page, texts)).toBeVisible()

        await backToResults(page, texts).scrollIntoViewIfNeeded()
        await expectTarget(backToResults(page, texts), texts.back)
        await expectNoHorizontalScroll(page)
      })
    })
  }
})
