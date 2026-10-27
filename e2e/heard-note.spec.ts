import { expect, test, type Locator, type Page } from '@playwright/test'
import { fakeMicrophonePlaying, openQuestion } from './microphone'
import { muteAudio } from './mute-audio'

// Feature heard-note-on-staff, slice 1, in a real browser (spec §16): while the microphone hears a
// note, its head is drawn on the staff in the colour of the token --color-heard, on the step of the
// note, right of the note of the question (criteria 1, 2). The microphone of Chromium plays re4 and
// the question is re4 (./microphone.ts), so the two heads stand at the same height. No screenshots:
// the colour is read as computed, the places from the glyphs.

test.use(fakeMicrophonePlaying('trumpet-re4.wav'))

test.beforeEach(({ page }) => muteAudio(page))

const HEAD = ''

const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const questionHead = (page: Page) =>
  staff(page).locator('svg .vf-stavenote:not(.vf-ghost *) .vf-notehead text').first()
const heardHead = (page: Page) =>
  staff(page).locator('svg.heard-layer .heard-note text').filter({ hasText: HEAD })

// The cell of a head glyph on the screen: its left and right edges and its centre. WebKit and
// Firefox bound SVG text by the metrics of the font, so the cell of the character is measured, as
// in staff-result.spec.ts; a SMuFL head is centred on its baseline.
const headCell = (head: Locator) =>
  head.evaluate((text) => {
    const toScreen = (text as SVGTextElement).getScreenCTM()
    if (!toScreen) throw new Error('note head is not laid out')
    const cell = (text as SVGTextElement).getExtentOfChar(0)
    const baseline = Number(text.getAttribute('y'))
    const left = new DOMPoint(cell.x, baseline).matrixTransform(toScreen)
    const right = new DOMPoint(cell.x + cell.width, baseline).matrixTransform(toScreen)
    return { left: left.x, right: right.x, centreY: left.y }
  })

// The colour of a token as the browser computes it, "rgb(15, 110, 106)".
function tokenColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.body.appendChild(document.createElement('span'))
    probe.style.color = `var(${name})`
    const { color } = getComputedStyle(probe)
    probe.remove()
    return color
  }, token)
}

test('the head of the note heard stands right of the note of the question, at its height', async ({
  page,
}) => {
  await openQuestion(page)
  await expect(heardHead(page)).toHaveCount(1, { timeout: 10_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  const question = await headCell(questionHead(page))
  const heard = await headCell(heardHead(page))

  expect(Math.abs(heard.centreY - question.centreY)).toBeLessThan(1)
  expect(heard.left).toBeGreaterThanOrEqual(question.right)
})

test('the head of the note heard is drawn in the colour of --color-heard', async ({ page }) => {
  await openQuestion(page)
  await expect(heardHead(page)).toHaveCount(1, { timeout: 10_000 })

  const fill = await heardHead(page).evaluate((head) => getComputedStyle(head).fill)

  expect(fill).toBe(await tokenColour(page, '--color-heard'))
  expect(await tokenColour(page, '--color-heard')).toBe('rgb(15, 110, 106)')
})
