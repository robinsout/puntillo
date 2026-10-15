import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseExercise, exerciseGroup, exerciseOption, exerciseSegment } from './exercise'
import { lengthGroup, lengthOption, startButton } from './session-length'

// Feature navigation-and-settings, slice 4, in a real browser (spec §16, §17): Exercise is a switch
// of two segments in one row the width of the column, each at least 44 × 44, the chosen one bold
// (criterion 12); Level is a subheading with Customize beside it, then three cards of the presets
// in a column, each the width of the column and at least 44 px tall, each with its small staff
// drawn (criterion 13); since feature fast-start the staff is a drawing in the build. The arrows move the choice of Exercise; Tab goes through Customize and the
// cards, each a button.
//
// A new user, so First steps; Math.random is fixed at 0.

const PRESETS = ['First steps', 'Confident reading', 'Advanced']

const card = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const customize = (page: Page) => page.getByRole('button', { name: 'Customize', exact: true })
const level = (page: Page) => page.getByRole('heading', { level: 2, name: 'Level', exact: true })
// The example is a labelled image inside the button, found by its markup.
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

// Feature fast-start, criterion 1: the example is a drawing made beforehand, its glyphs outlines
// rather than text in Bravura, as wide as before: --width-example.
async function expectExampleDrawn(page: Page, name: string) {
  const svg = exampleIn(page, name).locator('svg')
  await expect(svg, `drawing of "${name}"`).toHaveCount(1)
  expect(await svg.locator('path').count(), `outlines in "${name}"`).toBeGreaterThan(0)
  await expect(svg.locator('text'), `text in "${name}"`).toHaveCount(0)
  const width = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'))
    probe.style.width = 'var(--width-example)'
    const { width } = probe.getBoundingClientRect()
    probe.remove()
    return width
  })
  expect(Math.abs((await boxOf(svg)).width - width), `width of "${name}"`).toBeLessThanOrEqual(1)
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
      await expectExampleDrawn(page, name)
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

// Feature design-system, edge case 6: the text of the browser at 200 %, set as the size of the root
// font, which every size of the system follows. A card keeps its title and its line inside its
// frame, with no scroll of its own, and breaks the title between words only. The title and the
// line are found by aria-labelledby and aria-describedby of the card.
async function cardLayoutAt200(page: Page, name: string) {
  return card(page, name).evaluate((button) => {
    const frame = button.getBoundingClientRect()
    const textOf = (id: string | null | undefined) => (id ? document.getElementById(id) : null)
    const parts = [
      textOf(button.getAttribute('aria-labelledby')),
      textOf(button.getAttribute('aria-describedby')?.split(' ')[0]),
    ]
    const outside: string[] = []
    for (const part of parts) {
      if (!part) continue
      const range = document.createRange()
      range.selectNodeContents(part)
      for (const box of [...range.getClientRects(), part.getBoundingClientRect()]) {
        if (box.left < frame.left - 0.5 || box.right > frame.right + 0.5) {
          outside.push(part.textContent?.trim() ?? '')
          break
        }
      }
    }
    const title = parts[0]
    const broken: string[] = []
    const node = title?.firstChild
    if (node?.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      for (const match of text.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        const lines = new Set([...range.getClientRects()].map((box) => Math.round(box.top)))
        if (lines.size > 1) broken.push(match[0])
      }
    }
    return {
      scroll: button.scrollWidth - button.clientWidth,
      outside,
      broken,
      hasTitle: Boolean(title),
    }
  })
}

// The cell of a length is the label of its radio button, by its id or around it.
async function cellOf(radio: Locator) {
  const id = await radio.getAttribute('id')
  return id ? radio.page().locator(`label[for="${id}"]`) : radio.locator('xpath=ancestor::label')
}

test.describe('level cards with the text at 200 % on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('level cards with the text at 200 % on a 360 px wide screen: nothing cut or broken', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(card(page, PRESETS[2] ?? '')).toBeVisible()

    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
      .toBe('32px')

    for (const name of PRESETS) {
      const box = await boxOf(card(page, name))
      expect(box.x, `left edge of "${name}"`).toBeGreaterThanOrEqual(-0.5)
      expect(box.x + box.width, `right edge of "${name}"`).toBeLessThanOrEqual(360 + 0.5)
      const layout = await cardLayoutAt200(page, name)
      expect(layout.hasTitle, `title of "${name}"`).toBe(true)
      expect.soft(layout.scroll, `scroll inside "${name}"`).toBeLessThanOrEqual(1)
      expect.soft(layout.outside, `text outside "${name}"`).toEqual([])
      expect.soft(layout.broken, `words broken in "${name}"`).toEqual([])
    }
  })

  test('the start screen with the text at 200 % on a 360 px wide screen: no scroll, the lengths in the column', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(startButton(page)).toBeVisible()

    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
      .toBe('32px')

    // Start is as wide as the column.
    const column = await boxOf(startButton(page))
    const radios = await lengthGroup(page).getByRole('radio').all()
    expect(radios.length).toBeGreaterThan(0)
    for (const radio of radios) {
      const cell = await cellOf(radio)
      const name = (await cell.textContent())?.trim()
      const box = await boxOf(cell)
      expect.soft(box.x, `left edge of the length "${name}"`).toBeGreaterThanOrEqual(column.x - 0.5)
      expect
        .soft(box.x + box.width, `right edge of the length "${name}"`)
        .toBeLessThanOrEqual(column.x + column.width + 0.5)
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
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
