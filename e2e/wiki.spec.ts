import { expect, test, type Locator, type Page } from '@playwright/test'
import { section } from './navigation'
import { startSession } from './session-length'

// Feature wiki, slice 1: the section, the first article and Practice this in a real browser.
// The page starts as for a new user, in First steps, which does not ask for the duration. The
// texts of the article are its authors' to change, so only its title and its examples are checked.
// Feature navigation-and-settings, slice 2: the wiki is reached by the tab Wiki and left by the tab
// Trainer; an article keeps its own link Wiki to the list.
// Feature design-system, slice 6, criterion 11, edge cases 3 and 6: the topics and See also are
// lines as wide as their list, each with a chevron on the right; the credit of the piano sound is
// set small on lines as close as its text; Practice this takes the whole column on a phone only;
// long Spanish titles wrap, and an article fits with the text of the browser at 200 %.

const DURATIONS_TITLE = 'Durations of notes and rests'
const DURATION_BUTTON = /^1\/(1|2|4|8|16)$/

const TOPICS = [
  'treble-staff',
  'durations',
  'accidentals',
  'key-signatures',
  'keys',
  'piano-keyboard',
] as const

// Slice 2: the titles of the topics and the texts around them, in each language.
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
      'piano-keyboard': 'The piano keyboard',
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
      'piano-keyboard': 'Клавиатура фортепиано',
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
      'piano-keyboard': 'El teclado del piano',
    },
  },
} as const
const TITLES = LANGUAGES.en.titles

const link = (page: Page, name: string) => page.getByRole('link', { name, exact: true })
const contentLink = (page: Page, name: string) =>
  page.getByRole('main').getByRole('link', { name, exact: true })
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

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element is not laid out')
  return box
}

// The texts of the content cut by their box or by the edges of the screen. An inline element has
// no client width of its own (Firefox still gives it a scroll width), so each of its fragments on
// its lines is measured against the edges instead.
function cutTexts(page: Page, width: number) {
  return page.getByRole('main').evaluate((main, right) => {
    const found: string[] = []
    const outside = (box: DOMRect) => box.left < 0 || box.right > right
    for (const element of main.querySelectorAll<HTMLElement>('h1, h2, p, li, a, button, label')) {
      const box = element.getBoundingClientRect()
      if (box.width === 0) continue
      const cut =
        getComputedStyle(element).display === 'inline'
          ? [...element.getClientRects()].some(outside)
          : element.scrollWidth > element.clientWidth + 1 || outside(box)
      if (cut) found.push(element.textContent?.trim() ?? element.tagName)
    }
    return found
  }, width)
}

// Each link a line as wide as its list, 44 px high at least, its chevron at its right end.
async function expectLinkLines(list: Locator) {
  const listBox = await boxOf(list)
  const links = await list.getByRole('link').all()
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) {
    const what = await link.textContent()
    const box = await boxOf(link)
    expect(Math.abs(box.x - listBox.x), `left edge of ${what}`).toBeLessThanOrEqual(1.5)
    expect(Math.abs(box.width - listBox.width), `width of ${what}`).toBeLessThanOrEqual(3)
    expect(box.height, `height of ${what}`).toBeGreaterThanOrEqual(44 - 0.01)
    const chevron = await boxOf(link.locator('svg'))
    expect(
      box.x + box.width - (chevron.x + chevron.width),
      `chevron of ${what}`,
    ).toBeLessThanOrEqual(24)
    expect(chevron.x, `chevron of ${what}`).toBeGreaterThan(box.x + box.width / 2)
  }
}

