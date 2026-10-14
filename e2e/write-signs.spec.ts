import { expect, test, type Locator, type Page } from '@playwright/test'
import { startSession } from './session-length'

// Feature m2-write-notes, slice 3: signs in Write notes in a real browser (spec §16). The page
// starts as if Write notes had been chosen on an earlier visit, with one note in 4/4, the
// duration not asked, up to two signs in the key signature, and sharps, flats and naturals.
// Math.random gives queued values first, then a constant 0; the values queued right before a
// session starts go to its first question: the pitch, one of twelve from C4; the duration; the
// number of signs in the key signature, of three, then sharps (below 0.5) or flats; whether the
// note takes a sign of its own (0.75 or above), then a sharp (below 0.5) or a flat.

type RandomWindow = Window & { puntilloQueue: number[] }

const SIGNS = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  keySignatures: 2,
  accidentals: 'sharp-flat-and-natural',
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: false,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
  rests: false,
  dots: false,
})

// G major, F4: sounds F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = [3.5 / 12, 0, 0.5, 0.4, 0]
// G major, F4 with a natural against the key signature.
const F_NATURAL_IN_G_MAJOR = [3.5 / 12, 0, 0.5, 0.4, 0.9]

const SHARP_GLYPH = ''

test.use({ locale: 'en-US' })

async function openWriting(page: Page, queued: number[]) {
  await page.addInitScript((saved) => {
    const random = window as unknown as RandomWindow
    random.puntilloQueue = []
    Math.random = () => random.puntilloQueue.shift() ?? 0
    if (localStorage.getItem('puntillo.exercise') !== null) return
    localStorage.setItem('puntillo.exercise', 'write')
    localStorage.setItem('puntillo.preset', 'confident-reading')
    localStorage.setItem('puntillo.difficulty', saved)
  }, SIGNS)
  await page.goto('/')
  await page.evaluate((values) => {
    ;(window as unknown as RandomWindow).puntilloQueue = [...values]
  }, queued)
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stave').first()).toBeVisible()
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect(column(page)).toBeVisible()
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const column = (page: Page) => page.getByRole('slider', { name: 'Note 1', exact: true })

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// The status message as read: the buttons Why? after its sentences are no part of it.
function statusText(page: Page) {
  return page.getByRole('status').evaluate((status) => {
    const copy = status.cloneNode(true) as HTMLElement
    for (const each of copy.querySelectorAll('button')) each.remove()
    return copy.textContent?.replace(/\s+/g, ' ').trim()
  })
}

// The signs drawn before the notes, not those of the key signature.
function ownSigns(page: Page, glyph: string) {
  return staff(page)
    .locator('svg')
    .evaluate(
      (svg, sign) =>
        [...svg.querySelectorAll('.vf-stavenote text')].filter((text) => text.textContent === sign)
          .length,
      glyph,
    )
}

// A touch in the column on F4, the 1st space: half a staff space above the bottom line.
async function touchF4(page: Page) {
  const ys = await staff(page)
    .locator('svg')
    .evaluate((svg) =>
      [...(svg.querySelector('.vf-stave')?.querySelectorAll('path') ?? [])]
        .map((path) => path.getBoundingClientRect())
        .map(({ top, height }) => top + height / 2)
        .sort((a, b) => a - b),
    )
  const [top = 0, second = 0] = ys
  const bottom = ys.at(-1) ?? 0
  const box = await boxOf(column(page))
  await page.mouse.click(box.x + box.width / 2, bottom - (second - top) / 2)
}

test.describe('Write notes with signs', () => {
  test('writes F4 without a sign in G major, then explains a sharp written there', async ({
    page,
  }) => {
    await openWriting(page, F_IN_G_MAJOR)

    await expect(page.getByText('fa♯4', { exact: true })).toBeVisible()
    await expect(staff(page).locator('svg .vf-keysignature')).toHaveCount(1)

    await touchF4(page)
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'fa4')
    await button(page, 'Sharp').click()
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'fa♯4')
    await expect.poll(() => ownSigns(page, SHARP_GLYPH)).toBe(1)

    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')

    await button(page, 'Flat').click()
    await button(page, 'Check').click()

    await expect
      .poll(() => statusText(page))
      .toBe(
        'You wrote fa♭4, but the note is written fa4. ' +
          'The key signature already makes it fa♯: no sign needed.',
      )
    await expect(button(page, 'Why?')).toHaveCount(2)
  })

  test('takes F4 without a sign in G major as right', async ({ page }) => {
    await openWriting(page, F_IN_G_MAJOR)

    await touchF4(page)
    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Correct')
  })

  test('takes F4 with a natural against the key signature as right', async ({ page }) => {
    await openWriting(page, F_NATURAL_IN_G_MAJOR)

    await expect(page.getByText('fa4', { exact: true })).toBeVisible()
    await touchF4(page)
    await button(page, 'Natural').click()
    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Correct')
  })
})

test.describe('Write notes with signs with the keyboard', () => {
  test('writes the note, puts and takes away a sign and checks, all with the keyboard', async ({
    page,
  }) => {
    await openWriting(page, F_IN_G_MAJOR)

    // The middle of the twelve steps C4–G5 is A4; two steps down is F4.
    await column(page).focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(column(page)).toHaveAttribute('aria-valuetext', 'fa4')

    await button(page, 'Sharp').focus()
    await page.keyboard.press('Space')
    await expect(button(page, 'Sharp')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Space')
    await expect(button(page, 'Sharp')).toHaveAttribute('aria-pressed', 'false')

    await column(page).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('status')).toHaveText('Correct')
  })
})

test.describe('Write notes with signs on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits Sharp, Flat and Natural, each at least 44 by 44', async ({ page }) => {
    await openWriting(page, F_IN_G_MAJOR)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    for (const name of ['Sharp', 'Flat', 'Natural']) {
      const box = await boxOf(button(page, name))
      expect(box.width, `width of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
      expect(box.height, `height of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
      expect(box.x, `left edge of ${name}`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `right edge of ${name}`).toBeLessThanOrEqual(360)
    }
  })

  test('fits the staff with the key signature and a signed note without horizontal scrolling', async ({
    page,
  }) => {
    await openWriting(page, F_IN_G_MAJOR)
    await touchF4(page)
    await button(page, 'Sharp').click()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    const drawing = await boxOf(staff(page).locator('svg'))
    expect(drawing.x + drawing.width).toBeLessThanOrEqual(360)
  })
})
