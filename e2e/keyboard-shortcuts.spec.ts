import { expect, test, type Page } from '@playwright/test'
import { muteAudio } from './mute-audio'

// Feature keyboard-shortcuts, slice 1: Read notes answered by names from the keyboard of the
// computer in a real browser. A S D F G H J are the names, 1–5 the durations, Enter Check and then
// Next. The keys are pressed by their places (criterion 2), as Playwright names them by code.
// Slice 2: with Piano keyboard the same letters play the keys of the working octave, X moves it up.

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

async function waitForNote(page: Page) {
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
}

test.describe('answering from the keyboard', () => {
  // First steps alternates D4 (re) and E4 (mi) for a constant 0.
  test('runs a session of First steps from the keyboard alone', async ({ page }) => {
    await visit(page)
    await button(page, '10').click()

    for (let number = 1; number <= 10; number++) {
      await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
      await waitForNote(page)

      await page.keyboard.press(number % 2 === 1 ? 'KeyS' : 'KeyD')
      await page.keyboard.press('Enter')

      await expect(status(page)).toHaveText('Correct')
      await page.keyboard.press('Enter')
    }

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
    await expect(page.getByText('Questions: 10', { exact: true })).toBeVisible()
  })

  test('answers the name and the duration from the keyboard', async ({ page }) => {
    await visit(page, { preset: 'confident-reading', difficulty: ONE_NOTE_READING })
    await button(page, 'No limit').click()
    await waitForNote(page)
    await page.locator('h1').first().focus()

    await page.keyboard.press('KeyA')
    await page.keyboard.press('Digit1')
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')
    await expect(button(page, '1/1')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Enter')

    await expect(status(page)).toHaveText('Correct')
    await expect(page.getByText('Points: 2 of 2', { exact: true })).toBeVisible()
    await expect(button(page, 'Next')).toBeFocused()
  })

  // First steps asks D4 (re) first, on do4 to do5.
  test('answers a question with the piano keyboard from the keyboard', async ({ page }) => {
    await visitPiano(page)
    await button(page, '10').click()
    await waitForNote(page)

    await page.keyboard.press('KeyS')
    await expect(pianoKey(page, 're4')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Enter')

    await expect(status(page)).toHaveText('Correct')
  })

  test('plays do5 on the piano keyboard with X and A from the keyboard', async ({ page }) => {
    await visitPiano(page)
    await button(page, '10').click()
    await waitForNote(page)

    await page.keyboard.press('KeyX')
    await page.keyboard.press('KeyA')

    await expect(pianoKey(page, 'do5')).toHaveAttribute('aria-pressed', 'true')
    await expect(pianoKey(page, 'do4')).toHaveAttribute('aria-pressed', 'false')
  })
})
