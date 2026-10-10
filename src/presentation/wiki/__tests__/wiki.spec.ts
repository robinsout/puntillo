import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import {
  createMemoryStorage,
  loadSession,
  preferencesFor,
  storageWithNoteNaming,
} from '@/presentation/__tests__/screen'
import { EXAMPLE_LABEL, fakeWikiLibrary, renderApp } from '@/presentation/__tests__/app'

// Feature wiki, slice 1: the section with its first article, criteria 1, 2 (one topic), 4–7 and
// edge cases 1, 2. Keyboard, 44×44 targets and the 360 px width are checked in e2e/wiki.spec.ts.

afterEach(cleanup)

const DURATIONS_TITLE = 'Durations of notes and rests'
const TREBLE_STAFF_TITLE = 'Notes on the treble staff'
const ACCIDENTALS_TITLE = 'Sharp, flat and natural'
const KEY_SIGNATURES_TITLE = 'Key signatures'
const KEYS_TITLE = 'Keys and how to tell them by the key signature'
const ALL_TITLES = [
  TREBLE_STAFF_TITLE,
  DURATIONS_TITLE,
  ACCIDENTALS_TITLE,
  KEY_SIGNATURES_TITLE,
  KEYS_TITLE,
]
const TITLES_RU = [
  'Ноты на нотоносце в скрипичном ключе',
  'Длительности нот и пауз',
  'Диез, бемоль и бекар',
  'Знаки при ключе',
  'Тональности и как узнать их по знакам при ключе',
]
const TITLES_ES = [
  'Notas en el pentagrama en clave de sol',
  'Duraciones de notas y silencios',
  'Sostenido, bemol y becuadro',
  'Armaduras de clave',
  'Tonalidades y cómo reconocerlas por la armadura',
]

const link = (name: string) => screen.getByRole('link', { name })
const heading = (name: string) => screen.getByRole('heading', { level: 1, name })
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const topicsListed = () =>
  within(screen.getByRole('list'))
    .getAllByRole('link')
    .map((topic) => topic.textContent?.trim())
const isPressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'

describe('the link to the wiki on the choice screen', () => {
  it('opens the section with the list of topics', async () => {
    await renderApp()

    await fireEvent.click(link('Wiki'))

    expect(await findHeading('Wiki')).toBeTruthy()
    expect(link(DURATIONS_TITLE)).toBeTruthy()
  })

  it('is in the language of the interface, and so is the section', async () => {
    await renderApp({ locale: 'ru' })

    await fireEvent.click(link('Справка'))

    expect(await findHeading('Справка')).toBeTruthy()
    expect(link('Длительности нот и пауз')).toBeTruthy()
  })
})

describe('the list of topics', () => {
  it('has the five topics in their order', async () => {
    await renderApp({ path: '/wiki' })

    expect(topicsListed()).toEqual(ALL_TITLES)
  })

  it.each([
    ['ru', TITLES_RU],
    ['es', TITLES_ES],
  ] as const)('has them in %s when the interface is', async (locale, titles) => {
    await renderApp({ path: '/wiki', locale })

    expect(topicsListed()).toEqual(titles)
  })

  it('opens the article of a topic', async () => {
    await renderApp({ path: '/wiki' })

    await fireEvent.click(link(DURATIONS_TITLE))

    expect(await findHeading(DURATIONS_TITLE)).toBeTruthy()
  })

  it('loads no article by itself', async () => {
    const wiki = fakeWikiLibrary()
    await renderApp({ path: '/wiki', library: wiki.library })

    expect(wiki.loads).toEqual([])
  })
})

