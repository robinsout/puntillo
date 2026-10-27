import { expect, test, type Locator, type Page } from '@playwright/test'
import { startSession } from './session-length'

// Feature staff-progress-row, slice 2, in a real browser: in Read notes with questions of one note
// the staff is a row of ten questions. The notes passed in the row stand left of the current one,
// in the colour of the token --color-staff-passed, all on one staff on a desktop; the staff keeps
// its height from question to question, so the answer buttons stay where they are; the last row of
// a session of 10 ends with the final double bar line, a thin line and a thick one; the eleventh
// question opens a new row. On a phone a row of First steps, without signs or flags, is one staff
// of ten slots, with no horizontal scroll.
// No screenshots: places are read as boxes, colours as computed.
//
// A new user, so First steps, the duration not asked; Math.random is fixed at 0, so the questions
// alternate D4 (re), the lowest note without a ledger line, and E4 (mi).

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0
  })
})

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const noteGroups = (page: Page) => staff(page).locator('svg .vf-stavenote:not(.vf-ghost *)')
const noteheads = (page: Page) => noteGroups(page).locator('.vf-notehead text')
const staves = (page: Page) => staff(page).locator('svg .vf-stave')

async function waitForStaff(page: Page) {
  await expect(staves(page).first()).toBeVisible()
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// The x of the centre of each note head on the screen, in the order drawn. WebKit and Firefox bound
// SVG text by the metrics of the font, so the cell of the character is measured.
const headXs = (page: Page) =>
  noteheads(page).evaluateAll((texts) =>
    texts.map((text) => {
      const toScreen = (text as SVGTextElement).getScreenCTM()
      if (!toScreen) throw new Error('note head is not laid out')
      const cell = (text as SVGTextElement).getExtentOfChar(0)
      return new DOMPoint(cell.x + cell.width / 2, cell.y).matrixTransform(toScreen).x
    }),
  )

// The colour of a token as the browser computes it, "rgb(138, 127, 108)".
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.body.appendChild(document.createElement('span'))
    probe.style.color = `var(${name})`
    const { color } = getComputedStyle(probe)
    probe.remove()
    return color
  }, token)

const fills = (page: Page) =>
  noteheads(page).evaluateAll((texts) => texts.map((text) => getComputedStyle(text).fill))

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// Question `number` asks D4 (re) when odd, E4 (mi) when even: answered right and checked.
async function answerRight(page: Page, number: number) {
  await button(page, number % 2 === 1 ? 're' : 'mi').click()
  await button(page, 'Check').click()
  await expect(page.getByRole('status').first()).toHaveText('Correct')
}

// Answers questions `from` to `to` right and opens the one after each.
async function answerAndGoOn(page: Page, from: number, to: number) {
  for (let number = from; number <= to; number++) {
    await answerRight(page, number)
    await button(page, 'Next').click()
    await expect(noteGroups(page)).toHaveCount((number % 10) + 1)
  }
}

test.describe('a row of questions of one note', () => {
  test('stands the passed notes left of the current one, on one staff of a steady height', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, '10')
    await waitForStaff(page)
    const heights = [(await boxOf(staff(page))).height]

    for (let number = 1; number <= 3; number++) {
      await answerAndGoOn(page, number, number)
      await waitForStaff(page)
      heights.push((await boxOf(staff(page))).height)
    }

    await expect(noteGroups(page)).toHaveCount(4)
    await expect(staves(page)).toHaveCount(1)
    const xs = await headXs(page)
    expect(xs).toHaveLength(4)
    xs.slice(1).forEach((x, index) => expect(x).toBeGreaterThan(xs[index] ?? Infinity))
    for (const height of heights) expect(Math.abs(height - (heights[0] ?? 0))).toBeLessThan(1)

    const passed = await tokenColour(page, '--color-staff-passed')
    const colours = await fills(page)
    expect(colours.slice(0, 3)).toEqual([passed, passed, passed])
    expect(colours[3]).not.toBe(passed)
  })

  test('ends the row of a session of 10 with the final bar line and the session after it', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, '10')
    await waitForStaff(page)

    await answerAndGoOn(page, 1, 9)

    await expect(
      page.getByRole('progressbar', { name: 'Question 10 of 10', exact: true }),
    ).toBeVisible()
    await expect(noteGroups(page)).toHaveCount(10)
    // The final bar line: a thin line and a thick one, at the right end of the staff.
    const widths = await staff(page)
      .locator('svg .vf-stavebarline rect')
      .evaluateAll((rects) => rects.map((rect) => rect.getBoundingClientRect().width))
    const thinnest = Math.min(...widths)
    expect(widths.some((width) => width > 2 * thinnest)).toBe(true)

    await answerRight(page, 10)
    await button(page, 'Results').click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
  })

  test('opens a new row on the eleventh question without a limit', async ({ page }) => {
    await page.goto('/')
    await startSession(page, 'No limit')
    await waitForStaff(page)

    await answerAndGoOn(page, 1, 10)

    await expect(page.getByText('Question 11', { exact: true })).toBeVisible()
    await expect(noteGroups(page)).toHaveCount(1)
  })
})

test.describe('a row of questions of one note on a 375 px wide screen', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  // The page may scroll after Check, to the card of the result: places are taken on the page, not
  // on the screen, so that a shift of the layout is told from a scroll.
  const pageTop = async (locator: Locator) =>
    (await boxOf(locator)).y + (await locator.page().evaluate(() => window.scrollY))

  test('row of First steps on one staff on a 375 px wide screen, the answer buttons in place', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, '10')
    await waitForStaff(page)
    const places = [
      { staff: (await boxOf(staff(page))).height, re: await pageTop(button(page, 're')) },
    ]
    await expect(staves(page)).toHaveCount(1)
    await expectNoHorizontalScroll(page)

    for (let number = 1; number <= 6; number++) {
      await answerAndGoOn(page, number, number)
      await waitForStaff(page)
      await expect(staves(page)).toHaveCount(1)
      await expectNoHorizontalScroll(page)
      places.push({
        staff: (await boxOf(staff(page))).height,
        re: await pageTop(button(page, 're')),
      })
    }

    const [first] = places
    for (const [index, place] of places.entries()) {
      expect(
        Math.abs(place.staff - (first?.staff ?? 0)),
        `staff on question ${index + 1}`,
      ).toBeLessThan(1)
      expect(Math.abs(place.re - (first?.re ?? 0)), `re on question ${index + 1}`).toBeLessThan(1)
    }
    const box = await boxOf(staff(page))
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    for (const x of await headXs(page)) {
      expect(x).toBeGreaterThan(box.x)
      expect(x).toBeLessThan(box.x + box.width)
    }
  })
})
