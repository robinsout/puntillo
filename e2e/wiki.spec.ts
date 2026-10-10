import { expect, test, type Locator, type Page } from '@playwright/test'

// Feature wiki, slice 1: the section, the first article and Practice this in a real browser.
// The page starts as for a new user, in First steps, which does not ask for the duration. The
// texts of the article are its authors' to change, so only its title and its examples are checked.

const DURATIONS_TITLE = 'Durations of notes and rests'
const DURATION_BUTTON = /^1\/(1|2|4|8|16)$/

const TOPICS = ['treble-staff', 'durations', 'accidentals', 'key-signatures', 'keys'] as const

// Slice 2: the titles of the five topics and the texts around them, in each language.
const LANGUAGES = {
  en: {
    browser: 'en-US',
    practice: 'Practice this',
    seeAlso: 'See also',
    titles: {
      'treble-staff': 'Notes on the treble staff',
      durations: DURATIONS_TITLE,
      accidentals: 'Sharp, flat and natural',
      'key-signatures': 'Key signatures',
      keys: 'Keys and how to tell them by the key signature',
    },
  },
  ru: {
    browser: 'ru-RU',
    practice: 'Потренировать это',
    seeAlso: 'См. также',
    titles: {
      'treble-staff': 'Ноты на нотоносце в скрипичном ключе',
      durations: 'Длительности нот и пауз',
      accidentals: 'Диез, бемоль и бекар',
      'key-signatures': 'Знаки при ключе',
      keys: 'Тональности и как узнать их по знакам при ключе',
    },
  },
  es: {
    browser: 'es-ES',
    practice: 'Practicar esto',
    seeAlso: 'Véase también',
    titles: {
      'treble-staff': 'Notas en el pentagrama en clave de sol',
      durations: 'Duraciones de notas y silencios',
      accidentals: 'Sostenido, bemol y becuadro',
      'key-signatures': 'Armaduras de clave',
      keys: 'Tonalidades y cómo reconocerlas por la armadura',
    },
  },
} as const
const TITLES = LANGUAGES.en.titles

const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })
const examples = (page: Page) => page.getByRole('main').getByRole('img')
const searchField = (page: Page) => page.getByRole('searchbox', { name: 'Search', exact: true })
const topicLinks = (page: Page) => page.getByRole('main').getByRole('list').getByRole('link')
const seeAlso = (page: Page, name = 'See also') =>
  page.getByRole('heading', { level: 2, name, exact: true })

// WebKit on macOS tabs only through form fields; links and buttons need Option+Tab. The walk
// starts from the heading, as blur() keeps the starting point on the old element in Firefox;
// controls above the heading are reached backwards, as forwards from it Firefox leaves the page.
async function tabTo(page: Page, browserName: string, target: Locator) {
  const heading = page.locator('h1').first()
  const above = await target.evaluate(
    (element, headingElement) =>
      Boolean(headingElement.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
    await heading.elementHandle().then((handle) => handle!),
  )
  const key = `${browserName === 'webkit' ? 'Alt+' : ''}${above ? 'Shift+' : ''}Tab`
  await heading.focus()
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press(key)
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`${String(target)} is not reachable with Tab`)
}

