import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import {
  content,
  goToSection,
  navigation,
  PROGRESS,
  queryNavigation,
  renderApp,
  SECTION_LINKS,
  SECTIONS,
  SETTINGS,
  TRAINER,
  WIKI,
} from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { createMemoryStorage, preferencesFor } from '@/presentation/__tests__/screen'

// Feature navigation-and-settings, slice 2 (criteria 1–6, edge case 7): every screen but the
// question of a session has the header, its title Puntillo a link to the trainer, and the
// navigation Sections with Trainer, Progress, Wiki and Settings in this order, the section of the
// address marked as the current page, on nested addresses too. A move by the navigation puts the
// focus on the heading of the new screen. The header comes before the content, so Tab reaches
// the navigation first. Its place on a phone and on a desktop: e2e/navigation.spec.ts.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const LOCALES: readonly Locale[] = ['en', 'ru', 'es']
const HREFS = ['/', '/progress', '/wiki', '/settings']
const DURATIONS_TITLE = 'Durations of notes and rests'

// The screens with the navigation, by address, with the heading each opens with in English.
const SCREENS = [
  { path: '/', heading: 'Session length', current: TRAINER },
  { path: '/progress', heading: 'Progress', current: PROGRESS },
  { path: '/wiki', heading: 'Wiki', current: WIKI },
  { path: '/wiki/durations', heading: DURATIONS_TITLE, current: WIKI },
  { path: '/settings', heading: 'Settings', current: SETTINGS },
] as const

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })
const banner = () => screen.queryByRole('banner')

const linksOf = (locale: Locale = 'en') => within(navigation(locale)).getAllByRole('link')
const linkTexts = (locale: Locale = 'en') => linksOf(locale).map((link) => link.textContent?.trim())
const currentLinks = (locale: Locale = 'en') =>
  linksOf(locale)
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent?.trim())

// Confident reading with one note in 4/4, the name and the duration asked: a constant 0 asks C4,
// a whole note.
async function results() {
  const app = await renderApp({ preferences: preferencesFor(['en']) })
  await press('No limit')
  for (const name of ['do', '1/1', 'Check']) await press(name)
  await press('Finish')
  await findHeading('Results')
  return app
}

describe('the navigation (criterion 1)', () => {
  describe.each(SCREENS)('on $path', ({ path, heading, current }) => {
    it.each(LOCALES)('has the four sections in their order, named in %s', async (locale) => {
      await renderApp({ path, locale })
      if (locale === 'en') await findHeading(heading)

      expect(linkTexts(locale)).toEqual(SECTION_LINKS[locale])
      expect(linksOf(locale).map((link) => link.getAttribute('href'))).toEqual(HREFS)
    })

    it(`marks ${current.en} alone as the current page`, async () => {
      await renderApp({ path })
      await findHeading(heading)

      expect(currentLinks()).toEqual([current.en])
    })
  })

  it.each(LOCALES)('is the one navigation of the page, named in %s', async (locale) => {
    await renderApp({ locale })

    expect(screen.getAllByRole('navigation')).toEqual([
      screen.getByRole('navigation', { name: SECTIONS[locale] }),
    ])
  })

  it('is on the results of a session, Trainer the current page', async () => {
    await results()

    expect(linkTexts()).toEqual(SECTION_LINKS.en)
    expect(currentLinks()).toEqual([TRAINER.en])
  })

  it('marks the section current anew after a move', async () => {
    await renderApp()

    await goToSection(SETTINGS.en)
    await findHeading('Settings')

    expect(currentLinks()).toEqual([SETTINGS.en])
  })
})

// Criterion 4.
describe('the question of a session', () => {
  it('has neither the header nor the navigation in Read notes', async () => {
    await renderApp({ preferences: preferencesFor(['en']) })

    await press('No limit')
    await findHeading('Name the note')

    expect(banner()).toBeNull()
    expect(queryNavigation()).toBeNull()
    expect(screen.queryByRole('link', { name: 'Puntillo' })).toBeNull()
  })

  it('has neither the header nor the navigation in Write notes', async () => {
    const storage = createMemoryStorage()
    createPreferences(storage, ['en']).chooseExercise('write')
    await renderApp({ storage })

    await press('No limit')
    await screen.findByRole('button', { name: 'Finish' })

    expect(banner()).toBeNull()
    expect(queryNavigation()).toBeNull()
  })

  it('gets them back once the session is finished', async () => {
    await renderApp({ preferences: preferencesFor(['en']) })
    await press('No limit')
    await findHeading('Name the note')

    await press('Finish')
    await findHeading('Session length')

    expect(banner()).not.toBeNull()
    expect(linkTexts()).toEqual(SECTION_LINKS.en)
  })
})

