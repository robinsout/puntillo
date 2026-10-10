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

const link = (name: string) => screen.getByRole('link', { name })
const heading = (name: string) => screen.getByRole('heading', { level: 1, name })
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
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
  it('has one topic for now: the durations', async () => {
    await renderApp({ path: '/wiki' })

    const topics = within(screen.getByRole('list')).getAllByRole('link')

    expect(topics.map((topic) => topic.textContent?.trim())).toEqual([DURATIONS_TITLE])
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
