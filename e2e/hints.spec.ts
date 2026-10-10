import { expect, test, type Locator, type Page } from '@playwright/test'

// Feature wiki, slice 3: from the review of a mistake to the hint, to the article and back to the
// same question, in a real browser (spec §16). As in trainer.spec.ts the page starts in Confident
// reading with one note in 4/4, as if chosen on an earlier visit, and Math.random is fixed at 0, so
// the first question is a whole C4 (do). Answered re, then mi, it gets the review below, one
// sentence of the place of the note: its hint is that of Notes on the treble staff. The texts of
// the hints are their authors' to change, so only their title, a text and a drawn example are
// checked.

const ONE_NOTE_READING = JSON.stringify({
  low: 'C4',
  high: 'G5',
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
})

const REVIEW_OF_C4 = 'You chose mi. This is do: the note on the first ledger line below the staff.'
const TOPIC = 'Notes on the treble staff'
const ARTICLE = '/wiki/treble-staff'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const staff = (page: Page) => page.getByRole('img', { name: 'Music staff' })
const why = (page: Page) => button(page, 'Why?')
const hint = (page: Page) => page.getByRole('dialog')
const backToQuestion = (page: Page) =>
  link(page, 'Back to the question').or(button(page, 'Back to the question'))

// The status message as read: the buttons Why? after its sentences are no part of it.
function reviewText(page: Page) {
  return page.getByRole('status').evaluate((status) => {
    const copy = status.cloneNode(true) as HTMLElement
    for (const each of copy.querySelectorAll('button')) each.remove()
    return copy.textContent?.replace(/\s+/g, ' ').trim()
  })
}

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

async function reviewC4(page: Page) {
  await page.goto('/')
  await button(page, 'No limit').click()
  await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
  await button(page, 're').click()
  await button(page, '1/1').click()
  await button(page, 'Check').click()
  await expect(page.getByRole('status')).toHaveText('Incorrect. Try again.')
  await button(page, 'mi').click()
  await button(page, 'Check').click()
  await expect.poll(() => reviewText(page)).toBe(REVIEW_OF_C4)
}

async function openHint(page: Page) {
  await why(page).click()
  await expect(hint(page)).toBeVisible()
  await expect(hint(page).getByRole('img').locator('svg .vf-stavenote').first()).toBeVisible()
}

// Assertions use English texts, and WebKit without a locale falls back to the system language.
test.use({ locale: 'en-US' })

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

test.describe('the hint of a mistake', () => {
  test('opens from Why? with its title, its text and its example drawn', async ({ page }) => {
    await reviewC4(page)
    await expect(why(page)).toHaveAccessibleDescription(REVIEW_OF_C4)

    await openHint(page)

    await expect(hint(page).getByRole('heading', { name: TOPIC, exact: true })).toBeVisible()
    const text = await hint(page).evaluate((dialog) => {
      const copy = dialog.cloneNode(true) as HTMLElement
      for (const each of copy.querySelectorAll('h1, h2, h3, a, button, [role="img"]')) each.remove()
      return copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    })
    expect(text.length).toBeGreaterThan(20)
    await expect(link(page, 'Read the article')).toBeVisible()
    await expect(button(page, 'Close')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('leaves the question as it was, and closes with Esc, the focus back on Why?', async ({
    page,
  }) => {
    await reviewC4(page)
    await openHint(page)

    await page.keyboard.press('Escape')

    await expect(hint(page)).toBeHidden()
    await expect(why(page)).toBeFocused()
    await expect.poll(() => reviewText(page)).toBe(REVIEW_OF_C4)
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    await expect(button(page, 'Next')).toBeVisible()
  })

  test('closes with Close, the focus back on Why?', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)

    await button(page, 'Close').click()

    await expect(hint(page)).toBeHidden()
    await expect(why(page)).toBeFocused()
  })

  test('closes with a press outside it, the focus back on Why?', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)

    // The corner of the page, on the backdrop of the dialog.
    await page.mouse.click(5, 5)

    await expect(hint(page)).toBeHidden()
    await expect(why(page)).toBeFocused()
  })

  test('leads to the article and back to the same question', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)

    await link(page, 'Read the article').click()

    await expect(page).toHaveURL(new RegExp(`${ARTICLE}$`))
    await expect(heading(page, TOPIC)).toBeVisible()
    await expect(backToQuestion(page)).toBeVisible()
    await expect(page.getByRole('main').getByRole('img').first()).toBeVisible()
    await expect(button(page, 'Practice this')).toHaveCount(0)

    await backToQuestion(page).click()

    await expect(heading(page, 'Name the note')).toBeAttached()
    await expect(staff(page).locator('svg .vf-stavenote')).toHaveCount(1)
    await expect.poll(() => reviewText(page)).toBe(REVIEW_OF_C4)
    await expect(page.getByText('Question 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Points: 1 of 2', { exact: true })).toBeVisible()
    await expect(why(page)).toBeFocused()
  })

  test('leaves no Back to the question after a reload on the article', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)
    await link(page, 'Read the article').click()
    await expect(backToQuestion(page)).toBeVisible()

    await page.reload()

    await expect(heading(page, TOPIC)).toBeVisible()
    await expect(button(page, 'Practice this')).toBeVisible()
    await expect(backToQuestion(page)).toHaveCount(0)
  })
})

