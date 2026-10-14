import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import {
  chooseLength,
  createMemoryStorage,
  loadSession,
  renderSession,
  startingOnC4,
} from '@/presentation/__tests__/screen'

// Feature piano-keyboard, criteria 1, 16 and 18: the list "Note input" on the length choice, next
// to Language and Note names, with Note names and Piano keyboard, Note names by default; the choice
// is saved like the other preferences.

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

// A new render over the same storage stands for a page reload.
function reload(storage: KeyValueStorage) {
  cleanup()
  loadSession(storage)
}

describe('the Note input list', () => {
  it('is on the length choice', () => {
    renderSession()

    expect(list()).not.toBeNull()
  })

  it('comes right after the Note names list', () => {
    renderSession()

    const lists = screen.getAllByRole('combobox')
    const naming = screen.getByRole('combobox', { name: EN.noteNames })
    expect(lists[lists.indexOf(naming) + 1]).toBe(list())
  })

  it('offers Note names and Piano keyboard', () => {
    renderSession()

    expect(optionsIn(list())).toEqual([EN.names, EN.keyboard])
  })

  it('has Note names chosen by default', () => {
    renderSession()

    expect(chosenIn(list())).toBe(EN.names)
  })

  it.each(['en', 'ru', 'es'] as const)('is named and offers its options in %s', (locale) => {
    renderSession(startingOnC4(), undefined, locale)

    const texts = TEXTS[locale]
    const select = list(texts.noteInput)
    expect(select.labels?.[0]?.textContent?.trim()).toBe(texts.noteInput)
    expect(optionsIn(select)).toEqual([texts.names, texts.keyboard])
  })

  it('takes the chosen option', async () => {
    renderSession()

    await choose(EN.keyboard)

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('keeps the choice over a reload', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)

    await choose(EN.keyboard)
    reload(storage)

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('shows the note input saved before', () => {
    const storage = createMemoryStorage()
    createPreferences(storage, ['en']).chooseNoteInput('keyboard')

    loadSession(storage)

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('is not on the question screen', async () => {
    renderSession()

    await chooseLength('No limit')

    expect(queryList()).toBeNull()
  })

  // Criterion 3: the note input holds in Read notes only, so Write notes hides the list and keeps
  // its value, as Read notes hides the box Show note names on the staff.
  it('is not shown with Write notes', async () => {
    renderSession()

    await chooseExercise('Write notes')

    expect(queryList()).toBeNull()
  })

  it('shows again with Read notes chosen back, with the value chosen before', async () => {
    renderSession()
    await choose(EN.keyboard)
    await chooseExercise('Write notes')

    await chooseExercise('Read notes')

    expect(chosenIn(list())).toBe(EN.keyboard)
  })

  it('is not shown with Write notes saved before', () => {
    const storage = createMemoryStorage()
    createPreferences(storage, ['en']).chooseExercise('write')

    loadSession(storage)

    expect(queryList()).toBeNull()
  })
})
