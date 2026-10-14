import { expect, test, type Locator, type Page } from '@playwright/test'
import { startSession } from './session-length'

// Feature m2-write-notes, slice 2: Write notes with several notes and the duration in a real
// browser (spec §16). The page starts as if Write notes and Confident reading had been chosen on
// an earlier visit, without signs, in 4/4 alone. Math.random gives queued values first, then a
// constant 0; the values queued right before a session starts go to its first question.

type RandomWindow = Window & { puntilloQueue: number[] }

const difficultyOf = (questionLength: string, durations: string[]) =>
  JSON.stringify({
    low: 'C4',
    high: 'G5',
    ledgerLines: 1,
    keySignatures: 0,
    accidentals: 'none',
    durations,
    askDuration: true,
    questionLength,
    timeSignatures: ['4/4'],
    rests: false,
    dots: false,
  })

const SEVERAL_NOTES = difficultyOf('two-to-four-notes', ['whole', 'half', 'quarter', 'eighth'])
// Two bars of eighths alone: sixteen notes, more than a line of a phone holds.
const SIXTEEN_EIGHTHS = difficultyOf('two-bars', ['eighth'])

// The number of notes, then the pitch and the duration of each: C4 half (do4), E4 quarter (mi4),
// G4 quarter (sol4).
const DO_MI_SOL = [0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0]

test.use({ locale: 'en-US' })

async function openWriting(page: Page, difficulty: string, queued: number[] = []) {
  await page.addInitScript((saved) => {
    const random = window as unknown as RandomWindow
    random.puntilloQueue = []
    Math.random = () => random.puntilloQueue.shift() ?? 0
    if (localStorage.getItem('puntillo.exercise') !== null) return
    localStorage.setItem('puntillo.exercise', 'write')
    localStorage.setItem('puntillo.preset', 'confident-reading')
    localStorage.setItem('puntillo.difficulty', saved)
  }, difficulty)
  await page.goto('/')
  await page.evaluate((values) => {
    ;(window as unknown as RandomWindow).puntilloQueue = [...values]
  }, queued)
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stave').first()).toBeVisible()
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect(column(page, 1)).toBeVisible()
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const column = (page: Page, number: number) =>
  page.getByRole('slider', { name: `Note ${number}`, exact: true })

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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// The page heights of the five lines of the first stave, from the top one down.
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

// A touch in a column at the height of a line of the staff, counted from the bottom one; half
// staff spaces lower reach the steps below it: two below the 1st line is C4.
async function touch(page: Page, number: number, line: number, halfSpacesBelow = 0) {
  const ys = await staffLineYs(page)
  const y = ys[ys.length - line]
  const [top = 0, second = 0] = ys
  if (y === undefined) throw new Error(`no line ${line}`)
  const box = await boxOf(column(page, number))
  await page.mouse.click(box.x + box.width / 2, y + (halfSpacesBelow * (second - top)) / 2)
}

const stems = (page: Page) => staff(page).locator('svg .vf-stem')
const heads = (page: Page) => staff(page).locator('svg .vf-notehead')

test.describe('a session of Write notes with several notes and durations', () => {
  test('writes every note with its duration and checks the question', async ({ page }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

    await expect(
      page
        .getByText('do4, half note; mi4, quarter note; sol4, quarter note', { exact: true })
        .first(),
    ).toBeVisible()
    await expect(page.getByRole('slider')).toHaveCount(3)
    await expect(heads(page)).toHaveCount(0)

    await touch(page, 1, 1, 2)
    await expect(column(page, 1)).toHaveAttribute('aria-valuetext', 'do4')
    await expect(heads(page)).toHaveCount(1)
    await expect(stems(page)).toHaveCount(0)

    await button(page, 'Half note').click()
    await expect(stems(page)).toHaveCount(1)

    await touch(page, 2, 1)
    await expect(column(page, 2)).toHaveAttribute('aria-current', 'true')
    await button(page, 'Quarter note').click()
    await touch(page, 3, 2)
    await button(page, 'Quarter note').click()
    await expect(heads(page)).toHaveCount(3)

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Correct')
    await expect(page.getByText('Points: 6 of 6', { exact: true })).toBeVisible()
  })

  test('asks to answer every note before all are written', async ({ page }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)
    await touch(page, 1, 1, 2)
    await button(page, 'Half note').click()

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Answer every note')
  })

  test('gives a second try on the wrong part only and refuses the wrong duration', async ({
    page,
  }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)
    await touch(page, 1, 1, 2)
    await button(page, 'Quarter note').click()
    await touch(page, 2, 1)
    await button(page, 'Quarter note').click()
    await touch(page, 3, 2)
    await button(page, 'Quarter note').click()

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
    await expect(column(page, 1)).toHaveAccessibleDescription('Incorrect')
    await expect(button(page, 'Quarter note')).toBeDisabled()
    await button(page, 'Half note').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct on the second try')
  })
})

test.describe('Write notes of several notes with the keyboard', () => {
  test('moves between the notes with the arrow keys left and right, the focus following', async ({
    page,
  }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

    await column(page, 1).focus()
    await page.keyboard.press('ArrowRight')
    await expect(column(page, 2)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(column(page, 2)).toHaveAttribute('aria-valuetext', 'la4')

    await page.keyboard.press('ArrowLeft')
    await expect(column(page, 1)).toBeFocused()
    await expect(column(page, 1)).toHaveAttribute('aria-valuetext', 'No note yet')
  })
})

test.describe('Write notes of several notes on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the durations and the moves between the notes, each at least 44 by 44', async ({
    page,
  }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

    await expectNoHorizontalScroll(page)
    for (const name of [
      'Whole note',
      'Half note',
      'Quarter note',
      'Eighth note',
      'Previous note',
      'Next note',
      'One step up',
      'One step down',
    ]) {
      const box = await boxOf(button(page, name))
      expectTargetSize(box, `"${name}"`)
      expect(box.x, `left edge of "${name}"`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `right edge of "${name}"`).toBeLessThanOrEqual(360)
    }
  })

  test('goes on to further lines of the staff, every column at least 44 by 44', async ({
    page,
  }) => {
    await openWriting(page, SIXTEEN_EIGHTHS)

    await expectNoHorizontalScroll(page)
    expect(await staff(page).locator('svg .vf-stave').count()).toBeGreaterThan(1)
    await expect(page.getByRole('slider')).toHaveCount(16)
    for (const each of await page.getByRole('slider').all()) {
      const box = await boxOf(each)
      expectTargetSize(box, `the column ${await each.getAttribute('aria-label')}`)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
    }
  })
})
