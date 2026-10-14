import { expect, test, type Locator, type Page } from '@playwright/test'
import { startSession } from './session-length'

// Feature progress-and-storage, slice 3: a session left after its checks is kept in the browser
// over a reload and offered on the choice screen with Continue and Discard (criteria 8–10, 12), on
// a narrow screen and with the keyboard (edge case 7). As in progress.spec.ts the page starts in
// Confident reading with one note in 4/4, as if chosen on an earlier visit, and Math.random is
// fixed at 0, so the questions go C4 (do), D4 (re), C4… as whole notes.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const BLOCK = 'Unfinished session'
// Two questions of ten answered right, the third one on the screen.
const LINE = 'Read notes · question 3 of 10 · 100%'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.locator('[role="img"]').first()
const block = (page: Page) => page.getByRole('region', { name: BLOCK, exact: true })
const blockButton = (page: Page, name: string) =>
  block(page).getByRole('button', { name, exact: true })

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

// WebKit on macOS tabs only through form fields; links and buttons need Option+Tab. The walk
// starts from the heading; controls above it are reached backwards.
async function tabTo(page: Page, browserName: string, target: Locator) {
  const first = page.locator('h1').first()
  const above = await target.evaluate(
    (element, headingElement) =>
      Boolean(headingElement.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
    await first.elementHandle().then((handle) => handle!),
  )
  const key = `${browserName === 'webkit' ? 'Alt+' : ''}${above ? 'Shift+' : ''}Tab`
  await first.focus()
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press(key)
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`${String(target)} is not reachable with Tab`)
}

async function answerRight(page: Page, name: string) {
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await button(page, name).click()
  await button(page, '1/1').click()
  await button(page, 'Check').click()
  await button(page, 'Next').click()
}

// do and re answered right in a session of 10, then the page reloaded on the third question.
async function sessionLeftOnQuestionThree(page: Page) {
  await page.goto('/')
  await startSession(page, '10')
  await answerRight(page, 'do')
  await answerRight(page, 're')
  await expect(page.getByText('Question 3 of 10', { exact: true })).toBeVisible()
  await page.reload()
  await expect(heading(page, 'Trainer')).toBeAttached()
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

test.describe('Unfinished session', () => {
  // Assertions use English texts, and WebKit without a locale falls back to the system language.
  test.use({ locale: 'en-US' })

  test('is not offered before any session', async ({ page }) => {
    await page.goto('/')
    await expect(heading(page, 'Trainer')).toBeAttached()

    await expect(block(page)).toHaveCount(0)
  })

  test('is offered after a reload with its position', async ({ page }) => {
    await sessionLeftOnQuestionThree(page)

    await expect(block(page).getByRole('heading', { level: 2, name: BLOCK })).toBeVisible()
    await expect(block(page).getByText(LINE, { exact: true })).toBeVisible()
    await expect(blockButton(page, 'Continue')).toBeVisible()
    await expect(blockButton(page, 'Discard')).toBeVisible()
  })

  test('goes on with the third question and the score by Continue', async ({ page }) => {
    await sessionLeftOnQuestionThree(page)

    await blockButton(page, 'Continue').click()

    await expect(page.getByText('Question 3 of 10', { exact: true })).toBeVisible()
    await expect(page.getByText('Points: 4 of 4', { exact: true })).toBeVisible()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  })

  test('is gone by Discard, after a reload too', async ({ page }) => {
    await sessionLeftOnQuestionThree(page)

    await blockButton(page, 'Discard').click()
    await expect(block(page)).toHaveCount(0)
    await page.reload()
    await expect(heading(page, 'Trainer')).toBeAttached()

    await expect(block(page)).toHaveCount(0)
  })

  test('is continued with the keyboard alone', async ({ page, browserName }) => {
    await sessionLeftOnQuestionThree(page)

    await tabTo(page, browserName, blockButton(page, 'Continue'))
    await page.keyboard.press('Enter')

    await expect(page.getByText('Question 3 of 10', { exact: true })).toBeVisible()
  })
})

test.describe('Unfinished session on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, locale: 'en-US' })

  test('fits the block, its buttons large enough', async ({ page }) => {
    await sessionLeftOnQuestionThree(page)

    await expect(block(page)).toBeVisible()
    await expectTarget(blockButton(page, 'Continue'), 'Continue')
    await expectTarget(blockButton(page, 'Discard'), 'Discard')
    const line = await block(page).getByText(LINE, { exact: true }).boundingBox()
    expect(line && line.x).toBeGreaterThanOrEqual(0)
    expect(line && line.x + line.width).toBeLessThanOrEqual(360)
    await expectNoHorizontalScroll(page)
  })
})
