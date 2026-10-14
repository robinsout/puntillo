import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import { backToTrainer, renderApp, renderSettings } from '@/presentation/__tests__/app'
import {
  startSession,
  createMemoryStorage,
  preferencesFor,
  storageWithOneNoteReading,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature navigation-and-settings, slice 1: the Language list is on the settings screen, not on
// the choice screen.

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
const settingsHeading = (name: string) => screen.getByRole('heading', { level: 1, name })

async function chooseLanguage(name: string, list: HTMLSelectElement = languageList()) {
  const option = within(list).getByRole<HTMLOptionElement>('option', { name })
  await fireEvent.update(list, option.value)
}

// The settings screen as renderSession left the choice screen: Confident reading with one note.
const visitSettings = (locale: Locale = 'en') =>
  renderSettings({ locale, storage: storageWithOneNoteReading() })

// A page load on the settings screen: the saved preferences are read, the browser languages are
// the fallback.
const loadSettings = (storage: KeyValueStorage, browserLanguages: readonly string[]) =>
  renderSettings({ storage, preferences: preferencesFor(browserLanguages, storage) })

// Saving a value goes through the storage; this one holds garbage under every key.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

// A new render over the same storage stands for a page reload.
async function reload(storage: KeyValueStorage, browserLanguages: readonly string[]) {
  cleanup()
  await loadSettings(storage, browserLanguages)
}

describe('the Language list', () => {
  it('is on the settings screen', async () => {
    await visitSettings()

    expect(languageList()).not.toBeNull()
  })

  it('is not on the choice screen', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })

    expect(screen.queryByRole('combobox', { name: LANGUAGE_LABEL.en })).toBeNull()
  })

  it.each([
    ['en', 'Language'],
    ['ru', 'Язык'],
    ['es', 'Idioma'],
  ] as const)('is named in the interface language: %s → %s', async (locale, name) => {
    await visitSettings(locale)

    expect(languageList(name)).not.toBeNull()
  })

  it.each(['en', 'ru', 'es'] as const)(
    'offers English, Русский and Español untranslated in %s',
    async (locale) => {
      await visitSettings(locale)

      expect(optionsIn(languageList(LANGUAGE_LABEL[locale]))).toEqual(LANGUAGES)
    },
  )

  // Screen readers pronounce each language name in its own language.
  it('marks every language name with its own language', async () => {
    await visitSettings('ru')

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
  ] as const)('shows the current language %s as chosen', async (locale, name) => {
    await visitSettings(locale)

    expect(chosenIn(languageList(LANGUAGE_LABEL[locale]))).toBe(name)
  })

  it('shows English as chosen for a browser in an unsupported language', async () => {
    await loadSettings(createMemoryStorage(), ['de-DE'])

    expect(chosenIn(languageList())).toBe('English')
  })

  it('takes the keyboard focus', async () => {
    await visitSettings()
    const list = languageList()

    list.focus()

    expect(list).toBe(document.activeElement)
    expect(list.disabled).toBe(false)
  })

  it('is not on the question screen', async () => {
    await visitSettings()
    await backToTrainer()

    await startSession('No limit')

    expect(queryLanguageList()).toBeNull()
  })
})

describe('choosing a language', () => {
  it('switches the settings screen to it at once', async () => {
    await visitSettings()

    await chooseLanguage('Русский')

    expect(settingsHeading('Настройки')).not.toBeNull()
    expect(
      screen.getByRole('checkbox', { name: 'Сразу показывать правильный ответ' }),
    ).not.toBeNull()
    const list = languageList('Язык')
    expect(chosenIn(list)).toBe('Русский')
    expect(optionsIn(list)).toEqual(LANGUAGES)
  })

  it('switches the choice screen to it', async () => {
    await visitSettings()

    await chooseLanguage('Русский')
    await backToTrainer('ru')

    expect(screen.getByRole('heading', { level: 1, name: 'Тренажёр' })).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Длина сессии' })).not.toBeNull()
    expect(screen.getByRole('radio', { name: 'Без ограничения' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Начать' })).not.toBeNull()
  })

  it('changes the language of the page', async () => {
    await visitSettings()

    await chooseLanguage('Español')
    expect(pageLanguage()).toBe('es')

    await chooseLanguage('Русский', languageList('Idioma'))
    expect(pageLanguage()).toBe('ru')
  })

  it('can go back to English', async () => {
    await visitSettings('ru')

    await chooseLanguage('English', languageList('Язык'))

    expect(settingsHeading('Settings')).not.toBeNull()
    expect(pageLanguage()).toBe('en')
  })

  it('keeps what was set on the settings screen', async () => {
    await visitSettings()
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Show the right answer at once' }))

    await chooseLanguage('Español')

    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {
        name: 'Mostrar la respuesta correcta de inmediato',
      }).checked,
    ).toBe(true)
  })

  it('carries over to the session', async () => {
    await visitSettings()
    await chooseLanguage('Español')
    await backToTrainer('es')

    await startSession('Sin límite')

    expect(screen.getByRole('heading', { name: 'Nombra la nota' })).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Pentagrama' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Comprobar' })).not.toBeNull()
  })
})

describe('the language after a reload', () => {
  it('is the chosen one, not the browser one', async () => {
    const storage = createMemoryStorage()
    await loadSettings(storage, ['en'])
    await chooseLanguage('Español')

    await reload(storage, ['ru'])

    expect(settingsHeading('Ajustes')).not.toBeNull()
    expect(chosenIn(languageList('Idioma'))).toBe('Español')
    expect(pageLanguage()).toBe('es')
  })

  it('is the chosen one even when it was the browser one', async () => {
    const storage = createMemoryStorage()
    await loadSettings(storage, ['ru'])
    await chooseLanguage('Español', languageList('Язык'))
    await chooseLanguage('Русский', languageList('Idioma'))

    await reload(storage, ['es'])

    expect(chosenIn(languageList('Язык'))).toBe('Русский')
  })

  it('follows the browser while no language was chosen', async () => {
    const storage = createMemoryStorage()
    await loadSettings(storage, ['en'])

    await reload(storage, ['ru'])

    expect(settingsHeading('Настройки')).not.toBeNull()
    expect(chosenIn(languageList('Язык'))).toBe('Русский')
  })

  it.each(['', 'de', 'RU', 'es-ES', '{"language":"ru"}'])(
    'follows the browser when the saved value is not a language: %j',
    async (value) => {
      await loadSettings(storageHolding(value), ['es'])

      expect(settingsHeading('Ajustes')).not.toBeNull()
      expect(chosenIn(languageList('Idioma'))).toBe('Español')
      expect(pageLanguage()).toBe('es')
    },
  )
})

describe('with an unavailable storage', () => {
  it('still switches the interface to the chosen language', async () => {
    await loadSettings(unavailableStorage(), ['en'])

    await chooseLanguage('Русский')

    expect(settingsHeading('Настройки')).not.toBeNull()
    expect(pageLanguage()).toBe('ru')
  })

  it('follows the browser again after a reload', async () => {
    const storage = unavailableStorage()
    await loadSettings(storage, ['en'])
    await chooseLanguage('Русский')

    await reload(storage, ['en'])

    expect(settingsHeading('Settings')).not.toBeNull()
  })
})
