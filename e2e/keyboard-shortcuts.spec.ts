import { expect, test, type Locator, type Page } from '@playwright/test'
import { muteAudio } from './mute-audio'
import { openSettings } from './settings'
import { startSession } from './session-length'
import { chooseExercise } from './exercise'
import { resultStats } from './results'

// Feature keyboard-shortcuts, slice 1: Read notes answered by names from the keyboard of the
// computer in a real browser. A S D F G H J are the names, 1–5 the durations, Enter Check and then
// Next. The keys are pressed by their places (criterion 2), as Playwright names them by code.
// Slice 2: with Piano keyboard the same letters play the keys of the working octave, X moves it up.
// Slice 3: in Write notes ↑ and ↓ move the note a step and Enter checks, the focus off the column.
// Slice 4: on a desktop the question has a hint about the keys until it is closed, for good; the
// dialog Keyboard shortcuts opens from it and from the settings screen (feature
// navigation-and-settings moved it there from the start screen). The Desktop projects have a fine
// pointer, the Mobile ones have not.

test.use({ locale: 'en-US' })

// One note in 4/4 with the duration asked: a constant 0 gives C4 (do), a whole note.
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

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const status = (page: Page) => page.getByRole('status')

// Math.random is a constant 0. Without a saved preset the page is that of a new user: First steps.
async function visit(page: Page, saved?: { preset: string; difficulty: string }) {
  await page.addInitScript((initial) => {
    Math.random = () => 0
    if (!initial || localStorage.getItem('puntillo.preset') !== null) return
    localStorage.setItem('puntillo.preset', initial.preset)
    localStorage.setItem('puntillo.difficulty', initial.difficulty)
  }, saved)
  await page.goto('/')
}

// First steps with Piano keyboard, as saved on an earlier visit; silent, as the keys sound.
async function visitPiano(page: Page) {
  await muteAudio(page)
  await page.addInitScript(() => {
    Math.random = () => 0
    if (localStorage.getItem('puntillo.noteInput') !== null) return
    localStorage.setItem('puntillo.preset', 'first-steps')
    localStorage.setItem('puntillo.noteInput', 'keyboard')
  })
  await page.goto('/')
}

const pianoKey = (page: Page, name: string) =>
  page
    .getByRole('group', { name: 'Piano keyboard', exact: true })
    .getByRole('button', { name, exact: true })

// Feature staff-progress-row: the notes passed in the row stand left of the current one, so the
// question `number` of a row draws that many notes.
async function waitForNote(page: Page, number = 1) {
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(number)
}

