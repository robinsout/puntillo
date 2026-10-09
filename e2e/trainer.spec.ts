import { expect, test, type Locator, type Page } from '@playwright/test'

// Math.random picks the note, so it is replaced before the page loads. The value is constant
// within a step, so unrelated calls (VexFlow, Vite) do not shift the sequence. The first note
// is one of eight C4–C5 by floor(x × 8), each next one of the other seven by floor(x × 7).
// With x = 0 questions alternate: C4 (do), D4 (re), C4…

const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']
const DURATION_BUTTONS = ['Whole note', 'Half note', 'Quarter note', 'Eighth note']

const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

// The duration is whole, half, quarter or eighth by floor(x × 4), so x = 0 keeps every note
// whole. Feature duration-input, slice 2: the answer is a name and a duration.
async function chooseDuration(page: Page, name = 'Whole note') {
  await button(page, name).click()
}
const autoNext = (page: Page) =>
  page.getByRole('checkbox', { name: 'Open next question automatically' })

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

// Clicking the label toggles a checkbox or a radio, so either one is its hit area; the largest
// one counts.
function largestTargetOf(checkbox: Locator) {
  return checkbox.evaluate((input: HTMLInputElement) => {
    const labels = [...(input.labels ?? [])]
    const boxes = [input, ...labels].map((target) => {
      const { x, width, height } = target.getBoundingClientRect()
      return { x, width, height }
    })
    boxes.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))
    return { name: labels[0]?.textContent?.trim(), largest: boxes[0] }
  })
}

// WebKit on macOS tabs only through form fields; buttons need Option+Tab.
async function tabTo(page: Page, browserName: string, control: string | Locator) {
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  const target = typeof control === 'string' ? button(page, control) : control
  const name = typeof control === 'string' ? control : String(control)
  // blur() keeps the sequential focus navigation starting point on the old element in Firefox, so Tab runs past the last control and leaves the page; focusing the screen heading (tabindex=-1, before all controls) restarts the walk in every engine.
  await page.locator('h1').first().focus()
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press(key)
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`"${name}" is not reachable with Tab`)
}

type RandomWindow = Window & { puntilloRandom: number }

async function fixRandom(page: Page, value: number) {
  await page.addInitScript((initial) => {
    const random = window as unknown as RandomWindow
    random.puntilloRandom = initial
    Math.random = () => random.puntilloRandom
  }, value)
}

async function setRandom(page: Page, value: number) {
  await page.evaluate((next) => {
    ;(window as unknown as RandomWindow).puntilloRandom = next
  }, value)
}

// A step is half a staff space: E4 → 0, C4 → −2, G4 → 2, C5 → 5.
function noteStepAboveBottomLine(page: Page) {
  return staff(page)
    .locator('svg')
    .evaluate((svg) => {
      const lines = [...svg.querySelectorAll('.vf-stave path')]
        .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
        .filter((y): y is string => y !== undefined)
        .map(Number)
        .sort((a, b) => a - b)
      const [top, second] = lines
      const bottom = lines.at(-1)
      const head = svg.querySelector('.vf-notehead text')
      if (top === undefined || second === undefined || bottom === undefined || !head) {
        throw new Error('staff or notehead not rendered')
      }
      const halfSpace = (second - top) / 2
      return Math.round((bottom - Number(head.getAttribute('y'))) / halfSpace)
    })
}

// Defaults to No limit so that trainer checks never run out of questions.
async function openTrainer(page: Page, length = 'No limit') {
  await page.goto('/')
  await button(page, length).click()
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  // VexFlow measures glyph widths with the Bravura font, so the layout is right only once it loads.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

// Assertions use English texts, and WebKit without a locale falls back to the system language.
test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  await fixRandom(page, 0)
})

test.describe('trainer', () => {
  test('draws a staff with a treble clef, a time signature and one note', async ({ page }) => {
    await openTrainer(page)

    const svg = staff(page).locator('svg')
    await expect(svg).toHaveCount(1)
    await expect(svg.locator('.vf-stave')).toHaveCount(1)
    await expect(svg.locator('.vf-clef')).toHaveCount(1)
    await expect(svg.locator('.vf-timesignature')).toHaveCount(1)
    await expect(svg.locator('.vf-stavenote')).toHaveCount(1)
    await expect(svg.locator('.vf-notehead')).toHaveCount(1)
  })

  test('places the note to the right of the clef and the time signature', async ({ page }) => {
    await openTrainer(page)

    const svg = staff(page).locator('svg')
    const clef = await boxOf(svg.locator('.vf-clef'))
    const time = await boxOf(svg.locator('.vf-timesignature'))
    const head = await boxOf(svg.locator('.vf-notehead'))
    const drawing = await boxOf(svg)

    // Widths are zero until the Bravura font loads.
    expect(clef.width).toBeGreaterThan(0)
    expect(time.width).toBeGreaterThan(0)
    expect(head.width).toBeGreaterThan(0)
    expect(time.x).toBeGreaterThanOrEqual(clef.x + clef.width)
    expect(head.x).toBeGreaterThanOrEqual(time.x + time.width)
    expect(head.x + head.width).toBeLessThanOrEqual(drawing.x + drawing.width)
  })

  test('names the page Puntillo', async ({ page }) => {
    await openTrainer(page)

    await expect(page).toHaveTitle('Puntillo')
  })

  test('moves the focus to Next after Check and back to Check after Next', async ({
    page,
    browserName,
  }) => {
    await openTrainer(page)

    await tabTo(page, browserName, 'do')
    await page.keyboard.press('Enter')
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')
    await tabTo(page, browserName, 'Whole note')
    await page.keyboard.press('Enter')
    await expect(button(page, 'Whole note')).toHaveAttribute('aria-pressed', 'true')
    await tabTo(page, browserName, 'Check')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(button(page, 'Check')).toBeFocused()
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows seven note name buttons from do to si', async ({ page }) => {
    await openTrainer(page)

    for (const name of NAMES) {
      await expect(button(page, name)).toBeVisible()
    }
  })

  test('grades answers and moves to the next question', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')

    await button(page, 'do').click()
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Check')).toHaveCount(0)

    await button(page, 'Next').click()
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'false')
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    // The second question is D4. Feature mistake-review: a wrong answer gives a second try.
    await button(page, 'mi').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect. Try again.')
    await expect(button(page, 'Check')).toBeVisible()
    await expect(button(page, 'Next')).toHaveCount(0)
  })

  test('disables the note name buttons after Check and enables them after Next', async ({
    page,
  }) => {
    await openTrainer(page)

    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'true')

    await button(page, 'Next').click()
    for (const name of NAMES) {
      await expect(button(page, name)).toBeEnabled()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  test('asks to choose a note name and a duration when checking without them', async ({ page }) => {
    await openTrainer(page)

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Choose a note name and a duration')
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
    await expect(button(page, 'Check')).toBeVisible()
  })

  test('makes every interactive element at least 44 by 44 CSS pixels', async ({ page }) => {
    await openTrainer(page)
    // In the Next state the name buttons are disabled but still visible, so they are measured too.
    // C4: re and mi are wrong, so the second attempt and then the explanation are measured.
    const states = [
      async () => {},
      async () => {
        await button(page, 're').click()
        await chooseDuration(page)
        await button(page, 'Check').click()
        await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
      },
      async () => {
        await button(page, 'mi').click()
        await button(page, 'Check').click()
        await expect(button(page, 'Next')).toBeVisible()
      },
    ]

    for (const enter of states) {
      await enter()
      // Checkboxes are measured separately below: their hit area includes the label.
      const controls = page
        .locator(
          'button, a[href], input:not([type="checkbox"], [type="radio"]), select, textarea, [role="button"]',
        )
        .filter({ visible: true })
      const count = await controls.count()
      expect(count).toBeGreaterThanOrEqual(NAMES.length + 1)
      for (let index = 0; index < count; index++) {
        const control = controls.nth(index)
        const box = await boxOf(control)
        const label = (await control.textContent())?.trim()
        expectTargetSize(box, `"${label}"`)
      }

      // Clicking the label toggles the checkbox, so either one is the hit area:
      // at least one of them must be a solid 44×44 box.
      await expect(autoNext(page)).toBeVisible()
      const checkboxes = page
        .locator('input[type="checkbox"], input[type="radio"]')
        .filter({ visible: true })
      const checkboxCount = await checkboxes.count()
      expect(checkboxCount).toBeGreaterThanOrEqual(1)
      for (let index = 0; index < checkboxCount; index++) {
        const checkbox = checkboxes.nth(index)
        const { name, largest } = await largestTargetOf(checkbox)
        expectTargetSize(largest, `the "${name}" box`)
      }
    }
  })
})

