import { expect, test, type Locator, type Page } from '@playwright/test'
import { section } from './navigation'
import { mistakeLines, noteHeadOf } from './results'
import { startSession } from './session-length'

// Feature progress-and-storage, slice 1: Hardest notes of a real session kept in the browser over a
// reload (criteria 1, 5, 6), the Progress screen on a narrow screen and with the keyboard (edge
// case 7). As in most-mistakes.spec.ts the page starts in Confident reading with one note in 4/4,
// as if chosen on an earlier visit, and Math.random is fixed at 0, so the first question is C4
// (do), a whole note, then D4 (re).
// Slice 2: Recent sessions of a real session kept over a reload (criteria 2, 3), the screen with
// sessions on a narrow screen (edge case 7). The date is today's, so only its form is checked here;
// the texts of the dates are checked in src/presentation/progress/__tests__/recent-sessions.spec.ts.
// Feature navigation-and-settings, slice 2: the screen is reached by the tab Progress and left by
// the tab Trainer.
// Feature design-system, slice 6, criterion 11 and edge case 3: a line of Recent sessions puts its
// accuracy on the right in bold; a line of Hardest notes draws its note on a small staff before its
// text, as Most mistakes of the results does.

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

// Feature design-system, slice 6: a line of Hardest notes gives the item and its count apart, as a
// line of Most mistakes does: "do4, whole note / 1 mistake of 1".
const itemTexts = (page: Page) => mistakeLines(hardestNotes(page))

async function expectTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox()
  // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
  expect(box?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.x, `left edge of ${what}`).toBeGreaterThanOrEqual(0)
  expect(box && box.x + box.width, `right edge of ${what}`).toBeLessThanOrEqual(360)
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
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
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await answer(page, 'mi')
  await answer(page, 'fa', false)
  await expect(button(page, 'Next')).toBeVisible()
  await button(page, 'Finish').click()
  await expect(heading(page, 'Results')).toBeVisible()
  await button(page, 'New session').click()
  await expect(heading(page, 'Trainer')).toBeAttached()
}

async function openProgress(page: Page) {
  await section(page, 'Progress').click()
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

    expect(await itemTexts(page)).toEqual(['do4, whole note / 1 mistake of 1'])
  })

  test('keeps Hardest notes over a reload', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await page.reload()
    await openProgress(page)

    expect(await itemTexts(page)).toEqual(['do4, whole note / 1 mistake of 1'])
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

  test('opens at its own address and leads back by the tab Trainer', async ({ page }) => {
    await page.goto('/progress')
    await expect(heading(page, 'Progress')).toBeVisible()

    await section(page, 'Trainer').click()

    await expect(heading(page, 'Trainer')).toBeAttached()
  })

  test('is used with the keyboard alone', async ({ page, browserName }) => {
    await page.goto('/')
    await expect(section(page, 'Progress')).toBeVisible()

    await tabTo(page, browserName, section(page, 'Progress'))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Progress')).toBeVisible()
    await tabTo(page, browserName, section(page, 'Trainer'))
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Trainer')).toBeAttached()
  })
})

test.describe('Progress on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, locale: 'en-US' })

  test('fits the tab Progress on the choice screen, large enough', async ({ page }) => {
    await page.goto('/')
    await expect(section(page, 'Progress')).toBeVisible()

    await expectTarget(section(page, 'Progress'), 'Progress')
    await expectNoHorizontalScroll(page)
  })

  test('fits the screen with Hardest notes, the tab Trainer large enough', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)
    await expect(hardestNotes(page)).toHaveCount(1)

    await expectTarget(section(page, 'Trainer'), 'Trainer')
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

    await expectTarget(section(page, 'Trainer'), 'Trainer')
    await expectNoHorizontalScroll(page)
  })

  test('puts the accuracy of a session on the right of its line, in bold', async ({ page }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)
    await expect(recentSessions(page)).toHaveCount(1)

    const line = recentSessions(page).first()
    const accuracy = line.getByText('50%', { exact: true })
    await expect(accuracy).toBeVisible()
    const lineBox = await boxOf(line)
    const accuracyBox = await boxOf(accuracy)
    const date = await boxOf(line.getByText(/^\d{1,2} \w{3,4}/).first())
    // The padding of the line, --space-l at most.
    expect(lineBox.x + lineBox.width - (accuracyBox.x + accuracyBox.width)).toBeLessThanOrEqual(24)
    expect(accuracyBox.x).toBeGreaterThan(lineBox.x + lineBox.width / 2)
    expect(date.x - lineBox.x).toBeLessThanOrEqual(24)
    expect(accuracyBox.x).toBeGreaterThanOrEqual(date.x + date.width)
    const weight = await accuracy.evaluate((element) =>
      Number(getComputedStyle(element).fontWeight),
    )
    expect(weight).toBeGreaterThanOrEqual(600)
  })

  test('draws the note of each line of Hardest notes on a staff before its text', async ({
    page,
  }) => {
    await sessionWithMistakeOnC4(page)

    await openProgress(page)

    expect(await itemTexts(page)).toEqual(['do4, whole note / 1 mistake of 1'])
    const item = hardestNotes(page).first()
    await expect(item.locator('svg .vf-stavenote')).toHaveCount(1)
    const line = await boxOf(item)
    const head = await noteHeadOf(item)
    const text = await boxOf(item.getByText('do4, whole note', { exact: true }))
    expect(head.left).toBeGreaterThanOrEqual(line.x)
    expect(head.right).toBeLessThanOrEqual(text.x)
    // The cell of the glyph spans the ascent and descent of the music font, taller than the small
    // staff itself, so the middle of the head is what must lie within the line.
    const middle = (head.top + head.bottom) / 2
    expect(middle).toBeGreaterThanOrEqual(line.y)
    expect(middle).toBeLessThanOrEqual(line.y + line.height)
  })
})