test.describe('answering from the keyboard', () => {
  // First steps alternates D4 (re) and E4 (mi) for a constant 0.
  test('runs a session of First steps from the keyboard alone', async ({ page }) => {
    await visit(page)
    await startSession(page, '10')

    for (let number = 1; number <= 10; number++) {
      await expect(
        page.getByRole('progressbar', { name: `Question ${number} of 10`, exact: true }),
      ).toBeVisible()
      await waitForNote(page, number)

      await page.keyboard.press(number % 2 === 1 ? 'KeyS' : 'KeyD')
      await page.keyboard.press('Enter')

      await expect(status(page)).toHaveText('Correct')
      await page.keyboard.press('Enter')
    }

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
    await expect.poll(() => resultStats(page)).toMatchObject({ Questions: '10' })
  })

  test('answers the name and the duration from the keyboard', async ({ page }) => {
    await visit(page, { preset: 'confident-reading', difficulty: ONE_NOTE_READING })
    await startSession(page, 'No limit')
    await waitForNote(page)
    await page.locator('h1').first().focus()

    await page.keyboard.press('KeyA')
    await page.keyboard.press('Digit1')
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')
    await expect(button(page, '1/1')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Enter')

    await expect(status(page)).toHaveText('Correct')
    await expect(page.getByText('Accuracy 100%', { exact: true })).toBeVisible()
    await expect(button(page, 'Next')).toBeFocused()
  })

  // First steps asks D4 (re) first, on do4 to do5.
  test('answers a question with the piano keyboard from the keyboard', async ({ page }) => {
    await visitPiano(page)
    await startSession(page, '10')
    await waitForNote(page)

    await page.keyboard.press('KeyS')
    await expect(pianoKey(page, 're4')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Enter')

    await expect(status(page)).toHaveText('Correct')
  })

  test('plays do5 on the piano keyboard with X and A from the keyboard', async ({ page }) => {
    await visitPiano(page)
    await startSession(page, '10')
    await waitForNote(page)

    await page.keyboard.press('KeyX')
    await page.keyboard.press('KeyA')

    await expect(pianoKey(page, 'do5')).toHaveAttribute('aria-pressed', 'true')
    await expect(pianoKey(page, 'do4')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('writing notes from the keyboard', () => {
  // First steps writes D4–C5 with G4 in the middle; a constant 0.45 asks G4 (sol4) first.
  test('answers a question of Write notes from the keyboard alone', async ({ page }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.45
    })
    await page.goto('/')
    await chooseExercise(page, 'Write notes')
    await startSession(page, 'No limit')
    const column = page.getByRole('slider', { name: 'Note 1', exact: true })
    await expect(button(page, 'One step up')).toBeVisible()
    await page.locator('h1').first().focus()

    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    await expect(column).toHaveAttribute('aria-valuetext', 'sol4')
    await expect(column).not.toBeFocused()
    await page.keyboard.press('Enter')

    await expect(status(page)).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeFocused()
  })
})

const HINT = 'You can answer from the keyboard.'
const shortcutsDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })

async function expectTarget(locator: Locator, what: string) {
  const box = await locator.boundingBox()
  // Layout is fractional: Firefox reports 2.75rem as 43.99997px.
  expect(box?.width, `width of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
  expect(box?.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
}

test.describe('the hint about the keys', () => {
  // First steps asks D4 (re) first.
  test('shows the hint on a desktop, opens Keyboard shortcuts and is closed for good from the keyboard', async ({
    page,
  }) => {
    await visit(page)
    await startSession(page, '10')
    await waitForNote(page)
    await expect(page.getByText(HINT, { exact: true })).toBeVisible()
    await expect(button(page, 're')).toHaveAttribute('aria-keyshortcuts', 'S')

    await button(page, 'Keyboard shortcuts').click()
    await expect(shortcutsDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(shortcutsDialog(page)).toBeHidden()
    await expect(button(page, 'Keyboard shortcuts')).toBeFocused()

    await button(page, 'Close').click()
    await expect(page.getByText(HINT, { exact: true })).toHaveCount(0)

    await page.reload()
    await startSession(page, '10')
    await waitForNote(page)
    await expect(button(page, 're')).toBeVisible()
    await expect(page.getByText(HINT, { exact: true })).toHaveCount(0)
  })
})

test.describe('Keyboard shortcuts on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the dialog Keyboard shortcuts of the settings screen', async ({ page }) => {
    await visit(page)
    await openSettings(page)
    await expectTarget(button(page, 'Keyboard shortcuts'), 'Keyboard shortcuts')

    await button(page, 'Keyboard shortcuts').click()

    const dialog = shortcutsDialog(page)
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow).toBe(0)
    await expectNoHorizontalScroll(page)
    await expectTarget(dialog.getByRole('button', { name: 'Close', exact: true }), 'Close')
  })

  // The Desktop projects have a fine pointer and show the hint and the keys; the Mobile ones show
  // neither.
  test('shows the hint and the keys on a desktop alone, and fits them', async ({
    page,
    isMobile,
  }) => {
    const onDesktop = Number(!isMobile)
    await visit(page)

    await startSession(page, '10')
    await waitForNote(page)

    await expect(button(page, 're')).toBeVisible()
    await expect(page.getByText(HINT, { exact: true })).toHaveCount(onDesktop)
    await expect(button(page, 're').and(page.locator('[aria-keyshortcuts="S"]'))).toHaveCount(
      onDesktop,
    )
    for (const name of ['Keyboard shortcuts', 'Close']) {
      for (const target of await button(page, name).all()) await expectTarget(target, name)
    }
    await expectTarget(button(page, 're'), 're')
    await expectNoHorizontalScroll(page)
  })
})
