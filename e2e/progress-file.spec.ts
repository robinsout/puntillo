import { readFile } from 'node:fs/promises'
import {
  expect,
  test,
  type Browser,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test'
import { section } from './navigation'
import { startSession } from './session-length'

// Feature progress-and-storage, slice 4: the progress of a real session exported to a file and
// imported in another browser, over a reload (criteria 14–17), the language of the file taken at
// once (criterion 16), a file that is not Puntillo progress turned down; the buttons and the dialog
// on a narrow screen and with the keyboard (edge case 7). As in progress.spec.ts the page starts in
// Confident reading with one note in 4/4 and Math.random is fixed at 0, so the first question is
// C4 (do), a whole note.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const QUESTION = 'Replace your current progress with the file?'
const IMPORTED = 'Progress imported.'
const REJECTED = "This file can't be read as Puntillo progress. Your progress hasn't changed."

// C4 wrong on the name in both attempts, its duration right, then Finish: one question, 50%.
const SESSION_LINE = /^\d{1,2} \w{3,4} · Read notes · No limit · 1 question · 50%$/
const HARDEST_LINE = 'do4, whole note — 1 mistake of 1'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.locator('[role="img"]').first()
const confirmation = (page: Page) => page.getByRole('dialog', { name: QUESTION })
const status = (page: Page) => page.getByRole('status')

function linesOf(page: Page, name: string) {
  return page
    .getByRole('list', { name, exact: true })
    .getByRole('listitem')
    .evaluateAll((all) => all.map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? ''))
}

const sessionLines = (page: Page) => linesOf(page, 'Recent sessions')
const hardestLines = (page: Page) => linesOf(page, 'Hardest notes')

async function startsInOneNoteReading(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0
  })
  await page.addInitScript((difficulty) => {
    if (localStorage.getItem('puntillo.preset') !== null) return
    localStorage.setItem('puntillo.preset', 'confident-reading')
    localStorage.setItem('puntillo.difficulty', difficulty)
  }, ONE_NOTE_READING)
}

async function answer(page: Page, name: string, duration = true) {
  await button(page, name).click()
  if (duration) await button(page, '1/1').click()
  await button(page, 'Check').click()
}

// C4 wrong in both attempts on the name, then back on the choice screen.
async function sessionWithMistakeOnC4(page: Page) {
  await page.goto('/')
  await startSession(page, 'No limit')
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await answer(page, 'mi')
  await answer(page, 'fa', false)
  await expect(button(page, 'Next')).toBeVisible()
  await button(page, 'Finish').click()
  await expect(heading(page, 'Results')).toBeVisible()
  await button(page, 'New session').click()
  await expect(heading(page, 'Trainer')).toBeAttached()
}

async function openProgress(page: Page) {
  await section(page, 'Progress').click()
  await expect(heading(page, 'Progress')).toBeVisible()
}

async function exportProgress(page: Page): Promise<Download> {
  const download = page.waitForEvent('download')
  await button(page, 'Export progress').click()
  return download
}

async function textOf(download: Download): Promise<string> {
  return readFile(await download.path(), 'utf8')
}

type FileToChoose = { name: string; mimeType: string; buffer: Buffer }

const jsonFile = (text: string, name = 'puntillo-progress.json'): FileToChoose => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(text),
})

async function chooseFile(page: Page, file: FileToChoose) {
  const chooser = page.waitForEvent('filechooser')
  await button(page, 'Import progress').click()
  await (await chooser).setFiles(file)
}

