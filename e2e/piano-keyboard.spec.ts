import { expect, test, type Locator, type Page } from '@playwright/test'
import { muteAudio } from './mute-audio'
import { changeSettings, openSettings } from './settings'
import { startSession } from './session-length'

// Feature piano-keyboard, slice 1, in a real browser (spec §16, §17): the choice Piano keyboard is
// saved; a key played is graded by its sound and octave, with the second attempt and the review;
// on a 360 px wide screen at least an octave shows, the keyboard scrolls by itself and the page
// does not, and every key takes a press of at least 44 × 44; the keyboard is one Tab stop the
// arrows move within.
//
// Only the scenarios of the computer keyboard have "keyboard" in their titles (playwright.config.ts
// picks the engines by the titles), so the others speak of the piano keys.

test.use({ locale: 'en-US' })

test.beforeEach(({ page }) => muteAudio(page))

// Confident reading with one note in 4/4, no signs, the duration asked, as on an earlier visit. With
// Math.random at 0 the questions alternate C4 (do4) and D4 (re4), whole notes.
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

const GROUP = 'Piano keyboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const noteInput = (page: Page) => page.getByRole('combobox', { name: 'Note input', exact: true })
const piano = (page: Page) => page.getByRole('group', { name: GROUP, exact: true })
const pianoKey = (page: Page, name: string) =>
  piano(page).getByRole('button', { name, exact: true })
const status = (page: Page) => page.getByRole('status')

// Math.random is 0 throughout; the preset and its difficulty are saved as on an earlier visit, the
// difficulty left to the preset when null.
async function visit(page: Page, preset = 'confident-reading', difficulty: string | null = null) {
  await page.addInitScript(
    ([savedPreset, savedDifficulty]) => {
      Math.random = () => 0
      if (localStorage.getItem('puntillo.preset') !== null) return
      localStorage.setItem('puntillo.preset', savedPreset)
      if (savedDifficulty !== null) localStorage.setItem('puntillo.difficulty', savedDifficulty)
    },
    [preset, difficulty] as const,
  )
  await page.goto('/')
}

// Note input is in the settings (feature navigation-and-settings).
async function choosePiano(page: Page, more: () => Promise<unknown> = async () => {}) {
  await changeSettings(page, async () => {
    await noteInput(page).selectOption({ label: 'Piano keyboard' })
    await more()
  })
}

async function openQuestion(page: Page) {
  await startSession(page, 'No limit')
  // Feature staff-progress-row: on a narrow screen a row may take two staves.
  await expect(staff(page).locator('svg .vf-stave').first()).toBeVisible()
  await expect(piano(page)).toBeVisible()
}

async function startOnC4(page: Page) {
  await visit(page, 'confident-reading', ONE_NOTE_READING)
  await choosePiano(page)
  await openQuestion(page)
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// The keys in order, each with its visible label: the black keys have none.
async function keysOf(page: Page) {
  const keys = piano(page).getByRole('button')
  const count = await keys.count()
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const each = keys.nth(index)
      // On a desktop a key also shows the letter that plays it, hidden from its name: no label.
      const label = await each.evaluate((element) => {
        const copy = element.cloneNode(true) as HTMLElement
        for (const caption of copy.querySelectorAll('[aria-hidden="true"]')) caption.remove()
        return copy.textContent?.trim() ?? ''
      })
      return {
        name: label || `black key ${index + 1}`,
        black: label === '',
        box: await boxOf(each),
      }
    }),
  )
}

// The place of the focus among the keys, -1 outside them.
const focusedKey = (page: Page) =>
  piano(page)
    .getByRole('button')
    .evaluateAll((keys) => keys.indexOf(document.activeElement as HTMLElement))

test.describe('choosing the piano keys', () => {
  test('keeps the piano keys chosen over a reload', async ({ page }) => {
    await visit(page)

    await choosePiano(page)
    await page.reload()
    await openSettings(page)

    await expect(noteInput(page).locator('option:checked')).toHaveText('Piano keyboard')
  })
})