// A list of languages cannot be set via locale: WebKit takes only the first. Overriding the
// Navigator.prototype getters works in all three engines.
async function setBrowserLanguage(page: Page, language: string) {
  await page.addInitScript((first) => {
    Object.defineProperty(Navigator.prototype, 'languages', {
      configurable: true,
      get: () => Object.freeze([first]),
    })
    Object.defineProperty(Navigator.prototype, 'language', { configurable: true, get: () => first })
  }, language)
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

async function openArticle(page: Page) {
  await page.goto('/')
  await link(page, 'Wiki').click()
  await expect(heading(page, 'Wiki')).toBeVisible()
  await link(page, DURATIONS_TITLE).click()
  await expect(heading(page, DURATIONS_TITLE)).toBeVisible()
}

// Assertions use English texts, and WebKit without a locale falls back to the system language.
test.use({ locale: 'en-US' })

test.describe('the wiki', () => {
  test('leads from the choice screen to the article with its examples drawn on the staff', async ({
    page,
  }) => {
    await openArticle(page)

    await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()
    await expect(button(page, 'Practice this')).toBeVisible()
  })

  test('practises the article in a session of No limit, then gives the preset back', async ({
    page,
  }) => {
    await openArticle(page)

    await button(page, 'Practice this').click()

    await expect(heading(page, 'Name the note')).toBeVisible()
    await expect(page.getByText('Question 1', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: DURATION_BUTTON }).first()).toBeVisible()

    await button(page, 'Finish').click()

    await expect(heading(page, 'How many questions?')).toBeVisible()
    await expect(button(page, 'First steps')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Modified', { exact: true })).toHaveCount(0)
    await button(page, '10').click()
    await expect(heading(page, 'Name the note')).toBeVisible()
    await expect(page.getByRole('button', { name: DURATION_BUTTON })).toHaveCount(0)
  })

  test('opens an article from its address', async ({ page }) => {
    await page.goto('/wiki/durations')

    await expect(heading(page, DURATIONS_TITLE)).toBeVisible()
    await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()
  })

  test('opens the article in the language of the interface', async ({ page }) => {
    await setBrowserLanguage(page, 'ru-RU')

    await page.goto('/wiki/durations')

    await expect(heading(page, 'Длительности нот и пауз')).toBeVisible()
    await expect(button(page, 'Потренировать это')).toBeVisible()
  })

  test('leads from the article to the list and from the list to the trainer', async ({ page }) => {
    await openArticle(page)
    await expect(button(page, 'Practice this')).toBeVisible()

    await link(page, 'Wiki').click()
    await expect(heading(page, 'Wiki')).toBeFocused()
    await link(page, 'Trainer').click()

    await expect(heading(page, 'How many questions?')).toBeVisible()
  })

  test('says an unknown topic is not found and links to the list', async ({ page }) => {
    await page.goto('/wiki/xyz')

    await expect(heading(page, 'Article not found')).toBeVisible()
    await link(page, 'Wiki').click()
    await expect(heading(page, 'Wiki')).toBeVisible()
  })

  // Edge case 1 and spec §18: the articles are not part of the initial bundle. Each article is a
  // file of its own, so its request names the topic, in the dev server and in the build alike.
  test('loads the article only when it is opened', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))
    const isArticle = (url: string) => /durations\./.test(new URL(url).pathname)

    await page.goto('/')
    await expect(link(page, 'Wiki')).toBeVisible()
    await link(page, 'Wiki').click()
    await expect(heading(page, 'Wiki')).toBeVisible()
    expect(requested.filter(isArticle)).toEqual([])

    await link(page, DURATIONS_TITLE).click()
    await expect(button(page, 'Practice this')).toBeVisible()
    expect(requested.filter(isArticle)).not.toEqual([])
  })

  test('is used with the keyboard alone', async ({ page, browserName }) => {
    await page.goto('/')
    await expect(link(page, 'Wiki')).toBeVisible()

    await tabTo(page, browserName, link(page, 'Wiki'))
    await page.keyboard.press('Enter')
    await expect(heading(page, 'Wiki')).toBeVisible()
    await tabTo(page, browserName, link(page, DURATIONS_TITLE))
    await page.keyboard.press('Enter')
    await expect(button(page, 'Practice this')).toBeVisible()
    await tabTo(page, browserName, button(page, 'Practice this'))
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Name the note')).toBeVisible()
  })
})