test.describe('the hint on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits with its controls and Why? large enough', async ({ page }) => {
    await reviewC4(page)
    await expectTarget(why(page), 'Why?')

    await openHint(page)

    const box = await hint(page).boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    await expectTarget(link(page, 'Read the article'), 'Read the article')
    await expectTarget(button(page, 'Close'), 'Close')
    await expectNoHorizontalScroll(page)
    const overflow = await hint(page).evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
    expect(overflow).toBe(0)
  })

  test('fits the article with Back to the question large enough', async ({ page }) => {
    await reviewC4(page)
    await openHint(page)
    await link(page, 'Read the article').click()
    await expect(backToQuestion(page)).toBeVisible()

    await expectTarget(backToQuestion(page), 'Back to the question')
    await expectNoHorizontalScroll(page)
  })
})

// Feature wiki, slice 4: a help button "?" beside each parameter of Customize opens the hint of its
// topic over the panel; closing the hint leaves the panel open, the focus back on the help.
const PARAMETERS = [
  'From',
  'To',
  'Ledger lines',
  'Question length',
  'Time signatures',
  'Durations',
  'Rests',
  'Dots',
  'Ask for the duration',
  'Key signatures',
  'Accidentals',
]

const panel = (page: Page) => page.getByRole('dialog', { name: 'Customize', exact: true })
const help = (page: Page, parameter: string) => button(page, `Help: ${parameter}`)
const hintOf = (page: Page, title: string) => page.getByRole('dialog', { name: title, exact: true })

async function openCustomize(page: Page, sections: readonly string[] = []) {
  await page.goto('/')
  await button(page, 'Customize').click()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).locator('svg .vf-stavenote').first()).toBeAttached()
  for (const name of sections) {
    await panel(page).getByRole('button', { name, exact: true }).click()
    await expect(panel(page).getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  }
}

async function openHelp(page: Page, parameter: string, title: string) {
  await help(page, parameter).click()
  await expect(hintOf(page, title)).toBeVisible()
  await expect(
    hintOf(page, title).getByRole('img').locator('svg .vf-stavenote').first(),
  ).toBeVisible()
}

test.describe('the help in Customize', () => {
  test('opens the hint of Ledger lines; Esc closes it, then Customize, the focus back on each', async ({
    page,
  }) => {
    await openCustomize(page)

    await openHelp(page, 'Ledger lines', TOPIC)
    await expect(
      hintOf(page, TOPIC).getByRole('heading', { name: TOPIC, exact: true }),
    ).toBeVisible()
    await expect(hintOf(page, TOPIC).getByRole('link', { name: 'Read the article' })).toBeVisible()
    await expect(panel(page)).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(hintOf(page, TOPIC)).toBeHidden()
    await expect(panel(page)).toBeVisible()
    await expect(help(page, 'Ledger lines')).toBeFocused()

    await page.keyboard.press('Escape')

    await expect(panel(page)).toBeHidden()
    await expect(button(page, 'Customize')).toBeFocused()
  })

  test('closes the hint with Close and a press outside it, Customize open, the focus back on the help', async ({
    page,
  }) => {
    await openCustomize(page)

    await openHelp(page, 'From', TOPIC)
    await hintOf(page, TOPIC).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(hintOf(page, TOPIC)).toBeHidden()
    await expect(panel(page)).toBeVisible()
    await expect(help(page, 'From')).toBeFocused()

    await openHelp(page, 'To', TOPIC)
    // The corner of the page: on the backdrop of the hint, wherever the panel lies under it.
    await page.mouse.click(5, 5)
    await expect(hintOf(page, TOPIC)).toBeHidden()
    await expect(panel(page)).toBeVisible()
    await expect(help(page, 'To')).toBeFocused()
  })

  test('changes no setting', async ({ page }) => {
    await openCustomize(page, ['Rhythm', 'Signs'])
    const boxes = panel(page).getByRole('checkbox')
    const radios = panel(page).getByRole('radio')
    const checked = async () => ({
      boxes: await boxes.evaluateAll((all) =>
        all.map((each) => (each as HTMLInputElement).checked),
      ),
      radios: await radios.evaluateAll((all) =>
        all.map((each) => (each as HTMLInputElement).checked),
      ),
      saved: await page.evaluate(() => [
        localStorage.getItem('puntillo.preset'),
        localStorage.getItem('puntillo.difficulty'),
      ]),
    })
    const before = await checked()

    for (const [parameter, title] of [
      ['Rests', 'Durations of notes and rests'],
      ['Dots', 'Durations of notes and rests'],
      ['Ask for the duration', 'Durations of notes and rests'],
      ['Accidentals', 'Sharp, flat and natural'],
    ] as const) {
      await openHelp(page, parameter, title)
      await hintOf(page, title).getByRole('button', { name: 'Close', exact: true }).click()
      await expect(hintOf(page, title)).toBeHidden()
    }

    expect(await checked()).toEqual(before)
  })

  test('leads to the article with Practice this, the setting changed before kept', async ({
    page,
  }) => {
    await openCustomize(page, ['Rhythm'])
    await panel(page).getByRole('checkbox', { name: 'Rests', exact: true }).check()
    await openHelp(page, 'Rests', 'Durations of notes and rests')

    await link(page, 'Read the article').click()

    await expect(page).toHaveURL(/\/wiki\/durations$/)
    await expect(heading(page, 'Durations of notes and rests')).toBeVisible()
    await expect(button(page, 'Practice this')).toBeVisible()
    await expect(backToQuestion(page)).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const saved = await page.evaluate(() => localStorage.getItem('puntillo.difficulty'))
    expect(JSON.parse(saved ?? '{}')).toMatchObject({ rests: true })
  })
})

