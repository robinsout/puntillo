import { expect, test, type Locator, type Page } from '@playwright/test'
import { changeSettings } from './settings'
import { chooseLength, startButton, startSession } from './session-length'
import { chooseExercise, exerciseOption } from './exercise'

// Feature m2-write-notes, slice 1: a session of Write notes in a real browser (spec §16). A new
// user starts in First steps: D4–C5 without ledger lines, seven steps with G4 in the middle; slice
// 1 asks for one quarter note without signs. Math.random is fixed at 0.45 before the page loads,
// so the notes go G4 (sol4), F4 (fa4), G4…: the first of seven by floor(0.45 × 7) = 3, each next
// one of the other six by floor(0.45 × 6) = 2.

const ON_G4 = 0.45

const REVIEW_OF_G4 = 'You wrote re4. The note sol4 is on the 2nd line.'

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    Math.random = () => value
  }, ON_G4)
})

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const column = (page: Page) => page.getByRole('slider', { name: 'Note 1', exact: true })

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// Layout is fractional: Firefox reports 2.75rem as 43.99997px, which is still a 44px target.
function expectTargetSize(size: { width: number; height: number } | undefined, what: string) {
  expect(size?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(size?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
}

// Clicking the label checks a radio, so either one is its hit area; the largest one counts.
function largestTargetOf(radio: Locator) {
  return radio.evaluate((input: HTMLInputElement) => {
    const boxes = [input, ...(input.labels ?? [])].map((target) => {
      const { width, height } = target.getBoundingClientRect()
      return { width, height }
    })
    boxes.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))
    return boxes[0]
  })
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// The status message as read: the buttons Why? after its sentences are no part of it.
function statusText(page: Page) {
  return page.getByRole('status').evaluate((status) => {
    const copy = status.cloneNode(true) as HTMLElement
    for (const each of copy.querySelectorAll('button')) each.remove()
    return copy.textContent?.replace(/\s+/g, ' ').trim()
  })
}

// The page heights of the five staff lines, from the top one down.
function staffLineYs(page: Page) {
  return staff(page)
    .locator('svg')
    .evaluate((svg) =>
      [...svg.querySelectorAll('.vf-stave path')]
        .map((path) => path.getBoundingClientRect())
        .map(({ top, height }) => top + height / 2)
        .sort((a, b) => a - b),
    )
}

// From the top line to the bottom one of the first staff, on the screen.
function firstStaffSpan(page: Page) {
  return staff(page)
    .locator('svg .vf-stave')
    .first()
    .evaluate((stave) => {
      const ys = [...stave.querySelectorAll('path')]
        .map((path) => path.getBoundingClientRect())
        .map(({ top, height }) => top + height / 2)
      return Math.max(...ys) - Math.min(...ys)
    })
}

// A step is half a staff space: E4 → 0, G4 → 2, C5 → 5. Null until a note is drawn, so that
// expect.poll keeps polling.
function noteStepAboveBottomLine(page: Page) {
  return staff(page)
    .locator('svg')
    .evaluate((svg) => {
      const lines = [...svg.querySelectorAll('.vf-stave path')]
        .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
        .filter((y): y is string => y !== undefined)
        .map(Number)
        .sort((a, b) => a - b)
      const [top, second] = lines
      const bottom = lines.at(-1)
      const head = svg.querySelector('.vf-notehead text')
      if (top === undefined || second === undefined || bottom === undefined || !head) return null
      return Math.round((bottom - Number(head.getAttribute('y'))) / ((second - top) / 2))
    })
}

// Feature design-system, slice 3: the right note of a wrong one is drawn in outline, the group
// vf-ghost holding an ellipse; its step as above, null while there is none.
function ghostStepAboveBottomLine(page: Page) {
  return staff(page)
    .locator('svg')
    .evaluate((svg) => {
      const lines = [...svg.querySelectorAll('.vf-stave path')]
        .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
        .filter((y): y is string => y !== undefined)
        .map(Number)
        .sort((a, b) => a - b)
      const [top, second] = lines
      const bottom = lines.at(-1)
      const ghost = svg.querySelector('.vf-ghost ellipse')
      if (top === undefined || second === undefined || bottom === undefined || !ghost) return null
      return Math.round((bottom - Number(ghost.getAttribute('cy'))) / ((second - top) / 2))
    })
}

async function waitForStaff(page: Page) {
  await expect(staff(page).locator('svg .vf-stave')).toHaveCount(1)
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

// The quick mode is ticked in the settings before the session (feature navigation-and-settings).
async function openWriting(page: Page, { quick = false } = {}) {
  await page.goto('/')
  if (quick) {
    await changeSettings(page, () =>
      page.getByRole('checkbox', { name: 'Open next question automatically' }).check(),
    )
  }
  await chooseExercise(page, 'Write notes')
  await startSession(page, 'No limit')
  await waitForStaff(page)
  await expect(column(page)).toBeVisible()
}

// A touch in the column at the height of a line of the staff, counted from the bottom one: the
// 1st line is E4, the 2nd G4. Half a staff space lower is the step below it.
async function touchLine(page: Page, line: number, halfSpacesBelow = 0) {
  const ys = await staffLineYs(page)
  const y = ys[ys.length - line]
  const [top = 0, second = 0] = ys
  if (y === undefined) throw new Error(`no line ${line}`)
  const box = await boxOf(column(page))
  await page.mouse.click(box.x + box.width / 2, y + (halfSpacesBelow * (second - top)) / 2)
}

test.describe('a session of Write notes', () => {
  test('writes the named note by a touch, moves it a step and checks it', async ({ page }) => {
    await openWriting(page)

    await expect(page.getByRole('heading', { name: 'Write the notes', level: 1 })).toBeVisible()
    await expect(page.getByText('sol4', { exact: true })).toBeVisible()
    await expect(staff(page).locator('svg .vf-notehead')).toHaveCount(0)
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'No note yet')
    await expect(button(page, 'sol')).toHaveCount(0)

    await touchLine(page, 2)

    await expect(column(page)).toHaveAttribute('aria-valuetext', 'sol4')
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(2)

    await button(page, 'One step up').click()
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'la4')
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(3)

    await column(page).focus()
    await page.keyboard.press('ArrowDown')
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'sol4')
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(2)

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Correct')
    await expect(page.getByText('Accuracy 100%', { exact: true })).toBeVisible()

    await button(page, 'Next').click()

    await expect(page.getByText('fa4', { exact: true })).toBeVisible()
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'No note yet')
    await expect(staff(page).locator('svg .vf-notehead')).toHaveCount(0)
  })

  test('draws the written note inside its column', async ({ page }) => {
    await openWriting(page)

    await touchLine(page, 1)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(0)

    const head = await boxOf(staff(page).locator('svg .vf-notehead').first())
    const target = await boxOf(column(page))
    expect(head.x).toBeGreaterThanOrEqual(target.x)
    expect(head.x + head.width).toBeLessThanOrEqual(target.x + target.width)
  })

  test('writes a touch below the range on its bottom step', async ({ page }) => {
    await openWriting(page)

    // Two half spaces below the bottom line is C4, which First steps leaves out: D4 is the lowest.
    await touchLine(page, 1, 2)

    await expect(column(page)).toHaveAttribute('aria-valuetext', 're4')
    await expect(button(page, 'One step down')).toBeDisabled()
    await expect(button(page, 'One step up')).toBeEnabled()
  })

  test('gives a second try for a wrong note, then explains it and outlines the right one', async ({
    page,
  }) => {
    await openWriting(page)

    await touchLine(page, 1)
    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
    await expect(column(page)).toHaveAccessibleDescription('Incorrect')
    await expect(button(page, 'Next')).toHaveCount(0)

    await button(page, 'One step down').click()
    await expect(column(page)).toHaveAttribute('aria-valuetext', 're4')
    await button(page, 'Check').click()

    await expect.poll(() => statusText(page)).toBe(REVIEW_OF_G4)
    await expect(button(page, 'Why?')).toBeVisible()
    // Feature design-system, slice 3: the written note stays, the right one outlined on its step.
    await expect.poll(() => ghostStepAboveBottomLine(page)).toBe(2)
    expect(await noteStepAboveBottomLine(page)).toBe(-1)
    await expect(page.getByText('Accuracy 0%', { exact: true })).toBeVisible()
  })

  test('does not spend the second try on a second Check with the note on the rejected step', async ({
    page,
  }) => {
    await openWriting(page)
    await touchLine(page, 1)
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Change the note first')
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'mi4')
  })

  test('keeps Check in the quick mode and opens the next note after a right check', async ({
    page,
  }) => {
    await openWriting(page, { quick: true })

    await touchLine(page, 2)
    await expect(page.getByText('sol4', { exact: true })).toBeVisible()
    await button(page, 'Check').click()

    await expect(page.getByText('fa4', { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Correct')
  })

  test('keeps Write notes chosen after a reload', async ({ page }) => {
    await page.goto('/')
    await expect(exerciseOption(page, 'Read notes')).toBeChecked()
    await chooseExercise(page, 'Write notes')

    await page.reload()

    await expect(exerciseOption(page, 'Write notes')).toBeChecked()
  })
})

test.describe('Write notes with the keyboard', () => {
  test('writes the note with the arrow keys and checks it with Enter', async ({ page }) => {
    await openWriting(page)

    await column(page).focus()
    await page.keyboard.press('ArrowUp')
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'sol4')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('status')).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeFocused()
  })
})

