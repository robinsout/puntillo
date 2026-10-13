import { expect, test, type Locator, type Page } from '@playwright/test'

// Feature progress-and-storage, slice 1: Hardest notes of a real session kept in the browser over a
// reload (criteria 1, 5, 6), the Progress screen on a narrow screen and with the keyboard (edge
// case 7). As in most-mistakes.spec.ts the page starts in Confident reading with one note in 4/4,
// as if chosen on an earlier visit, and Math.random is fixed at 0, so the first question is C4
// (do), a whole note, then D4 (re).
// Slice 2: Recent sessions of a real session kept over a reload (criteria 2, 3), the screen with
// sessions on a narrow screen (edge case 7). The date is today's, so only its form is checked here;
// the texts of the dates are checked in src/presentation/progress/__tests__/recent-sessions.spec.ts.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.locator('[role="img"]').first()
const hardestNotes = (page: Page) =>
  page.getByRole('list', { name: 'Hardest notes', exact: true }).getByRole('listitem')

const recentSessions = (page: Page) =>
  page.getByRole('list', { name: 'Recent sessions', exact: true }).getByRole('listitem')

// C4 wrong on the name in both attempts, its duration right, then Finish: one question, 50%.
const SESSION_LINE = /^\d{1,2} \w{3,4} · Read notes · No limit · 1 question · 50%$/

function sessionLines(page: Page) {
  return recentSessions(page).evaluateAll((all) =>
    all.map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  )
}

function itemTexts(page: Page) {
  return hardestNotes(page).evaluateAll((all) =>
    all.map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
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

async function answer(page: Page, name: string, duration = true) {
  await button(page, name).click()
  if (duration) await button(page, '1/1').click()
  await button(page, 'Check').click()
}

// C4 wrong in both attempts on the name, then back on the choice screen.
async function sessionWithMistakeOnC4(page: Page) {
  await page.goto('/')
  await button(page, 'No limit').click()
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await answer(page, 'mi')
  await answer(page, 'fa', false)
  await expect(button(page, 'Next')).toBeVisible()
  await button(page, 'Finish').click()
  await expect(heading(page, 'Results')).toBeVisible()
  await button(page, 'New session').click()
  await expect(heading(page, 'Session length')).toBeVisible()
}

async function openProgress(page: Page) {
  await link(page, 'Progress').click()
  await expect(heading(page, 'Progress')).toBeVisible()
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

test.describe('Progress', () => {
  // Assertions use English texts, and WebKit without a locale falls back to the system language.
  test.use({ locale: 'en-US' })

  test('says No mistakes yet before any session', async ({ page }) => {
    await page.goto('/')

    await openProgress(page)

    await expect(page.getByText('No mistakes yet', { exact: true })).toBeVisible()
    await expect(hardestNotes(page)).toHaveCount(0)
  })

  test('lists a note answered wrong in a session among Hardest notes', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)

    expect(await itemTexts(page)).toEqual(['do4, whole note — 1 mistake of 1'])
  })

  test('keeps Hardest notes over a reload', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await page.reload()
    await openProgress(page)

    expect(await itemTexts(page)).toEqual(['do4, whole note — 1 mistake of 1'])
  })

  test('says No sessions yet before any session', async ({ page }) => {
    await page.goto('/')

    await openProgress(page)

    await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible()
    await expect(recentSessions(page)).toHaveCount(0)
  })

  test('lists a session ended by Finish under Recent sessions', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)

    const lines = await sessionLines(page)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(SESSION_LINE)
  })

  test('keeps Recent sessions over a reload', async ({ page }) => {
    await sessionWithMistakeOnC4(page)
    await openProgress(page)
    const before = await sessionLines(page)

    await page.reload()
    await expect(heading(page, 'Progress')).toBeVisible()

    expect(await sessionLines(page)).toEqual(before)
    expect(before[0]).toMatch(SESSION_LINE)
  })

  test('opens at its own address and leads back by Trainer', async ({ page }) => {
    await page.goto('/progress')
    await expect(heading(page, 'Progress')).toBeVisible()

    await link(page, 'Trainer').click()

    await expect(heading(page, 'Session length')).toBeVisible()
  })

  test('is used with the keyboard alone', async ({ page, browserName }) => {
    await page.goto('/')
    await expect(link(page, 'Progress')).toBeVisible()

    await tabTo(page, browserName, link(page, 'Progress'))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Progress')).toBeVisible()
    await tabTo(page, browserName, link(page, 'Trainer'))
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Session length')).toBeVisible()
  })
})

test.describe('Progress on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, locale: 'en-US' })

  test('fits the link on the choice screen, large enough', async ({ page }) => {
    await page.goto('/')
    await expect(link(page, 'Progress')).toBeVisible()

    await expectTarget(link(page, 'Progress'), 'Progress')
    await expectNoHorizontalScroll(page)
  })

  test('fits the screen with Hardest notes, Trainer large enough', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)
    await expect(hardestNotes(page)).toHaveCount(1)

    await expectTarget(link(page, 'Trainer'), 'Trainer')
    for (const item of await hardestNotes(page).all()) {
      const box = await item.boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    }
    await expectNoHorizontalScroll(page)
  })

  test('fits the screen with Recent sessions', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)
    await expect(recentSessions(page)).toHaveCount(1)

    for (const line of await recentSessions(page).all()) {
      const box = await line.boundingBox()
      expect(box && box.x).toBeGreaterThanOrEqual(0)
      expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    }
    await expectNoHorizontalScroll(page)
  })

  test('fits the screen without mistakes', async ({ page }) => {
    await page.goto('/progress')
    await expect(page.getByText('No mistakes yet', { exact: true })).toBeVisible()

    await expectTarget(link(page, 'Trainer'), 'Trainer')
    await expectNoHorizontalScroll(page)
  })
})
