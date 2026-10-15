import { expect, test, type Locator, type Page } from '@playwright/test'
import { chooseExercise } from './exercise'
import { startSession } from './session-length'

// Feature design-system, slice 3, criterion 13 in a real browser: once a question is checked, the
// notes of Read notes, the right answers, are drawn in the colour of the token --color-correct, the
// notes written in Write notes in that of --color-correct or --color-wrong; a note answered on
// another step has a ghost there, a head in outline, dashed for the answer of Read notes and solid
// for the right note of Write notes (the group vf-ghost holding an ellipse). Under each note answered wrong is its
// caption, the right name and what was answered wrong, "mi — yours", hidden from screen readers;
// a note answered right has none.
// No screenshots: the colours are read as computed, the places as boxes.

type RandomWindow = Window & { puntilloQueue: number[] }

test.use({ locale: 'en-US' })

// Confident reading with one note in 4/4, the duration asked, as most tests of the trainer: with
// Math.random at 0 the first question is C4 (do), a whole note.
const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

interface Visit {
  random: number
  // Saved as if on an earlier visit; null for a new user, in First steps.
  preset: string | null
  // The values of the preset, unless given.
  difficulty?: string
}

// The right answer is shown at once, so a single Check leads to the review.
async function visit(page: Page, { random, preset, difficulty }: Visit) {
  await page.addInitScript(
    ([value, savedPreset, savedDifficulty]) => {
      const queue = window as unknown as RandomWindow
      queue.puntilloQueue = []
      Math.random = () => queue.puntilloQueue.shift() ?? Number(value)
      if (localStorage.getItem('puntillo.showAnswerAtOnce') !== null) return
      localStorage.setItem('puntillo.showAnswerAtOnce', 'true')
      if (savedPreset) localStorage.setItem('puntillo.preset', savedPreset)
      if (savedDifficulty) localStorage.setItem('puntillo.difficulty', savedDifficulty)
    },
    [String(random), preset, difficulty ?? null] as const,
  )
  await page.goto('/')
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
// The notes drawn, the ghosts left out.
const noteGroups = (page: Page) => staff(page).locator('svg .vf-stavenote:not(.vf-ghost *)')
const noteheads = (page: Page) => noteGroups(page).locator('.vf-notehead text')
const ghosts = (page: Page) => staff(page).locator('svg .vf-ghost ellipse')
const caption = (page: Page, text: string) =>
  page.locator('[aria-hidden="true"]').getByText(text, { exact: true })

async function waitForStaff(page: Page) {
  await expect(staff(page).locator('svg .vf-stave').first()).toBeVisible()
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

const centreOf = ({ x, y, width, height }: Box) => ({ x: x + width / 2, y: y + height / 2 })

function overlap(a: Box, b: Box) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0.5 && height > 0.5
}

const contains = (box: Box, { x, y }: { x: number; y: number }) =>
  x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height

// The centre of a note head on the screen. WebKit and Firefox bound SVG text by the metrics of the
// font, well past the drawn glyph, so its box is no measure of the head. The glyph cell is laid out
// from Bravura's advance, which matches its ink, and a SMuFL head is centred on its baseline.
const headCentre = (head: Locator) =>
  head.evaluate((text) => {
    const toScreen = (text as SVGTextElement).getScreenCTM()
    if (!toScreen) throw new Error('note head is not laid out')
    const cell = (text as SVGTextElement).getExtentOfChar(0)
    const baseline = Number(text.getAttribute('y'))
    const centre = new DOMPoint(cell.x + cell.width / 2, baseline).matrixTransform(toScreen)
    return { x: centre.x, y: centre.y }
  })

// The colour of a token as the browser computes it, "rgb(164, 71, 15)".
function tokenColour(page: Page, token: '--color-correct' | '--color-wrong') {
  return page.evaluate((name) => {
    const probe = document.body.appendChild(document.createElement('span'))
    probe.style.color = `var(${name})`
    const { color } = getComputedStyle(probe)
    probe.remove()
    return color
  }, token)
}

const paint = (locator: Locator, property: 'fill' | 'stroke' | 'color' | 'stroke-dasharray') =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// The lines of the captions under the notes: each text of its own hidden from screen readers, by
// the staff. The keys of the answer buttons on a desktop are hidden texts too, but not there.
function captionBoxes(page: Page) {
  return staff(page)
    .locator('xpath=..')
    .evaluate((around) =>
      [...around.querySelectorAll('[aria-hidden="true"], [aria-hidden="true"] *')]
        .filter(
          (element) =>
            !element.closest('svg') &&
            element.children.length === 0 &&
            (element.textContent?.trim() ?? '') !== '',
        )
        .map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { text: element.textContent?.trim() ?? '', box: { x, y, width, height } }
        }),
    )
}

