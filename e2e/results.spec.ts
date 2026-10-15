import { expect, test, type Locator, type Page } from '@playwright/test'
import { mistakeLines, resultStats } from './results'
import { startSession } from './session-length'

// Feature design-system, slice 5, criterion 16 and edge case 3: the results built of the design
// system in a real browser. The accuracy stands large in the display font, the figures are three
// tiles in a row, each line of Most mistakes draws its note on a small staff before its text and
// keeps its links to the wiki, and the buttons take the whole column. Long Spanish texts wrap
// rather than overflow.
//
// As in most-mistakes.spec.ts the page starts in Confident reading with one note in 4/4, as if
// chosen on an earlier visit, and Math.random is fixed at 0, so the questions are whole notes, C4
// (do), D4 (re)… Both are answered wrong twice on the name: Most mistakes holds re4, then do4.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const TEXTS = {
  en: {
    browser: 'en-US',
    noLimit: 'No limit',
    check: 'Check',
    next: 'Next',
    finish: 'Finish',
    results: 'Results',
    mostMistakes: 'Most mistakes',
    staff: 'Notes on the treble staff',
    practice: 'Practice only these',
    newSession: 'New session',
    points: '2 of 4 points',
  },
  es: {
    browser: 'es-ES',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    next: 'Siguiente',
    finish: 'Terminar',
    results: 'Resultados',
    mostMistakes: 'Más errores',
    staff: 'Notas en el pentagrama en clave de sol',
    practice: 'Practicar solo estos',
    newSession: 'Nueva sesión',
    points: '2 de 4 puntos',
  },
} as const

type Texts = (typeof TEXTS)[keyof typeof TEXTS]
const EN = TEXTS.en

const WIDTH = 360

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const items = (page: Page, texts: Texts = EN) =>
  page.getByRole('list', { name: texts.mostMistakes, exact: true }).getByRole('listitem')
// Two of four points: 50%, with a non-breaking space before % in Spanish.
const percent = (page: Page) => page.getByText(/^50 ?%$/)

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

const styleOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      fontSize: parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight),
      fontFamily: style.fontFamily,
    }
  })

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function answer(page: Page, texts: Texts, name: string, duration = true) {
  await button(page, name).click()
  if (duration) await button(page, '1/1').click()
  await button(page, texts.check).click()
}

// Both attempts wrong on the name, the duration right.
async function answerWrong(page: Page, texts: Texts) {
  await answer(page, texts, 'mi')
  await answer(page, texts, 'fa', false)
  await expect(button(page, texts.next)).toBeVisible()
}

async function resultsWithMistakes(page: Page, texts: Texts = EN) {
  await page.goto('/')
  await startSession(page, texts.noLimit)
  await expect(page.locator('[role="img"] svg .vf-stavenote')).toHaveCount(1)
  await answerWrong(page, texts)
  await button(page, texts.next).click()
  await answerWrong(page, texts)
  await button(page, texts.finish).click()
  await expect(heading(page, texts.results)).toBeVisible()
  await expect(items(page, texts)).toHaveCount(2)
}

// The note head of a staff in screen pixels. The box of an SVG text is the font's line box in
// WebKit, far taller than the glyph; the extent of its character is laid out from its advance in
// every engine.
const noteHeadOf = (item: Locator) =>
  item.locator('.vf-stavenote').evaluate((note) => {
    const head = [...note.querySelectorAll<SVGTextContentElement>('text')].find((text) =>
      /^[-]$/.test(text.textContent ?? ''),
    )
    const toScreen = head?.getScreenCTM()
    if (!head || !toScreen) throw new Error('no note head is laid out')
    const cell = head.getExtentOfChar(0)
    const corner = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(toScreen)
    const topLeft = corner(cell.x, cell.y)
    const bottomRight = corner(cell.x + cell.width, cell.y + cell.height)
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }
  })

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

