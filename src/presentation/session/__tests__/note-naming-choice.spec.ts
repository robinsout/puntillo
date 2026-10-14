import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  backToTrainer,
  openSettings,
  renderApp,
  renderSettings,
} from '@/presentation/__tests__/app'
import {
  chooseLength,
  chooseShownDuration,
  createMemoryStorage,
  NAMES,
  preferencesFor,
  startingOnC4,
  startingOnG4,
  storageWithOneNoteReading,
  statusText,
  storageWithNoteNaming,
  unavailableStorage,
  unpressedNoteNameButtons,
} from '@/presentation/__tests__/screen'

// Feature language-and-naming, slice 2: the list "Note names" on the length choice.
// Feature navigation-and-settings, slice 1: the list is on the settings screen, not on the choice
// screen.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// The options name the systems by their first three notes and are not translated.
const SYSTEMS = ['do, re, mi', 'до, ре, ми', 'C, D, E']
const CYRILLIC = ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си']
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

const TEXTS = {
  en: {
    naming: 'Note names',
    language: 'Language',
    noLimit: 'No limit',
    atOnce: 'Show the right answer at once',
    check: 'Check',
    settings: 'Settings',
  },
  ru: {
    naming: 'Названия нот',
    language: 'Язык',
    noLimit: 'Без ограничения',
    atOnce: 'Сразу показывать правильный ответ',
    check: 'Проверить',
    settings: 'Настройки',
  },
  es: {
    naming: 'Nombres de las notas',
    language: 'Idioma',
    noLimit: 'Sin límite',
    atOnce: 'Mostrar la respuesta correcta de inmediato',
    check: 'Comprobar',
    settings: 'Ajustes',
  },
} as const

const namingList = (name: string = TEXTS.en.naming) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })
const queryNamingList = (name: string = TEXTS.en.naming) => screen.queryByRole('combobox', { name })
const languageList = (name: string = TEXTS.en.language) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })
const chosenIn = (list: HTMLSelectElement) => list.selectedOptions[0]?.textContent?.trim()
const optionsIn = (list: HTMLSelectElement) =>
  within(list)
    .getAllByRole('option')
    .map((option) => option.textContent?.trim())
const pageLanguage = () => document.documentElement.lang

async function choose(option: string, list: HTMLSelectElement) {
  const { value } = within(list).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(list, value)
}

const chooseNaming = (system: string, list: HTMLSelectElement = namingList()) =>
  choose(system, list)

// None is pressed on a fresh question.
const noteNameButtons = () => unpressedNoteNameButtons().map((button) => button.textContent?.trim())
const button = (name: string) => screen.getByRole('button', { name })
const status = statusText

// Garbage under every key, as a damaged storage could hold.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

// The settings screen as the choice screen of the session tests: Confident reading with one note,
// questions from C4 unless given.
const visitSettings = (locale: Locale = 'en', random: Random = startingOnC4()) =>
  renderSettings({ locale, random, storage: storageWithOneNoteReading() })

// A page load on the settings screen: the saved preferences are read, the browser languages are
// the fallback.
const loadSettings = (storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) =>
  renderSettings({ storage, preferences: preferencesFor(browserLanguages, storage) })

// A new render over the same storage stands for a page reload.
async function reload(storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) {
  cleanup()
  await loadSettings(storage, browserLanguages)
}

async function startSession(locale: Locale = 'en') {
  await backToTrainer(locale)
  await chooseLength(TEXTS[locale].noLimit)
}

// With the box ticked, one wrong answer is enough for the review.
async function answerWrongAtOnce(name: string, locale: Locale) {
  const texts = TEXTS[locale]
  await fireEvent.click(screen.getByRole('checkbox', { name: texts.atOnce }))
  await startSession(locale)
  await fireEvent.click(button(name))
  await chooseShownDuration()
  await fireEvent.click(button(texts.check))
}

