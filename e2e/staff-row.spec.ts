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

// Slice 3: under each passed note of the row a mark of its first attempt, the check of "right" in
// the colour of --color-correct or the cross of "wrong" in that of --color-wrong, right on the second
// try among the wrong ones (criterion 8). The marks stand in one row below the staff, each under its
// note, and the row keeps its room from the first question on, so the answer buttons stay where they
// are (criterion 6). They lie by the staff, in the element that holds it, outside its drawing.
//
// Questions 1 and 3 ask D4 (re), answered right; question 2 asks E4 (mi), answered fa and then mi:
// the marks of question 4 are ✓ ✗ ✓.

interface MarkBox {
  readonly x: number
  readonly top: number
  readonly bottom: number
  readonly width: number
  readonly drawing: string
  readonly colour: string
}

// The icons by the staff, the drawing of the staff and the heard note inside it left out.
const marksOf = (page: Page): Promise<MarkBox[]> =>
  staff(page).evaluate((drawing) =>
    [...(drawing.parentElement?.querySelectorAll('svg') ?? [])]
      .filter((icon) => !drawing.contains(icon))
      .map((icon) => {
        const box = icon.getBoundingClientRect()
        return {
          x: box.x + box.width / 2,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          drawing: icon.innerHTML,
          colour: getComputedStyle(icon).color,
        }
      }),
  )

// The bottom staff line of the first staff on the screen.
const bottomLine = async (page: Page) => {
  const box = await boxOf(staves(page).first())
  return box.y + box.height
}

async function answerRightWrongRight(page: Page) {
  await answerAndGoOn(page, 1, 1)

  await button(page, 'fa').click()
  await button(page, 'Check').click()
  await expect(page.getByRole('status').first()).toHaveText('Incorrect. Try again.')
  await button(page, 'mi').click()
  await button(page, 'Check').click()
  await button(page, 'Next').click()
  await expect(noteGroups(page)).toHaveCount(3)

  await answerAndGoOn(page, 3, 3)
  await waitForStaff(page)
}

test.describe('the marks under the passed notes', () => {
  test('give ✓ ✗ ✓ by the first attempt, each under its note, below the staff', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, '10')
    await waitForStaff(page)
    expect(await marksOf(page)).toEqual([])

    await answerRightWrongRight(page)

    const marks = await marksOf(page)
    expect(marks).toHaveLength(3)
    const [first, second, third] = marks as [MarkBox, MarkBox, MarkBox]
    expect(third.drawing).toBe(first.drawing)
    expect(second.drawing).not.toBe(first.drawing)
    const correct = await tokenColour(page, '--color-correct')
    const wrong = await tokenColour(page, '--color-wrong')
    expect(marks.map(({ colour }) => colour)).toEqual([correct, wrong, correct])

    const xs = await headXs(page)
    expect(xs).toHaveLength(4)
    marks.forEach(({ x, width }, index) => {
      expect(width).toBeGreaterThan(0)
      expect(Math.abs(x - (xs[index] ?? Infinity)), `mark ${index + 1}`).toBeLessThan(4)
    })

    const line = await bottomLine(page)
    // The box of SVG text is the cell of the Bravura font, far taller than the head: the centre of
    // a SMuFL head is the baseline of its text, and the head reaches half a staff space below it.
    const stave = await boxOf(staves(page).first())
    const halfSpace = stave.height / 8
    const heads = await noteheads(page).evaluateAll((texts) =>
      texts.map((text) => {
        const toScreen = (text as SVGTextElement).getScreenCTM()
        if (!toScreen) throw new Error('note head is not laid out')
        const baseline = Number(text.getAttribute('y'))
        return new DOMPoint(Number(text.getAttribute('x')), baseline).matrixTransform(toScreen).y
      }),
    )
    for (const { top } of marks) {
      expect(top).toBeGreaterThanOrEqual(line)
      expect(top).toBeGreaterThanOrEqual(Math.max(...heads.slice(0, 3)) + halfSpace)
      expect(Math.abs(top - first.top)).toBeLessThan(1)
    }
  })
})

test.describe('the marks under the passed notes on a 375 px wide screen', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  const pageTop = async (locator: Locator) =>
    (await boxOf(locator)).y + (await locator.page().evaluate(() => window.scrollY))

  test('marks on a 375 px wide screen stand under their notes, the answer buttons in place', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, '10')
    await waitForStaff(page)
    const before = await pageTop(button(page, 're'))

    await answerRightWrongRight(page)

    const marks = await marksOf(page)
    expect(marks).toHaveLength(3)
    await expectNoHorizontalScroll(page)
    expect(Math.abs((await pageTop(button(page, 're'))) - before)).toBeLessThan(1)

    const xs = await headXs(page)
    const line = await bottomLine(page)
    const buttons = (await boxOf(button(page, 're'))).y
    marks.forEach(({ x, width, top, bottom }, index) => {
      expect(Math.abs(x - (xs[index] ?? Infinity)), `mark ${index + 1}`).toBeLessThan(4)
      expect(x - width / 2).toBeGreaterThanOrEqual(0)
      expect(x + width / 2).toBeLessThanOrEqual(375)
      expect(top).toBeGreaterThanOrEqual(line)
      expect(bottom).toBeLessThanOrEqual(buttons)
    })
  })
})

// Slice 4: the session left in the middle of a row goes on after a reload with the notes passed in
// it and their marks (criterion 13).
test.describe('the row of a session continued after a reload', () => {
  test('brings back the passed notes with ✓ ✗ ✓, the fourth question after them', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, '10')
    await waitForStaff(page)
    await answerRightWrongRight(page)
    const before = await marksOf(page)

    await page.reload()
    await page
      .getByRole('region', { name: 'Unfinished session', exact: true })
      .getByRole('button', { name: 'Continue', exact: true })
      .click()
    await waitForStaff(page)

    await expect(
      page.getByRole('progressbar', { name: 'Question 4 of 10', exact: true }),
    ).toBeVisible()
    await expect(noteGroups(page)).toHaveCount(4)
    const passed = await tokenColour(page, '--color-staff-passed')
    const colours = await fills(page)
    expect(colours.slice(0, 3)).toEqual([passed, passed, passed])
    expect(colours[3]).not.toBe(passed)

    const marks = await marksOf(page)
    expect(marks.map(({ drawing }) => drawing)).toEqual(before.map(({ drawing }) => drawing))
    const correct = await tokenColour(page, '--color-correct')
    const wrong = await tokenColour(page, '--color-wrong')
    expect(marks.map(({ colour }) => colour)).toEqual([correct, wrong, correct])
    const xs = await headXs(page)
    marks.forEach(({ x }, index) => {
      expect(Math.abs(x - (xs[index] ?? Infinity)), `mark ${index + 1}`).toBeLessThan(4)
    })
  })
})