test.describe('the results on a 360 px wide screen', () => {
  test.use({ viewport: { width: WIDTH, height: 640 }, locale: EN.browser })

  test('fit the screen without horizontal scrolling', async ({ page }) => {
    await resultsWithMistakes(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('set the accuracy in the display font, larger than the heading, 48 px at least', async ({
    page,
  }) => {
    await resultsWithMistakes(page)

    await expect(percent(page)).toBeVisible()
    await expect(page.getByText(EN.points, { exact: true })).toBeVisible()
    const accuracy = await styleOf(percent(page))
    const title = await styleOf(heading(page, EN.results))
    expect(accuracy.fontSize).toBeGreaterThanOrEqual(48)
    expect(accuracy.fontSize).toBeGreaterThan(title.fontSize)
    expect(accuracy.fontFamily).toContain('Source Serif 4')
  })

  test('put the three tiles in one row, each value larger and bolder than its label', async ({
    page,
  }) => {
    await resultsWithMistakes(page)

    await expect.poll(() => resultStats(page).then(Object.keys)).toHaveLength(3)
    const terms = page.getByRole('term')
    const values = page.getByRole('definition')
    const boxes = await Promise.all([0, 1, 2].map((index) => boxOf(terms.nth(index))))
    for (const [index, box] of boxes.entries()) {
      expect(Math.abs(box.y - (boxes[0]?.y ?? 0)), `top of tile ${index + 1}`).toBeLessThan(1)
      expect(box.x, `left edge of tile ${index + 1}`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `right edge of tile ${index + 1}`).toBeLessThanOrEqual(WIDTH)
    }
    const gaps = boxes.slice(1).map((box, index) => {
      const before = boxes[index] as (typeof boxes)[number]
      return box.x - (before.x + before.width)
    })
    expect(Math.min(...gaps), 'room between the tiles').toBeGreaterThanOrEqual(0)
    for (const index of [0, 1, 2]) {
      const label = await styleOf(terms.nth(index))
      const value = await styleOf(values.nth(index))
      expect(value.fontSize).toBeGreaterThan(label.fontSize)
      expect(value.fontWeight).toBeGreaterThanOrEqual(600)
    }
  })

  test('draw the note of each line of Most mistakes on a staff before its text', async ({
    page,
  }) => {
    await resultsWithMistakes(page)

    expect(await mistakeLines(items(page))).toEqual([
      're4, whole note / 1 mistake',
      'do4, whole note / 1 mistake',
    ])
    for (let index = 0; index < 2; index++) {
      const item = items(page).nth(index)
      await expect(item.locator('svg .vf-stavenote')).toHaveCount(1)
      const line = await boxOf(item)
      const head = await noteHeadOf(item)
      const text = await boxOf(item.getByText(/whole note$/))
      expect(head.left, `note head of line ${index + 1}`).toBeGreaterThanOrEqual(line.x)
      expect(head.right, `note head of line ${index + 1}`).toBeLessThanOrEqual(text.x)
      expect(head.top, `note head of line ${index + 1}`).toBeGreaterThanOrEqual(line.y)
      expect(head.bottom, `note head of line ${index + 1}`).toBeLessThanOrEqual(
        line.y + line.height,
      )
    }
  })

  test('keep the links of Most mistakes 44 px high and within the width', async ({ page }) => {
    await resultsWithMistakes(page)

    for (let index = 0; index < 2; index++) {
      const link = items(page).nth(index).getByRole('link', { name: EN.staff, exact: true })
      await link.scrollIntoViewIfNeeded()
      const box = await boxOf(link)
      // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
      expect(box.height, `height of link ${index + 1}`).toBeGreaterThanOrEqual(44 - 0.01)
      expect(box.x, `left edge of link ${index + 1}`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `right edge of link ${index + 1}`).toBeLessThanOrEqual(WIDTH)
    }
  })

  test('stretch both buttons over the column, Practice only these above', async ({ page }) => {
    await resultsWithMistakes(page)

    const list = await boxOf(page.getByRole('list', { name: EN.mostMistakes, exact: true }))
    const practice = await boxOf(button(page, EN.practice))
    const newSession = await boxOf(button(page, EN.newSession))
    for (const [name, box] of [
      [EN.practice, practice],
      [EN.newSession, newSession],
    ] as const) {
      expect(Math.abs(box.x - list.x), `left edge of ${name}`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(box.width - list.width), `width of ${name}`).toBeLessThanOrEqual(0.5)
      expect(box.height, `height of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
    }
    expect(newSession.y).toBeGreaterThanOrEqual(practice.y + practice.height)
  })
})

test.describe('the results in Spanish on a 360 px wide screen', () => {
  test.use({ viewport: { width: WIDTH, height: 640 }, locale: TEXTS.es.browser })

  test('wrap the long texts rather than cut them', async ({ page }) => {
    const texts = TEXTS.es
    await resultsWithMistakes(page, texts)
    await expect(page.getByText(texts.points, { exact: true })).toBeVisible()

    await expectNoHorizontalScroll(page)
    const cut = await page.getByRole('main').evaluate((main, width) => {
      const found: string[] = []
      for (const element of main.querySelectorAll<HTMLElement>(
        'h1, h2, p, dt, dd, li, a, button',
      )) {
        const box = element.getBoundingClientRect()
        if (box.width === 0) continue
        if (element.scrollWidth > element.clientWidth + 1 || box.left < 0 || box.right > width)
          found.push(element.textContent?.trim() ?? element.tagName)
      }
      return found
    }, WIDTH)
    expect(cut).toEqual([])
  })
})

test.describe('the results on a 1440 px wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 }, locale: EN.browser })

  // --width-content, 40rem.
  test('keep the buttons as wide as the column, 640 px at most', async ({ page }) => {
    await resultsWithMistakes(page)

    const list = await boxOf(page.getByRole('list', { name: EN.mostMistakes, exact: true }))
    for (const name of [EN.practice, EN.newSession]) {
      const box = await boxOf(button(page, name))
      expect(Math.abs(box.width - list.width), `width of ${name}`).toBeLessThanOrEqual(0.5)
      expect(box.width, `width of ${name}`).toBeLessThanOrEqual(640 + 0.5)
    }
  })
})