describe('the Note names list', () => {
  it('is on the settings screen', async () => {
    await visitSettings()

    expect(namingList()).not.toBeNull()
  })

  it('is not on the choice screen', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })

    expect(queryNamingList()).toBeNull()
  })

  it('comes right after the Language list', async () => {
    await visitSettings()

    expect(screen.getAllByRole('combobox').slice(0, 2)).toEqual([languageList(), namingList()])
  })

  it.each(['en', 'ru', 'es'] as const)('is named in the interface language: %s', async (locale) => {
    await visitSettings(locale)

    const list = namingList(TEXTS[locale].naming)
    expect(list.labels?.[0]?.textContent?.trim()).toBe(TEXTS[locale].naming)
  })

  it.each(['en', 'ru', 'es'] as const)(
    'offers do, re, mi; до, ре, ми; C, D, E untranslated in %s',
    async (locale) => {
      await visitSettings(locale)

      expect(optionsIn(namingList(TEXTS[locale].naming))).toEqual(SYSTEMS)
    },
  )

  it.each(['en', 'ru', 'es'] as const)('has do, re, mi chosen by default in %s', async (locale) => {
    await visitSettings(locale)

    expect(chosenIn(namingList(TEXTS[locale].naming))).toBe('do, re, mi')
  })

  // Screen readers pronounce the Cyrillic names in Russian whatever the interface language.
  it.each(['en', 'ru', 'es'] as const)('marks only до, ре, ми as Russian in %s', async (locale) => {
    await visitSettings(locale)

    const languages = within(namingList(TEXTS[locale].naming))
      .getAllByRole('option')
      .map((option) => [option.textContent?.trim(), option.getAttribute('lang')])
    expect(languages).toEqual([
      ['do, re, mi', null],
      ['до, ре, ми', 'ru'],
      ['C, D, E', null],
    ])
  })

  it('takes the keyboard focus', async () => {
    await visitSettings()
    const list = namingList()

    list.focus()

    expect(list).toBe(document.activeElement)
    expect(list.disabled).toBe(false)
  })

  it('is not on the question screen', async () => {
    await visitSettings()

    await startSession()

    expect(queryNamingList()).toBeNull()
  })
})

describe('the note name buttons', () => {
  it('are do, re, mi… by default', async () => {
    await visitSettings()

    await startSession()

    expect(noteNameButtons()).toEqual(NAMES)
  })

  it.each([
    ['до, ре, ми', CYRILLIC],
    ['C, D, E', LETTERS],
    ['do, re, mi', NAMES],
  ])('follow the chosen system %s', async (system, names) => {
    await visitSettings()

    await chooseNaming(system)
    await startSession()

    expect(noteNameButtons()).toEqual(names)
  })

  it.each(['en', 'ru', 'es'] as const)(
    'are marked as Russian in Cyrillic in %s',
    async (locale) => {
      await visitSettings(locale)

      await chooseNaming('до, ре, ми', namingList(TEXTS[locale].naming))
      await startSession(locale)

      expect(CYRILLIC.map((name) => button(name).getAttribute('lang'))).toEqual(
        CYRILLIC.map(() => 'ru'),
      )
    },
  )

  it.each([
    ['do, re, mi', NAMES],
    ['C, D, E', LETTERS],
  ])('have no language mark in %s', async (system, names) => {
    await visitSettings('ru')

    await chooseNaming(system, namingList(TEXTS.ru.naming))
    await startSession('ru')

    expect(names.map((name) => button(name).getAttribute('lang'))).toEqual(names.map(() => null))
  })

  it('show the chosen option as chosen', async () => {
    await visitSettings()

    await chooseNaming('C, D, E')

    expect(chosenIn(namingList())).toBe('C, D, E')
  })

  it('answer in the chosen system', async () => {
    await visitSettings()
    await chooseNaming('C, D, E')
    await startSession()

    await fireEvent.click(button('C'))
    await chooseShownDuration()
    await fireEvent.click(button('Check'))

    expect(status()).toBe('Correct')
  })

  it('follow a system changed between sessions', async () => {
    await visitSettings()
    await chooseNaming('C, D, E')
    await startSession()
    // Nothing is checked, so Finish opens the length choice again.
    await fireEvent.click(button('Finish'))
    await openSettings()

    expect(chosenIn(namingList())).toBe('C, D, E')
    await chooseNaming('до, ре, ми')
    await startSession()

    expect(noteNameButtons()).toEqual(CYRILLIC)
  })
})

