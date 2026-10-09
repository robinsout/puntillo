import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  createMemoryStorage,
  loadSession,
  NAMES,
  renderSession,
  startingOnB4,
  startingOnC4,
  startingOnG4,
  storageWithNoteNaming,
  storageWithSeventhNote,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature language-and-naming, slice 3: the seventh note switch B / H.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const LETTERS_B = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const LETTERS_H = ['C', 'D', 'E', 'F', 'G', 'A', 'H']
const CYRILLIC = ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си']

const TEXTS = {
  en: {
    seventh: 'Seventh note',
    naming: 'Note names',
    language: 'Language',
    noLimit: 'No limit',
    atOnce: 'Show the right answer at once',
    check: 'Check',
  },
  ru: {
    seventh: 'Седьмая ступень',
    naming: 'Названия нот',
    language: 'Язык',
    noLimit: 'Без ограничения',
    atOnce: 'Сразу показывать правильный ответ',
    check: 'Проверить',
  },
  es: {
    seventh: 'Séptima nota',
    naming: 'Nombres de las notas',
    language: 'Idioma',
    noLimit: 'Sin límite',
    atOnce: 'Mostrar la respuesta correcta de inmediato',
    check: 'Comprobar',
  },
} as const

// Either a fieldset with a legend or an element with role="radiogroup" names the pair.
const querySwitch = (name: string = TEXTS.en.seventh) =>
  screen.queryByRole('group', { name }) ?? screen.queryByRole('radiogroup', { name })

function seventhSwitch(name: string = TEXTS.en.seventh) {
  const group = querySwitch(name)
  if (!group) throw new Error(`no group named "${name}"`)
  return group
}

const radio = (name: 'B' | 'H', group: HTMLElement = seventhSwitch()) =>
  within(group).getByRole<HTMLInputElement>('radio', { name })
const radiosIn = (group: HTMLElement = seventhSwitch()) =>
  within(group).getAllByRole<HTMLInputElement>('radio')
const checkedIn = (group: HTMLElement = seventhSwitch()) =>
  radiosIn(group)
    .filter((input) => input.checked)
    .map((input) => accessibleNameOf(input))

// The name of a radio comes from its label; the labels hold the letters only.
const accessibleNameOf = (input: HTMLInputElement) =>
  [...(input.labels ?? [])].map((label) => label.textContent?.trim()).join(' ') ||
  input.getAttribute('aria-label')

const namingList = (name: string = TEXTS.en.naming) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })
const languageList = (name: string = TEXTS.en.language) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })

async function choose(option: string, list: HTMLSelectElement) {
  const { value } = within(list).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(list, value)
}

const chooseNaming = (system: string, list: HTMLSelectElement = namingList()) =>
  choose(system, list)

async function chooseSeventh(note: 'B' | 'H', group: HTMLElement = seventhSwitch()) {
  await fireEvent.click(radio(note, group))
}

// The note name buttons are the only toggle buttons; none is pressed on a fresh question.
const noteNameButtons = () =>
  screen.getAllByRole('button', { pressed: false }).map((button) => button.textContent?.trim())
const button = (name: string) => screen.getByRole('button', { name })
const status = () => screen.getByRole('status').textContent?.trim()

// Garbage under every key, as a damaged storage could hold.
const storageHolding = (value: string): KeyValueStorage => ({
  get: () => value,
  set: () => {},
  canSave: () => true,
})

// A new render over the same storage stands for a page reload.
function reload(storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) {
  cleanup()
  loadSession(storage, browserLanguages)
}

async function answerWrongAtOnce(name: string, locale: Locale = 'en') {
  const texts = TEXTS[locale]
  await fireEvent.click(screen.getByRole('checkbox', { name: texts.atOnce }))
  await chooseLength(texts.noLimit)
  await fireEvent.click(button(name))
  await fireEvent.click(button(texts.check))
}