test.describe('answering on the piano keys', () => {
  test('says Correct for the key of the note', async ({ page }) => {
    await startOnC4(page)

    await pianoKey(page, 'do4').click()
    await button(page, '1/1').click()
    await button(page, 'Check').click()

    await expect(status(page)).toHaveText('Correct')
  })

  test('gives a second attempt for the key an octave off, then the review', async ({ page }) => {
    await startOnC4(page)

    await pianoKey(page, 'do5').click()
    await button(page, '1/1').click()
    await button(page, 'Check').click()

    await expect(status(page)).toHaveText('Incorrect. Try again.')
    await expect(pianoKey(page, 'do5')).toBeDisabled()

    await pianoKey(page, 're4').click()
    await button(page, 'Check').click()

    await expect(status(page)).toContainText(
      'You played re4. This is do4: the note on the first ledger line below the staff.',
    )
  })
})

// Feature piano-keyboard, slice 3, criterion 17: the key of the same sound in another octave is a
// mistake of the octave, its Why? leading to the article on the piano keyboard.
test.describe('the review of a piano key an octave off', () => {
  const atOnce = (page: Page) =>
    page.getByRole('checkbox', { name: 'Show the right answer at once', exact: true })
  const TITLE = 'The piano keyboard'

  test('leads by its Why? to the hint and the article on the piano keyboard', async ({ page }) => {
    await visit(page, 'confident-reading', ONE_NOTE_READING)
    await choosePiano(page, () => atOnce(page).check())
    await openQuestion(page)

    await pianoKey(page, 'do5').click()
    await button(page, '1/1').click()
    await button(page, 'Check').click()
    await expect(status(page)).toContainText(
      'You played do5. This is do4: the note on the first ledger line below the staff.',
    )
    await button(page, 'Why?').click()

    const hint = page.getByRole('dialog', { name: TITLE, exact: true })
    await expect(hint).toBeVisible()
    await hint.getByRole('link', { name: 'Read the article', exact: true }).click()

    await expect(page).toHaveURL(/\/wiki\/piano-keyboard$/)
    await expect(page.getByRole('heading', { level: 1, name: TITLE, exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('img').first()).toBeVisible()
    await page
      .getByRole('link', { name: 'Back to the question', exact: true })
      .or(button(page, 'Back to the question'))
      .click()

    await expect(piano(page)).toBeVisible()
  })
})

test.describe('the piano keys on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  // Advanced spans G3 to D6, wider than the screen.
  async function startAdvanced(page: Page) {
    await visit(page, 'advanced')
    await choosePiano(page)
    await openQuestion(page)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
  }

  test('shows at least an octave: seven white keys whole on the screen', async ({ page }) => {
    await startAdvanced(page)

    const whole = (await keysOf(page)).filter(
      ({ black, box }) => !black && box.x >= -0.5 && box.x + box.width <= 360 + 0.5,
    )
    expect(whole.length).toBeGreaterThanOrEqual(7)
  })

  test('scrolls the keys, not the page', async ({ page }) => {
    await startAdvanced(page)

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    const keys = await keysOf(page)
    const right = Math.max(...keys.map(({ box }) => box.x + box.width))
    expect(right).toBeGreaterThan(360)
  })

  // Layout is fractional: Firefox reports 2.75rem as 43.99997px, which is still a 44px target.
  test('gives every key a press of at least 44 × 44', async ({ page }) => {
    await startAdvanced(page)

    const keys = await keysOf(page)
    for (const { name, box } of keys) {
      expect(box.width, `width of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
      expect(box.height, `height of ${name}`).toBeGreaterThanOrEqual(44 - 0.01)
    }
  })

  test('leaves at least 44 px of each white key below the black keys', async ({ page }) => {
    await startAdvanced(page)

    const keys = await keysOf(page)
    const blackBottom = Math.max(
      ...keys.filter(({ black }) => black).map(({ box }) => box.y + box.height),
    )
    for (const { name, box } of keys.filter(({ black }) => !black))
      expect(box.y + box.height - blackBottom, `lower part of ${name}`).toBeGreaterThanOrEqual(
        44 - 0.01,
      )
  })
})

// Feature design-system, slice 2, criterion 14: on a narrow screen each new question scrolls the
// keys so that the working octave, the one the letters of the computer keyboard play, shows whole:
// for one note C4–G5 it is octave 4, do4 to si4, whatever the question and wherever the keys were
// scrolled before.
test.describe('the working octave of the piano keys on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  type RandomWindow = Window & { puntilloRandom: number }

  // The first question is C4; at 0.9 the next ones are F5 and E5, in the octave above.
  async function startOnKeys(page: Page) {
    await page.addInitScript((difficulty) => {
      const random = window as unknown as RandomWindow
      random.puntilloRandom = 0
      Math.random = () => random.puntilloRandom
      if (localStorage.getItem('puntillo.preset') !== null) return
      localStorage.setItem('puntillo.preset', 'confident-reading')
      localStorage.setItem('puntillo.difficulty', difficulty)
    }, ONE_NOTE_READING)
    await page.goto('/')
    await choosePiano(page, () =>
      page.getByRole('checkbox', { name: 'Show the right answer at once', exact: true }).check(),
    )
    await openQuestion(page)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
  }

  // Left and right edges of the key within the part of the keys in view, negative when cut off.
  async function marginsOf(page: Page, name: string) {
    const view = await boxOf(piano(page))
    const key = await boxOf(pianoKey(page, name))
    const left = Math.max(view.x, 0)
    const right = Math.min(view.x + view.width, 360)
    return { left: key.x - left, right: right - (key.x + key.width) }
  }

  async function expectOctaveInView(page: Page, question: number) {
    await expect
      .poll(async () => (await marginsOf(page, 'do4')).left, {
        message: `do4 on question ${question}`,
      })
      .toBeGreaterThanOrEqual(-0.5)
    await expect
      .poll(async () => (await marginsOf(page, 'si4')).right, {
        message: `si4 on question ${question}`,
      })
      .toBeGreaterThanOrEqual(-0.5)
  }

  test('shows do4 to si4 on each new question, wherever the keys were scrolled', async ({
    page,
  }) => {
    await startOnKeys(page)

    for (let question = 1; question <= 3; question++) {
      await expectOctaveInView(page, question)
      // The user scrolls the keys away to the top of the keyboard.
      await piano(page).evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await pianoKey(page, 'sol5').click()
      await button(page, '1/1').click()
      await button(page, 'Check').click()
      await expect(button(page, 'Next')).toBeVisible()
      await page.evaluate(() => {
        ;(window as unknown as RandomWindow).puntilloRandom = 0.9
      })
      await button(page, 'Next').click()
      // Feature staff-progress-row: the notes passed in the row stand left of the new one.
      await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(question + 1)
    }
    await expectOctaveInView(page, 4)
  })
})

test.describe('the piano keys from the computer keyboard', () => {
  async function tabToPiano(page: Page) {
    for (let presses = 0; presses < 40; presses++) {
      await page.keyboard.press('Tab')
      if ((await focusedKey(page)) !== -1) return
    }
    throw new Error('Tab does not reach the piano keys')
  }

  test('Tab reaches the keys, the arrows move between them and Enter plays one', async ({
    page,
  }) => {
    await startOnC4(page)

    await tabToPiano(page)
    const first = await focusedKey(page)
    await page.keyboard.press('ArrowRight')
    const second = await focusedKey(page)
    await page.keyboard.press('ArrowLeft')
    const back = await focusedKey(page)

    expect(second).toBe(first + 1)
    expect(back).toBe(first)

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(piano(page).getByRole('button').nth(second)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('Space plays the key in focus', async ({ page }) => {
    await startOnC4(page)

    await tabToPiano(page)
    await page.keyboard.press('Space')

    await expect(piano(page).locator('[aria-pressed="true"]')).toHaveCount(1)
  })

  test('the keys are one Tab stop: the next Tab leaves them', async ({ page }) => {
    await startOnC4(page)

    await tabToPiano(page)
    await page.keyboard.press('Tab')

    expect(await focusedKey(page)).toBe(-1)
  })
})
