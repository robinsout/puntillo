import { expect, test, type Locator, type Page } from '@playwright/test'
import { navigation, section } from './navigation'
import { changeSettings } from './settings'

// Feature navigation-and-settings, slice 2, in a real browser (spec §16, §17): the header and the
// navigation Sections on every screen but the question of a session (criteria 1–4). Below 768 px
// the navigation is a bar of four tabs fixed at the bottom, each at least 44 × 44, the content
// scrolled clear of it (edge cases 5, 6); from 768 px it is a row of links in the header, right of
// the title. Tab reaches the title and the four sections before the screen (edge case 7). The
// quick mode changed in Settings in the middle of a question, by the way of a hint and its
// article, acts back on the question (criterion 9, edge case 1).
//
// As in hints.spec.ts the page starts in Confident reading with one note in 4/4 and Math.random is
// fixed at 0, so the first question is a whole C4 (do), then a whole D4 (re).

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const SECTIONS = ['Trainer', 'Progress', 'Wiki', 'Settings']
// The text of the current tab is bold, so it is told by more than its colour.
const BOLD = 600

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const title = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'Puntillo' })
const autoNext = (page: Page) =>
  page.getByRole('checkbox', { name: 'Open next question automatically', exact: true })

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

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${String(locator)} has no box`)
  return box
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

const fontWeight = (locator: Locator) =>
  locator.evaluate((element) => Number(getComputedStyle(element).fontWeight))

async function expectCurrentBold(page: Page, current: string) {
  for (const name of SECTIONS) {
    const weight = await fontWeight(section(page, name))
    if (name === current) expect(weight, `weight of ${name}`).toBeGreaterThanOrEqual(BOLD)
    else expect(weight, `weight of ${name}`).toBeLessThan(BOLD)
  }
  await expect(section(page, current)).toHaveAttribute('aria-current', 'page')
}

// The links of the sections side by side, in their order, their tops level.
async function expectInOneRow(page: Page) {
  const boxes = await Promise.all(SECTIONS.map((name) => boxOf(section(page, name))))
  for (const [index, box] of boxes.entries()) {
    expect(Math.abs(box.y - boxes[0]!.y), `top of ${SECTIONS[index]}`).toBeLessThanOrEqual(1)
    if (index > 0) {
      const before = boxes[index - 1]!
      expect(box.x, `${SECTIONS[index]} after ${SECTIONS[index - 1]}`).toBeGreaterThanOrEqual(
        before.x + before.width - 1,
      )
    }
  }
}

async function expectInHeader(page: Page) {
  const viewport = page.viewportSize()!
  const nav = await boxOf(navigation(page))
  const name = await boxOf(title(page))
  expect(nav.y, 'top of the navigation').toBeLessThan(100)
  expect(nav.x, 'the navigation right of Puntillo').toBeGreaterThanOrEqual(name.x + name.width)
  expect(nav.y + nav.height, 'bottom of the navigation').toBeLessThan(viewport.height / 2)
  await expectInOneRow(page)
  await expectNoHorizontalScroll(page)
}

test.describe('navigation on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  for (const path of ['/', '/settings']) {
    test(`is a bar of four tabs at the bottom on ${path}, clear of the content`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(navigation(page)).toBeVisible()

      const nav = await boxOf(navigation(page))
      expect(Math.abs(nav.y + nav.height - 640), 'bottom of the navigation').toBeLessThanOrEqual(1)
      await expectInOneRow(page)
      for (const name of SECTIONS) {
        const box = await boxOf(section(page, name))
        // Layout is fractional: Firefox reports 2.75rem as 43.99997px, which is still a 44px target.
        expect(box.width, `width of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
        expect(box.height, `height of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
        expect(box.x, `left edge of ${name}`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `right edge of ${name}`).toBeLessThanOrEqual(360)
      }
      await expectNoHorizontalScroll(page)

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const last = page.getByRole('main').locator(':scope > *:last-child')
      await expect
        .poll(async () => (await boxOf(last)).y + (await boxOf(last)).height)
        .toBeLessThanOrEqual((await boxOf(navigation(page))).y + 1)
    })
  }

  test('has the header with Puntillo at the top on the left', async ({ page }) => {
    await page.goto('/progress')

    const name = await boxOf(title(page))
    expect(name.y).toBeLessThan(100)
    expect(name.x).toBeLessThan(180)
  })

  test('marks the current tab in bold', async ({ page }) => {
    await page.goto('/wiki/durations')
    await expect(heading(page, 'Durations of notes and rests')).toBeVisible()

    await expectCurrentBold(page, 'Wiki')
  })
})

test.describe('navigation on a 1440 px wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is a row of links in the header, right of Puntillo', async ({ page }) => {
    await page.goto('/')
    await expect(navigation(page)).toBeVisible()

    await expectInHeader(page)
  })

  test('marks the current link in bold', async ({ page }) => {
    await page.goto('/settings')
    await expect(heading(page, 'Settings')).toBeVisible()

    await expectCurrentBold(page, 'Settings')
  })
})

// Edge case 6: a phone on its side is as wide as a small tablet.
test.describe('navigation on a 780 px wide screen', () => {
  test.use({ viewport: { width: 780, height: 360 } })

  test('is a row of links in the header, as on a desktop, the content scrolling', async ({
    page,
  }) => {
    await page.goto('/settings')
    await expect(navigation(page)).toBeVisible()

    await expectInHeader(page)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })
})

// WebKit on macOS tabs only through form fields; links and buttons need Option+Tab.
const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

test.describe('navigation with the keyboard', () => {
  test('reaches Puntillo and the four sections with Tab first, then opens one', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await expect(navigation(page)).toBeVisible()
    const key = tabKey(browserName)

    // The walk starts at the top of the page, before the app, whatever has the focus on load.
    await page.evaluate(() => {
      const start = document.createElement('div')
      start.tabIndex = -1
      document.body.prepend(start)
      start.focus()
    })
    for (const target of [title(page), ...SECTIONS.map((name) => section(page, name))]) {
      await page.keyboard.press(key)
      await expect(target).toBeFocused()
    }
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Settings')).toBeFocused()
  })

  test('puts the focus on the heading of the screen opened', async ({ page }) => {
    await page.goto('/settings')
    await expect(heading(page, 'Settings')).toBeVisible()

    await section(page, 'Progress').click()

    await expect(heading(page, 'Progress')).toBeFocused()
  })
})

test.describe('the question of a session', () => {
  test('has neither the header nor the navigation, back once it is finished', async ({ page }) => {
    await page.goto('/')
    await expect(navigation(page)).toBeVisible()

    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    await expect(page.getByRole('banner')).toHaveCount(0)
    await expect(navigation(page)).toHaveCount(0)
    await button(page, 'Finish').click()
    await expect(navigation(page)).toBeVisible()
  })
})

// From the review of C4 answered re, then mi, to its hint, to the article of the hint. In the
// quick mode a press of the name answers, with no Check after it.
async function readArticleFromReview(page: Page, { check = ['Check'] } = {}) {
  const answer = async (name: string) => {
    for (const each of [name, ...check]) await button(page, each).click()
  }
  await button(page, 'No limit').click()
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await button(page, '1/1').click()
  await answer('re')
  await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
  await answer('mi')
  await expect(button(page, 'Next')).toBeVisible()
  await button(page, 'Why?').click()
  await link(page, 'Read the article').click()
  await expect(heading(page, 'Notes on the treble staff')).toBeVisible()
}

test.describe('the quick mode changed in Settings in the middle of a question', () => {
  test('ticked on the review, opens the next question once back, answered at once', async ({
    page,
  }) => {
    await page.goto('/')
    await readArticleFromReview(page)

    await section(page, 'Settings').click()
    await autoNext(page).check()
    await section(page, 'Trainer').click()

    await expect(heading(page, 'Name the note')).toBeVisible()
    await expect(page.getByText('Question 2', { exact: true })).toBeVisible()
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect(button(page, 'Check')).toHaveCount(0)
    await button(page, '1/1').click()
    await button(page, 're').click()
    await expect(page.getByText('Question 3', { exact: true })).toBeVisible()
  })

  test('unticked on the review, goes on with Check once back', async ({ page }) => {
    await page.goto('/')
    await changeSettings(page, () => autoNext(page).check())
    await readArticleFromReview(page, { check: [] })

    await section(page, 'Settings').click()
    await autoNext(page).uncheck()
    await section(page, 'Trainer').click()

    await expect(heading(page, 'Name the note')).toBeVisible()
    await button(page, 'Next').click()
    await expect(page.getByText('Question 2', { exact: true })).toBeVisible()
    await button(page, '1/1').click()
    await button(page, 're').click()
    await expect(page.getByRole('status')).toHaveText('')
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeVisible()
  })

  // Edge case 1: the tab Trainer is a way back to the question as Back to the question is.
  test('the tab Trainer from the article brings back the same review', async ({ page }) => {
    await page.goto('/')
    await readArticleFromReview(page)

    await section(page, 'Trainer').click()

    await expect(heading(page, 'Name the note')).toBeVisible()
    await expect(page.getByText('Question 1', { exact: true })).toBeVisible()
    await expect(button(page, 'Why?')).toBeVisible()
    await expect(button(page, 'Next')).toBeVisible()
  })
})