test.describe('Write notes on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits without horizontal scrolling, the column and the buttons at least 44 by 44', async ({
    page,
  }) => {
    await openWriting(page)
    await touchLine(page, 2)

    await expectNoHorizontalScroll(page)
    const drawing = await boxOf(staff(page).locator('svg'))
    expect(drawing.x).toBeGreaterThanOrEqual(0)
    expect(drawing.x + drawing.width).toBeLessThanOrEqual(360)
    for (const [what, target] of [
      ['the column', column(page)],
      ['One step up', button(page, 'One step up')],
      ['One step down', button(page, 'One step down')],
      ['Check', button(page, 'Check')],
    ] as const) {
      const box = await boxOf(target)
      expectTargetSize(box, what)
      expect(box.x + box.width, `right edge of ${what}`).toBeLessThanOrEqual(360)
    }
  })

  test('spans the column over the whole staff, from above its top line to below its bottom one', async ({
    page,
  }) => {
    await openWriting(page)

    const ys = await staffLineYs(page)
    const box = await boxOf(column(page))
    expect(box.y).toBeLessThan(ys[0] ?? 0)
    expect(box.y + box.height).toBeGreaterThan(ys.at(-1) ?? Infinity)
  })

  test('draws the staff of Write notes 1.5 times as tall as that of Read notes', async ({
    page,
  }) => {
    await page.goto('/')
    await startSession(page, 'No limit')
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    // Feature staff-progress-row: Read notes draws a row, which may take two staves on a phone, so
    // the size is told by the five lines of one staff, not by the height of the drawing.
    const readingSpan = await firstStaffSpan(page)
    await button(page, 'Finish').click()

    await chooseExercise(page, 'Write notes')
    await startSession(page, 'No limit')
    await waitForStaff(page)
    const writing = await boxOf(staff(page))

    expect(await firstStaffSpan(page)).toBeGreaterThanOrEqual(readingSpan * 1.5 - 1)
    expect(writing.width).toBeLessThanOrEqual(360)
  })

  test('fits the switch Exercise with targets of at least 44 by 44', async ({ page }) => {
    await page.goto('/')

    await expectNoHorizontalScroll(page)
    for (const name of ['Read notes', 'Write notes']) {
      const largest = await largestTargetOf(exerciseOption(page, name))
      expect(
        Math.min(largest?.width ?? 0, largest?.height ?? 0),
        `the "${name}" radio`,
      ).toBeGreaterThanOrEqual(44 - 0.01)
    }
  })
})

