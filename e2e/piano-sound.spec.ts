import { expect, test, type Locator, type Page } from '@playwright/test'
import { muteAudio } from './mute-audio'
import { backToTrainer } from './settings'

// Feature piano-keyboard, slice 2, in a real browser (spec §16, §18): the samples of the piano are
// not part of the page as it opens; with Piano keyboard and the sound on they are fetched on the
// first press on the page, with the sound off never; a piano key played once they are in starts a
// sound and an inactive one does not (criteria 13–15). The box Play the keys is saved and shows
// with Piano keyboard alone (criterion 2). The sound itself cannot be heard here: the requests of
// the samples and the sources started by Web Audio stand for it.
//
// No title has "keyboard" in it: those are the scenarios of the computer keyboard
// (playwright.config.ts picks the engines by the titles).

test.use({ locale: 'en-US' })

test.beforeEach(({ page }) => muteAudio(page))

// As in piano-keyboard.spec.ts: Confident reading with one note in 4/4, no signs, the duration
// asked. With Math.random at 0 the first question is a whole C4 (do4).
const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  keySignatures: 0,
  accidentals: 'none',
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
  rests: false,
  dots: false,
})

const SAMPLES = 12
const SAMPLE = /\/piano\/[^/]+\.mp3$/

const BOX = 'Play the keys'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const box = (page: Page) => page.getByRole('checkbox', { name: BOX, exact: true })
const noteInput = (page: Page) => page.getByRole('combobox', { name: 'Note input', exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const piano = (page: Page) => page.getByRole('group', { name: 'Piano keyboard', exact: true })
const pianoKey = (page: Page, name: string) =>
  piano(page).getByRole('button', { name, exact: true })

interface Started {
  __sourcesStarted?: number
}

// Every sample requested by the page, and every Web Audio source it starts counted in the page.
// Math.random is 0 throughout; the difficulty and the note input are saved as on an earlier visit.
// The box is in the settings (feature navigation-and-settings), opened by their address: a click of
// the link would be a press on the page, which starts the samples loading.
async function visit(
  page: Page,
  noteInputSaved: 'names' | 'keyboard' = 'keyboard',
  path: '/' | '/settings' = '/',
) {
  const requested: string[] = []
  page.on('request', (request) => {
    if (SAMPLE.test(new URL(request.url()).pathname)) requested.push(request.url())
  })
  await page.addInitScript(
    ([difficulty, input]) => {
      Math.random = () => 0
      const start = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (...args) {
        const counted = window as Started
        counted.__sourcesStarted = (counted.__sourcesStarted ?? 0) + 1
        return start.apply(this, args)
      }
      if (localStorage.getItem('puntillo.preset') !== null) return
      localStorage.setItem('puntillo.preset', 'confident-reading')
      localStorage.setItem('puntillo.difficulty', difficulty)
      localStorage.setItem('puntillo.noteInput', input)
    },
    [ONE_NOTE_READING, noteInputSaved] as const,
  )
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return requested
}

// A fetch started by a press is under way by the time the page has drawn a frame and run a task
// after it, and its request reaches the test before the answer to this.
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve))
      }),
  )

// A click of the mouse where the element is: a disabled button gets none.
async function clickWhere(page: Page, locator: Locator) {
  const area = await locator.boundingBox()
  if (!area) throw new Error('element is not laid out')
  await page.mouse.click(area.x + area.width / 2, area.y + area.height / 2)
}

const sourcesStarted = (page: Page) =>
  page.evaluate(() => (window as Started).__sourcesStarted ?? 0)

async function openQuestion(page: Page) {
  await button(page, 'No limit').click()
  await expect(staff(page).locator('svg .vf-stave')).toBeVisible()
  await expect(piano(page)).toBeVisible()
}

test('opening the page requests no piano samples', async ({ page }) => {
  const requested = await visit(page)

  await settled(page)

  expect(requested).toEqual([])
})

test('the first click on the page requests the twelve piano samples', async ({ page }) => {
  const requested = await visit(page)

  await page.mouse.click(1, 1)

  await expect.poll(() => requested.length).toBe(SAMPLES)
})

test('with Note names a click on the page requests no piano samples', async ({ page }) => {
  const requested = await visit(page, 'names')

  await page.mouse.click(1, 1)
  await button(page, 'No limit').click()
  await settled(page)

  expect(requested).toEqual([])
})

test('with the sound off the piano keys played request no samples', async ({ page }) => {
  const requested = await visit(page, 'keyboard', '/settings')
  await box(page).uncheck()

  await backToTrainer(page)
  await openQuestion(page)
  await pianoKey(page, 'do4').click()
  await pianoKey(page, 're4').click()
  await settled(page)

  expect(requested).toEqual([])
  expect(await sourcesStarted(page)).toBe(0)
})

test('the samples are requested on the next click once the sound is turned on', async ({
  page,
}) => {
  const requested = await visit(page, 'keyboard', '/settings')
  await box(page).uncheck()
  await page.mouse.click(1, 1)
  await settled(page)
  expect(requested).toEqual([])

  await box(page).check()
  await page.mouse.click(1, 1)

  await expect.poll(() => requested.length).toBe(SAMPLES)
})

test('a piano key played once the samples are in starts a sound, an inactive one does not', async ({
  page,
}) => {
  const requested = await visit(page)
  await openQuestion(page)
  await expect.poll(() => requested.length).toBe(SAMPLES)

  // Decoding takes a moment after the requests: a key played before it is silent (edge case 1).
  await expect
    .poll(async () => {
      await pianoKey(page, 'do5').click()
      return sourcesStarted(page)
    })
    .toBeGreaterThan(0)

  await button(page, '1/1').click()
  await button(page, 'Check').click()
  await expect(pianoKey(page, 'do5')).toBeDisabled()
  const before = await sourcesStarted(page)

  await clickWhere(page, pianoKey(page, 'do5'))
  await settled(page)
  expect(await sourcesStarted(page)).toBe(before)

  await pianoKey(page, 'do4').click()
  await expect.poll(() => sourcesStarted(page)).toBe(before + 1)
})

test('the box Play the keys is ticked at first and kept cleared after a reload', async ({
  page,
}) => {
  await visit(page, 'keyboard', '/settings')
  await expect(box(page)).toBeChecked()

  await box(page).uncheck()
  await page.reload()

  await expect(box(page)).not.toBeChecked()
})

test('the box Play the keys is not shown with Note names', async ({ page }) => {
  await visit(page, 'keyboard', '/settings')
  await expect(box(page)).toBeVisible()

  await noteInput(page).selectOption({ label: 'Note names' })

  await expect(box(page)).toHaveCount(0)
})
