import { expect, test, type Locator, type Page } from '@playwright/test'

// Feature wiki, slice 3: from the review of a mistake to the hint, to the article and back to the
// same question, in a real browser (spec §16). As in trainer.spec.ts the page starts in Confident
// reading with one note in 4/4, as if chosen on an earlier visit, and Math.random is fixed at 0, so
// the first question is a whole C4 (do). Answered re, then mi, it gets the review below, one
// sentence of the place of the note: its hint is that of Notes on the treble staff. The texts of
// the hints are their authors' to change, so only their title, a text and a drawn example are
// checked.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const REVIEW_OF_C4 = 'You chose mi. This is do: the note on the first ledger line below the staff.'
const TOPIC = 'Notes on the treble staff'
const ARTICLE = '/wiki/treble-staff'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const why = (page: Page) => button(page, 'Why?')
const hint = (page: Page) => page.getByRole('dialog')
const backToQuestion = (page: Page) =>
  link(page, 'Back to the question').or(button(page, 'Back to the question'))

// The status message as read: the buttons Why? after its sentences are no part of it.
function reviewText(page: Page) {
  return page.getByRole('status').evaluate((status) => {
    const copy = status.cloneNode(true) as HTMLElement
    for (const each of copy.querySelectorAll('button')) each.remove()
    return copy.textContent?.replace(/\s+/g, ' ').trim()
  })
}

async function expectTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox()
  // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
  expect(box?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
}

async function reviewC4(page: Page) {
  await page.goto('/')
  await button(page, 'No limit').click()
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await button(page, 're').click()
  await button(page, '1/1').click()
  await button(page, 'Check').click()
  await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
  await button(page, 'mi').click()
  await button(page, 'Check').click()
  await expect.poll(() => reviewText(page)).toBe(REVIEW_OF_C4)
}

async function openHint(page: Page) {
  await why(page).click()
  await expect(hint(page)).toBeVisible()
  await expect(hint(page).getByRole('img').locator('svg .vf-stavenote').first()).toBeVisible()
}

// Assertions use English texts, and WebKit without a locale falls back to the system language.
test.use({ locale: 'en-US' })

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

test.describe('the hint of a mistake', () => {
  test('opens from Why? with its title, its text and its example drawn', async ({ page }) => {
    await reviewC4(page)
    await expect(why(page)).toHaveAccessibleDescription(REVIEW_OF_C4)

    await openHint(page)

    await expect(hint(page).getByRole('heading', { name: TOPIC, exact: true })).toBeVisible()
    const text = await hint(page).evaluate((dialog) => {
      const copy = dialog.cloneNode(true) as HTMLElement
      for (const each of copy.querySelectorAll('h1, h2, h3, a, button, [role="img"]')) each.remove()
      return copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    })
    expect(text.length).toBeGreaterThan(20)
    await expect(link(page, 'Read the article')).toBeVisible()
    await expect(button(page, 'Close')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('leaves the question as it was, and closes with Esc, the focus back on Why?', async ({
    page,
  }) => {
    await reviewC4(page)
    await openHint(page)

    await page.keyboard.press('Escape')

    await expect(hint(page)).toBeHidden()
    await expect(why(page)).toBeFocused()
    await expect.poll(() => reviewText(page)).toBe(REVIEW_OF_C4)
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    await expect(button(page, 'Next')).toBeVisible()
  })

  test('closes with Close, the focus back on Why?', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)

    await button(page, 'Close').click()

    await expect(hint(page)).toBeHidden()
    await expect(why(page)).toBeFocused()
  })

  test('closes with a press outside it, the focus back on Why?', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)

    // The corner of the page, on the backdrop of the dialog.
    await page.mouse.click(5, 5)

    await expect(hint(page)).toBeHidden()
    await expect(why(page)).toBeFocused()
  })

  test('leads to the article and back to the same question', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)

    await link(page, 'Read the article').click()

    await expect(page).toHaveURL(new RegExp(`${ARTICLE}$`))
    await expect(heading(page, TOPIC)).toBeVisible()
    await expect(backToQuestion(page)).toBeVisible()
    await expect(page.getByRole('main').getByRole('img').first()).toBeVisible()
    await expect(button(page, 'Practice this')).toHaveCount(0)

    await backToQuestion(page).click()

    await expect(heading(page, 'Name the note')).toBeAttached()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect.poll(() => reviewText(page)).toBe(REVIEW_OF_C4)
    await expect(page.getByText('Question 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    await expect(why(page)).toBeFocused()
  })

  test('leaves no Back to the question after a reload on the article', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)
    await link(page, 'Read the article').click()
    await expect(backToQuestion(page)).toBeVisible()

    await page.reload()

    await expect(heading(page, TOPIC)).toBeVisible()
    await expect(button(page, 'Practice this')).toBeVisible()
    await expect(backToQuestion(page)).toHaveCount(0)
  })
})

test.describe('the hint on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits with its controls and Why? large enough', async ({ page }) => {
    await reviewC4(page)
    await expectTarget(why(page), 'Why?')

    await openHint(page)

    const box = await hint(page).boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    await expectTarget(link(page, 'Read the article'), 'Read the article')
    await expectTarget(button(page, 'Close'), 'Close')
    await expectNoHorizontalScroll(page)
    const overflow = await hint(page).evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
    expect(overflow).toBe(0)
  })

  test('fits the article with Back to the question large enough', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)
    await link(page, 'Read the article').click()
    await expect(backToQuestion(page)).toBeVisible()

    await expectTarget(backToQuestion(page), 'Back to the question')
    await expectNoHorizontalScroll(page)
  })
})