// Feature design-system, slice 4, criterion 11: Write notes as Read notes after slice 2
// (trainer.spec.ts, "the question screen on …"). The heading is visually hidden and the task is
// the main text; the staff is on a surface; Check sticks to the bottom of a phone window and
// stands in the flow on a desktop, in a column as wide as that of Read notes. Layout is
// fractional, so edges are compared to within half a pixel.
const heading = (page: Page) => page.getByRole('heading', { name: 'Write the notes', level: 1 })
const task = (page: Page) => page.getByRole('main').locator('ol').first()

const fontSizeOf = (locator: Locator) =>
  locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))

// The colour behind the staff: that of its nearest ancestor with a background of its own.
const backgroundBehind = (locator: Locator) =>
  locator.evaluate((element) => {
    for (let each = element.parentElement; each; each = each.parentElement) {
      const color = getComputedStyle(each).backgroundColor
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color
    }
    return null
  })

test.describe('the Write notes screen on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('hides the heading from the eye, the focus still going to it', async ({ page }) => {
    await page.goto('/')
    await chooseExercise(page, 'Write notes')
    await chooseLength(page, 'No limit')
    await startButton(page).focus()
    await page.keyboard.press('Enter')
    await waitForStaff(page)

    await expect(heading(page)).toBeFocused()
    const box = await boxOf(heading(page))
    expect(box.width * box.height, 'area of the heading').toBeLessThanOrEqual(1)
  })

  test('sets the task larger than the text of the screen, 24 px at least', async ({ page }) => {
    await openWriting(page)

    const taskSize = await fontSizeOf(task(page))
    const textSize = await fontSizeOf(page.getByRole('main'))
    expect(taskSize).toBeGreaterThanOrEqual(24)
    expect(taskSize).toBeGreaterThan(textSize)
  })

  test('draws the staff on a surface, unlike the ground of the page', async ({ page }) => {
    await openWriting(page)

    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(await backgroundBehind(staff(page))).not.toBe(ground)
  })

  test('keeps Check at the bottom of the window, nearly as wide', async ({ page }) => {
    await openWriting(page)
    await page.evaluate(() => window.scrollTo(0, 0))

    const check = await boxOf(button(page, 'Check'))
    const below = 640 - (check.y + check.height)
    expect(below, 'room under Check').toBeGreaterThanOrEqual(-0.5)
    expect(below, 'room under Check').toBeLessThanOrEqual(24 + 0.5)
    expect(check.width).toBeGreaterThanOrEqual(360 - 2 * 24 - 0.5)
  })

  test('fits the review without horizontal scrolling, Next at the bottom', async ({ page }) => {
    await openWriting(page)
    await touchLine(page, 1)
    await button(page, 'Check').click()
    await button(page, 'One step down').click()
    await button(page, 'Check').click()
    await expect.poll(() => statusText(page)).toBe(REVIEW_OF_G4)

    await expectNoHorizontalScroll(page)
    const next = await boxOf(button(page, 'Next'))
    expectTargetSize(next, 'Next')
    expect(640 - (next.y + next.height), 'room under Next').toBeLessThanOrEqual(24 + 0.5)
  })
})

