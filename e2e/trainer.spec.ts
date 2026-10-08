import { expect, test, type Locator, type Page } from '@playwright/test'

// Math.random picks the note, so it is replaced before the page loads. The value is constant
// within a step, so unrelated calls (VexFlow, Vite) do not shift the sequence. The first note
// is one of eight C4–C5 by floor(x × 8), each next one of the other seven by floor(x × 7).
// With x = 0 questions alternate: C4 (do), D4 (re), C4…

const NAMES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
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

// WebKit on macOS tabs only through form fields; buttons need Option+Tab.
async function tabTo(page: Page, browserName: string, name: string) {
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  const target = button(page, name)
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
    await button(page, 'Check').click()
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Check')).toHaveCount(0)

    await button(page, 'Next').click()
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
    await expect(button(page, 'do')).toHaveAttribute('aria-pressed', 'false')
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    // The second question is D4.
    await button(page, 'mi').click()
    await button(page, 'Check').click()
    await expect(status).toHaveText('Incorrect')
    await expect(button(page, 'Next')).toBeVisible()
  })

  test('disables the note name buttons after Check and enables them after Next', async ({
    page,
  }) => {
    await openTrainer(page)

    await button(page, 're').click()
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Incorrect')
    for (const name of NAMES) {
      await expect(button(page, name)).toBeDisabled()
    }
    await expect(button(page, 're')).toHaveAttribute('aria-pressed', 'true')

    await button(page, 'Next').click()
    for (const name of NAMES) {
      await expect(button(page, name)).toBeEnabled()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  test('asks to choose a note name when checking without one', async ({ page }) => {
    await openTrainer(page)

    await button(page, 'Check').click()

    await expect(page.getByRole('status')).toHaveText('Choose a note name first')
    await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
    await expect(button(page, 'Check')).toBeVisible()
  })

  test('makes every interactive element at least 44 by 44 CSS pixels', async ({ page }) => {
    await openTrainer(page)
    // In the Next state the name buttons are disabled but still visible, so they are measured too.
    const states = [
      async () => {},
      async () => {
        await button(page, 'do').click()
        await button(page, 'Check').click()
        await expect(button(page, 'Next')).toBeVisible()
      },
    ]

    for (const enter of states) {
      await enter()
      // Checkboxes are measured separately below: their hit area includes the label.
      const controls = page
        .locator('button, a[href], input:not([type="checkbox"]), select, textarea, [role="button"]')
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
      const checkboxes = page.locator('input[type="checkbox"]').filter({ visible: true })
      const checkboxCount = await checkboxes.count()
      expect(checkboxCount).toBeGreaterThanOrEqual(1)
      for (let index = 0; index < checkboxCount; index++) {
        const checkbox = checkboxes.nth(index)
        const { name, largest } = await checkbox.evaluate((input: HTMLInputElement) => {
          const labels = [...(input.labels ?? [])]
          const sizes = [input, ...labels].map((target) => {
            const { width, height } = target.getBoundingClientRect()
            return { width, height }
          })
          sizes.sort((a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height))
          return { name: labels[0]?.textContent?.trim(), largest: sizes[0] }
        })
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

    // C5: mi is wrong.
    await setRandom(page, 0)
    await button(page, 'mi').click()

    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await expect(status).toHaveText('Incorrect')
    await expect(button(page, 'Check')).toHaveCount(0)
    await expect(autoNext(page)).toBeChecked()
  })

  test('opens the next note at once when ticked on a shown result', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await button(page, 'do').click()
    await button(page, 'Check').click()
    await expect(button(page, 'Next')).toBeVisible()

    await autoNext(page).check()

    // C4 → D4.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Next')).toHaveCount(0)
    await expect(button(page, 'Check')).toHaveCount(0)
  })

  test('waits for Next when not ticked', async ({ page }) => {
    await openTrainer(page)
    const status = page.getByRole('status')

    await button(page, 'do').click()
    await button(page, 'Check').click()
    await expect(status).toHaveText('Correct')

    // eslint-disable-next-line playwright/no-wait-for-timeout -- no event marks a missing transition; wait twice the removed 1.5 s pause
    await page.waitForTimeout(3000)

    await expect(status).toHaveText('Correct')
    await expect(button(page, 'Next')).toBeVisible()
    await expect(button(page, 'Check')).toHaveCount(0)
  })

  test('is not remembered after a reload', async ({ page }) => {
    await openTrainer(page)
    await autoNext(page).check()

    await page.reload()
    await button(page, 'No limit').click()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)

    await expect(autoNext(page)).not.toBeChecked()
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
    await button(page, 'Check').click()
    await expect(page.getByRole('status')).toHaveText('Correct')
    await button(page, 'Next').click()
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(5)

    await setRandom(page, 0)
    await button(page, 'do').click()
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

// With Math.random = 0 odd questions are C4 (do is correct), even ones D4 (do is wrong).

const choiceHeading = (page: Page) => page.getByRole('heading', { name: 'How many questions?' })
const LENGTHS = ['10', '20', '50', 'No limit']

async function expectAtRoot(page: Page) {
  const url = new URL(page.url())
  expect(url.pathname + url.search + url.hash).toBe('/')
}

async function expectProgress(page: Page, checked: number) {
  // Odd questions are the correct ones, so the streak is 1 after an odd one and 0 after an even.
  const correct = Math.ceil(checked / 2)
  const streak = checked % 2
  await expect(page.getByText(`Correct: ${correct} of ${checked}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`Streak: ${streak}`, { exact: true })).toBeVisible()
}

// Five odd questions are correct. Stops on the last checked question, where Results is shown.
async function answerTenQuestionsWithDo(page: Page) {
  const status = page.getByRole('status')
  for (let number = 1; number <= 10; number++) {
    await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
    await expectProgress(page, number - 1)
    await button(page, 'do').click()
    await button(page, 'Check').click()
    await expect(status).toHaveText(number % 2 === 1 ? 'Correct' : 'Incorrect')
    await expectProgress(page, number)
    if (number < 10) await button(page, 'Next').click()
  }
}

async function expectFitsNarrowScreen(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const controls = page
    .locator('button, a[href], input, select, textarea, [role="button"]')
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
    await expect(page.getByText('Accuracy: 50% (5 of 10)', { exact: true })).toBeVisible()
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

    for (let number = 1; number < 10; number++) {
      await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
      await expectProgress(page, number - 1)
      await button(page, 'do').click()
      await expect(status).toHaveText(number % 2 === 1 ? 'Correct' : 'Incorrect')
    }
    await expect(page.getByText('Question 10 of 10', { exact: true })).toBeVisible()
    await expectProgress(page, 9)

    await button(page, 'do').click()

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
    await expect(page.getByText('Accuracy: 50% (5 of 10)', { exact: true })).toBeVisible()
    await expect(page.getByText('Questions: 10', { exact: true })).toBeVisible()
    await expect(page.getByText('Best streak: 1', { exact: true })).toBeVisible()
    await expect(page.getByText(/^Average time: \d+\.\d\u00A0s$/)).toBeVisible()
    await expect(button(page, 'Results')).toHaveCount(0)
    await expect(staff(page)).toHaveCount(0)
  })

  // Feature decision 2026-10-08: no answer before the note is drawn, so loading is not timed.
  test('shows the note name buttons only once the staff has drawn the note', async ({ page }) => {
    await page.goto('/')
    // Records, in the page, whether the note was on the staff when each button first appeared.
    await page.evaluate(() => {
      const seen: Record<string, boolean> = {}
      ;(window as unknown as { puntilloButtonsSeen: Record<string, boolean> }).puntilloButtonsSeen =
        seen
      const record = () => {
        const drawn = document.querySelector('.vf-stavenote') !== null
        for (const element of document.querySelectorAll('button')) {
          const name = element.textContent?.trim() ?? ''
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
    for (const name of [...NAMES, 'Check']) {
      expect(seen[name], `"${name}" appeared before the note was drawn`).toBe(true)
    }
  })

  test('is lost on a reload: the choice of length opens again', async ({ page }) => {
    await openTrainer(page, '10')
    await button(page, 'do').click()
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

    await tabTo(page, browserName, 'do')
    await page.keyboard.press('Enter')

    // C4 → D4: do was correct, and the focus stays for the next answer.
    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-1)
    await expect(status).toHaveText('Correct')
    await expect(button(page, 'do')).toBeFocused()

    await page.keyboard.press('Enter')

    await expect.poll(() => noteStepAboveBottomLine(page)).toBe(-2)
    await expect(status).toHaveText('Incorrect')
    await expect(page.getByText('Question 3 of 10', { exact: true })).toBeVisible()
    await expect(button(page, 'do')).toBeFocused()
  })

  test('moves the focus to the results heading after the last quick answer', async ({ page }) => {
    await openTrainer(page, '10')
    await autoNext(page).check()
    for (let number = 1; number < 10; number++) {
      await expect(page.getByText(`Question ${number} of 10`, { exact: true })).toBeVisible()
      await button(page, 'do').click()
    }
    await expect(page.getByText('Question 10 of 10', { exact: true })).toBeVisible()

    await button(page, 'do').focus()
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
    await button(page, 'Check').click()

    const texts = ['Question 1 of 10', 'Correct: 1 of 1', 'Streak: 1']
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
    await button(page, 'Check').click()
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
    await expect(page.getByText('Accuracy: 67% (2 of 3)', { exact: true })).toBeVisible()
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
}
const SPANISH = {
  lang: 'es',
  choose: '¿Cuántas preguntas?',
  noLimit: 'Sin límite',
  heading: 'Nombra la nota',
  staff: 'Pentagrama',
  check: 'Comprobar',
  autoNext: 'Abrir automáticamente la siguiente pregunta',
}
const ENGLISH = {
  lang: 'en',
  choose: 'How many questions?',
  noLimit: 'No limit',
  heading: 'Name the note',
  staff: 'Music staff',
  check: 'Check',
  autoNext: 'Open next question automatically',
}

async function expectInterfaceIn(page: Page, texts: typeof ENGLISH) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: texts.choose })).toBeVisible()
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