// Criterion 6.
describe('a move by the navigation', () => {
  it.each([
    { name: PROGRESS.en, path: '/progress', heading: 'Progress' },
    { name: WIKI.en, path: '/wiki', heading: 'Wiki' },
    { name: SETTINGS.en, path: '/settings', heading: 'Settings' },
  ])('opens $heading from the choice screen, the focus on its heading', async (section) => {
    const { router } = await renderApp()

    await goToSection(section.name)

    const title = await findHeading(section.heading)
    expect(router.currentRoute.value.path).toBe(section.path)
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it.each(['/progress', '/wiki', '/wiki/durations', '/settings'])(
    'opens the choice screen by Trainer from %s, the focus on its heading',
    async (path) => {
      const { router } = await renderApp({ path })

      await goToSection(TRAINER.en)

      const title = await findHeading('Session length')
      expect(router.currentRoute.value.path).toBe('/')
      await waitFor(() => expect(document.activeElement).toBe(title))
    },
  )

  it('opens the list of topics by Wiki from an article', async () => {
    await renderApp({ path: '/wiki/durations' })
    await findHeading(DURATIONS_TITLE)

    await goToSection(WIKI.en)

    const title = await findHeading('Wiki')
    await waitFor(() => expect(document.activeElement).toBe(title))
  })
})

// Criterion 3.
describe('the header', () => {
  it.each(LOCALES)('has the title Puntillo, a link to the trainer, in %s', async (locale) => {
    await renderApp({ path: '/progress', locale })

    const header = banner()
    expect(header).not.toBeNull()
    const title = within(header as HTMLElement).getByRole('link', { name: 'Puntillo' })
    expect(title.getAttribute('href')).toBe('/')
  })

  it('leads by its title to the choice screen', async () => {
    const { router } = await renderApp({ path: '/settings' })

    await fireEvent.click(screen.getByRole('link', { name: 'Puntillo' }))

    expect(await findHeading('Session length')).toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/')
  })

  // Edge case 7: Tab follows the order of the page, so the navigation comes before the screen.
  it('holds the navigation and comes before the content of the screen', async () => {
    await renderApp()

    const header = banner() as HTMLElement
    expect(header).not.toBeNull()
    expect(header.contains(navigation())).toBe(true)
    const main = screen.getByRole('main')
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(header.contains(main)).toBe(false)
  })

  it('puts the title before the navigation', async () => {
    await renderApp()

    const title = screen.getByRole('link', { name: 'Puntillo' })
    expect(
      title.compareDocumentPosition(navigation()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

// Criterion 5: the links of the sections on the screens give way to the navigation.
describe('the screens without links of their own to the sections', () => {
  it.each(LOCALES)('the choice screen has no Wiki, Progress nor Settings in %s', async (locale) => {
    await renderApp({ locale })

    for (const name of [WIKI[locale], PROGRESS[locale], SETTINGS[locale]]) {
      expect(content().queryByRole('link', { name })).toBeNull()
    }
  })

  it('the choice screen has no button Keyboard shortcuts', async () => {
    await renderApp()

    expect(content().queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull()
  })

  it.each(['/progress', '/settings', '/wiki'])('%s has no link Trainer', async (path) => {
    await renderApp({ path })

    expect(content().queryByRole('link', { name: TRAINER.en })).toBeNull()
  })

  it('the article keeps its link Wiki to the list of topics', async () => {
    await renderApp({ path: '/wiki/durations' })
    await screen.findByText('Article text in en.')

    expect(content().getByRole('link', { name: WIKI.en }).getAttribute('href')).toBe('/wiki')
  })
})
