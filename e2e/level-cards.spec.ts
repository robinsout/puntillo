import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseExercise, exerciseGroup, exerciseOption, exerciseSegment } from './exercise'
import { lengthOption, startButton } from './session-length'

// Feature navigation-and-settings, slice 4, in a real browser (spec §16, §17): Exercise is a switch
// of two segments in one row the width of the column, each at least 44 × 44, the chosen one bold
// (criterion 12); Level is a subheading with Customize beside it, then three cards of the presets
// in a column, each the width of the column and at least 44 px tall, each with its small staff
// drawn (criterion 13). The arrows move the choice of Exercise; Tab goes through Customize and the
// cards, each a button.
//
// A new user, so First steps; Math.random is fixed at 0.

const PRESETS = ['First steps', 'Confident reading', 'Advanced']

const card = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const customize = (page: Page) => page.getByRole('button', { name: 'Customize', exact: true })
const level = (page: Page) => page.getByRole('heading', { level: 2, name: 'Level', exact: true })
// The staff of the example is a labelled image inside the button, found by its markup.
const exampleIn = (page: Page, name: string) =>
  card(page, name).locator('[role="img"][aria-label="Example"]')

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0
  })
})

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${String(locator)} has no box`)
  return box
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// WebKit on macOS tabs only through form fields; buttons need Option+Tab.
const tab = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

test.describe('the start screen on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('level cards on a 360 px wide screen: a column the width of Start, each drawn', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(startButton(page)).toBeVisible()
    const start = await boxOf(startButton(page))

    let bottom = -Infinity
    for (const name of PRESETS) {
      const box = await boxOf(card(page, name))
      expect(box.height, `height of "${name}"`).toBeGreaterThanOrEqual(44 - 0.01)
      expect(Math.abs(box.x - start.x), `left edge of "${name}"`).toBeLessThanOrEqual(1)
      expect(Math.abs(box.width - start.width), `width of "${name}"`).toBeLessThanOrEqual(1)
      expect(box.y, `"${name}" below the card before`).toBeGreaterThanOrEqual(bottom)
      bottom = box.y + box.height
      await expect(exampleIn(page, name).locator('svg .vf-stavenote')).toHaveCount(1)
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('puts Customize beside the subheading Level, above the cards', async ({ page }) => {
    await page.goto('/')

    const heading = await boxOf(level(page))
    const button = await boxOf(customize(page))
    expect(button.y).toBeLessThan(heading.y + heading.height)
    expect(heading.y).toBeLessThan(button.y + button.height)
    expect(button.x).toBeGreaterThan(heading.x)
    expect(button.x + button.width).toBeLessThanOrEqual(360)
    const first = await boxOf(card(page, PRESETS[0] ?? ''))
    expect(first.y).toBeGreaterThanOrEqual(button.y + button.height - 0.01)
  })

  test('fits the two segments of Exercise in one row the width of Start, each at least 44 by 44', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(startButton(page)).toBeVisible()
    const start = await boxOf(startButton(page))

    const read = await boxOf(await exerciseSegment(page, 'Read notes'))
    const write = await boxOf(await exerciseSegment(page, 'Write notes'))
    for (const [name, box] of [
      ['Read notes', read],
      ['Write notes', write],
    ] as const) {
      expect(box.width, `width of "${name}"`).toBeGreaterThanOrEqual(44 - 0.01)
      expect(box.height, `height of "${name}"`).toBeGreaterThanOrEqual(44 - 0.01)
    }
    expect(Math.round(read.y)).toBe(Math.round(write.y))
    expect(write.x).toBeGreaterThan(read.x)
    const group = await boxOf(exerciseGroup(page))
    expect(Math.abs(group.x - start.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(group.width - start.width)).toBeLessThanOrEqual(1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('marks the chosen segment by more than its colour: the text is bold', async ({ page }) => {
    await page.goto('/')
    await chooseExercise(page, 'Write notes')

    const weightOf = async (name: string) =>
      Number(
        await (
          await exerciseSegment(page, name)
        ).evaluate((segment: Element) => getComputedStyle(segment).fontWeight),
      )
    expect(await weightOf('Write notes')).toBeGreaterThan(await weightOf('Read notes'))
  })
})

test.describe('the start screen with the keyboard', () => {
  test('moves the choice of Exercise with the arrows, and Tab goes through Customize and the cards', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await exerciseOption(page, 'Read notes').focus()

    await page.keyboard.press('ArrowRight')
    await expect(exerciseOption(page, 'Write notes')).toBeChecked()
    await expect(exerciseOption(page, 'Write notes')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(exerciseOption(page, 'Read notes')).toBeChecked()

    for (const next of [customize(page), ...PRESETS.map((name) => card(page, name))]) {
      await page.keyboard.press(tab(browserName))
      await expect(next).toBeFocused()
    }
    await page.keyboard.press(tab(browserName))
    await expect(lengthOption(page, '10')).toBeFocused()
  })

  test('chooses a card with Enter', async ({ page, browserName }) => {
    await page.goto('/')
    await customize(page).focus()

    await page.keyboard.press(tab(browserName))
    await page.keyboard.press(tab(browserName))
    await expect(card(page, 'Confident reading')).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(card(page, 'Confident reading')).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page, 'First steps')).toHaveAttribute('aria-pressed', 'false')
  })
})