test.describe('the result on the staff on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('result on the staff on a 360 px wide screen', async ({ page }) => {
    await visit(page, { random: 0, preset: 'confident-reading', difficulty: ONE_NOTE_READING })
    await startSession(page, 'No limit')
    await waitForStaff(page)

    await button(page, 'mi').click()
    await button(page, '1/1').click()
    await button(page, 'Check').click()

    const wrong = await tokenColour(page, '--color-wrong')
    const correct = await tokenColour(page, '--color-correct')
    await expect(ghosts(page)).toHaveCount(1)
    // The note of the question is the right answer.
    expect(await paint(noteheads(page).first(), 'fill')).toBe(correct)

    const ghost = ghosts(page).first()
    expect(await paint(ghost, 'stroke')).toBe(wrong)
    expect(await paint(ghost, 'stroke-dasharray')).not.toBe('none')
    // E4, the answer, is two steps above C4, the note.
    const head = await headCentre(noteheads(page).first())
    const outline = centreOf(await boxOf(ghost))
    expect(outline.y, 'the ghost above the note').toBeLessThan(head.y - 5)
    expect(Math.abs(outline.x - head.x), 'the ghost in the column of the note').toBeLessThan(12)

    const right = caption(page, 'do')
    const yours = caption(page, 'mi — yours')
    await expect(right).toBeVisible()
    await expect(yours).toBeVisible()
    expect(await paint(right, 'color')).toBe(correct)
    expect(await paint(yours, 'color')).toBe(wrong)
    for (const line of [right, yours]) {
      const box = await boxOf(line)
      expect(box.x, 'left edge of the caption').toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, 'right edge of the caption').toBeLessThanOrEqual(360)
      expect(centreOf(box).y, 'the caption below the note').toBeGreaterThan(head.y)
      expect(contains(box, head), 'the caption over the note').toBe(false)
    }
    expect(overlap(await boxOf(right), await boxOf(yours)), 'the two lines').toBe(false)
    await expectNoHorizontalScroll(page)
  })

  test('captions every note of a bar of Confident reading, none over another', async ({ page }) => {
    await visit(page, { random: 0.5, preset: 'confident-reading' })
    await startSession(page, 'No limit')
    await waitForStaff(page)
    const targets = page.getByRole('button', { name: /^Note \d+$/ })
    await expect(targets.first()).toBeVisible()
    const notes = await targets.count()
    expect(notes).toBeGreaterThan(1)

    // Math.random at 0.5 gives a bar of quarter notes. Each note answered do, a quarter note:
    // the notes other than do are wrong, each with two lines of caption.
    for (let index = 0; index < notes; index++) {
      await button(page, 'do').click()
      await button(page, '1/4').click()
    }
    await button(page, 'Check').click()
    await expect(button(page, 'Next')).toBeVisible()

    const lines = await captionBoxes(page)
    // A caption under each note answered wrong, whose target is still marked Incorrect; none
    // under a note answered right.
    const wrongNotes = await targets.evaluateAll(
      (elements) =>
        elements.filter((element) =>
          (element.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .some((id) => document.getElementById(id)?.textContent?.trim() === 'Incorrect'),
        ).length,
    )
    expect(wrongNotes).toBeGreaterThan(0)
    const answers = lines.filter(({ text }) => text.endsWith(' — yours'))
    expect(answers, 'a caption under each note answered wrong').toHaveLength(wrongNotes)
    expect(lines.filter(({ text }) => text.endsWith('✓'))).toEqual([])
    const heads = []
    for (const head of await noteheads(page).all()) heads.push(await headCentre(head))
    for (const [index, { text, box }] of lines.entries()) {
      expect(box.x, `left edge of "${text}"`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `right edge of "${text}"`).toBeLessThanOrEqual(360)
      for (const [other, head] of heads.entries())
        expect(contains(box, head), `"${text}" over note ${other + 1}`).toBe(false)
      for (const { text: otherText, box: otherBox } of lines.slice(index + 1))
        expect(overlap(box, otherBox), `"${text}" and "${otherText}"`).toBe(false)
    }
    await expectNoHorizontalScroll(page)
  })
})

test.describe('the result of Write notes on the staff', () => {
  // The page heights of the five staff lines, from the top one down.
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

  test('outlines the right note of a wrong one on its step, the written one in place', async ({
    page,
  }) => {
    // First steps, which a new user starts in: with Math.random at 0.45 the note is G4 (sol4).
    await visit(page, { random: 0.45, preset: null })
    await chooseExercise(page, 'Write notes')
    await startSession(page, 'No limit')
    await waitForStaff(page)
    const column = page.getByRole('slider', { name: 'Note 1', exact: true })
    await expect(column).toBeVisible()

    // Written on the bottom line, E4.
    const ys = await staffLineYs(page)
    const bottom = ys.at(-1) ?? 0
    const box = await boxOf(column)
    await page.mouse.click(box.x + box.width / 2, bottom)
    await expect(column).toHaveAttribute('aria-valuetext', 'mi4')
    await button(page, 'Check').click()

    const correct = await tokenColour(page, '--color-correct')
    const wrong = await tokenColour(page, '--color-wrong')
    await expect(ghosts(page)).toHaveCount(1)
    const ghost = ghosts(page).first()
    expect(await paint(ghost, 'stroke')).toBe(correct)
    expect(await paint(ghost, 'stroke-dasharray')).toBe('none')
    expect(await paint(noteheads(page).first(), 'fill')).toBe(wrong)

    // G4 is on the second line from the bottom. The result card and the focus on Next may scroll
    // the page, so the lines are measured again, together with the ghost.
    const after = await staffLineYs(page)
    const [top = 0, second = 0] = after
    const secondFromBottom = after.at(-2) ?? 0
    const bottomAfter = after.at(-1) ?? 0
    const outline = centreOf(await boxOf(ghost))
    expect(Math.abs(outline.y - secondFromBottom)).toBeLessThan((second - top) / 4)
    const head = await headCentre(noteheads(page).first())
    expect(Math.abs(head.y - bottomAfter), 'the written note on its line').toBeLessThan(
      (second - top) / 4,
    )
    expect(Math.abs(outline.x - head.x), 'the ghost in the column of the note').toBeLessThan(12)

    await expect(caption(page, 'sol4')).toBeVisible()
    await expect(caption(page, 'mi4 — yours')).toBeVisible()
  })
})
