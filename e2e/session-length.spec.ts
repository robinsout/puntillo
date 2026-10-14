import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  chooseLength,
  lengthCell,
  lengthGroup,
  lengthOption,
  startButton,
  startSession,
} from './session-length'

// Feature navigation-and-settings, slice 3, in a real browser (spec §16, §17): the session length is
// a choice of seven cells on the start screen, in two rows of four and three on a 360 px wide
// screen, each at least 44 × 44, and Start below it the width of the column, as tall as
// --target-size-l (criteria 14, 15). The arrows move the choice within the group and Tab goes in
// and out of it (edge case 7). The choice is kept over a reload.
//
// As in navigation.spec.ts the page starts in Confident reading with one note in 4/4 and
// Math.random is fixed at 0, so the first question is a whole C4 (do).

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const FIRST_ROW = ['10', '20', '50', 'No limit']
const SECOND_ROW = ['3 min', '5 min', '10 min']
// --target-size-l, 3.25rem.
const START_HEIGHT = 52

const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })

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

async function expectNoteDrawn(page: Page) {
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
}

// WebKit on macOS tabs only through form fields; buttons need Option+Tab.
const tab = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
const backTab = (browserName: string) => (browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab')

test.describe('session length on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits seven cells in two rows, each at least 44 by 44, without horizontal scrolling', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(startButton(page)).toBeVisible()

    const rowTop = async (names: readonly string[]) => {
      const tops: number[] = []
      for (const name of names) {
        const box = await boxOf(await lengthCell(page, name))
        expect(box.width, `width of "${name}"`).toBeGreaterThanOrEqual(44 - 0.01)
        expect(box.height, `height of "${name}"`).toBeGreaterThanOrEqual(44 - 0.01)
        expect(box.x, `left edge of "${name}"`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `right edge of "${name}"`).toBeLessThanOrEqual(360)
        tops.push(Math.round(box.y))
      }
      expect(new Set(tops).size, `one row: ${names.join(', ')}`).toBe(1)
      return tops[0] ?? 0
    }
    expect(await rowTop(SECOND_ROW)).toBeGreaterThan(await rowTop(FIRST_ROW))
    const xs: number[] = []
    for (const name of FIRST_ROW) xs.push((await boxOf(await lengthCell(page, name))).x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('shows No limit as ∞', async ({ page }) => {
    await page.goto('/')

    await expect(await lengthCell(page, 'No limit')).toHaveText('∞')
  })

  test('puts Start below the choice, the width of the column and at least 52 px tall', async ({
    page,
  }) => {
    await page.goto('/')

    const group = await boxOf(lengthGroup(page))
    const start = await boxOf(startButton(page))
    expect(start.y).toBeGreaterThanOrEqual(group.y + group.height)
    expect(start.height).toBeGreaterThanOrEqual(START_HEIGHT - 0.01)
    expect(Math.abs(start.x - group.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(start.width - group.width)).toBeLessThanOrEqual(1)
    expect(start.x + start.width).toBeLessThanOrEqual(360)
  })

  test('marks the chosen cell by more than its colour: the text is bold', async ({ page }) => {
    await page.goto('/')
    await chooseLength(page, '20')

    const weightOf = async (name: string) =>
      Number(
        await (
          await lengthCell(page, name)
        ).evaluate((cell: Element) => getComputedStyle(cell).fontWeight),
      )
    expect(await weightOf('20')).toBeGreaterThan(await weightOf('10'))
  })
})

test.describe('session length', () => {
  test('has 10 chosen for a new user, and a press only chooses', async ({ page }) => {
    await page.goto('/')
    await expect(lengthOption(page, '10')).toBeChecked()

    await chooseLength(page, '50')

    await expect(lengthOption(page, '50')).toBeChecked()
    await expect(lengthOption(page, '10')).not.toBeChecked()
    await expect(staff(page)).toHaveCount(0)
  })

  test('starts a session of the length chosen with Start', async ({ page }) => {
    await page.goto('/')

    await startSession(page, '20')

    await expectNoteDrawn(page)
    await expect(
      page.getByRole('progressbar', { name: 'Question 1 of 20', exact: true }),
    ).toBeVisible()
  })

  test('keeps the choice over a reload', async ({ page }) => {
    await page.goto('/')
    await chooseLength(page, '5 min')
    await expect(lengthOption(page, '5 min')).toBeChecked()

    await page.reload()

    await expect(lengthOption(page, '5 min')).toBeChecked()
    await startButton(page).click()
    await expectNoteDrawn(page)
    await expect(page.getByRole('progressbar', { name: 'Time: 0:00', exact: true })).toBeVisible()
  })
})

test.describe('session length with the keyboard', () => {
  test('moves the choice with the arrows and starts the session with Enter on Start', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await lengthOption(page, '10').focus()

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(lengthOption(page, 'No limit')).toBeChecked()
    await expect(lengthOption(page, 'No limit')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(lengthOption(page, '50')).toBeChecked()
    await expect(staff(page)).toHaveCount(0)

    await page.keyboard.press(tab(browserName))
    await expect(startButton(page)).toBeFocused()
    await page.keyboard.press('Enter')

    await expectNoteDrawn(page)
    await expect(
      page.getByRole('progressbar', { name: 'Question 1 of 50', exact: true }),
    ).toBeVisible()
  })

  test('goes into the group at the chosen length and out of it with Tab, Space on Start starts', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await chooseLength(page, '3 min')
    await startButton(page).focus()

    await page.keyboard.press(backTab(browserName))
    await expect(lengthOption(page, '3 min')).toBeFocused()
    await page.keyboard.press(tab(browserName))
    await expect(startButton(page)).toBeFocused()
    await page.keyboard.press('Space')

    await expectNoteDrawn(page)
    await expect(page.getByRole('progressbar', { name: 'Time: 0:00', exact: true })).toBeVisible()
  })

  test('puts the focus on the hidden heading Trainer back from a session', async ({ page }) => {
    await page.goto('/')
    await startSession(page, 'No limit')
    await expectNoteDrawn(page)

    await page.getByRole('button', { name: 'Finish', exact: true }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Trainer', exact: true }),
    ).toBeFocused()
  })
})