// G4 lies on the 2nd line; the 2nd degree is a wrong name for it.
describe('the review of a wrong answer', () => {
  it.each<{ locale: Locale; system: string; chosen: string; review: string }>([
    {
      locale: 'ru',
      system: 'до, ре, ми',
      chosen: 'ре',
      review: 'Вы выбрали ре. Это соль — нота на второй линейке.',
    },
    {
      locale: 'en',
      system: 'C, D, E',
      chosen: 'D',
      review: 'You chose D. This is G: the note on the 2nd line.',
    },
    {
      locale: 'es',
      system: 'C, D, E',
      chosen: 'D',
      review: 'Elegiste D. Es G: la nota en la segunda línea.',
    },
    {
      locale: 'ru',
      system: 'C, D, E',
      chosen: 'D',
      review: 'Вы выбрали D. Это G — нота на второй линейке.',
    },
    {
      locale: 'en',
      system: 'до, ре, ми',
      chosen: 'ре',
      review: 'You chose ре. This is соль: the note on the 2nd line.',
    },
    {
      locale: 'ru',
      system: 'do, re, mi',
      chosen: 're',
      review: 'Вы выбрали re. Это sol — нота на второй линейке.',
    },
  ])('names the notes in $system in $locale', async ({ locale, system, chosen, review }) => {
    await visitSettings(locale, startingOnG4())
    await chooseNaming(system, namingList(TEXTS[locale].naming))

    await answerWrongAtOnce(chosen, locale)

    expect(status()).toBe(review)
  })

  it('names the notes in the chosen system after the second try too', async () => {
    await visitSettings()
    await chooseNaming('C, D, E')
    await startSession()

    await fireEvent.click(button('D'))
    await chooseShownDuration()
    await fireEvent.click(button('Check'))
    expect(status()).toBe('Incorrect. Try again.')
    await fireEvent.click(button('E'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe(
      'You chose E. This is C: the note on the first ledger line below the staff.',
    )
  })
})

// Feature criterion 6.
describe('the note naming and the language', () => {
  it('keeps the language when a system is chosen', async () => {
    await visitSettings()

    await chooseNaming('до, ре, ми')

    expect(screen.getByRole('heading', { level: 1, name: TEXTS.en.settings })).not.toBeNull()
    expect(chosenIn(languageList())).toBe('English')
    expect(pageLanguage()).toBe('en')
  })

  it('keeps the system when a language is chosen', async () => {
    await visitSettings()
    await chooseNaming('C, D, E')

    await choose('Русский', languageList())

    expect(chosenIn(namingList(TEXTS.ru.naming))).toBe('C, D, E')
    await startSession('ru')
    expect(noteNameButtons()).toEqual(LETTERS)
  })

  it('keeps do, re, mi when a language is chosen', async () => {
    await visitSettings()

    await choose('Русский', languageList())

    expect(chosenIn(namingList(TEXTS.ru.naming))).toBe('do, re, mi')
  })

  it('keeps both after a reload', async () => {
    const storage = createMemoryStorage()
    await loadSettings(storage, ['en'])
    await chooseNaming('до, ре, ми')
    await choose('Español', languageList())

    await reload(storage, ['ru'])

    expect(chosenIn(languageList(TEXTS.es.language))).toBe('Español')
    expect(chosenIn(namingList(TEXTS.es.naming))).toBe('до, ре, ми')
  })
})

describe('the note naming after a reload', () => {
  it('is the chosen one', async () => {
    const storage = createMemoryStorage()
    await loadSettings(storage)
    await chooseNaming('C, D, E')

    await reload(storage)

    expect(chosenIn(namingList())).toBe('C, D, E')
    await startSession()
    expect(noteNameButtons()).toEqual(LETTERS)
  })

  it('is the last of several choices', async () => {
    const storage = createMemoryStorage()
    await loadSettings(storage)
    await chooseNaming('C, D, E')
    await chooseNaming('до, ре, ми')

    await reload(storage)

    expect(chosenIn(namingList())).toBe('до, ре, ми')
  })

  it('is do, re, mi again when chosen back', async () => {
    const storage = storageWithNoteNaming('letter')
    await loadSettings(storage)
    await chooseNaming('do, re, mi')

    await reload(storage)

    expect(chosenIn(namingList())).toBe('do, re, mi')
  })

  it('is the saved one with the language still from the browser', async () => {
    await loadSettings(storageWithNoteNaming('cyrillic-syllable'), ['es'])

    expect(screen.getByRole('heading', { level: 1, name: TEXTS.es.settings })).not.toBeNull()
    expect(chosenIn(namingList(TEXTS.es.naming))).toBe('до, ре, ми')
    await startSession('es')
    expect(noteNameButtons()).toEqual(CYRILLIC)
  })

  it.each(['', 'Letter', 'C, D, E', 'до, ре, ми', ' letter', '{"noteNaming":"letter"}'])(
    'is do, re, mi when the saved value is not a system: %j',
    async (value) => {
      await loadSettings(storageHolding(value), ['en'])

      expect(chosenIn(namingList())).toBe('do, re, mi')
      await startSession()
      expect(noteNameButtons()).toEqual(NAMES)
    },
  )
})

describe('the note naming with an unavailable storage', () => {
  it('still applies the chosen system', async () => {
    await loadSettings(unavailableStorage())

    await chooseNaming('C, D, E')
    await startSession()

    expect(noteNameButtons()).toEqual(LETTERS)
  })

  it('is do, re, mi again after a reload', async () => {
    const storage = unavailableStorage()
    await loadSettings(storage)
    await chooseNaming('C, D, E')

    await reload(storage)

    expect(chosenIn(namingList())).toBe('do, re, mi')
  })
})