describe('an article', () => {
  it('opens from its address with its title, its text and its examples on the staff', async () => {
    await renderApp({ path: '/wiki/durations' })

    expect(heading(DURATIONS_TITLE)).toBeTruthy()
    expect(await screen.findByText('Article text in en.')).toBeTruthy()
    const example = screen.getByRole('img', { name: EXAMPLE_LABEL })
    expect(example.getAttribute('data-elements')).toBe('C5/half D5/half')
    expect(example.getAttribute('data-time-signature')).toBe('4/4')
  })

  it('keeps the text and the examples in the order of the article', async () => {
    await renderApp({ path: '/wiki/durations' })

    const first = await screen.findByText('Article text in en.')
    const example = screen.getByRole('img', { name: EXAMPLE_LABEL })
    const last = screen.getByText('The note fa♯.')

    expect(first.compareDocumentPosition(example) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(example.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is loaded for its topic in the language of the interface', async () => {
    const wiki = fakeWikiLibrary()
    await renderApp({ path: '/wiki/durations', locale: 'es', library: wiki.library })

    expect(await screen.findByText('Article text in es.')).toBeTruthy()
    expect(wiki.loads).toEqual([{ topic: 'durations', locale: 'es' }])
    expect(heading('Duraciones de notas y silencios')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Practicar esto' })).toBeTruthy()
  })

  it.each([
    ['ru', 'Длительности нот и пауз', 'Потренировать это'],
    ['en', DURATIONS_TITLE, 'Practice this'],
  ] as const)('is in %s when the interface is', async (locale, title, practice) => {
    await renderApp({ path: '/wiki/durations', locale })

    expect(await screen.findByText(`Article text in ${locale}.`)).toBeTruthy()
    expect(heading(title)).toBeTruthy()
    expect(screen.getByRole('button', { name: practice })).toBeTruthy()
  })

  // Criterion 5: the library names the notes; the article asks it in the naming of the user.
  it('names the notes in the naming of the user', async () => {
    await renderApp({ path: '/wiki/durations' })
    expect(await screen.findByText('The note fa♯.')).toBeTruthy()
    cleanup()

    const preferences = preferencesFor(['en'], storageWithNoteNaming('letter'))
    await renderApp({ path: '/wiki/durations', preferences })

    expect(await screen.findByText('The note F♯.')).toBeTruthy()
  })

  // Edge case 1.
  describe('while it loads', () => {
    it('shows its title and a placeholder in place of the text', async () => {
      const wiki = fakeWikiLibrary('held')
      await renderApp({ path: '/wiki/durations', library: wiki.library })

      expect(heading(DURATIONS_TITLE)).toBeTruthy()
      expect(screen.getByRole('status').textContent?.trim()).toBe('Loading…')
      expect(screen.queryByText('Article text in en.')).toBeNull()
      expect(queryButton('Practice this')).toBeNull()
    })

    it('replaces the placeholder with the article once loaded', async () => {
      const wiki = fakeWikiLibrary('held')
      await renderApp({ path: '/wiki/durations', library: wiki.library })

      wiki.release()

      expect(await screen.findByText('Article text in en.')).toBeTruthy()
      expect(screen.queryByText('Loading…')).toBeNull()
      expect(queryButton('Practice this')).toBeTruthy()
    })
  })

  describe('that fails to load', () => {
    it('says so and offers Back', async () => {
      await renderApp({ path: '/wiki/durations', library: fakeWikiLibrary('failing').library })

      const alert = await screen.findByRole('alert')
      expect(alert.textContent?.trim()).toBe("Couldn't load the article.")
      expect(link('Back')).toBeTruthy()
      expect(queryButton('Practice this')).toBeNull()
      expect(screen.queryByText('Loading…')).toBeNull()
    })

    it('goes Back to the list of topics', async () => {
      await renderApp({ path: '/wiki/durations', library: fakeWikiLibrary('failing').library })
      await screen.findByRole('alert')

      await fireEvent.click(link('Back'))

      expect(await findHeading('Wiki')).toBeTruthy()
    })
  })

  // Edge case 2.
  describe('of an unknown topic', () => {
    it.each([
      ['en', 'Article not found'],
      ['ru', 'Статья не найдена'],
      ['es', 'Artículo no encontrado'],
    ] as const)('is not found, in %s', async (locale, text) => {
      await renderApp({ path: '/wiki/xyz', locale })

      expect(heading(text)).toBeTruthy()
    })

    it('links to the list of topics', async () => {
      const wiki = fakeWikiLibrary()
      await renderApp({ path: '/wiki/xyz', library: wiki.library })

      await fireEvent.click(link('Wiki'))

      expect(await findHeading('Wiki')).toBeTruthy()
      expect(wiki.loads).toEqual([])
    })
  })
})

// Criterion 6: the fake article practices the half and the eighth notes with their durations
// asked, while the user is in First steps, which does not ask for the duration.
// Decisions of the coordinator on slice 1: the list links back to the trainer, the article to
// the list, and a move to either puts the focus on its heading, as SessionView does.
describe('moving around the wiki', () => {
  it.each([
    ['en', 'Trainer'],
    ['ru', 'Тренажёр'],
    ['es', 'Entrenador'],
  ] as const)('the list links to the trainer, in %s', async (locale, name) => {
    await renderApp({ path: '/wiki', locale })

    expect(link(name).getAttribute('href')).toBe('/')
  })

  it('the list goes back to the choice screen', async () => {
    await renderApp({ path: '/wiki' })

    await fireEvent.click(link('Trainer'))

    expect(await findHeading('How many questions?')).toBeTruthy()
  })

  it('the article links to the list', async () => {
    await renderApp({ path: '/wiki/durations' })
    await screen.findByText('Article text in en.')

    await fireEvent.click(link('Wiki'))

    expect(await findHeading('Wiki')).toBeTruthy()
  })

  it('puts the focus on the heading of the list', async () => {
    await renderApp()

    await fireEvent.click(link('Wiki'))

    const title = await findHeading('Wiki')
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it('puts the focus on the heading of the article', async () => {
    await renderApp({ path: '/wiki' })

    await fireEvent.click(link(DURATIONS_TITLE))

    const title = await findHeading(DURATIONS_TITLE)
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it('puts the focus back on the heading of the list from an article', async () => {
    await renderApp({ path: '/wiki/durations' })
    await screen.findByText('Article text in en.')

    await fireEvent.click(link('Wiki'))

    const title = await findHeading('Wiki')
    await waitFor(() => expect(document.activeElement).toBe(title))
  })
})

describe('Practice this', () => {
  async function practice(storage = createMemoryStorage()) {
    await renderApp({ path: '/wiki/durations', preferences: preferencesFor(['en'], storage) })
    await fireEvent.click(await screen.findByRole('button', { name: 'Practice this' }))
    expect(await findHeading('Name the note')).toBeTruthy()
    return storage
  }

  it('starts a session of No limit at once', async () => {
    await practice()

    expect(screen.getByText('Question 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy()
  })

  it('asks with the difficulty of the article', async () => {
    await practice()

    expect(screen.getByRole('button', { name: '1/2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1/8' })).toBeTruthy()
    expect(queryButton('1/4')).toBeNull()
  })

  it('leaves the preset of the user: after Finish it is back as it was', async () => {
    await practice()

    await fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    expect(await findHeading('How many questions?')).toBeTruthy()
    expect(isPressed('First steps')).toBe(true)
    expect(screen.queryByText('Modified')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '10' }))
    expect(queryButton('1/2')).toBeNull()
  })

  it('saves nothing: the next visit is in the preset of the user', async () => {
    const storage = await practice()
    cleanup()

    loadSession(storage)

    expect(isPressed('First steps')).toBe(true)
    expect(screen.queryByText('Modified')).toBeNull()
  })
})

// Feature wiki, slice 2, criterion 3: the search field above the list filters the topics by their
// titles and by the texts of their articles, in the language of the interface. Every fake article
// names F♯4 and has a block of its own: "About keys in en.".
describe('the search of topics', () => {
  const searchField = (name = 'Search') => screen.getByRole('searchbox', { name })

  async function searchFor(query: string, name?: string) {
    await fireEvent.update(searchField(name), query)
  }

  const expectListed = (titles: string[]) =>
    waitFor(() => {
      expect(screen.queryByRole('list') && topicsListed()).toEqual(titles)
    })

  const expectNothingFound = (text = 'Nothing found') =>
    waitFor(() => {
      expect(screen.getByRole('status').textContent?.trim()).toBe(text)
      expect(screen.queryByRole('list')).toBeNull()
    })

  it('is a search field with a visible label, above the list', async () => {
    await renderApp({ path: '/wiki' })

    const field = searchField()
    expect(field.getAttribute('type')).toBe('search')
    expect(screen.getByLabelText('Search')).toBe(field)
    expect(screen.getByText('Search')).toBeTruthy()
    const list = screen.getByRole('list')
    expect(field.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([
    ['ru', 'Поиск'],
    ['es', 'Buscar'],
  ] as const)('is labelled in %s', async (locale, name) => {
    await renderApp({ path: '/wiki', locale })

    expect(searchField(name)).toBeTruthy()
  })

  it('starts empty, with every topic listed', async () => {
    await renderApp({ path: '/wiki' })

    expect((searchField() as HTMLInputElement).value).toBe('')
    expect(topicsListed()).toEqual(ALL_TITLES)
  })

  it('finds a topic by its title, whatever the case', async () => {
    await renderApp({ path: '/wiki' })

    await searchFor('SHARP')

    await expectListed([ACCIDENTALS_TITLE])
  })

  it('finds every topic whose title has the query, in the order of the topics', async () => {
    await renderApp({ path: '/wiki' })

    await searchFor('key')

    await expectListed([KEY_SIGNATURES_TITLE, KEYS_TITLE])
  })

  it('finds a topic by the text of its article', async () => {
    await renderApp({ path: '/wiki' })

    await searchFor('about accidentals in en')

    await expectListed([ACCIDENTALS_TITLE])
  })

  it('opens the article of a topic found', async () => {
    await renderApp({ path: '/wiki' })
    await searchFor('about keys in en')
    await expectListed([KEYS_TITLE])

    await fireEvent.click(link(KEYS_TITLE))

    expect(await findHeading(KEYS_TITLE)).toBeTruthy()
  })

  it('says Nothing found in place of the list when nothing matches', async () => {
    await renderApp({ path: '/wiki' })

    await searchFor('xyz')

    await expectNothingFound()
  })

  it.each([
    ['ru', 'Поиск', 'Ничего не найдено'],
    ['es', 'Buscar', 'No se encontró nada'],
  ] as const)('says Nothing found in %s', async (locale, name, text) => {
    await renderApp({ path: '/wiki', locale })

    await searchFor('xyz', name)

    await expectNothingFound(text)
  })

  it('lists every topic again once the field is cleared', async () => {
    await renderApp({ path: '/wiki' })
    await searchFor('xyz')
    await expectNothingFound()

    await searchFor('')

    await expectListed(ALL_TITLES)
    expect(screen.queryByText('Nothing found')).toBeNull()
  })

  it('searches the titles and the articles in the language of the interface', async () => {
    const wiki = fakeWikiLibrary()
    await renderApp({ path: '/wiki', locale: 'ru', library: wiki.library })

    await searchFor('about keys in ru', 'Поиск')
    await expectListed(['Тональности и как узнать их по знакам при ключе'])
    expect(wiki.loads.every(({ locale }) => locale === 'ru')).toBe(true)

    await searchFor('about keys in en', 'Поиск')
    await expectNothingFound('Ничего не найдено')

    await searchFor('бекар', 'Поиск')
    await expectListed(['Диез, бемоль и бекар'])

    await searchFor('Sharp', 'Поиск')
    await expectNothingFound('Ничего не найдено')
  })

  it('ignores the marks over the letters', async () => {
    await renderApp({ path: '/wiki', locale: 'es' })

    await searchFor('COMO RECONOCERLAS', 'Buscar')

    await expectListed(['Tonalidades y cómo reconocerlas por la armadura'])
  })

  it('finds a note by its name in the naming of the user', async () => {
    await renderApp({ path: '/wiki' })
    await searchFor('fa♯')
    await expectListed(ALL_TITLES)
    cleanup()

    const preferences = preferencesFor(['en'], storageWithNoteNaming('letter'))
    await renderApp({ path: '/wiki', preferences })
    await searchFor('F♯')
    await expectListed(ALL_TITLES)
    await searchFor('fa♯')
    await expectNothingFound()
  })

  it('shows the answer to the latest query, even when an earlier one arrives after it', async () => {
    const wiki = fakeWikiLibrary('held')
    await renderApp({ path: '/wiki', library: wiki.library })

    await searchFor('fa♯')
    const loadsOfFirst = wiki.loads.length
    await searchFor('sharp')
    // The search may reuse the articles asked for by the first query rather than ask again.
    const loadsOfSecond = wiki.loads.length - loadsOfFirst
    if (loadsOfSecond > 0) wiki.releaseLast(loadsOfSecond)
    else wiki.release()
    await expectListed([ACCIDENTALS_TITLE])

    wiki.release()

    await new Promise((resolve) => setTimeout(resolve, 0))
    await expectListed([ACCIDENTALS_TITLE])
  })

  it('still finds topics by their titles when the articles fail to load', async () => {
    await renderApp({ path: '/wiki', library: fakeWikiLibrary('failing').library })

    await searchFor('sharp')

    await expectListed([ACCIDENTALS_TITLE])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// Feature wiki, slice 2, criterion 4: after its content an article links its related topics by
// their titles, in the order of the article.
describe('the related topics of an article', () => {
  it('follow the content under See also, in the order of the article', async () => {
    await renderApp({ path: '/wiki/accidentals' })
    const last = await screen.findByText('About accidentals in en.')

    const seeAlso = screen.getByRole('heading', { level: 2, name: 'See also' })
    const related = within(screen.getByRole('list')).getAllByRole('link')

    expect(related.map((each) => each.textContent?.trim())).toEqual([
      KEY_SIGNATURES_TITLE,
      TREBLE_STAFF_TITLE,
    ])
    expect(last.compareDocumentPosition(seeAlso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      seeAlso.compareDocumentPosition(related[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it.each([
    ['ru', 'См. также', ['Знаки при ключе', 'Диез, бемоль и бекар']],
    ['es', 'Véase también', ['Armaduras de clave', 'Sostenido, bemol y becuadro']],
  ] as const)('are in %s when the interface is', async (locale, heading, titles) => {
    await renderApp({ path: '/wiki/keys', locale })
    await screen.findByText(`About keys in ${locale}.`)

    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('link')
        .map((each) => each.textContent?.trim()),
    ).toEqual(titles)
  })

  it('open the related article with its title and its content', async () => {
    const wiki = fakeWikiLibrary()
    const { router } = await renderApp({ path: '/wiki/accidentals', library: wiki.library })
    await screen.findByText('About accidentals in en.')

    await fireEvent.click(link(KEY_SIGNATURES_TITLE))

    expect(await findHeading(KEY_SIGNATURES_TITLE)).toBeTruthy()
    expect(await screen.findByText('About key-signatures in en.')).toBeTruthy()
    expect(screen.queryByText('About accidentals in en.')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/wiki/key-signatures')
    expect(wiki.loads.at(-1)).toEqual({ topic: 'key-signatures', locale: 'en' })
  })

  it('put the focus on the heading of the related article', async () => {
    await renderApp({ path: '/wiki/accidentals' })
    await screen.findByText('About accidentals in en.')

    await fireEvent.click(link(KEY_SIGNATURES_TITLE))

    const title = await findHeading(KEY_SIGNATURES_TITLE)
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it('lead on from one related article to the next', async () => {
    await renderApp({ path: '/wiki/accidentals' })
    await screen.findByText('About accidentals in en.')
    await fireEvent.click(link(KEY_SIGNATURES_TITLE))
    await screen.findByText('About key-signatures in en.')

    await fireEvent.click(link(KEYS_TITLE))

    const title = await findHeading(KEYS_TITLE)
    expect(await screen.findByText('About keys in en.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(title))
  })
})