test.describe('the help in Customize on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the panel with every help button large enough, and the hint over it', async ({
    page,
  }) => {
    await openCustomize(page, ['Rhythm', 'Signs'])

    for (const parameter of PARAMETERS) {
      const target = help(page, parameter)
      await target.scrollIntoViewIfNeeded()
      await expectTarget(target, `Help: ${parameter}`)
      const box = await target.boundingBox()
      expect(box?.x, `left edge of Help: ${parameter}`).toBeGreaterThanOrEqual(0)
      expect(box && box.x + box.width, `right edge of Help: ${parameter}`).toBeLessThanOrEqual(360)
    }
    const overflow = await panel(page).evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
    expect(overflow, 'overflow of the panel').toBeLessThanOrEqual(0)
    await expectNoHorizontalScroll(page)

    await openHelp(page, 'Accidentals', 'Sharp, flat and natural')

    const hint = hintOf(page, 'Sharp, flat and natural')
    const box = await hint.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    expect(await hint.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)).toBe(0)
    await expectTarget(hint.getByRole('link', { name: 'Read the article' }), 'Read the article')
    await expectTarget(hint.getByRole('button', { name: 'Close', exact: true }), 'Close')
    await expectNoHorizontalScroll(page)
  })
})

// The section Signs with its help buttons, in every language: the longest names are Russian.
const SIGNS_TEXTS = [
  {
    lang: 'en',
    customize: 'Customize',
    signs: 'Signs',
    help: ['Help: Key signatures', 'Help: Accidentals'],
  },
  {
    lang: 'ru',
    customize: 'Настроить',
    signs: 'Знаки',
    help: ['Справка: Ключевые знаки', 'Справка: Случайные знаки'],
  },
  {
    lang: 'es',
    customize: 'Personalizar',
    signs: 'Signos',
    help: ['Ayuda: Armaduras', 'Ayuda: Alteraciones'],
  },
] as const

for (const texts of SIGNS_TEXTS) {
  test.describe(`the help in Signs of Customize in ${texts.lang} on a 360 px wide screen`, () => {
    test.use({ viewport: { width: 360, height: 640 } })

    test('fits the section with its help buttons large enough', async ({ page }) => {
      await page.addInitScript(
        (lang) => localStorage.setItem('puntillo.language', lang),
        texts.lang,
      )
      await page.goto('/')
      await button(page, texts.customize).click()
      const customize = page.getByRole('dialog', { name: texts.customize, exact: true })
      await expect(customize).toBeVisible()
      await expect(customize.locator('svg .vf-stavenote').first()).toBeAttached()
      const signs = customize.getByRole('button', { name: texts.signs, exact: true })
      await signs.click()
      await expect(signs).toHaveAttribute('aria-expanded', 'true')

      for (const name of texts.help) {
        const target = button(page, name)
        await target.scrollIntoViewIfNeeded()
        await expectTarget(target, name)
        const box = await target.boundingBox()
        expect(box?.x, `left edge of ${name}`).toBeGreaterThanOrEqual(0)
        expect(box && box.x + box.width, `right edge of ${name}`).toBeLessThanOrEqual(360)
      }
      const overflow = await customize.evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth)
      expect(overflow, `overflow of the panel in ${texts.lang}`).toBeLessThanOrEqual(0)
      await expectNoHorizontalScroll(page)
    })
  })
}