test.describe('the Write notes screen on a 1440 px wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('widens the column as in Read notes, up to 1000 px', async ({ page }) => {
    await openWriting(page)

    const main = await boxOf(page.getByRole('main'))
    expect(main.width).toBeGreaterThanOrEqual(900)
    expect(main.width).toBeLessThanOrEqual(1000 + 2 * 32 + 0.5)
  })

  // 480 units of the drawing, as in Read notes, at the scale of Write notes, 1.5. The box of the
  // stave takes in the stroke of its lines, about a pixel on each side.
  test('does not stretch one bar of the staff over the column', async ({ page }) => {
    await openWriting(page)

    const stave = await boxOf(staff(page).locator('svg .vf-stave').first())
    expect(stave.width).toBeLessThanOrEqual(480 * 1.5 + 2)
  })

  test('puts Check in the flow under the buttons, as wide as a panel', async ({ page }) => {
    await openWriting(page)

    const check = await boxOf(button(page, 'Check'))
    let lowest = 0
    for (const name of ['One step up', 'One step down']) {
      const box = await boxOf(button(page, name))
      lowest = Math.max(lowest, box.y + box.height)
    }
    expect(check.y).toBeGreaterThanOrEqual(lowest - 0.5)
    expect(check.y - lowest).toBeLessThanOrEqual(120)
    // --width-panel, 24rem.
    expect(check.width).toBeGreaterThanOrEqual(384 - 0.5)
    expect(check.width).toBeLessThanOrEqual(384 + 0.5)
  })
})