describe('the Seventh note switch', () => {
  it('is hidden with do, re, mi, the default system', () => {
    renderSession()

    expect(querySwitch()).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('appears when C, D, E is chosen', async () => {
    renderSession()

    await chooseNaming('C, D, E')

    expect(seventhSwitch()).not.toBeNull()
  })

  it.each(['en', 'ru', 'es'] as const)('is named in the interface language: %s', async (locale) => {
    renderSession(startingOnC4(), undefined, locale)

    await chooseNaming('C, D, E', namingList(TEXTS[locale].naming))

    expect(seventhSwitch(TEXTS[locale].seventh)).not.toBeNull()
  })

  it.each(['en', 'ru', 'es'] as const)('offers B and H untranslated in %s', async (locale) => {
    renderSession(startingOnC4(), undefined, locale)

    await chooseNaming('C, D, E', namingList(TEXTS[locale].naming))

    const group = seventhSwitch(TEXTS[locale].seventh)
    expect(radiosIn(group).map(accessibleNameOf)).toEqual(['B', 'H'])
  })

  it('has B chosen by default', async () => {
    renderSession()

    await chooseNaming('C, D, E')

    expect(checkedIn()).toEqual(['B'])
  })

  it('comes right after the Note names list', async () => {
    renderSession()

    await chooseNaming('C, D, E')

    const controls = [...document.querySelectorAll('select, input, button')]
    const after = controls.slice(controls.indexOf(namingList()) + 1)
    expect(after.slice(0, 2)).toEqual([radio('B'), radio('H')])
  })

  it('is one group of two radios: choosing one unchooses the other', async () => {
    renderSession()
    await chooseNaming('C, D, E')

    await chooseSeventh('H')
    expect(checkedIn()).toEqual(['H'])

    await chooseSeventh('B')
    expect(checkedIn()).toEqual(['B'])
    expect(radio('B').name).not.toBe('')
    expect(radio('B').name).toBe(radio('H').name)
  })

  it('takes the keyboard focus', async () => {
    renderSession()
    await chooseNaming('C, D, E')

    radio('B').focus()

    expect(radio('B')).toBe(document.activeElement)
    expect(radio('B').disabled).toBe(false)
    expect(radio('H').disabled).toBe(false)
  })

  it.each(['до, ре, ми', 'do, re, mi'])('hides again when %s is chosen', async (system) => {
    renderSession()
    await chooseNaming('C, D, E')

    await chooseNaming(system)

    expect(querySwitch()).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('keeps H while hidden', async () => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    await chooseNaming('до, ре, ми')
    await chooseNaming('C, D, E')

    expect(checkedIn()).toEqual(['H'])
  })

  it('keeps B while hidden after going back from H', async () => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseSeventh('H')
    await chooseSeventh('B')

    await chooseNaming('do, re, mi')
    await chooseNaming('C, D, E')

    expect(checkedIn()).toEqual(['B'])
  })

  it('is not on the question screen', async () => {
    renderSession()
    await chooseNaming('C, D, E')

    await chooseLength('No limit')

    expect(querySwitch()).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})

describe('the note name buttons with the seventh note', () => {
  it('end with B by default in C, D, E', async () => {
    renderSession()
    await chooseNaming('C, D, E')

    await chooseLength('No limit')

    expect(noteNameButtons()).toEqual(LETTERS_B)
  })

  it('end with H when H is chosen, the other letters the same', async () => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    await chooseLength('No limit')

    expect(noteNameButtons()).toEqual(LETTERS_H)
  })

  it('end with B again when B is chosen back', async () => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseSeventh('H')
    await chooseSeventh('B')

    await chooseLength('No limit')

    expect(noteNameButtons()).toEqual(LETTERS_B)
  })

  it.each([
    ['до, ре, ми', CYRILLIC],
    ['do, re, mi', NAMES],
  ])('stay syllables in %s with H remembered', async (system, names) => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    await chooseNaming(system)
    await chooseLength('No limit')

    expect(noteNameButtons()).toEqual(names)
  })

  it('answer si with H', async () => {
    renderSession(startingOnB4())
    await chooseNaming('C, D, E')
    await chooseSeventh('H')
    await chooseLength('No limit')

    await fireEvent.click(button('H'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe('Correct')
  })

  it('follow a seventh note changed between sessions', async () => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseLength('No limit')
    // Nothing is checked, so Finish opens the length choice again.
    await fireEvent.click(button('Finish'))

    expect(checkedIn()).toEqual(['B'])
    await chooseSeventh('H')
    await chooseLength('No limit')

    expect(noteNameButtons()).toEqual(LETTERS_H)
  })
})

// B4 lies on the 3rd line, G4 on the 2nd.
describe('the review of a wrong answer with H', () => {
  it.each<{ locale: Locale; review: string }>([
    { locale: 'en', review: 'You chose C. This is H: the note on the 3rd line.' },
    { locale: 'ru', review: 'Вы выбрали C. Это H — нота на третьей линейке.' },
    { locale: 'es', review: 'Elegiste C. Es H: la nota en la tercera línea.' },
  ])('names si H as the right note in $locale', async ({ locale, review }) => {
    renderSession(startingOnB4(), undefined, locale)
    await chooseNaming('C, D, E', namingList(TEXTS[locale].naming))
    await chooseSeventh('H', seventhSwitch(TEXTS[locale].seventh))

    await answerWrongAtOnce('C', locale)

    expect(status()).toBe(review)
  })

  it('names si H as the chosen note', async () => {
    renderSession(startingOnG4())
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    await answerWrongAtOnce('H')

    expect(status()).toBe('You chose H. This is G: the note on the 2nd line.')
  })

  it('names si B with B', async () => {
    renderSession(startingOnB4())
    await chooseNaming('C, D, E')

    await answerWrongAtOnce('C')

    expect(status()).toBe('You chose C. This is B: the note on the 3rd line.')
  })

  it('names si H after the second try too', async () => {
    renderSession(startingOnB4())
    await chooseNaming('C, D, E')
    await chooseSeventh('H')
    await chooseLength('No limit')

    await fireEvent.click(button('C'))
    await fireEvent.click(button('Check'))
    expect(status()).toBe('Incorrect. Try again.')
    await fireEvent.click(button('D'))
    await fireEvent.click(button('Check'))

    expect(status()).toBe('You chose D. This is H: the note on the 3rd line.')
  })
})

describe('the seventh note and the other preferences', () => {
  it('keeps C, D, E and the language when H is chosen', async () => {
    renderSession()
    await chooseNaming('C, D, E')

    await chooseSeventh('H')

    expect(namingList().selectedOptions[0]?.textContent?.trim()).toBe('C, D, E')
    expect(languageList().selectedOptions[0]?.textContent?.trim()).toBe('English')
    expect(document.documentElement.lang).toBe('en')
  })

  it('is kept when a language is chosen', async () => {
    renderSession()
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    await choose('Русский', languageList())

    expect(checkedIn(seventhSwitch(TEXTS.ru.seventh))).toEqual(['H'])
  })
})

describe('the seventh note after a reload', () => {
  it('is the chosen H', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    reload(storage)

    expect(checkedIn()).toEqual(['H'])
    await chooseLength('No limit')
    expect(noteNameButtons()).toEqual(LETTERS_H)
  })

  it('is B again when chosen back', async () => {
    const storage = storageWithSeventhNote('H', storageWithNoteNaming('letter'))
    loadSession(storage)
    await chooseSeventh('B')

    reload(storage)

    expect(checkedIn()).toEqual(['B'])
  })

  it('is remembered while another system is saved', async () => {
    const storage = storageWithSeventhNote('H', storageWithNoteNaming('cyrillic-syllable'))
    loadSession(storage)

    expect(querySwitch()).toBeNull()
    await chooseNaming('C, D, E')

    expect(checkedIn()).toEqual(['H'])
  })

  it.each(['', 'h', ' H', '"H"', 'Bb', '{"seventhNote":"H"}', 'letter'])(
    'is B when the saved value is not B or H: %j',
    async (value) => {
      loadSession(storageHolding(value))
      await chooseNaming('C, D, E')

      expect(checkedIn()).toEqual(['B'])
      await chooseLength('No limit')
      expect(noteNameButtons()).toEqual(LETTERS_B)
    },
  )
})

describe('the seventh note with an unavailable storage', () => {
  it('still applies H', async () => {
    loadSession(unavailableStorage())
    await chooseNaming('C, D, E')

    await chooseSeventh('H')
    await chooseLength('No limit')

    expect(noteNameButtons()).toEqual(LETTERS_H)
  })

  it('is B again after a reload', async () => {
    const storage = unavailableStorage()
    loadSession(storage)
    await chooseNaming('C, D, E')
    await chooseSeventh('H')

    reload(storage)
    await chooseNaming('C, D, E')

    expect(checkedIn()).toEqual(['B'])
  })
})
