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
    await expect(page.getByText('Accuracy 100%', { exact: true })).toBeVisible()
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

// Feature design-system, slice 4, criterion 11, edge cases 3 and 4: Write notes as Read notes after
// slice 2 (trainer.spec.ts, "the question screen on …"). On a phone Check, Next and Results stick
// to the bottom of the window and cover no button once the page is scrolled to its end; the task
// reads first, its current note bold and in the accent colour; only the current column is framed.
// Layout is fractional, so edges are compared to within half a pixel.
type Box = { x: number; y: number; width: number; height: number }

const WRITING_BUTTONS = [
  'Previous note',
  'Next note',
  'One step up',
  'One step down',
  'Whole note',
  'Half note',
  'Quarter note',
  'Eighth note',
]

function overlaps(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0.5 && height > 0.5
}

async function scrollToEnd(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
}

async function expectButtonsUncoveredBy(page: Page, action: Locator) {
  const actionBox = await boxOf(action)
  for (const name of WRITING_BUTTONS) {
    const box = await boxOf(button(page, name))
    expect(overlaps(box, actionBox), `"${name}" under ${String(action)}`).toBe(false)
  }
}

// Note 1 a quarter instead of a half, then an eighth: the review of its duration.
async function openReviewOfNote1(page: Page) {
  await touch(page, 1, 1, 2)
  await button(page, 'Quarter note').click()
  await touch(page, 2, 1)
  await button(page, 'Quarter note').click()
  await touch(page, 3, 2)
  await button(page, 'Quarter note').click()
  await button(page, 'Check').click()
  await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
  await button(page, 'Eighth note').click()
  await button(page, 'Check').click()
  await expect(button(page, 'Next')).toBeVisible()
}

const taskNotes = (page: Page) => page.getByRole('main').locator('ol').first().locator('li')

const styleOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      color: style.color,
      fontWeight: Number(style.fontWeight),
      borderTopWidth: parseFloat(style.borderTopWidth),
      borderTopStyle: style.borderTopStyle,
      borderTopColor: style.borderTopColor,
      backgroundColor: style.backgroundColor,
    }
  })

// The value of a colour token as the browser computes it, to compare with computed styles.
const tokenColor = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

// The value of a length token in pixels, as a border of that width computes.
const tokenLength = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('span')
    probe.style.borderTop = `var(${name}) solid`
    document.body.append(probe)
    const width = parseFloat(getComputedStyle(probe).borderTopWidth)
    probe.remove()
    return width
  }, token)

test.describe('the Write notes screen of several notes on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('leaves the buttons uncovered by Check and Next once scrolled to the end', async ({
    page,
  }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

    await scrollToEnd(page)
    await expectButtonsUncoveredBy(page, button(page, 'Check'))

    await openReviewOfNote1(page)
    await scrollToEnd(page)
    await expectButtonsUncoveredBy(page, button(page, 'Next'))
    const next = await boxOf(button(page, 'Next'))
    expect(640 - (next.y + next.height), 'room under Next').toBeLessThanOrEqual(24 + 0.5)
    await expectNoHorizontalScroll(page)
  })

  test('sets the notes of the task in a row, the current one bold and in the accent colour', async ({
    page,
  }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

    await expect(taskNotes(page)).toHaveCount(3)
    const [first, second] = [
      await boxOf(taskNotes(page).nth(0)),
      await boxOf(taskNotes(page).nth(1)),
    ]
    expect(second.y, 'the second note on the line of the first').toBeLessThan(
      first.y + first.height,
    )
    const current = await styleOf(taskNotes(page).nth(0))
    const other = await styleOf(taskNotes(page).nth(1))
    expect(current.color).toBe(await tokenColor(page, '--color-accent'))
    expect(current.fontWeight).toBeGreaterThanOrEqual(700)
    expect(other.color).not.toBe(current.color)
    expect(other.fontWeight).toBeLessThan(700)

    await touch(page, 2, 1)

    expect((await styleOf(taskNotes(page).nth(1))).color).toBe(current.color)
    expect((await styleOf(taskNotes(page).nth(0))).color).toBe(other.color)
  })

  test('frames the current column on the accent tint, the others thin and dashed, a wrong one dashed', async ({
    page,
  }) => {
    await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

    const current = await styleOf(column(page, 1))
    expect(current.borderTopStyle).toBe('solid')
    expect(current.borderTopColor).toBe(await tokenColor(page, '--color-accent'))
    expect(current.backgroundColor).toBe(await tokenColor(page, '--color-accent-tint'))
    expect(current.borderTopWidth).toBe(await tokenLength(page, '--line-medium'))
    // The other columns show where to touch by a thin dashed frame.
    for (const number of [2, 3]) {
      const other = await styleOf(column(page, number))
      expect(other.borderTopWidth, `column ${number}`).toBe(await tokenLength(page, '--line-thin'))
      expect(other.borderTopStyle, `column ${number}`).toBe('dashed')
      expect(other.borderTopColor, `column ${number}`).toBe(
        await tokenColor(page, '--color-border'),
      )
    }

    await touch(page, 1, 1, 2)
    await button(page, 'Quarter note').click()
    await touch(page, 2, 1)
    await button(page, 'Quarter note').click()
    await touch(page, 3, 2)
    await button(page, 'Quarter note').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')

    const wrong = await styleOf(column(page, 1))
    expect(wrong.borderTopStyle).toBe('dashed')
    expect(wrong.borderTopColor).toBe(await tokenColor(page, '--color-wrong'))
  })
})

// Edge case 4: a phone turned on its side.
for (const width of [780, 640]) {
  test.describe(`the Write notes screen of several notes on a ${width} px wide screen held sideways`, () => {
    test.use({ viewport: { width, height: 360 } })

    test('leaves the staff uncovered by Check', async ({ page }) => {
      await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)
      await page.evaluate(() => window.scrollTo(0, 0))

      expect(overlaps(await boxOf(staff(page)), await boxOf(button(page, 'Check')))).toBe(false)
    })

    test('leaves the buttons uncovered by Check once scrolled to the end', async ({ page }) => {
      await openWriting(page, SEVERAL_NOTES, DO_MI_SOL)

      await scrollToEnd(page)

      await expectButtonsUncoveredBy(page, button(page, 'Check'))
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
}
