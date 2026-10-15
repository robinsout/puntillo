import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import { content, goToSection, renderApp, WIKI } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { preferencesFor, startSession } from '@/presentation/__tests__/screen'

// Feature session-summary, slice 2, criterion 8: a link of an item in Most mistakes opens its
// article as Read the article of a hint does from the review (feature wiki, slice 3): in place of
// the trainer, the session kept. Where the article offers Back to the question during a question,
// it offers Back to the results on the results, on a related article too; it brings back the
// same results, the focus on the link that was followed. Without results to go back to — after
// New session, or after a reload, which starts the page anew — there is no Back to the results.
//
// The page runs in Confident reading with one note in 4/4, the random source a constant 0, so the
// questions are C4 (do), D4 (re), a whole note each; both are answered wrong, so Most mistakes
// holds re4, then do4, each linked to Notes on the treble staff.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    noLimit: 'No limit',
    check: 'Check',
    next: 'Next',
    finish: 'Finish',
    results: 'Results',
    mostMistakes: 'Most mistakes',
    back: 'Back to the results',
    staff: 'Notes on the treble staff',
    practice: 'Practice this',
    wiki: 'Wiki',
  },
  ru: {
    noLimit: 'Без ограничения',
    check: 'Проверить',
    next: 'Далее',
    finish: 'Завершить',
    results: 'Результаты',
    mostMistakes: 'Больше всего ошибок',
    back: 'Назад к результатам',
    staff: 'Ноты на нотоносце в скрипичном ключе',
    practice: 'Потренировать это',
    wiki: 'Справка',
  },
  es: {
    noLimit: 'Sin límite',
    check: 'Comprobar',
    next: 'Siguiente',
    finish: 'Terminar',
    results: 'Resultados',
    mostMistakes: 'Más errores',
    back: 'Volver a los resultados',
    staff: 'Notas en el pentagrama en clave de sol',
    practice: 'Practicar esto',
    wiki: 'Wiki',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
const DURATIONS_TITLE = 'Durations of notes and rests'

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })

// Back to the results may be a link or a button: it is one or the other, once.
const backsToResults = (name: string = EN.back) => [
  ...screen.queryAllByRole('link', { name }),
  ...screen.queryAllByRole('button', { name }),
]

function backToResults(name: string = EN.back) {
  const found = backsToResults(name)
  if (found.length !== 1) throw new Error(`expected one ${name}, found ${found.length}`)
  return found[0] as HTMLElement
}

function items(name: string = EN.mostMistakes): HTMLElement[] {
  const list = screen.queryByRole('list', { name })
  if (!list) throw new Error(`no list named ${name}`)
  return within(list).getAllByRole('listitem')
}

// The link of the item at `index` to the article on the staff.
function staffLink(index: number, texts: (typeof TEXTS)[Locale] = EN): HTMLElement {
  const item = items(texts.mostMistakes)[index]
  if (!item) throw new Error(`no item ${index + 1} in Most mistakes`)
  return within(item).getByRole('link', { name: texts.staff })
}

// Feature design-system, slice 5: the accuracy large with its points, then the figures as terms
// with their values.
const figures = () => [
  screen.getByText(/^\d+%$/),
  screen.getByText(/^\d+ of \d+ points?$/),
  ...screen.getAllByRole('term'),
  ...screen.getAllByRole('definition'),
]

interface Results {
  readonly items: readonly string[]
  readonly figures: readonly string[]
}

const resultsShown = (): Results => ({
  items: items().map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  figures: figures().map((figure) => figure.textContent?.trim() ?? ''),
})

// Both attempts wrong on the name, the duration right.
async function answerWrong(texts: (typeof TEXTS)[Locale], first: string, second: string) {
  await press(first)
  await press('1/1')
  await press(texts.check)
  await press(second)
  await press(texts.check)
}

async function resultsWithTwoMistakes(locale: Locale = 'en') {
  const texts = TEXTS[locale]
  const app = await renderApp({ locale, preferences: preferencesFor([locale]) })
  await startSession(texts.noLimit)
  await answerWrong(texts, 'mi', 'fa')
  await press(texts.next)
  await answerWrong(texts, 'mi', 'fa')
  await press(texts.finish)
  await findHeading(texts.results)
  return app
}

// Follows the link of the second item, re4 being first.
async function readArticleFromResults(locale: Locale = 'en') {
  const texts = TEXTS[locale]
  const app = await resultsWithTwoMistakes(locale)
  const results = locale === 'en' ? resultsShown() : null
  await fireEvent.click(staffLink(1, texts))
  await findHeading(texts.staff)
  await screen.findByText(`About treble-staff in ${locale}.`)
  return { ...app, results }
}

