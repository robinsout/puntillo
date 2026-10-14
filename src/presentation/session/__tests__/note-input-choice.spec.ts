import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import {
  backToTrainer,
  openSettings,
  renderApp,
  renderSettings,
} from '@/presentation/__tests__/app'
import {
  startSession,
  createMemoryStorage,
  storageWithOneNoteReading,
} from '@/presentation/__tests__/screen'

// Feature piano-keyboard, criteria 1, 16 and 18: the list "Note input" on the length choice, next
// to Language and Note names, with Note names and Piano keyboard, Note names by default; the choice
// is saved like the other preferences.
// Feature navigation-and-settings, slice 1: the list is on the settings screen, in the group Read
// notes, not on the choice screen; the group is shown whatever the exercise.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const TEXTS = {
  en: {
    noteInput: 'Note input',
    names: 'Note names',
    keyboard: 'Piano keyboard',
    noteNames: 'Note names',
  },
  ru: {
    noteInput: 'Ввод нот',
    names: 'Названия нот',
    keyboard: 'Клавиатура фортепиано',
    noteNames: 'Названия нот',
  },
  es: {
    noteInput: 'Entrada de notas',
    names: 'Nombres de las notas',
    keyboard: 'Teclado de piano',
    noteNames: 'Nombres de las notas',
  },
} as const

const EN = TEXTS.en

const list = (name: string = EN.noteInput) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })
const queryList = (name: string = EN.noteInput) => screen.queryByRole('combobox', { name })
const chosenIn = (select: HTMLSelectElement) => select.selectedOptions[0]?.textContent?.trim()
const optionsIn = (select: HTMLSelectElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent?.trim())

// The exercise is chosen by radio buttons in a group named Exercise.
function exerciseSwitch(name = 'Exercise') {
  const group = screen.queryByRole('group', { name }) ?? screen.queryByRole('radiogroup', { name })
  if (!group) throw new Error(`no group named "${name}"`)
  return group
}

async function chooseExercise(name: string) {
  await fireEvent.click(within(exerciseSwitch()).getByRole('radio', { name }))
}

async function choose(option: string, select: HTMLSelectElement = list()) {
  const { value } = within(select).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(select, value)
}

const visitSettings = (locale: Locale = 'en') =>
  renderSettings({ locale, storage: storageWithOneNoteReading() })

// A new render over the same storage stands for a page reload.
async function reload(storage: KeyValueStorage) {
  cleanup()
  await renderSettings({ storage })
}

describe('the Note input list', () => {
  it('is on the settings screen', async () => {
    await visitSettings()

    expect(list()).not.toBeNull()
  })

  it('is not on the choice screen', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })

    expect(queryList()).toBeNull()
  })

  it('comes right after the Note names list', async () => {
    await visitSettings()

    const lists = screen.getAllByRole('combobox')
    const naming = screen.getByRole('combobox', { name: EN.noteNames })
    expect(lists[lists.indexOf(naming) + 1]).toBe(list())
  })

  it('offers Note names and Piano keyboard', async () => {
    await visitSettings()

    expect(optionsIn(list())).toEqual([EN.names, EN.keyboard])
  })

  it('has Note names chosen by default', async () => {
    await visitSettings()

    expect(chosenIn(list())).toBe(EN.names)
  })

  it.each(['en', 'ru', 'es'] as const)('is named and offers its options in %s', async (locale) => {
    await visitSettings(locale)

    const texts = TEXTS[locale]
    const select = list(texts.noteInput)
    expect(select.labels?.[0]?.textContent?.trim()).toBe(texts.noteInput)
    expect(optionsIn(select)).toEqual([texts.names, texts.keyboard])
  })

  it('takes the chosen option', async () => {
    await visitSettings()

    await choose(EN.keyboard)

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('keeps the choice over a reload', async () => {
    const storage = createMemoryStorage()
    await renderSettings({ storage })

    await choose(EN.keyboard)
    await reload(storage)

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('shows the note input saved before', async () => {
    const storage = createMemoryStorage()
    createPreferences(storage, ['en']).chooseNoteInput('keyboard')

    await renderSettings({ storage })

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('is not on the question screen', async () => {
    await visitSettings()
    await backToTrainer()

    await startSession('No limit')

    expect(queryList()).toBeNull()
  })

  // Criterion 7: the group Read notes is shown on the settings screen whatever the exercise
  // chosen on the choice screen, unlike the choice screen before, which hid the list with Write
  // notes.
  it('is shown with Write notes chosen on the choice screen', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })

    await chooseExercise('Write notes')
    await openSettings()

    expect(list()).not.toBeNull()
  })

  it('keeps the value chosen before Write notes was chosen', async () => {
    await visitSettings()
    await choose(EN.keyboard)
    await backToTrainer()
    await chooseExercise('Write notes')

    await openSettings()

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('is shown with Write notes saved before', async () => {
    const storage = createMemoryStorage()
    createPreferences(storage, ['en']).chooseExercise('write')

    await renderSettings({ storage })

    expect(list()).not.toBeNull()
  })
})