// Feature wiki, slice 2: the five topics, the search and the related topics.
test.describe('the topics of the wiki', () => {
  test('are filtered by the search, and Nothing found is said when none matches', async ({
    page,
  }) => {
    await page.goto('/wiki')
    await expect(topicLinks(page)).toHaveText(TOPICS.map((topic) => TITLES[topic]))

    // In the titles and the English articles, the word is only in those of accidentals.
    await searchField(page).fill('natural')
    await expect(topicLinks(page)).toHaveText([TITLES.accidentals])

    await searchField(page).fill('xyz')
    await expect(page.getByRole('status')).toHaveText('Nothing found')
    await expect(page.getByRole('main').getByRole('list')).toHaveCount(0)

    await searchField(page).fill('')
    await expect(topicLinks(page)).toHaveText(TOPICS.map((topic) => TITLES[topic]))
  })

  test('opens an article found by the search', async ({ page }) => {
    await page.goto('/wiki')
    // Only the title of keys has these words.
    await searchField(page).fill('HOW TO TELL')
    await expect(topicLinks(page)).toHaveText([TITLES.keys])

    await link(page, TITLES.keys).click()

    await expect(heading(page, TITLES.keys)).toBeVisible()
  })

  test('lead from an article to a related one', async ({ page }) => {
    await page.goto('/wiki/accidentals')
    await expect(seeAlso(page)).toBeVisible()

    await link(page, TITLES['key-signatures']).click()

    await expect(page).toHaveURL(/\/wiki\/key-signatures$/)
    await expect(heading(page, TITLES['key-signatures'])).toBeFocused()
    await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()
    await expect(seeAlso(page)).toBeVisible()
  })

  for (const [language, texts] of Object.entries(LANGUAGES)) {
    test(`open every article in ${language}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await setBrowserLanguage(page, texts.browser)

      for (const topic of TOPICS) {
        await page.goto(`/wiki/${topic}`)

        await expect(heading(page, texts.titles[topic])).toBeVisible()
        await expect(button(page, texts.practice)).toBeVisible()
        await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()
        await expect(seeAlso(page, texts.seeAlso)).toBeVisible()
        await expect(page.getByRole('alert')).toHaveCount(0)
      }
      expect(errors).toEqual([])
    })
  }
})

test.describe('the wiki on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('fits the choice screen link, large enough', async ({ page }) => {
    await page.goto('/')
    await expect(link(page, 'Wiki')).toBeVisible()

    await expectTarget(link(page, 'Wiki'), 'Wiki')
    await expectNoHorizontalScroll(page)
  })

  test('fits the list, its links large enough', async ({ page }) => {
    await page.goto('/wiki')
    await expect(heading(page, 'Wiki')).toBeVisible()

    await expectTarget(link(page, DURATIONS_TITLE), DURATIONS_TITLE)
    await expectTarget(link(page, 'Trainer'), 'Trainer')
    await expectNoHorizontalScroll(page)
  })

  test('fits the article and its examples, Practice this large enough', async ({ page }) => {
    await page.goto('/wiki/durations')
    await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()

    await expectTarget(button(page, 'Practice this'), 'Practice this')
    await expectTarget(link(page, 'Wiki'), 'Wiki')
    for (const example of await examples(page).all()) {
      const box = await example.boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    }
    await expectNoHorizontalScroll(page)
  })

  test('fits the page of an unknown topic, its link large enough', async ({ page }) => {
    await page.goto('/wiki/xyz')
    await expect(heading(page, 'Article not found')).toBeVisible()

    await expectTarget(link(page, 'Wiki'), 'Wiki')
    await expectNoHorizontalScroll(page)
  })

  test('fits the search, the field large enough', async ({ page }) => {
    await page.goto('/wiki')
    await expect(searchField(page)).toBeVisible()

    await expectTarget(searchField(page), 'Search')
    for (const topic of await topicLinks(page).all()) await expectTarget(topic, 'a topic')
    await searchField(page).fill('xyz')
    await expect(page.getByRole('status')).toHaveText('Nothing found')
    await expectNoHorizontalScroll(page)
  })

  for (const topic of TOPICS) {
    test(`fits the article ${topic}, its links and buttons large enough`, async ({ page }) => {
      await page.goto(`/wiki/${topic}`)
      await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()
      await expect(seeAlso(page)).toBeVisible()

      await expectNoHorizontalScroll(page)
      for (const each of await page.getByRole('main').getByRole('link').all())
        await expectTarget(each, `the link ${await each.textContent()}`)
      for (const each of await page.getByRole('main').getByRole('button').all())
        await expectTarget(each, `the button ${await each.textContent()}`)
    })
  }
})
