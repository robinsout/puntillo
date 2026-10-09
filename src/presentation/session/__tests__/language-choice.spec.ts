import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import {
  chooseLength,
  createMemoryStorage,
  loadSession,
  renderSession,
  startingOnC4,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// Feature language-and-naming: language names are written in their own language and are not
// translated.
const LANGUAGES = ['English', 'Русский', 'Español']

const LANGUAGE_LABEL = { en: 'Language', ru: 'Язык', es: 'Idioma' } as const

const languageList = (name: string = LANGUAGE_LABEL.en) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })
const queryLanguageList = () => screen.queryByRole('combobox')
const chosenIn = (list: HTMLSelectElement) => list.selectedOptions[0]?.textContent?.trim()
const optionsIn = (list: HTMLSelectElement) =>
  within(list)
    .getAllByRole('option')
    .map((option) => option.textContent?.trim())
const pageLanguage = () => document.documentElement.lang

async function chooseLanguage(name: string, list: HTMLSelectElement = languageList()) {
  const option = within(list).getByRole<HTMLOptionElement>('option', { name })
  await fireEvent.update(list, option.value)
}

// Saving a value goes through the storage; this one holds garbage under every key.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

// A new render over the same storage stands for a page reload.
function reload(storage: KeyValueStorage, browserLanguages: readonly string[]) {
  cleanup()
  loadSession(storage, browserLanguages)
}

describe('the Language list', () => {
  it('is on the length choice', () => {
    renderSession()

    expect(languageList()).not.toBeNull()
  })

  it.each([
    ['en', 'Language'],
    ['ru', 'Язык'],
    ['es', 'Idioma'],
  ] as const)('is named in the interface language: %s → %s', (locale, name) => {
    renderSession(startingOnC4(), undefined, locale)

    expect(languageList(name)).not.toBeNull()
  })

  it.each(['en', 'ru', 'es'] as const)(
    'offers English, Русский and Español untranslated in %s',
    (locale) => {
      renderSession(startingOnC4(), undefined, locale)

      expect(optionsIn(languageList(LANGUAGE_LABEL[locale]))).toEqual(LANGUAGES)
    },
  )

  // Screen readers pronounce each language name in its own language.
  it('marks every language name with its own language', () => {
    renderSession(startingOnC4(), undefined, 'ru')

    const languages = within(languageList('Язык'))
      .getAllByRole('option')
      .map((option) => [option.textContent?.trim(), option.getAttribute('lang')])
    expect(languages).toEqual([
      ['English', 'en'],
      ['Русский', 'ru'],
      ['Español', 'es'],
    ])
  })

  it.each([
    ['en', 'English'],
    ['ru', 'Русский'],
    ['es', 'Español'],
  ] as const)('shows the current language %s as chosen', (locale, name) => {
    renderSession(startingOnC4(), undefined, locale)

    expect(chosenIn(languageList(LANGUAGE_LABEL[locale]))).toBe(name)
  })

  it('shows English as chosen for a browser in an unsupported language', () => {
    loadSession(createMemoryStorage(), ['de-DE'])

    expect(chosenIn(languageList())).toBe('English')
  })

  it('takes the keyboard focus', () => {
    renderSession()
    const list = languageList()

    list.focus()

    expect(list).toBe(document.activeElement)
    expect(list.disabled).toBe(false)
  })

  it('is not on the question screen', async () => {
    renderSession()

    await chooseLength('No limit')

    expect(queryLanguageList()).toBeNull()
  })
})

describe('choosing a language', () => {
  it('switches the length choice to it at once', async () => {
    renderSession()

    await chooseLanguage('Русский')

    expect(screen.getByRole('heading', { name: 'Сколько вопросов?' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Без ограничения' })).not.toBeNull()
    expect(
      screen.getByRole('checkbox', { name: 'Сразу показывать правильный ответ' }),
    ).not.toBeNull()
    const list = languageList('Язык')
    expect(chosenIn(list)).toBe('Русский')
    expect(optionsIn(list)).toEqual(LANGUAGES)
  })

  it('changes the language of the page', async () => {
    renderSession()

    await chooseLanguage('Español')
    expect(pageLanguage()).toBe('es')

    await chooseLanguage('Русский', languageList('Idioma'))
    expect(pageLanguage()).toBe('ru')
  })

  it('can go back to English', async () => {
    renderSession(startingOnC4(), undefined, 'ru')

    await chooseLanguage('English', languageList('Язык'))

    expect(screen.getByRole('heading', { name: 'How many questions?' })).not.toBeNull()
    expect(pageLanguage()).toBe('en')
  })

  it('keeps what was set on the length choice', async () => {
    renderSession()
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Show the right answer at once' }))

    await chooseLanguage('Español')

    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {
        name: 'Mostrar la respuesta correcta de inmediato',
      }).checked,
    ).toBe(true)
  })

  it('carries over to the session', async () => {
    renderSession()
    await chooseLanguage('Español')

    await chooseLength('Sin límite')

    expect(screen.getByRole('heading', { name: 'Nombra la nota' })).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Pentagrama' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Comprobar' })).not.toBeNull()
  })
})

describe('the language after a reload', () => {
  it('is the chosen one, not the browser one', async () => {
    const storage = createMemoryStorage()
    loadSession(storage, ['en'])
    await chooseLanguage('Español')

    reload(storage, ['ru'])

    expect(screen.getByRole('heading', { name: '¿Cuántas preguntas?' })).not.toBeNull()
    expect(chosenIn(languageList('Idioma'))).toBe('Español')
    expect(pageLanguage()).toBe('es')
  })

  it('is the chosen one even when it was the browser one', async () => {
    const storage = createMemoryStorage()
    loadSession(storage, ['ru'])
    await chooseLanguage('Español', languageList('Язык'))
    await chooseLanguage('Русский', languageList('Idioma'))

    reload(storage, ['es'])

    expect(chosenIn(languageList('Язык'))).toBe('Русский')
  })

  it('follows the browser while no language was chosen', () => {
    const storage = createMemoryStorage()
    loadSession(storage, ['en'])

    reload(storage, ['ru'])

    expect(screen.getByRole('heading', { name: 'Сколько вопросов?' })).not.toBeNull()
    expect(chosenIn(languageList('Язык'))).toBe('Русский')
  })

  it.each(['', 'de', 'RU', 'es-ES', '{"language":"ru"}'])(
    'follows the browser when the saved value is not a language: %j',
    (value) => {
      loadSession(storageHolding(value), ['es'])

      expect(screen.getByRole('heading', { name: '¿Cuántas preguntas?' })).not.toBeNull()
      expect(chosenIn(languageList('Idioma'))).toBe('Español')
      expect(pageLanguage()).toBe('es')
    },
  )
})

describe('with an unavailable storage', () => {
  it('still switches the interface to the chosen language', async () => {
    loadSession(unavailableStorage(), ['en'])

    await chooseLanguage('Русский')

    expect(screen.getByRole('heading', { name: 'Сколько вопросов?' })).not.toBeNull()
    expect(pageLanguage()).toBe('ru')
  })

  it('follows the browser again after a reload', async () => {
    const storage = unavailableStorage()
    loadSession(storage, ['en'])
    await chooseLanguage('Русский')

    reload(storage, ['en'])

    expect(screen.getByRole('heading', { name: 'How many questions?' })).not.toBeNull()
  })
})