describe('a link in Most mistakes', () => {
  it('opens its article in place of the results', async () => {
    const { router } = await readArticleFromResults()

    expect(router.currentRoute.value.path).toBe('/wiki/treble-staff')
    expect(screen.queryByRole('heading', { level: 1, name: EN.results })).toBeNull()
  })

  it('opens the article with Back to the results', async () => {
    await readArticleFromResults()

    expect(backToResults()).toBeTruthy()
    expect(screen.queryAllByRole('link', { name: 'Back to the question' })).toEqual([])
    expect(screen.queryAllByRole('button', { name: 'Back to the question' })).toEqual([])
  })

  // Decision of the coordinator on slice 2: as during a question, Practice this would replace the
  // session, so Back to the results stands in its place.
  it('opens the article without Practice this', async () => {
    await readArticleFromResults()

    expect(screen.queryByRole('button', { name: EN.practice })).toBeNull()
  })

  it('opens a related article without Practice this, with Back to the results', async () => {
    await readArticleFromResults()

    await fireEvent.click(screen.getByRole('link', { name: DURATIONS_TITLE }))
    await findHeading(DURATIONS_TITLE)
    await screen.findByText('About durations in en.')

    expect(screen.queryByRole('button', { name: EN.practice })).toBeNull()
    expect(backToResults()).toBeTruthy()
  })

  it.each(['ru', 'es'] as const)(
    'opens the article without Practice this in %s',
    async (locale) => {
      await readArticleFromResults(locale)

      expect(screen.queryByRole('button', { name: TEXTS[locale].practice })).toBeNull()
    },
  )
})

// Decision of the coordinator on slice 2: on the list of topics the link Trainer is named as during
// a question, here Back to the results, and it leads back to the same results. Feature
// navigation-and-settings, slice 2: the screen itself has no link Trainer, the navigation has.
describe('the list of topics during the results', () => {
  it('offers Back to the results in place of Trainer', async () => {
    await readArticleFromResults()

    await fireEvent.click(content().getByRole('link', { name: 'Wiki' }))
    await findHeading('Wiki')

    expect(backToResults()).toBeTruthy()
    expect(content().queryByRole('link', { name: 'Trainer' })).toBeNull()
  })

  it('brings back the same results from there', async () => {
    const { results } = await readArticleFromResults()
    await fireEvent.click(content().getByRole('link', { name: 'Wiki' }))
    await findHeading('Wiki')

    await fireEvent.click(backToResults())

    await findHeading(EN.results)
    expect(resultsShown()).toEqual(results)
  })

  it.each(['ru', 'es'] as const)('names it in %s', async (locale) => {
    await readArticleFromResults(locale)

    await fireEvent.click(content().getByRole('link', { name: TEXTS[locale].wiki }))
    await findHeading(TEXTS[locale].wiki)

    expect(backToResults(TEXTS[locale].back)).toBeTruthy()
  })
})

describe('Back to the results', () => {
  it('brings back the same results', async () => {
    const { results } = await readArticleFromResults()

    await fireEvent.click(backToResults())

    await findHeading(EN.results)
    expect(resultsShown()).toEqual(results)
  })

  it('goes to the trainer', async () => {
    const { router } = await readArticleFromResults()

    await fireEvent.click(backToResults())

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  })

  it('puts the focus on the link that was followed', async () => {
    await readArticleFromResults()

    await fireEvent.click(backToResults())

    await findHeading(EN.results)
    await waitFor(() => expect(document.activeElement).toBe(staffLink(1)))
  })

  it('stays on a related article, and brings back the same results from there', async () => {
    const { results } = await readArticleFromResults()

    await fireEvent.click(screen.getByRole('link', { name: DURATIONS_TITLE }))
    await findHeading(DURATIONS_TITLE)
    await screen.findByText('About durations in en.')

    await fireEvent.click(backToResults())
    await findHeading(EN.results)
    expect(resultsShown()).toEqual(results)
    await waitFor(() => expect(document.activeElement).toBe(staffLink(1)))
  })

  it('leaves the results to go on as before: New session opens the choice of length', async () => {
    await readArticleFromResults()
    await fireEvent.click(backToResults())
    await findHeading(EN.results)

    await press('New session')

    expect(await findHeading('Trainer')).toBeTruthy()
  })

  it.each(['ru', 'es'] as const)('is said in %s', async (locale) => {
    await readArticleFromResults(locale)

    expect(backToResults(TEXTS[locale].back)).toBeTruthy()
    expect(backsToResults(EN.back)).toEqual([])
  })
})

describe('without results to go back to', () => {
  it('the article after New session has no Back to the results', async () => {
    await readArticleFromResults()
    await fireEvent.click(backToResults())
    await findHeading(EN.results)
    await press('New session')
    await findHeading('Trainer')

    await goToSection(WIKI.en)
    await findHeading('Wiki')
    await fireEvent.click(screen.getByRole('link', { name: EN.staff }))
    await screen.findByText('About treble-staff in en.')

    expect(backsToResults()).toEqual([])
    expect(screen.getByRole('button', { name: EN.practice })).toBeTruthy()
  })

  it('a reload on the article leaves no Back to the results: the session is not kept', async () => {
    await readArticleFromResults()
    cleanup()

    await renderApp({ path: '/wiki/treble-staff', preferences: preferencesFor(['en']) })
    await screen.findByText('About treble-staff in en.')

    expect(backsToResults()).toEqual([])
  })
})
