import { expect, test, type Locator, type Page } from '@playwright/test'
import { changeSettings, openSettings } from './settings'
import { startSession } from './session-length'

// Feature m2-write-notes, slice 4, criterion 14: the caption of a written note for a beginner, in
// a real browser (spec §16). The box Show note names on the staff is in the settings, under Write
// notes (feature navigation-and-settings); when
// ticked, a written note has its name under the staff, in its column, below the lowest ledger line
// a note may take: two staff spaces under the bottom line. The caption is hidden from screen
// readers, so it is found by its text inside an aria-hidden element.

type RandomWindow = Window & { puntilloQueue: number[] }

test.use({ locale: 'en-US' })

// Confident reading with 2–4 notes in 4/4, no signs: the values queued right before a session
// make C4 half (do4), E4 quarter (mi4), G4 quarter (sol4).
const SEVERAL_NOTES = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  keySignatures: 0,
  accidentals: 'none',
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: false,
  questionLength: 'two-to-four-notes',
  timeSignatures: ['4/4'],
  rests: false,
  dots: false,
})
const DO_MI_SOL = [0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0]

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const column = (page: Page, number: number) =>
  page.getByRole('slider', { name: `Note ${number}`, exact: true })
const namesBox = (page: Page) =>
  page.getByRole('checkbox', { name: 'Show note names on the staff', exact: true })
const caption = (page: Page, name: string) =>
  page.locator('[aria-hidden="true"]').getByText(name, { exact: true })

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// Math.random gives queued values first, then a constant 0. The difficulty is saved as if on an
// earlier visit; the boxes are left to the test.
async function visit(page: Page) {
  await page.addInitScript((saved) => {
    const random = window as unknown as RandomWindow
    random.puntilloQueue = []
    Math.random = () => random.puntilloQueue.shift() ?? 0
    if (localStorage.getItem('puntillo.preset') !== null) return
    localStorage.setItem('puntillo.preset', 'confident-reading')
    localStorage.setItem('puntillo.difficulty', saved)
  }, SEVERAL_NOTES)
  await page.goto('/')
}

async function startWithNames(page: Page) {
  await visit(page)
  await page.getByRole('radio', { name: 'Write notes', exact: true }).check()
  await changeSettings(page, () => namesBox(page).check())
  await page.evaluate((values) => {
    ;(window as unknown as RandomWindow).puntilloQueue = [...values]
  }, DO_MI_SOL)
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stave').first()).toBeVisible()
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect(column(page, 1)).toBeVisible()
}

// The page heights of the five staff lines of the first stave, from the top one down.
function staffLineYs(page: Page) {
  return staff(page)
    .locator('svg')
    .evaluate((svg) =>
      [...(svg.querySelector('.vf-stave')?.querySelectorAll('path') ?? [])]
        .map((path) => path.getBoundingClientRect())
        .map(({ top, height }) => top + height / 2)
        .sort((a, b) => a - b),
    )
}

// A touch in a column at a line counted from the bottom one, or half staff spaces below it.
async function touch(page: Page, number: number, line: number, halfSpacesBelow = 0) {
  const ys = await staffLineYs(page)
  const y = ys[ys.length - line]
  const [top = 0, second = 0] = ys
  if (y === undefined) throw new Error(`no line ${line}`)
  const box = await boxOf(column(page, number))
  await page.mouse.click(box.x + box.width / 2, y + (halfSpacesBelow * (second - top)) / 2)
}

// Writes do4 under the staff, mi4 on the bottom line and sol4 on the second.
async function writeAll(page: Page) {
  await touch(page, 1, 1, 2)
  await touch(page, 2, 1)
  await touch(page, 3, 2)
}

test.describe('the caption of a written note', () => {
  test('stands in the column of its note, below the lowest ledger line', async ({ page }) => {
    await startWithNames(page)

    await touch(page, 3, 2)

    await expect(caption(page, 'sol4')).toBeVisible()
    const text = await boxOf(caption(page, 'sol4'))
    const target = await boxOf(column(page, 3))
    expect(text.x).toBeGreaterThanOrEqual(target.x)
    expect(text.x + text.width).toBeLessThanOrEqual(target.x + target.width)
    const ys = await staffLineYs(page)
    const [top = 0, second = 0] = ys
    const bottom = ys.at(-1) ?? 0
    expect(text.y).toBeGreaterThanOrEqual(bottom + 2 * (second - top))
  })

  test('follows the note a step up', async ({ page }) => {
    await startWithNames(page)
    await touch(page, 3, 2)

    await button(page, 'One step up').click()

    await expect(caption(page, 'la4')).toBeVisible()
    await expect(caption(page, 'sol4')).toHaveCount(0)
  })

  test('is kept on with the box after a reload', async ({ page }) => {
    await visit(page)
    await openSettings(page)
    await namesBox(page).check()

    await page.reload()

    await expect(namesBox(page)).toBeChecked()
  })
})

test.describe('the captions of written notes on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('stay on the screen, each within its own column', async ({ page }) => {
    await startWithNames(page)

    await writeAll(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    for (const [number, name] of [
      [1, 'do4'],
      [2, 'mi4'],
      [3, 'sol4'],
    ] as const) {
      const text = await boxOf(caption(page, name))
      const target = await boxOf(column(page, number))
      expect(text.x, `left edge of ${name}`).toBeGreaterThanOrEqual(Math.max(0, target.x))
      expect(text.x + text.width, `right edge of ${name}`).toBeLessThanOrEqual(
        Math.min(360, target.x + target.width),
      )
    }
  })

  test('fit the box Show note names on the staff, at least 44 high', async ({ page }) => {
    await visit(page)
    await openSettings(page)

    const largest = await namesBox(page).evaluate((input: HTMLInputElement) => {
      const boxes = [input, ...(input.labels ?? [])].map((target) => {
        const { x, width, height } = target.getBoundingClientRect()
        return { x, width, height }
      })
      boxes.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))
      return boxes[0]
    })
    expect(largest?.height ?? 0).toBeGreaterThanOrEqual(44 - 0.01)
    expect((largest?.x ?? 0) + (largest?.width ?? 0)).toBeLessThanOrEqual(360)
  })
})