async function openArticle(page: Page) {
  await page.goto('/')
  await section(page, 'Wiki').click()
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

    await expect(heading(page, 'Trainer')).toBeAttached()
    await expect(button(page, 'First steps')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Modified', { exact: true })).toHaveCount(0)
    await startSession(page, '10')
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

  test('leads from the article to the list, and the tab Trainer to the trainer', async ({
    page,
  }) => {
    await openArticle(page)
    await expect(button(page, 'Practice this')).toBeVisible()

    await contentLink(page, 'Wiki').click()
    await expect(heading(page, 'Wiki')).toBeFocused()
    await section(page, 'Trainer').click()

    await expect(heading(page, 'Trainer')).toBeAttached()
  })

  test('says an unknown topic is not found and links to the list', async ({ page }) => {
    await page.goto('/wiki/xyz')

    await expect(heading(page, 'Article not found')).toBeVisible()
    await contentLink(page, 'Wiki').click()
    await expect(heading(page, 'Wiki')).toBeVisible()
  })

  // Edge case 1 and spec §18: the articles are not part of the initial bundle. Each article is a
  // file of its own, so its request names the topic, in the dev server and in the build alike.
  test('loads the article only when it is opened', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))
    const isArticle = (url: string) => /durations\./.test(new URL(url).pathname)

    await page.goto('/')
    await expect(section(page, 'Wiki')).toBeVisible()
    await section(page, 'Wiki').click()
    await expect(heading(page, 'Wiki')).toBeVisible()
    expect(requested.filter(isArticle)).toEqual([])

    await link(page, DURATIONS_TITLE).click()
    await expect(button(page, 'Practice this')).toBeVisible()
    expect(requested.filter(isArticle)).not.toEqual([])
  })

  test('is used with the keyboard alone', async ({ page, browserName }) => {
    await page.goto('/')
    await expect(section(page, 'Wiki')).toBeVisible()

    await tabTo(page, browserName, section(page, 'Wiki'))
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

// Feature wiki, slice 2: the topics, the search and the related topics.
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

  // Feature midi-input, slice 3, criterion 11: the paragraph on the MIDI keyboard is in this
  // article alone.
  for (const [language, texts] of Object.entries(LANGUAGES)) {
    test(`find The piano keyboard alone by MIDI in ${language}`, async ({ page }) => {
      await setBrowserLanguage(page, texts.browser)
      await page.goto('/wiki')

      await page.getByRole('main').getByRole('searchbox').fill('MIDI')

      await expect(topicLinks(page)).toHaveText([texts.titles['piano-keyboard']])
    })
  }

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

  test('fits the tab Wiki on the choice screen, large enough', async ({ page }) => {
    await page.goto('/')
    await expect(section(page, 'Wiki')).toBeVisible()

    await expectTarget(section(page, 'Wiki'), 'Wiki')
    await expectNoHorizontalScroll(page)
  })

  test('fits the list, its links large enough', async ({ page }) => {
    await page.goto('/wiki')
    await expect(heading(page, 'Wiki')).toBeVisible()

    await expectTarget(link(page, DURATIONS_TITLE), DURATIONS_TITLE)
    await expectTarget(section(page, 'Trainer'), 'Trainer')
    await expectNoHorizontalScroll(page)
  })

  test('fits the article and its examples, Practice this large enough', async ({ page }) => {
    await page.goto('/wiki/durations')
    await expect(examples(page).first().locator('svg .vf-stavenote').first()).toBeVisible()

    await expectTarget(button(page, 'Practice this'), 'Practice this')
    await expectTarget(contentLink(page, 'Wiki'), 'Wiki')
    for (const example of await examples(page).all()) {
      const box = await example.boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(360)
    }
    await expectNoHorizontalScroll(page)
  })

  test('fits the page of an unknown topic, its link large enough', async ({ page }) => {
    await page.goto('/wiki/xyz')
    await expect(heading(page, 'Article not found')).toBeVisible()

    await expectTarget(contentLink(page, 'Wiki'), 'Wiki')
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

  // Feature piano-keyboard, slice 3, criterion 18.
  test('fits the credit of the piano sound below the topics, its links large enough', async ({
    page,
  }) => {
    await page.goto('/wiki')
    const samples = link(page, 'Salamander Grand Piano')
    const license = link(page, 'CC BY 3.0')
    await samples.scrollIntoViewIfNeeded()

    await expect(samples).toBeVisible()
    await expect(license).toBeVisible()
    await expect(samples).toHaveAttribute(
      'href',
      'https://archive.org/details/SalamanderGrandPianoV3',
    )
    await expect(license).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0/')
    await expectTarget(samples, 'the link Salamander Grand Piano')
    await expectTarget(license, 'the link CC BY 3.0')
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

  test('stretches each topic over the list, its chevron on the right', async ({ page }) => {
    await page.goto('/wiki')
    await expect(topicLinks(page)).toHaveCount(TOPICS.length)

    await expectLinkLines(page.getByRole('main').getByRole('list'))
    await expectNoHorizontalScroll(page)
  })

  test('stretches each topic of See also over its list, its chevron on the right', async ({
    page,
  }) => {
    await page.goto('/wiki/accidentals')
    await expect(seeAlso(page)).toBeVisible()

    await expectLinkLines(page.getByRole('main').getByRole('list'))
  })

  test('sets the credit of the piano sound small, its lines as close as its text', async ({
    page,
  }) => {
    await page.goto('/wiki')
    const credit = link(page, 'CC BY 3.0').locator('xpath=..')
    await credit.scrollIntoViewIfNeeded()

    const set = await credit.evaluate((element) => {
      const style = getComputedStyle(element)
      const tops = new Set<number>()
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects())
          if (rect.width > 0) tops.add(Math.round(rect.top))
      }
      return {
        fontSize: parseFloat(style.fontSize),
        lineHeight: parseFloat(style.lineHeight),
        height: element.getBoundingClientRect().height,
        lines: tops.size,
      }
    })
    const topic = await link(page, DURATIONS_TITLE).evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    )
    expect(set.fontSize).toBeLessThan(topic)
    expect(set.lines).toBeGreaterThan(0)
    expect(set.height).toBeLessThanOrEqual(set.lines * set.lineHeight + 1)
  })

  test('stretches Practice this over the column', async ({ page }) => {
    await page.goto('/wiki/durations')
    await expect(button(page, 'Practice this')).toBeVisible()

    const column = await boxOf(heading(page, DURATIONS_TITLE))
    const practice = await boxOf(button(page, 'Practice this'))
    expect(Math.abs(practice.x - column.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(practice.width - column.width)).toBeLessThanOrEqual(0.5)
    expect(practice.height).toBeGreaterThanOrEqual(52 - 0.01)
  })

  test('puts the link Wiki of an article above its title, large enough', async ({ page }) => {
    await page.goto('/wiki/durations')
    await expect(button(page, 'Practice this')).toBeVisible()

    const wiki = await boxOf(contentLink(page, 'Wiki'))
    const title = await boxOf(heading(page, DURATIONS_TITLE))
    expect(wiki.y + wiki.height).toBeLessThanOrEqual(title.y + 0.5)
    await expectTarget(contentLink(page, 'Wiki'), 'Wiki')
  })
})

test.describe('the wiki in Spanish on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, locale: 'es-ES' })

  test.beforeEach(async ({ page }) => {
    await setBrowserLanguage(page, 'es-ES')
  })

  test('wraps the long titles of the topics rather than cutting them', async ({ page }) => {
    await page.goto('/wiki')
    await expect(topicLinks(page)).toHaveText(TOPICS.map((topic) => LANGUAGES.es.titles[topic]))

    await expectNoHorizontalScroll(page)
    expect(await cutTexts(page, 360)).toEqual([])
    await expectLinkLines(page.getByRole('main').getByRole('list'))
  })

  test('wraps the long title of an article rather than cutting it', async ({ page }) => {
    await page.goto('/wiki/keys')
    await expect(seeAlso(page, LANGUAGES.es.seeAlso)).toBeVisible()

    await expectNoHorizontalScroll(page)
    expect(await cutTexts(page, 360)).toEqual([])
  })
})

// Edge case 6: the text of the browser at 200 %, set as the size of the root font, which every size
// of the system follows.
test.describe('the article with the text at 200 % on a 360 px wide screen', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  for (const topic of ['keys', 'piano-keyboard'] as const) {
    test(`fits the article ${topic}, none of its text cut`, async ({ page }) => {
      await page.goto(`/wiki/${topic}`)
      await expect(seeAlso(page)).toBeVisible()

      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
        .toBe('32px')

      await expectNoHorizontalScroll(page)
      expect(await cutTexts(page, 360)).toEqual([])
      await expectTarget(button(page, 'Practice this'), 'Practice this')
    })
  }
})

test.describe('the article on a 1440 px wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('keeps Practice this as wide as its text, not the column', async ({ page }) => {
    await page.goto('/wiki/durations')
    await expect(button(page, 'Practice this')).toBeVisible()

    const column = await boxOf(heading(page, DURATIONS_TITLE))
    const practice = await boxOf(button(page, 'Practice this'))
    expect(practice.width).toBeLessThan(column.width / 2)
    expect(practice.height).toBeGreaterThanOrEqual(52 - 0.01)
  })
})