// The date of the device as the file is named by it.
const today = (page: Page) =>
  page.evaluate(() => {
    const now = new Date()
    const twoDigits = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`
  })

// The progress of a session with a mistake on C4 in a browser of its own, as a file.
async function exportedElsewhere(browser: Browser): Promise<FileToChoose> {
  const context = await browser.newContext({ locale: 'en-US' })
  try {
    const other = await context.newPage()
    await startsInOneNoteReading(other)
    await sessionWithMistakeOnC4(other)
    await openProgress(other)
    const download = await exportProgress(other)
    return jsonFile(await textOf(download), download.suggestedFilename())
  } finally {
    await context.close()
  }
}

async function expectTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox()
  // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
  expect(box?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.x, `left edge of ${what}`).toBeGreaterThanOrEqual(0)
  expect(box && box.x + box.width, `right edge of ${what}`).toBeLessThanOrEqual(360)
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

const isFocused = (locator: Locator) =>
  locator.evaluate((element) => element === document.activeElement)

// WebKit on macOS tabs only through form fields; links and buttons need Option+Tab.
async function tabTo(page: Page, browserName: string, target: Locator) {
  await page.locator('h1').first().focus()
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press(`${browserName === 'webkit' ? 'Alt+' : ''}Tab`)
    if (await isFocused(target)) return
  }
  throw new Error(`${String(target)} is not reachable with Tab`)
}

test.beforeEach(async ({ page }) => {
  await startsInOneNoteReading(page)
})

test.describe('Progress file', () => {
  // Assertions use English texts, and WebKit without a locale falls back to the system language.
  test.use({ locale: 'en-US' })

  test('Export progress saves a file of the day with the finished session', async ({ page }) => {
    await sessionWithMistakeOnC4(page)
    await openProgress(page)

    const download = await exportProgress(page)

    expect(download.suggestedFilename()).toBe(`puntillo-progress-${await today(page)}.json`)
    const file: unknown = JSON.parse(await textOf(download))
    expect(file).toMatchObject({
      app: 'puntillo',
      version: 1,
      history: {
        sessions: [{ exercise: 'read', length: 'unlimited', questions: 1, accuracy: 50 }],
      },
    })
  })

  test('Import progress replaces the progress with a file of another browser', async ({
    page,
    browser,
  }) => {
    const file = await exportedElsewhere(browser)
    await page.goto('/')
    await openProgress(page)
    await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible()

    await chooseFile(page, file)
    await expect(confirmation(page)).toBeVisible()
    await button(page, 'Replace').click()

    await expect(status(page)).toHaveText(IMPORTED)
    await expect(confirmation(page)).toBeHidden()
    expect(await sessionLines(page)).toEqual([expect.stringMatching(SESSION_LINE)])
    expect(await hardestLines(page)).toEqual([HARDEST_LINE])

    await page.reload()
    await expect(heading(page, 'Progress')).toBeVisible()
    expect(await sessionLines(page)).toEqual([expect.stringMatching(SESSION_LINE)])
    expect(await hardestLines(page)).toEqual([HARDEST_LINE])
  })

  test('Import progress takes the language of the file at once and keeps it', async ({ page }) => {
    await sessionWithMistakeOnC4(page)
    await openProgress(page)
    const exported = JSON.parse(await textOf(await exportProgress(page))) as {
      preferences: Record<string, unknown>
    }
    exported.preferences.language = 'ru'

    await chooseFile(page, jsonFile(JSON.stringify(exported, null, 2)))
    await button(page, 'Replace').click()

    await expect(status(page)).toHaveText('Прогресс загружен.')
    await expect(heading(page, 'Прогресс')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.reload()
    await expect(heading(page, 'Прогресс')).toBeVisible()
  })

  test('Cancel leaves the progress as it was', async ({ page, browser }) => {
    const file = await exportedElsewhere(browser)
    await page.goto('/progress')
    await expect(heading(page, 'Progress')).toBeVisible()

    await chooseFile(page, file)
    await button(page, 'Cancel').click()

    await expect(confirmation(page)).toBeHidden()
    await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible()
    await expect(page.getByText(IMPORTED, { exact: true })).toHaveCount(0)
  })

  test('a file that is not Puntillo progress is turned down', async ({ page }) => {
    await sessionWithMistakeOnC4(page)
    await openProgress(page)

    await chooseFile(page, jsonFile(JSON.stringify({ app: 'other', version: 1 })))

    await expect(status(page)).toHaveText(REJECTED)
    await expect(confirmation(page)).toHaveCount(0)
    expect(await hardestLines(page)).toEqual([HARDEST_LINE])
    await page.reload()
    await expect(heading(page, 'Progress')).toBeVisible()
    expect(await hardestLines(page)).toEqual([HARDEST_LINE])
  })

  test('is used with the keyboard: Export, Import, Esc', async ({ page, browserName }) => {
    await page.goto('/progress')
    await expect(heading(page, 'Progress')).toBeVisible()
    const exporter = button(page, 'Export progress')
    const importer = button(page, 'Import progress')

    await tabTo(page, browserName, exporter)
    const download = page.waitForEvent('download')
    await page.keyboard.press('Enter')
    const file = jsonFile(await textOf(await download))

    await tabTo(page, browserName, importer)
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles(file)
    await expect(confirmation(page)).toBeVisible()
    expect(
      await confirmation(page).evaluate((dialog) => dialog.contains(document.activeElement)),
    ).toBe(true)

    await page.keyboard.press('Escape')

    await expect(confirmation(page)).toBeHidden()
    await expect.poll(() => isFocused(importer)).toBe(true)
  })
})

test.describe('Progress file on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, locale: 'en-US' })

  test('fits Export progress and Import progress, large enough', async ({ page }) => {
    await sessionWithMistakeOnC4(page)
    await openProgress(page)
    await expect(button(page, 'Import progress')).toBeVisible()

    await expectTarget(button(page, 'Export progress'), 'Export progress')
    await expectTarget(button(page, 'Import progress'), 'Import progress')
    await expectNoHorizontalScroll(page)
  })

  test('fits the dialog and its buttons', async ({ page }) => {
    await sessionWithMistakeOnC4(page)
    await openProgress(page)
    const file = jsonFile(await textOf(await exportProgress(page)))

    await chooseFile(page, file)
    await expect(confirmation(page)).toBeVisible()

    const box = await confirmation(page).boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    expect(box && box.y + box.height).toBeLessThanOrEqual(640)
    await expectTarget(button(page, 'Replace'), 'Replace')
    await expectTarget(button(page, 'Cancel'), 'Cancel')
    await expectNoHorizontalScroll(page)
  })

  test('fits the message about a file turned down', async ({ page }) => {
    await page.goto('/progress')
    await expect(heading(page, 'Progress')).toBeVisible()

    await chooseFile(page, jsonFile('not JSON'))

    await expect(status(page)).toHaveText(REJECTED)
    const box = await status(page).boundingBox()
    expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    await expectNoHorizontalScroll(page)
  })
})