test.describe('opening the next question automatically', () => {
  test('is off when the trainer opens', async ({ page }) => {
    await openTrainer(page)

    await expect(autoNext(page)).toBeVisible()
    await expect(autoNext(page)).not.toBeChecked()
  })

  // Feature one-tap-answer: with the box ticked one press of a name is one answer.
  test('opens a new note at once when a note name is pressed while ticked', async ({ page }) => {
    // 0.5 → G4 (5th of eight); 0.9 → C5 (7th of the seven without G4); 0 → C4 (1st without C5).
    await fixRandom(page, 0.5)
    await openTrainer(page)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(2)
    const status = page.getByRole('status')

    await autoNext(page).check()
    await expect(button(page, 'Check')).toHaveCount(0)
    await setRandom(page, 0.9)
    await chooseDuration(page, 'Quarter note')
    await button(page, 'sol').click()

    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(5)
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect(button(page, 'Next')).toHaveCount(0)
    for (const name of NAMES) {
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
      await expect(button(page, name)).toBeEnabled()
    }
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect(autoNext(page)).toBeChecked()
  })

  test('opens the next note at once when ticked on a shown result', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(button(page, 'Next')).toBeVisible()

    await autoNext(page).check()

    // C4 → D4.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect(button(page, 'Check')).toHaveCount(0)
  })

  // Criterion 8: unticked mid-question, the question goes on with Check and no old result.
  test('shows Check and an empty message when unticked after a quick answer', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    await autoNext(page).check()
    await chooseDuration(page)
    await button(page, 'do').click()
    await expect(status).toHaveText('Correct')

    await autoNext(page).uncheck()

    await expect(button(page, 'Check')).toBeVisible()
    await expect(status).toHaveText('')
    await expect(button(page, 'Next')).toHaveCount(0)
    // C4 → D4: still the question opened by the quick answer.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
  })

  test('waits for Next when not ticked', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')

    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(status).toHaveText('Correct')

    // eslint-disable-next-line playwright/no-wait-for-timeout -- no event marks a missing transition; wait twice the removed 1.5 s pause
    await page.waitForTimeout(3000)

    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeVisible()
    await expect(button(page, 'Check')).toHaveCount(0)
  })

  // Feature language-and-naming, criterion 8.
  test('is kept after a reload, answering with one press', async ({ page }) => {
    await openTrainer(page)
    await autoNext(page).check()

    await page.reload()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    await expect(autoNext(page)).toBeChecked()
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await chooseDuration(page)
    await button(page, 'do').click()
    // C4 → D4.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(page.getByRole('status')).toHaveText('Correct')
  })

  test('stays unticked after a reload once unticked again', async ({ page }) => {
    await openTrainer(page)
    await autoNext(page).check()
    await autoNext(page).uncheck()

    await page.reload()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    await expect(autoNext(page)).not.toBeChecked()
    await expect(button(page, 'Check')).toBeVisible()
  })
})

test.describe('trainer questions', () => {
  test('draws a note of another pitch after each Next, at its place on the staff', async ({
    page,
  }) => {
    // 0.5 → G4 (5th of eight); 0.9 → C5 (7th of the seven without G4); 0 → C4 (1st without C5).
    // Init scripts run in order, so this value overrides the 0 from beforeEach.
    await fixRandom(page, 0.5)
    await openTrainer(page)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(2)

    await setRandom(page, 0.9)
    await button(page, 'sol').click()
    await chooseDuration(page, 'Quarter note')
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    await button(page, 'Next').click()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(5)

    await setRandom(page, 0)
    await button(page, 'do').click()
    await chooseDuration(page, 'Eighth note')
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    await button(page, 'Next').click()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  })
})

test.describe('trainer on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the staff without horizontal scrolling', async ({ page }) => {
    await openTrainer(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const drawing = await boxOf(staff(page).locator('svg'))
    expect(drawing.x).toBeGreaterThanOrEqual(0)
    expect(drawing.x + drawing.width).toBeLessThanOrEqual(360)
  })

  test('fits the automatic next question box without horizontal scrolling', async ({ page }) => {
    await openTrainer(page)
    const states = [
      async () => {},
      async () => {
        await button(page, 'do').click()
        await chooseDuration(page)
        await button(page, 'Check').click()
        await expect(button(page, 'Next')).toBeVisible()
      },
    ]

    for (const enter of states) {
      await enter()
      await expect(autoNext(page)).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      const box = await boxOf(autoNext(page))
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
    }
  })
})

// Feature duration-input, slice 1. The duration is whole, half, quarter or eighth by
// floor(x × 4), so x = 0 keeps the whole note on C4 that the tests above rely on.
const SMUFL = { noteheadWhole: '\uE0A2', noteheadHalf: '\uE0A3', noteheadBlack: '\uE0A4' }

const DURATIONS = [
  {
    random: 0,
    note: 'a whole note on C4',
    step: -2,
    head: SMUFL.noteheadWhole,
    stems: 0,
    flags: 0,
  },
  { random: 0.3, note: 'a half note on E4', step: 0, head: SMUFL.noteheadHalf, stems: 1, flags: 0 },
  {
    random: 0.6,
    note: 'a quarter note on G4',
    step: 2,
    head: SMUFL.noteheadBlack,
    stems: 1,
    flags: 0,
  },
  {
    random: 0.9,
    note: 'an eighth note on C5',
    step: 5,
    head: SMUFL.noteheadBlack,
    stems: 1,
    flags: 1,
  },
]

test.describe('note durations', () => {
  for (const { random, note, step, head, stems, flags } of DURATIONS) {
    test(`draws ${note} alone in the bar when the source gives ${random}`, async ({ page }) => {
      await fixRandom(page, random)
      await openTrainer(page)

      const svg = staff(page).locator('svg')
      await expect(svg.locator('.vf-stavenote')).toHaveCount(1)
      await expect(svg.locator('.vf-notehead text')).toHaveText([head])
      await expect(svg.locator('.vf-stem')).toHaveCount(stems)
      await expect(svg.locator('.vf-flag')).toHaveCount(flags)
      await expect.poll(() => noteStepAboveBottomLine(page)).toBe(step)
    })
  }

  test.describe('on a 360 px wide screen', () => {
    test.use({ viewport: { width: 360, height: 640 } })

    test('fits an eighth note with its stem and flag without horizontal scrolling', async ({
      page,
    }) => {
      await fixRandom(page, 0.9)
      await openTrainer(page)
      const svg = staff(page).locator('svg')
      await expect(svg.locator('.vf-flag')).toHaveCount(1)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)

      const drawing = await boxOf(svg)
      expect(drawing.x).toBeGreaterThanOrEqual(0)
      expect(drawing.x + drawing.width).toBeLessThanOrEqual(360)
      for (const part of ['.vf-notehead', '.vf-stem', '.vf-flag']) {
        const box = await boxOf(svg.locator(part))
        expect(box.width, `width of ${part}`).toBeGreaterThan(0)
        expect(box.x, `left of ${part}`).toBeGreaterThanOrEqual(drawing.x - 0.5)
        expect(box.x + box.width, `right of ${part}`).toBeLessThanOrEqual(
          drawing.x + drawing.width + 0.5,
        )
      }
    })
  })
})

// With Math.random = 0 odd questions are C4 (do is correct), even ones D4 (do is wrong).

const choiceHeading = (page: Page) => page.getByRole('heading', { name: 'How many questions?' })
const LENGTHS = ['10', '20', '50', 'No limit']

async function expectAtRoot(page: Page) {
  const url = new URL(page.url())
  expect(url.pathname + url.search + url.hash).toBe('/')
}

async function expectProgress(page: Page, checked: number) {
  // Odd questions are the correct ones, so the streak is 1 after an odd one and 0 after an even.
  // The duration is always right, so a wrong name still earns the point of the duration.
  const correct = Math.ceil(checked / 2)
  const points = 2 * correct + (checked - correct)
  const streak = checked % 2
  await expect(page.getByText(`Points: ${points} of ${2 * checked}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`Streak: ${streak}`, { exact: true })).toBeVisible()
}

// Five odd questions are correct. Stops on the last checked question, where Results is shown.
async function answerTenQuestionsWithDo(page: Page) {
  const status = page.getByRole('status')
  for (let number = 1; number <= 10; number++) {
    await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
    await expectProgress(page, number - 1)
    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(status).toHaveText(number % 2 === 1 ? 'Correct' : 'Incorrect. Try again.')
    await expectProgress(page, number)
    if (number % 2 === 0) {
      // D4: the second attempt is wrong again, which does not change the score.
      await button(page, 'mi').click()
      await button(page, 'Check').click()
      await expect(status).toHaveText('You chose mi. This is re: the note just below the staff.')
      await expectProgress(page, number)
    }
    if (number < 10) await button(page, 'Next').click()
  }
}

// In the quick mode do on D4 is a wrong first press; re then is right on the second try.
async function answerQuicklyWithDo(page: Page, number: number) {
  await chooseDuration(page)
  await button(page, 'do').click()
  if (number % 2 === 0) {
    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
    await button(page, 're').click()
  }
}

async function expectFitsNarrowScreen(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const controls = page
    .locator(
      'button, a[href], input:not([type="checkbox"], [type="radio"]), select, textarea, [role="button"]',
    )
    .filter({ visible: true })
  const count = await controls.count()
  expect(count).toBeGreaterThanOrEqual(1)
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index)
    const box = await boxOf(control)
    const label = (await control.textContent())?.trim()
    expectTargetSize(box, `"${label}"`)
    expect(box.x, `left edge of "${label}"`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `right edge of "${label}"`).toBeLessThanOrEqual(360)
  }
  const checkboxes = page
    .locator('input[type="checkbox"], input[type="radio"]')
    .filter({ visible: true })
  const checkboxCount = await checkboxes.count()
  for (let index = 0; index < checkboxCount; index++) {
    const { name, largest } = await largestTargetOf(checkboxes.nth(index))
    expectTargetSize(largest, `the "${name}" box`)
    expect(largest?.x, `left edge of the "${name}" box`).toBeGreaterThanOrEqual(0)
    expect(
      (largest?.x ?? 0) + (largest?.width ?? 0),
      `right edge of the "${name}" box`,
    ).toBeLessThanOrEqual(360)
  }
}

test.describe('a session', () => {
  test('starts with the choice of four lengths and no question', async ({ page }) => {
    await page.goto('/')

    await expect(choiceHeading(page)).toBeVisible()
    for (const length of LENGTHS) {
      await expect(button(page, length)).toBeVisible()
    }
    await expect(staff(page)).toHaveCount(0)
    await expect(button(page, 'Check')).toHaveCount(0)
    await expectAtRoot(page)
  })

  test('shows the question number above the staff', async ({ page }) => {
    await openTrainer(page, '10')

    const number = page.getByText('Question 1 of 10', { exact: true })
    await expect(number).toBeVisible()
    await expect(choiceHeading(page)).toHaveCount(0)
    const numberBox = await boxOf(number)
    const staffBox = await boxOf(staff(page))
    expect(numberBox.y + numberBox.height).toBeLessThanOrEqual(staffBox.y)
    await expectAtRoot(page)
  })

  test('shows "Question 1" without a limit', async ({ page }) => {
    await openTrainer(page)

    await expect(page.getByText('Question 1', { exact: true })).toBeVisible()
  })

  test('goes through 10 questions to the results and back to the choice', async ({ page }) => {
    await openTrainer(page, '10')

    await answerTenQuestionsWithDo(page)
    await expect(button(page, 'Next')).toHaveCount(0)
    const results = button(page, 'Results')
    await expect(results).toBeVisible()
    const box = await boxOf(results)
    expectTargetSize(box, '"Results"')

    await results.click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
    await expect(page.getByText('Accuracy: 75% (15 of 20 points)', { exact: true })).toBeVisible()
    await expect(page.getByText('Questions: 10', { exact: true })).toBeVisible()
    await expect(page.getByText('Best streak: 1', { exact: true })).toBeVisible()
    // Real time varies between runs, so only the format is checked, with the non-breaking space.
    await expect(page.getByText(/^Average time: \d+\.\d\u00A0s$/)).toBeVisible()
    await expect(staff(page)).toHaveCount(0)
    await expectAtRoot(page)

    await button(page, 'New session').click()
    await expect(choiceHeading(page)).toBeVisible()
    for (const length of LENGTHS) {
      await expect(button(page, length)).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Results' })).toHaveCount(0)
    await expectAtRoot(page)
  })

  test('goes through 10 quick answers straight to the results', async ({ page }) => {
    await openTrainer(page, '10')
    await autoNext(page).check()
    const status = page.getByRole('status')

    // Even questions are D4: do is wrong, and re on the second try opens the next note.
    for (let number = 1; number < 10; number++) {
      await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
      await expectProgress(page, number - 1)
      await answerQuicklyWithDo(page, number)
      await expect(status).toHaveText(number % 2 === 1 ? 'Correct' : 'Correct on the second try')
    }
    await expect(page.getByText('Question 10 of 10', { exact: true })).toBeVisible()
    await expectProgress(page, 9)

    await answerQuicklyWithDo(page, 10)

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
    await expect(page.getByText('Accuracy: 75% (15 of 20 points)', { exact: true })).toBeVisible()
    await expect(page.getByText('Questions: 10', { exact: true })).toBeVisible()
    await expect(page.getByText('Best streak: 1', { exact: true })).toBeVisible()
    await expect(page.getByText(/^Average time: \d+\.\d\u00A0s$/)).toBeVisible()
    await expect(button(page, 'Results')).toHaveCount(0)
    await expect(staff(page)).toHaveCount(0)
  })

  // Feature decision 2026-10-08: no answer before the note is drawn, so loading is not timed.
  test('shows the answer buttons only once the staff has drawn the note', async ({ page }) => {
    await page.goto('/')
    // Records, in the page, whether the note was on the staff when each button first appeared.
    await page.evaluate(() => {
      const seen: Record<string, boolean> = {}
      ;(window as unknown as { puntilloButtonsSeen: Record<string, boolean> }).puntilloButtonsSeen =
        seen
      const record = () => {
        const drawn = document.querySelector('.vf-stavenote') !== null
        for (const element of document.querySelectorAll('button')) {
          const name = element.textContent?.trim() || element.getAttribute('aria-label') || ''
          if (!(name in seen)) seen[name] = drawn
        }
      }
      new MutationObserver(record).observe(document.body, { childList: true, subtree: true })
    })

    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect(button(page, 'do')).toBeVisible()
    await expect(button(page, 'Check')).toBeVisible()

    const seen = await page.evaluate(
      () =>
        (window as unknown as { puntilloButtonsSeen: Record<string, boolean> }).puntilloButtonsSeen,
    )
    for (const name of [...NAMES, ...DURATION_BUTTONS, 'Check']) {
      expect(seen[name], `"${name}" appeared before the note was drawn`).toBe(true)
    }
  })

  test('is lost on a reload: the choice of length opens again', async ({ page }) => {
    await openTrainer(page, '10')
    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    await expect(page.getByText('Question 2 of 10', { exact: true })).toBeVisible()

    await page.reload()

    await expect(choiceHeading(page)).toBeVisible()
    await expect(staff(page)).toHaveCount(0)
    await expect(page.getByText(/^Question \d+/)).toHaveCount(0)
  })
})

test.describe('a session with the keyboard', () => {
  const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

  test('moves the focus to the question heading when started with the keyboard', async ({
    page,
    browserName,
  }) => {
    await page.goto('/')
    await expect(h1(page, 'How many questions?')).toBeVisible()
    await expect(autoNext(page)).toHaveCount(0)

    await tabTo(page, browserName, '10')
    await page.keyboard.press('Enter')

    await expect(h1(page, 'Name the note')).toBeFocused()
  })

  test('keeps the focus on the pressed note name in the quick mode', async ({
    page,
    browserName,
  }) => {
    await openTrainer(page, '10')
    const status = page.getByRole('status')
    await autoNext(page).check()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await chooseDuration(page)
    await tabTo(page, browserName, 'do')
    await page.keyboard.press('Enter')

    // C4 → D4: do was correct, and the focus stays for the next answer.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'do')).toBeFocused()
  })

  test('moves the focus to the results heading after the last quick answer', async ({ page }) => {
    await openTrainer(page, '10')
    await autoNext(page).check()
    for (let number = 1; number < 10; number++) {
      await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
      await chooseDuration(page)
      await button(page, number % 2 === 1 ? 'do' : 're').click()
    }
    await expect(page.getByText('Question 10 of 10', { exact: true })).toBeVisible()

    // Question 10 is D4.
    await chooseDuration(page)
    await button(page, 're').focus()
    await page.keyboard.press('Enter')

    await expect(h1(page, 'Results')).toBeFocused()
  })

  test('moves the focus to the results heading and then to the choice heading', async ({
    page,
  }) => {
    await openTrainer(page, '10')
    await answerTenQuestionsWithDo(page)
    await expect(button(page, 'Results')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(h1(page, 'Results')).toBeFocused()
    await expect(autoNext(page)).toHaveCount(0)

    await button(page, 'New session').focus()
    await page.keyboard.press('Enter')
    await expect(h1(page, 'How many questions?')).toBeFocused()
  })
})

test.describe('a session on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the choice of length with large enough buttons', async ({ page }) => {
    await page.goto('/')
    await expect(choiceHeading(page)).toBeVisible()

    await expectFitsNarrowScreen(page)
  })

  test('fits the question number, "Correct" and the streak without horizontal scrolling', async ({
    page,
  }) => {
    await openTrainer(page, '10')
    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()

    const texts = ['Question 1 of 10', 'Points: 2 of 2', 'Streak: 1']
    for (const text of texts) {
      const box = await boxOf(page.getByText(text, { exact: true }))
      expect(box.x, `left edge of "${text}"`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `right edge of "${text}"`).toBeLessThanOrEqual(360)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('fits the results with large enough buttons', async ({ page }) => {
    await openTrainer(page, '10')
    await answerTenQuestionsWithDo(page)
    await button(page, 'Results').click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()

    await expectFitsNarrowScreen(page)
  })
})

// Questions 1 and 3 are C4 (do is right), question 2 is D4 (do is wrong): 2 of 3.
async function checkThreeQuestionsWithDo(page: Page) {
  for (let number = 1; number <= 3; number++) {
    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    if (number === 2) {
      await button(page, 'mi').click()
      await button(page, 'Check').click()
    }
    await expect(button(page, 'Next')).toBeVisible()
    if (number < 3) await button(page, 'Next').click()
  }
  await expectProgress(page, 3)
}

test.describe('finishing a session early', () => {
  const resultsHeading = (page: Page) => page.getByRole('heading', { name: 'Results' })

  test('opens the results of the checked questions without a limit and starts anew', async ({
    page,
  }) => {
    await openTrainer(page)
    await expect(button(page, 'Finish')).toBeVisible()
    await checkThreeQuestionsWithDo(page)

    await button(page, 'Finish').click()

    await expect(resultsHeading(page)).toBeVisible()
    await expect(page.getByText('Accuracy: 83% (5 of 6 points)', { exact: true })).toBeVisible()
    await expect(page.getByText('Questions: 3', { exact: true })).toBeVisible()
    await expect(page.getByText('Best streak: 1', { exact: true })).toBeVisible()
    await expect(staff(page)).toHaveCount(0)
    await expect(button(page, 'Finish')).toHaveCount(0)
    await expectAtRoot(page)

    await button(page, 'New session').click()
    await expect(choiceHeading(page)).toBeVisible()
  })

  test('opens the choice of length when nothing is checked', async ({ page }) => {
    await openTrainer(page, '10')

    await button(page, 'Finish').click()

    await expect(choiceHeading(page)).toBeVisible()
    await expect(resultsHeading(page)).toHaveCount(0)
    await expect(staff(page)).toHaveCount(0)
    await expectAtRoot(page)
  })
})

test.describe('finishing a session early with the keyboard', () => {
  const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

  test('moves the focus to the results heading', async ({ page, browserName }) => {
    await openTrainer(page)
    await checkThreeQuestionsWithDo(page)

    await tabTo(page, browserName, 'Finish')
    await page.keyboard.press('Enter')

    await expect(h1(page, 'Results')).toBeFocused()
  })

  test('moves the focus to the choice heading when nothing is checked', async ({
    page,
    browserName,
  }) => {
    await openTrainer(page, '10')

    await tabTo(page, browserName, 'Finish')
    await page.keyboard.press('Enter')

    await expect(h1(page, 'How many questions?')).toBeFocused()
  })
})

test.describe('finishing a session early on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits Finish below the box, large enough, without horizontal scrolling', async ({
    page,
  }) => {
    await openTrainer(page, '10')
    const states = [
      async () => {},
      async () => {
        await button(page, 'do').click()
        await chooseDuration(page)
        await button(page, 'Check').click()
        await expect(button(page, 'Next')).toBeVisible()
      },
    ]

    for (const enter of states) {
      await enter()
      const finish = button(page, 'Finish')
      await expect(finish).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)

      const box = await boxOf(finish)
      expectTargetSize(box, '"Finish"')
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)

      // The box is measured with its label, which is its visible extent.
      const label = await boxOf(page.locator('label').filter({ has: autoNext(page) }))
      expect(box.y).toBeGreaterThanOrEqual(label.y + label.height)
    }
  })
})

// Feature mistake-review, slice 1: the second attempt and the explanation in the normal mode.
// With Math.random = 0 the first note is C4 (do), the second D4 (re).

// A mark must not rest on colour alone, so only properties of shape are compared.
const SHAPE = [
  'border-top-width',
  'border-top-style',
  'outline-width',
  'outline-style',
  'box-shadow',
  'text-decoration-line',
  'font-weight',
  'font-style',
]
const FRAME = [
  'border-top-width',
  'border-top-style',
  'outline-width',
  'outline-style',
  'box-shadow',
]

function shapeOf(locator: Locator, properties: string[]) {
  return locator.evaluate((element, names) => {
    const style = getComputedStyle(element)
    return names.map((name) => `${name}: ${style.getPropertyValue(name)}`)
  }, properties)
}

const REVIEW_OF_C4 = 'You chose mi. This is do: the note on the first ledger line below the staff.'

test.describe('a wrong answer', () => {
  test('gives a second try, then explains the note and goes on with Next', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')

    await button(page, 're').click()
    await chooseDuration(page)
    await button(page, 'Check').click()

    await expect(status).toHaveText('Incorrect. Try again.')
    await expect(button(page, 're')).toBeDisabled()
    await expect(button(page, 're')).toHaveAccessibleDescription('Incorrect')
    for (const name of NAMES.filter((name) => name !== 're')) {
      await expect(button(page, name)).toBeEnabled()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(button(page, 'Check')).toBeVisible()
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await button(page, 'mi').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText(REVIEW_OF_C4)
    await expect(button(page, 'do')).toHaveAccessibleDescription('Correct')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 'Next')).toBeFocused()
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()

    await button(page, 'Next').click()

    // C4 → D4.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeEnabled()
    }
    await expect(button(page, 'Check')).toBeVisible()
  })

  test('is still counted wrong when the second try is right', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')

    await button(page, 're').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect. Try again.')
    await button(page, 'do').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText('Correct on the second try')
    await expect(button(page, 'Next')).toBeVisible()
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    await expect(page.getByText('Streak: 0', { exact: true })).toBeVisible()
  })

  test('marks the wrong and then the right name by shape, not only by colour', async ({ page }) => {
    await openTrainer(page)
    // fa is never chosen, so it shows the plain look of an enabled and then a disabled name.
    const plain = button(page, 'fa')

    await button(page, 're').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')

    expect(await shapeOf(button(page, 're'), SHAPE)).not.toEqual(await shapeOf(plain, SHAPE))

    await button(page, 'mi').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText(REVIEW_OF_C4)
    // Moving the mouse and the focus away keeps hover and focus styles out of the comparison.
    await page.mouse.move(0, 0)
    await page.locator('h1').first().focus()

    expect(await shapeOf(button(page, 'do'), FRAME)).not.toEqual(await shapeOf(plain, FRAME))
    expect(await shapeOf(button(page, 're'), SHAPE)).not.toEqual(await shapeOf(plain, SHAPE))
  })
})

test.describe('a wrong answer on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the second try and the explanation without horizontal scrolling', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    const states = [
      async () => {
        await button(page, 're').click()
        await chooseDuration(page)
        await button(page, 'Check').click()
        await expect(status).toHaveText('Incorrect. Try again.')
      },
      async () => {
        await button(page, 'mi').click()
        await button(page, 'Check').click()
        await expect(status).toHaveText(REVIEW_OF_C4)
      },
    ]

    for (const enter of states) {
      await enter()
      await expectFitsNarrowScreen(page)
      const box = await boxOf(status)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
      // The long explanation must wrap inside its line, not run out of it.
      expect(await status.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    }
  })
})

// Feature mistake-review, slice 3: in the quick mode a wrong press stops on the note.
test.describe('a wrong answer in the quick mode', () => {
  test('gives a second try and opens the next note when it is right', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    await autoNext(page).check()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await chooseDuration(page)
    await button(page, 're').click()

    await expect(status).toHaveText('Incorrect. Try again.')
    await expect(button(page, 're')).toBeDisabled()
    await expect(button(page, 're')).toHaveAccessibleDescription('Incorrect')
    for (const name of NAMES.filter((name) => name !== 're')) {
      await expect(button(page, name)).toBeEnabled()
    }
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await button(page, 'do').click()

    // C4 → D4.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('Correct on the second try')
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    for (const name of NAMES) {
      await expect(button(page, name)).toBeEnabled()
    }
  })

  test('explains the note after a second wrong press and goes on with Next', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    await autoNext(page).check()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await chooseDuration(page)
    await button(page, 're').click()
    await expect(status).toHaveText('Incorrect. Try again.')
    await button(page, 'mi').click()

    await expect(status).toHaveText(REVIEW_OF_C4)
    await expect(button(page, 'do')).toHaveAccessibleDescription('Correct')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 'Next')).toBeFocused()
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await button(page, 'Next').click()

    // C4 → D4, and the quick mode goes on.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect(button(page, 'Check')).toHaveCount(0)
    await chooseDuration(page)
    await button(page, 're').click()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await expect(status).toHaveText('Correct')
  })

  test('moves the focus off the wrong name to its neighbour and then to Next', async ({
    page,
    browserName,
  }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    await autoNext(page).check()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)

    await chooseDuration(page)
    await tabTo(page, browserName, 're')
    await page.keyboard.press('Enter')

    await expect(status).toHaveText('Incorrect. Try again.')
    await expect(button(page, 'mi')).toBeFocused()

    await page.keyboard.press('Enter')

    await expect(status).toHaveText(REVIEW_OF_C4)
    await expect(button(page, 'Next')).toBeFocused()

    await page.keyboard.press('Enter')

    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(button(page, 'do')).toBeFocused()
  })
})

// A list of languages cannot be set via locale: Chromium accepts 'de-DE,ru', WebKit takes
// only the first. Overriding Navigator.prototype getters works in all three engines.
async function setBrowserLanguages(page: Page, languages: string[], language: string) {
  await page.addInitScript(
    ([list, first]) => {
      Object.defineProperty(Navigator.prototype, 'languages', {
        configurable: true,
        get: () => Object.freeze([...list]),
      })
      Object.defineProperty(Navigator.prototype, 'language', {
        configurable: true,
        get: () => first,
      })
    },
    [languages, language] as const,
  )
}

const RUSSIAN = {
  lang: 'ru',
  choose: 'Сколько вопросов?',
  noLimit: 'Без ограничения',
  heading: 'Назовите ноту',
  staff: 'Нотоносец',
  check: 'Проверить',
  autoNext: 'Автоматически открывать следующий вопрос',
  languageList: 'Язык',
  language: 'Русский',
}
const SPANISH = {
  lang: 'es',
  choose: '¿Cuántas preguntas?',
  noLimit: 'Sin límite',
  heading: 'Nombra la nota',
  staff: 'Pentagrama',
  check: 'Comprobar',
  autoNext: 'Abrir automáticamente la siguiente pregunta',
  languageList: 'Idioma',
  language: 'Español',
}
const ENGLISH = {
  lang: 'en',
  choose: 'How many questions?',
  noLimit: 'No limit',
  heading: 'Name the note',
  staff: 'Music staff',
  check: 'Check',
  autoNext: 'Open next question automatically',
  languageList: 'Language',
  language: 'English',
}

const languageList = (page: Page, name = 'Language') =>
  page.getByRole('combobox', { name, exact: true })

async function expectInterfaceIn(page: Page, texts: typeof ENGLISH) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
  await expect(languageList(page, texts.languageList).locator('option:checked')).toHaveText(
    texts.language,
  )
  await button(page, texts.noLimit).click()
  // Waits without the staff label so that a wrong language fails a text check, not the load wait.
  await expect(page.locator('svg .vf-stavenote')).toHaveCount(1)

  await expect(page.getByRole('heading', { name: texts.heading })).toBeVisible()
  await expect(page).toHaveTitle('Puntillo')
  await expect(page.getByRole('img', { name: texts.staff })).toBeVisible()
  await expect(button(page, texts.check)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: texts.autoNext })).toBeVisible()
  for (const name of NAMES) {
    await expect(button(page, name)).toBeVisible()
  }
}

test.describe('interface language from a Russian browser', () => {
  test.use({ locale: 'ru-RU' })

  test('is Russian', async ({ page }) => {
    await expectInterfaceIn(page, RUSSIAN)
    await expect(page.locator('html')).toHaveAttribute('lang', RUSSIAN.lang)

    await button(page, 'do').click()
    await chooseDuration(page, 'Целая')
    await button(page, RUSSIAN.check).click()
    await expect(page.getByRole('status')).toHaveText('Верно')
    await expect(button(page, 'Далее')).toBeVisible()

    await button(page, 'Завершить').click()
    await expect(page.getByText(/^Среднее время: \d+,\d\u00A0с$/)).toBeVisible()
  })
})

test.describe('interface language from a Mexican Spanish browser', () => {
  test.use({ locale: 'es-MX' })

  test('is Spanish', async ({ page }) => {
    await expectInterfaceIn(page, SPANISH)
    await expect(page.locator('html')).toHaveAttribute('lang', SPANISH.lang)

    await button(page, 'do').click()
    await chooseDuration(page, 'Redonda')
    await button(page, SPANISH.check).click()
    await expect(page.getByRole('status')).toHaveText('Correcto')
    await expect(button(page, 'Siguiente')).toBeVisible()
  })
})

test.describe('interface language from a German browser', () => {
  test.use({ locale: 'de-DE' })

  test('is English', async ({ page }) => {
    await expectInterfaceIn(page, ENGLISH)
    await expect(page.locator('html')).toHaveAttribute('lang', ENGLISH.lang)
  })
})

test.describe('interface language from several browser languages', () => {
  test('is the first supported one', async ({ page }) => {
    await setBrowserLanguages(page, ['de-DE', 'ru'], 'de-DE')

    await expectInterfaceIn(page, RUSSIAN)
    await expect(page.locator('html')).toHaveAttribute('lang', RUSSIAN.lang)
  })

  test('is taken from navigator.language when the list is empty', async ({ page }) => {
    await setBrowserLanguages(page, [], 'es')

    await expectInterfaceIn(page, SPANISH)
    await expect(page.locator('html')).toHaveAttribute('lang', SPANISH.lang)
  })
})

const atOnce = (page: Page) => page.getByRole('checkbox', { name: 'Show the right answer at once' })
const REVIEW_OF_C4_AT_ONCE =
  'You chose re. This is do: the note on the first ledger line below the staff.'

test.describe('showing the right answer at once', () => {
  test('is unticked on the length choice and not on the question', async ({ page }) => {
    await page.goto('/')

    await expect(atOnce(page)).not.toBeChecked()

    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect(atOnce(page)).toHaveCount(0)
  })

  test('explains the note right after a wrong first answer and goes on with Next', async ({
    page,
  }) => {
    await page.goto('/')
    await atOnce(page).check()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    const status = page.getByRole('status')

    await button(page, 're').click()
    await chooseDuration(page)
    await button(page, 'Check').click()

    await expect(status).toHaveText(REVIEW_OF_C4_AT_ONCE)
    await expect(button(page, 'do')).toHaveAccessibleDescription('Correct')
    await expect(button(page, 're')).toHaveAccessibleDescription('Incorrect')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect(button(page, 'Next')).toBeFocused()
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()

    await button(page, 'Next').click()

    // C4 → D4.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('')
    await expect(button(page, 'Check')).toBeVisible()
  })

  test('stays ticked in a new session', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()
    await button(page, '10').click()
    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await button(page, 'Finish').click()
    await button(page, 'New session').click()

    await expect(atOnce(page)).toBeChecked()
  })

  // Feature language-and-naming, criterion 8.
  test('is kept after a reload and still explains the note at once', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()

    await page.reload()

    await expect(atOnce(page)).toBeChecked()
    await expect(autoNext(page)).toHaveCount(0)
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect(autoNext(page)).not.toBeChecked()
    await button(page, 're').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText(REVIEW_OF_C4_AT_ONCE)
    await expect(button(page, 'Next')).toBeVisible()
  })

  test('stays unticked after a reload once unticked again', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()
    await atOnce(page).uncheck()

    await page.reload()

    await expect(atOnce(page)).not.toBeChecked()
  })
})

test.describe('both boxes with a full storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
  })

  test('work until a reload, with no errors', async ({ page }) => {
    await page.goto('/')
    await expect(atOnce(page)).not.toBeChecked()
    // From here on: in development the Vue devtools fail to write while the page loads.
    const errors = collectPageErrors(page)

    await atOnce(page).check()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await autoNext(page).check()
    await chooseDuration(page)
    await button(page, 're').click()
    await expect(page.getByRole('status')).toHaveText(REVIEW_OF_C4_AT_ONCE)
    expect(errors).toEqual([])

    await page.reload()
    await expect(atOnce(page)).not.toBeChecked()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect(autoNext(page)).not.toBeChecked()
    await expect(button(page, 'Check')).toBeVisible()
  })
})

test.describe('showing the right answer at once on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the length choice with a large enough box', async ({ page }) => {
    await page.goto('/')
    await expect(atOnce(page)).toBeVisible()

    await expectFitsNarrowScreen(page)
    const { largest } = await largestTargetOf(atOnce(page))
    expectTargetSize(largest, 'the "Show the right answer at once" box')
  })

  test('fits the explanation shown at once', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    await button(page, 're').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText(REVIEW_OF_C4_AT_ONCE)

    await expectFitsNarrowScreen(page)
  })
})

const LANGUAGES = ['English', 'Русский', 'Español']

async function expectChosenLanguage(page: Page, texts: typeof ENGLISH) {
  await expect(languageList(page, texts.languageList).locator('option:checked')).toHaveText(
    texts.language,
  )
}

function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('choosing the interface language', () => {
  test('offers English, Русский and Español with the browser language chosen', async ({ page }) => {
    await page.goto('/')

    await expect(languageList(page).locator('option')).toHaveText(LANGUAGES)
    await expectChosenLanguage(page, ENGLISH)
  })

  test('switches the interface and the page language without a reload', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      ;(window as unknown as { sameDocument: boolean }).sameDocument = true
    })

    await languageList(page).selectOption({ label: 'Русский' })

    await expect(page.getByRole('heading', { name: RUSSIAN.choose })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', RUSSIAN.lang)
    await expectChosenLanguage(page, RUSSIAN)
    await expect(languageList(page, RUSSIAN.languageList).locator('option')).toHaveText(LANGUAGES)
    expect(
      await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument),
    ).toBe(true)

    await button(page, RUSSIAN.noLimit).click()
    await expect(page.getByRole('heading', { name: RUSSIAN.heading })).toBeVisible()
    await expect(page.getByRole('img', { name: RUSSIAN.staff })).toBeVisible()
    await expect(button(page, RUSSIAN.check)).toBeVisible()
  })

  test('is kept after a reload in a browser of another language', async ({ page }) => {
    await page.goto('/')
    await languageList(page).selectOption({ label: 'Español' })
    await expect(page.locator('html')).toHaveAttribute('lang', SPANISH.lang)

    await setBrowserLanguages(page, ['ru-RU', 'en'], 'ru-RU')

    await expectInterfaceIn(page, SPANISH)
    await expect(page.locator('html')).toHaveAttribute('lang', SPANISH.lang)
  })

  test('follows the browser after a reload while none was chosen', async ({ page }) => {
    await page.goto('/')
    await expectChosenLanguage(page, ENGLISH)

    await setBrowserLanguages(page, ['ru-RU', 'en'], 'ru-RU')

    await expectInterfaceIn(page, RUSSIAN)
    await expect(page.locator('html')).toHaveAttribute('lang', RUSSIAN.lang)
  })

  test('is reachable with Tab', async ({ page, browserName }) => {
    await page.goto('/')

    await tabTo(page, browserName, languageList(page))

    await expect(languageList(page)).toBeFocused()
  })

  test('has a target of at least 44 × 44', async ({ page }) => {
    await page.goto('/')
    await expect(languageList(page)).toBeVisible()

    expectTargetSize(await boxOf(languageList(page)), 'the Language list')
  })
})

// Blocked site data, where merely reading localStorage throws, is left to the storage adapter's
// unit tests: in development the Vue devtools read localStorage on load and the page never starts.
test.describe('choosing the interface language with a full storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
  })

  test('switches the interface until a reload, with no errors', async ({ page }) => {
    await page.goto('/')
    await expectChosenLanguage(page, ENGLISH)
    // From here on: in development the Vue devtools fail to write while the page loads.
    const errors = collectPageErrors(page)

    await languageList(page).selectOption({ label: 'Русский' })
    await expect(page.getByRole('heading', { name: RUSSIAN.choose })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', RUSSIAN.lang)
    expect(errors).toEqual([])

    await expectInterfaceIn(page, ENGLISH)
  })
})

test.describe('choosing the interface language on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the length choice in every language', async ({ page }) => {
    await page.goto('/')

    let current = ENGLISH
    for (const texts of [ENGLISH, RUSSIAN, SPANISH]) {
      // The name of the list changes with the language.
      await languageList(page, current.languageList).selectOption({ label: texts.language })
      await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
      current = texts

      await expectFitsNarrowScreen(page)
    }
  })
})

// Feature language-and-naming, slice 2: the list "Note names".
const SYSTEMS = ['do, re, mi', 'до, ре, ми', 'C, D, E']
const CYRILLIC = ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си']
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NAMING_LIST = { en: 'Note names', ru: 'Названия нот', es: 'Nombres de las notas' }

const namingList = (page: Page, name = NAMING_LIST.en) =>
  page.getByRole('combobox', { name, exact: true })

async function expectChosenNaming(page: Page, system: string, name = NAMING_LIST.en) {
  await expect(namingList(page, name).locator('option:checked')).toHaveText(system)
}

async function expectNoteNameButtons(page: Page, names: string[]) {
  for (const name of names) {
    await expect(button(page, name)).toBeVisible()
  }
  for (const name of NAMES.filter((name) => !names.includes(name))) {
    await expect(button(page, name)).toHaveCount(0)
  }
}

async function startTrainer(page: Page, noLimit = 'No limit') {
  await button(page, noLimit).click()
  await expect(page.locator('svg .vf-stavenote')).toHaveCount(1)
}

test.describe('choosing the note names', () => {
  test('offers do, re, mi; до, ре, ми; C, D, E right after the language, do, re, mi chosen', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(namingList(page).locator('option')).toHaveText(SYSTEMS)
    await expectChosenNaming(page, 'do, re, mi')
    await expect(page.getByRole('combobox')).toHaveCount(2)
    await expect(page.getByRole('combobox').nth(0)).toHaveAccessibleName('Language')
    await expect(page.getByRole('combobox').nth(1)).toHaveAccessibleName('Note names')
  })

  test('names the buttons in the chosen system', async ({ page }) => {
    await page.goto('/')

    await namingList(page).selectOption({ label: 'C, D, E' })
    await startTrainer(page)

    await expectNoteNameButtons(page, LETTERS)
    await button(page, 'C').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
  })

  test('explains a wrong answer in the chosen system and language', async ({ page }) => {
    await page.goto('/')
    await languageList(page).selectOption({ label: 'Русский' })
    await namingList(page, NAMING_LIST.ru).selectOption({ label: 'до, ре, ми' })
    await page.getByRole('checkbox', { name: 'Сразу показывать правильный ответ' }).check()
    // 4/8 → G4, on the 2nd line.
    await setRandom(page, 4 / 8)
    await startTrainer(page, RUSSIAN.noLimit)

    await button(page, 'ре').click()
    await chooseDuration(page, 'Четверть')
    await button(page, RUSSIAN.check).click()

    await expect(page.getByRole('status')).toHaveText(
      'Вы выбрали ре. Это соль — нота на второй линейке.',
    )
    await expect(button(page, 'соль')).toHaveAccessibleDescription('Верно')
  })

  test('explains a wrong second try in letters', async ({ page }) => {
    await page.goto('/')
    await namingList(page).selectOption({ label: 'C, D, E' })
    await startTrainer(page)
    const status = page.getByRole('status')

    await button(page, 'D').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect. Try again.')
    await button(page, 'E').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText(
      'You chose E. This is C: the note on the first ledger line below the staff.',
    )
  })

  test('is kept after a reload', async ({ page }) => {
    await page.goto('/')
    await namingList(page).selectOption({ label: 'до, ре, ми' })

    await page.reload()

    await expect(namingList(page).locator('option:checked')).toHaveText('до, ре, ми')
    await startTrainer(page)
    await expectNoteNameButtons(page, CYRILLIC)
  })

  test('does not change the language, and the language does not change it', async ({ page }) => {
    await page.goto('/')

    await namingList(page).selectOption({ label: 'C, D, E' })
    await expectChosenLanguage(page, ENGLISH)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await languageList(page).selectOption({ label: 'Español' })
    await expectChosenNaming(page, 'C, D, E', NAMING_LIST.es)

    await page.reload()

    await expectChosenLanguage(page, SPANISH)
    await expectChosenNaming(page, 'C, D, E', NAMING_LIST.es)
    await startTrainer(page, SPANISH.noLimit)
    await expectNoteNameButtons(page, LETTERS)
  })

  test('is reachable with Tab', async ({ page, browserName }) => {
    await page.goto('/')

    await tabTo(page, browserName, namingList(page))

    await expect(namingList(page)).toBeFocused()
  })

  test('has a target of at least 44 × 44', async ({ page }) => {
    await page.goto('/')
    await expect(namingList(page)).toBeVisible()

    expectTargetSize(await boxOf(namingList(page)), 'the Note names list')
  })
})

test.describe('choosing the note names with a full storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
  })

  test('applies the system until a reload, with no errors', async ({ page }) => {
    await page.goto('/')
    await expectChosenNaming(page, 'do, re, mi')
    // From here on: in development the Vue devtools fail to write while the page loads.
    const errors = collectPageErrors(page)

    await namingList(page).selectOption({ label: 'C, D, E' })
    await startTrainer(page)
    await expectNoteNameButtons(page, LETTERS)
    expect(errors).toEqual([])

    await page.reload()
    await expectChosenNaming(page, 'do, re, mi')
  })
})

test.describe('choosing the note names on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the length choice in every language', async ({ page }) => {
    await page.goto('/')
    await expect(namingList(page)).toBeVisible()

    let current = ENGLISH
    for (const texts of [ENGLISH, RUSSIAN, SPANISH]) {
      await languageList(page, current.languageList).selectOption({ label: texts.language })
      await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
      current = texts

      await expect(
        namingList(page, NAMING_LIST[texts.lang as keyof typeof NAMING_LIST]),
      ).toBeVisible()
      await expectFitsNarrowScreen(page)
    }
  })

  test('fits the buttons and the explanation in Cyrillic names', async ({ page }) => {
    await page.goto('/')
    await languageList(page).selectOption({ label: 'Русский' })
    await namingList(page, NAMING_LIST.ru).selectOption({ label: 'до, ре, ми' })
    await page.getByRole('checkbox', { name: 'Сразу показывать правильный ответ' }).check()
    await startTrainer(page, RUSSIAN.noLimit)
    await expectFitsNarrowScreen(page)

    await button(page, 'ре').click()
    await chooseDuration(page, 'Целая')
    await button(page, RUSSIAN.check).click()
    await expect(page.getByRole('status')).toHaveText(
      'Вы выбрали ре. Это до — нота на первой добавочной линейке снизу.',
    )

    await expectFitsNarrowScreen(page)
  })
})

// Feature language-and-naming, slice 3: the seventh note switch B / H.
const SEVENTH_SWITCH = { en: 'Seventh note', ru: 'Седьмая ступень', es: 'Séptima nota' }
const LETTERS_H = ['C', 'D', 'E', 'F', 'G', 'A', 'H']

// Either a fieldset with a legend or an element with role="radiogroup" names the pair.
const seventhSwitch = (page: Page, name = SEVENTH_SWITCH.en) =>
  page
    .getByRole('group', { name, exact: true })
    .or(page.getByRole('radiogroup', { name, exact: true }))
const seventhRadio = (page: Page, note: 'B' | 'H') =>
  seventhSwitch(page).getByRole('radio', { name: note, exact: true })

const chosenSeventh = (page: Page) => seventhSwitch(page).getByRole('radio', { checked: true })

async function expectSwitchHidden(page: Page) {
  await expect(seventhSwitch(page)).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)
}

async function showSeventhSwitch(page: Page) {
  await page.goto('/')
  await namingList(page).selectOption({ label: 'C, D, E' })
  await expect(seventhSwitch(page)).toBeVisible()
}

test.describe('choosing the seventh note', () => {
  test('appears right after the Note names list for C, D, E only, with B chosen', async ({
    page,
  }) => {
    await page.goto('/')
    await expectChosenNaming(page, 'do, re, mi')
    await expectSwitchHidden(page)

    await namingList(page).selectOption({ label: 'C, D, E' })

    await expect(seventhSwitch(page)).toBeVisible()
    await expect(seventhSwitch(page).getByRole('radio')).toHaveCount(2)
    await expect(chosenSeventh(page)).toHaveAccessibleName('B')
    const follows = await namingList(page).evaluate((list) => {
      const controls = [...document.querySelectorAll('select, input, button')]
      return controls
        .slice(controls.indexOf(list) + 1, controls.indexOf(list) + 3)
        .map((control) => (control as HTMLInputElement).type)
    })
    expect(follows).toEqual(['radio', 'radio'])

    await namingList(page).selectOption({ label: 'до, ре, ми' })
    await expectSwitchHidden(page)
  })

  test('names si H on the button and in the review', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'H').check()
    await page.getByRole('checkbox', { name: 'Show the right answer at once' }).check()
    // 6/8 → B4, on the 3rd line.
    await setRandom(page, 6 / 8)
    await startTrainer(page)

    await expectNoteNameButtons(page, LETTERS_H)
    await expect(button(page, 'B')).toHaveCount(0)
    await button(page, 'C').click()
    await chooseDuration(page, 'Eighth note')
    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText(
      'You chose C. This is H: the note on the 3rd line.',
    )
    await expect(button(page, 'H')).toHaveAccessibleDescription('Correct')
  })

  test('keeps its value while hidden', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'H').check()

    await namingList(page).selectOption({ label: 'до, ре, ми' })
    await expectSwitchHidden(page)
    await namingList(page).selectOption({ label: 'C, D, E' })

    await expect(chosenSeventh(page)).toHaveAccessibleName('H')
  })

  test('is kept after a reload', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'H').check()

    await page.reload()

    await expectChosenNaming(page, 'C, D, E')
    await expect(chosenSeventh(page)).toHaveAccessibleName('H')
    await startTrainer(page)
    await expectNoteNameButtons(page, LETTERS_H)
    await expect(button(page, 'B')).toHaveCount(0)
  })

  test('is kept after a reload while another system is chosen', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'H').check()
    await namingList(page).selectOption({ label: 'до, ре, ми' })

    await page.reload()

    await expectChosenNaming(page, 'до, ре, ми')
    await expectSwitchHidden(page)
    await namingList(page).selectOption({ label: 'C, D, E' })
    await expect(chosenSeventh(page)).toHaveAccessibleName('H')
  })

  test('is named in the interface language, the letters untranslated', async ({ page }) => {
    await showSeventhSwitch(page)

    let current = ENGLISH
    for (const [language, texts] of [
      ['Русский', RUSSIAN],
      ['Español', SPANISH],
    ] as const) {
      await languageList(page, current.languageList).selectOption({ label: language })
      await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
      current = texts
      const group = seventhSwitch(page, SEVENTH_SWITCH[texts.lang as keyof typeof SEVENTH_SWITCH])
      await expect(group).toBeVisible()
      await expect(group.getByRole('radio', { name: 'B', exact: true })).toBeVisible()
      await expect(group.getByRole('radio', { name: 'H', exact: true })).toBeVisible()
    }
  })

  test('is reachable with Tab', async ({ page, browserName }) => {
    await showSeventhSwitch(page)

    await tabTo(page, browserName, seventhRadio(page, 'B'))

    await expect(seventhRadio(page, 'B')).toBeFocused()
  })

  test('moves between B and H with the arrow keys', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'B').focus()

    await page.keyboard.press('ArrowDown')
    await expect(seventhRadio(page, 'H')).toBeFocused()
    await expect(chosenSeventh(page)).toHaveAccessibleName('H')

    await page.keyboard.press('ArrowUp')
    await expect(seventhRadio(page, 'B')).toBeFocused()
    await expect(chosenSeventh(page)).toHaveAccessibleName('B')
  })

  test('saves a choice made with the keyboard', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'B').focus()
    await page.keyboard.press('ArrowDown')
    await expect(chosenSeventh(page)).toHaveAccessibleName('H')

    await page.reload()

    await expect(chosenSeventh(page)).toHaveAccessibleName('H')
  })

  test('has targets of at least 44 × 44', async ({ page }) => {
    await showSeventhSwitch(page)
    await expect(seventhSwitch(page).getByRole('radio')).toHaveCount(2)

    for (const note of ['B', 'H'] as const) {
      const { largest } = await largestTargetOf(seventhRadio(page, note))
      expectTargetSize(largest, `the ${note} radio`)
    }
  })
})

test.describe('choosing the seventh note with a full storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
  })

  test('applies H until a reload, with no errors', async ({ page }) => {
    await page.goto('/')
    await expectChosenNaming(page, 'do, re, mi')
    // From here on: in development the Vue devtools fail to write while the page loads.
    const errors = collectPageErrors(page)

    await namingList(page).selectOption({ label: 'C, D, E' })
    await seventhRadio(page, 'H').check()
    await startTrainer(page)
    await expectNoteNameButtons(page, LETTERS_H)
    expect(errors).toEqual([])

    await page.reload()
    await namingList(page).selectOption({ label: 'C, D, E' })
    await expect(chosenSeventh(page)).toHaveAccessibleName('B')
  })
})

test.describe('choosing the seventh note on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the length choice with the switch in every language', async ({ page }) => {
    await showSeventhSwitch(page)

    let current = ENGLISH
    for (const texts of [ENGLISH, RUSSIAN, SPANISH]) {
      await languageList(page, current.languageList).selectOption({ label: texts.language })
      await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
      current = texts

      await expect(
        seventhSwitch(page, SEVENTH_SWITCH[texts.lang as keyof typeof SEVENTH_SWITCH]),
      ).toBeVisible()
      await expectFitsNarrowScreen(page)
    }
  })

  test('fits the buttons and the review with H', async ({ page }) => {
    await showSeventhSwitch(page)
    await seventhRadio(page, 'H').check()
    await page.getByRole('checkbox', { name: 'Show the right answer at once' }).check()
    await setRandom(page, 6 / 8)
    await startTrainer(page)
    await expectFitsNarrowScreen(page)

    await button(page, 'C').click()
    await chooseDuration(page, 'Eighth note')
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText(
      'You chose C. This is H: the note on the 3rd line.',
    )

    await expectFitsNarrowScreen(page)
  })
})

// Feature language-and-naming, slice 5: the notice about settings that will not be saved.
const NOTICE = {
  en: "Settings won't be saved in this browser.",
  ru: 'Настройки не сохранятся в этом браузере.',
  es: 'La configuración no se guardará en este navegador.',
}

const notice = (page: Page, text = NOTICE.en) => page.getByText(text, { exact: true })
const anyNotice = (page: Page) =>
  page.getByText(new RegExp(`^(${Object.values(NOTICE).join('|')})$`))

async function fillStorage(page: Page) {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
  })
}

test.describe('the notice about settings with a working storage', () => {
  test('is never shown', async ({ page }) => {
    await page.goto('/')
    await expectChosenNaming(page, 'do, re, mi')
    await expect(anyNotice(page)).toHaveCount(0)

    await atOnce(page).check()
    await namingList(page).selectOption({ label: 'C, D, E' })
    await seventhRadio(page, 'H').check()
    await languageList(page).selectOption({ label: 'Español' })
    await expect(page.getByRole('heading', { name: SPANISH.choose })).toBeVisible()

    await expect(anyNotice(page)).toHaveCount(0)
  })
})

test.describe('the notice about settings with a full storage', () => {
  test.beforeEach(async ({ page }) => {
    await fillStorage(page)
  })

  test('appears once, below the settings, after the first choice', async ({ page }) => {
    await page.goto('/')
    await expectChosenNaming(page, 'do, re, mi')
    await expect(anyNotice(page)).toHaveCount(0)

    await namingList(page).selectOption({ label: 'C, D, E' })

    await expect(notice(page)).toHaveCount(1)
    await expect(notice(page)).toBeVisible()
    await expect(anyNotice(page)).toHaveCount(1)
    const switchBox = await boxOf(seventhSwitch(page))
    expect((await boxOf(notice(page))).y).toBeGreaterThanOrEqual(switchBox.y + switchBox.height)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('stays one line after further choices, in the chosen language', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()
    await expect(notice(page)).toHaveCount(1)

    await namingList(page).selectOption({ label: 'C, D, E' })
    await seventhRadio(page, 'H').check()
    await atOnce(page).uncheck()
    await expect(anyNotice(page)).toHaveCount(1)

    await languageList(page).selectOption({ label: 'Русский' })
    await expect(notice(page, NOTICE.ru)).toHaveCount(1)
    await expect(anyNotice(page)).toHaveCount(1)
  })

  test('is not on the question screen and is back once after the session', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()
    await expect(notice(page)).toHaveCount(1)

    await startTrainer(page)
    await expect(page.getByRole('heading', { name: 'Name the note' })).toBeVisible()
    await expect(anyNotice(page)).toHaveCount(0)

    await button(page, 'do').click()
    await chooseDuration(page)
    await button(page, 'Check').click()
    await button(page, 'Finish').click()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
    await expect(anyNotice(page)).toHaveCount(0)

    await button(page, 'New session').click()
    await expect(page.getByRole('heading', { name: 'How many questions?' })).toBeVisible()
    await expect(notice(page)).toHaveCount(1)
  })

  test('is gone after a reload until the next choice', async ({ page }) => {
    await page.goto('/')
    await atOnce(page).check()
    await expect(notice(page)).toHaveCount(1)

    await page.reload()
    await expectChosenNaming(page, 'do, re, mi')

    await expect(anyNotice(page)).toHaveCount(0)
  })
})

test.describe('the notice about settings on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits in every language', async ({ page }) => {
    await fillStorage(page)
    await page.goto('/')
    await namingList(page).selectOption({ label: 'C, D, E' })

    let current = ENGLISH
    for (const texts of [ENGLISH, RUSSIAN, SPANISH]) {
      await languageList(page, current.languageList).selectOption({ label: texts.language })
      await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
      current = texts

      const line = notice(page, NOTICE[texts.lang as keyof typeof NOTICE])
      await expect(line).toBeVisible()
      const box = await boxOf(line)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
      await expectFitsNarrowScreen(page)
    }
  })
})

// Feature duration-input, slice 2: the row of duration buttons in the normal mode.
// x = 0.3 gives a half note on E4 (mi); every next note is a half note too, F4 (fa), then E4.
const REVIEW_OF_HALF_NOTE = 'You chose an eighth note. This is a half note.'

async function openOnHalfNote(page: Page, length = 'No limit') {
  await fixRandom(page, 0.3)
  await openTrainer(page, length)
  await expect(staff(page).locator('svg .vf-notehead text')).toHaveText([SMUFL.noteheadHalf])
}

test.describe('answering the duration', () => {
  test('shows four duration buttons below the note names, none chosen', async ({ page }) => {
    await openOnHalfNote(page)

    const lastName = await boxOf(button(page, 'si'))
    for (const name of DURATION_BUTTONS) {
      const duration = button(page, name)
      await expect(duration).toBeVisible()
      await expect(duration).toBeEnabled()
      await expect(duration).toHaveAttribute('aria-pressed', 'false')
      expect((await boxOf(duration)).y, `top of "${name}"`).toBeGreaterThanOrEqual(
        lastName.y + lastName.height,
      )
    }
  })

  test('takes a right name and duration as correct', async ({ page }) => {
    await openOnHalfNote(page)
    const status = page.getByRole('status')

    await button(page, 'Half note').click()
    await button(page, 'mi').click()
    await expect(button(page, 'Half note')).toHaveAttribute('aria-pressed', 'true')
    await expect(button(page, 'mi')).toHaveAttribute('aria-pressed', 'true')
    await button(page, 'Check').click()

    await expect(status).toHaveText('Correct')
    for (const name of [...NAMES, ...DURATION_BUTTONS]) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(page.getByText('Points: 2 of 2', { exact: true })).toBeVisible()
    await expect(button(page, 'Next')).toBeFocused()

    await button(page, 'Next').click()
    for (const name of DURATION_BUTTONS) {
      await expect(button(page, name)).toBeEnabled()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  test('asks for both when only a name is chosen', async ({ page }) => {
    await openOnHalfNote(page)

    await button(page, 'mi').click()
    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Choose a note name and a duration')
    await expect(button(page, 'Check')).toBeVisible()
    await expect(page.getByText('Points: 0 of 0', { exact: true })).toBeVisible()
  })

  test('gives a second try on a wrong duration only, keeping the right name', async ({ page }) => {
    await openOnHalfNote(page)
    const status = page.getByRole('status')

    await button(page, 'mi').click()
    await button(page, 'Quarter note').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText('Incorrect. Try again.')
    await expect(button(page, 'Quarter note')).toBeDisabled()
    await expect(button(page, 'Quarter note')).toHaveAccessibleDescription('Incorrect')
    for (const name of DURATION_BUTTONS.filter((name) => name !== 'Quarter note')) {
      await expect(button(page, name)).toBeEnabled()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(button(page, 'mi')).toHaveAttribute('aria-pressed', 'true')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()

    await button(page, 'Half note').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText('Correct on the second try')
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    await expect(page.getByText('Streak: 0', { exact: true })).toBeVisible()
  })

  test('explains a duration wrong twice and marks the right one', async ({ page }) => {
    await openOnHalfNote(page)
    const status = page.getByRole('status')
    await button(page, 'mi').click()
    await button(page, 'Quarter note').click()
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect. Try again.')

    await button(page, 'Eighth note').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText(REVIEW_OF_HALF_NOTE)
    await expect(button(page, 'Half note')).toHaveAccessibleDescription('Correct')
    await expect(button(page, 'Quarter note')).toHaveAccessibleDescription('Incorrect')
    await expect(button(page, 'Eighth note')).toHaveAccessibleDescription('Incorrect')
    for (const name of [...NAMES, ...DURATION_BUTTONS]) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 'Next')).toBeFocused()
  })

  test('explains a wrong name and a wrong duration in two sentences', async ({ page }) => {
    await openOnHalfNote(page)
    const status = page.getByRole('status')
    await button(page, 're').click()
    await button(page, 'Quarter note').click()
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect. Try again.')

    await button(page, 'fa').click()
    await button(page, 'Eighth note').click()
    await button(page, 'Check').click()

    await expect(status).toHaveText(
      `You chose fa. This is mi: the note on the 1st line. ${REVIEW_OF_HALF_NOTE}`,
    )
  })

  test('marks the wrong and the right duration by shape, not only by colour', async ({ page }) => {
    await openOnHalfNote(page)
    // The whole note is never chosen, so it shows the plain look of a duration.
    const plain = button(page, 'Whole note')
    await button(page, 'mi').click()
    await button(page, 'Quarter note').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')

    expect(await shapeOf(button(page, 'Quarter note'), SHAPE)).not.toEqual(
      await shapeOf(plain, SHAPE),
    )

    await button(page, 'Eighth note').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText(REVIEW_OF_HALF_NOTE)
    await page.mouse.move(0, 0)
    await page.locator('h1').first().focus()

    expect(await shapeOf(button(page, 'Half note'), FRAME)).not.toEqual(await shapeOf(plain, FRAME))
  })

  test('explains a wrong duration at once with the box ticked', async ({ page }) => {
    await fixRandom(page, 0.3)
    await page.goto('/')
    await atOnce(page).check()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    await button(page, 'mi').click()
    await button(page, 'Eighth note').click()
    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText(REVIEW_OF_HALF_NOTE)
    await expect(button(page, 'Half note')).toHaveAccessibleDescription('Correct')
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect(button(page, 'Next')).toBeFocused()
  })

  test('gives the accuracy by points in the results', async ({ page }) => {
    await openOnHalfNote(page)
    // E4: right.
    await button(page, 'mi').click()
    await button(page, 'Half note').click()
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    // F4: the name is right, the duration wrong, then right on the second try.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(1)
    await button(page, 'fa').click()
    await button(page, 'Whole note').click()
    await button(page, 'Check').click()
    await button(page, 'Half note').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct on the second try')
    await button(page, 'Next').click()
    // E4: right.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(0)
    await button(page, 'mi').click()
    await button(page, 'Half note').click()
    await button(page, 'Check').click()
    await expect(page.getByText('Points: 5 of 6', { exact: true })).toBeVisible()

    await button(page, 'Finish').click()

    await expect(page.getByText('Accuracy: 83% (5 of 6 points)', { exact: true })).toBeVisible()
    await expect(page.getByText('Questions: 3', { exact: true })).toBeVisible()
    await expect(page.getByText('Best streak: 1', { exact: true })).toBeVisible()
  })

  test('reaches the duration buttons with Tab and chooses one with Enter', async ({
    page,
    browserName,
  }) => {
    await openOnHalfNote(page)

    await tabTo(page, browserName, 'Half note')
    await page.keyboard.press('Enter')

    await expect(button(page, 'Half note')).toHaveAttribute('aria-pressed', 'true')
  })

  // Edge case 4: a drawing of its own, so no system font can change or hide it.
  test('draws each duration without text, so without a font', async ({ page }) => {
    await openOnHalfNote(page)

    for (const name of DURATION_BUTTONS) {
      const image = button(page, name).locator('svg')
      await expect(image).toHaveCount(1)
      await expect(image).toHaveAttribute('aria-hidden', 'true')
      await expect(image.locator('text')).toHaveCount(0)
      const drawing = await boxOf(image)
      const target = await boxOf(button(page, name))
      expect(drawing.width, `width of the image of "${name}"`).toBeGreaterThan(0)
      expect(drawing.height, `height of the image of "${name}"`).toBeGreaterThan(0)
      expect(drawing.x).toBeGreaterThanOrEqual(target.x)
      expect(drawing.x + drawing.width).toBeLessThanOrEqual(target.x + target.width)
    }
  })
})

test.describe('answering the duration on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  // Edge case 3.
  test('fits the staff and both rows, each duration at least 44 × 44, in one row', async ({
    page,
  }) => {
    await openOnHalfNote(page)
    const status = page.getByRole('status')
    const states = [
      async () => {},
      async () => {
        await button(page, 're').click()
        await button(page, 'Quarter note').click()
        await button(page, 'Check').click()
        await expect(status).toHaveText('Incorrect. Try again.')
      },
      async () => {
        await button(page, 'fa').click()
        await button(page, 'Eighth note').click()
        await button(page, 'Check').click()
        await expect(button(page, 'Next')).toBeVisible()
      },
    ]

    for (const enter of states) {
      await enter()
      await expectFitsNarrowScreen(page)
      const drawing = await boxOf(staff(page).locator('svg'))
      expect(drawing.x + drawing.width).toBeLessThanOrEqual(360)
      const tops = []
      for (const name of DURATION_BUTTONS) {
        const box = await boxOf(button(page, name))
        expectTargetSize(box, `"${name}"`)
        tops.push(box.y)
      }
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
      // The two-sentence review must wrap inside its line, not run out of it.
      expect(await status.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    }
  })
})
