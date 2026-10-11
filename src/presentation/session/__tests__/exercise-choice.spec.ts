import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  constant,
  createManualClock,
  createMemoryStorage,
  loadSession,
  preferencesFor,
  renderSessionWith,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature m2-write-notes, slice 1, criterion 1: the switch Exercise on the length choice, Read
// notes (M1) by default and Write notes (M2). The choice is saved like the other preferences, and
// the whole session goes in the chosen exercise.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const TEXTS = {
  en: {
    exercise: 'Exercise',
    read: 'Read notes',
    write: 'Write notes',
    noLimit: 'No limit',
    readHeading: 'Name the note',
    writeHeading: 'Write the notes',
    finish: 'Finish',
  },
  ru: {
    exercise: 'Упражнение',
    read: 'Читать ноты',
    write: 'Записывать ноты',
    noLimit: 'Без ограничения',
    readHeading: 'Назовите ноту',
    writeHeading: 'Запишите ноты',
    finish: 'Завершить',
  },
  es: {
    exercise: 'Ejercicio',
    read: 'Leer notas',
    write: 'Escribir notas',
    noLimit: 'Sin límite',
    readHeading: 'Nombra la nota',
    writeHeading: 'Escriba las notas',
    finish: 'Terminar',
  },
} as const

// Either a fieldset with a legend or an element with role="radiogroup" names the pair.
function exerciseSwitch(name: string = TEXTS.en.exercise) {
  const group = screen.queryByRole('group', { name }) ?? screen.queryByRole('radiogroup', { name })
  if (!group) throw new Error(`no group named "${name}"`)
  return group
}

const radio = (name: string, group: HTMLElement = exerciseSwitch()) =>
  within(group).getByRole<HTMLInputElement>('radio', { name })
const checkedIn = (group: HTMLElement = exerciseSwitch()) =>
  within(group)
    .getAllByRole<HTMLInputElement>('radio')
    .filter((input) => input.checked)
    .map((input) => input.labels?.[0]?.textContent?.trim())

// A new user, so First steps; the first note is G4 for a constant 0.45 in either exercise.
function renderChoice(storage: KeyValueStorage = createMemoryStorage(), locale: Locale = 'en') {
  renderSessionWith({
    random: constant(0.45),
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
}

const heading = (name: string) => screen.queryByRole('heading', { name, level: 1 })
const writingColumn = () => screen.queryByRole('slider', { name: 'Note 1' })
const noteNameButton = () => screen.queryByRole('button', { name: 'sol' })

// A new render over the same storage stands for a page reload.
function reload(storage: KeyValueStorage) {
  cleanup()
  loadSession(storage)
}

describe('the switch Exercise', () => {
  it('offers Read notes and Write notes, in this order', () => {
    renderChoice()

    const names = within(exerciseSwitch())
      .getAllByRole<HTMLInputElement>('radio')
      .map((input) => input.labels?.[0]?.textContent?.trim())
    expect(names).toEqual(['Read notes', 'Write notes'])
  })

  it('has Read notes chosen for a new user', () => {
    renderChoice()

    expect(checkedIn()).toEqual(['Read notes'])
  })

  it('switches to Write notes', async () => {
    renderChoice()

    await fireEvent.click(radio('Write notes'))

    expect(checkedIn()).toEqual(['Write notes'])
  })

  it.each(['ru', 'es'] as const)('is said in the language of the interface: %s', (locale) => {
    const texts = TEXTS[locale]
    renderChoice(createMemoryStorage(), locale)

    const group = exerciseSwitch(texts.exercise)
    expect(radio(texts.read, group).checked).toBe(true)
    expect(radio(texts.write, group).checked).toBe(false)
  })
})

describe('a session in the chosen exercise', () => {
  it('is Read notes by default: the note is named with the name buttons', async () => {
    renderChoice()

    await chooseLength(TEXTS.en.noLimit)

    expect(heading(TEXTS.en.readHeading)).not.toBeNull()
    expect(noteNameButton()).not.toBeNull()
    expect(writingColumn()).toBeNull()
  })

  it('is Write notes once chosen: the note is written on the staff, no name buttons', async () => {
    renderChoice()
    await fireEvent.click(radio('Write notes'))

    await chooseLength(TEXTS.en.noLimit)

    expect(heading(TEXTS.en.writeHeading)).not.toBeNull()
    expect(writingColumn()).not.toBeNull()
    expect(noteNameButton()).toBeNull()
    expect(heading(TEXTS.en.readHeading)).toBeNull()
  })

  it('moves the focus to the heading of Write notes when it starts', async () => {
    renderChoice()
    await fireEvent.click(radio('Write notes'))

    await chooseLength(TEXTS.en.noLimit)

    await waitFor(() => expect(document.activeElement).toBe(heading(TEXTS.en.writeHeading)))
  })

  it('is Read notes again once Read notes is chosen back', async () => {
    renderChoice()
    await fireEvent.click(radio('Write notes'))
    await fireEvent.click(radio('Read notes'))

    await chooseLength(TEXTS.en.noLimit)

    expect(noteNameButton()).not.toBeNull()
    expect(writingColumn()).toBeNull()
  })

  it.each(['ru', 'es'] as const)('is Write notes in %s too', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice(createMemoryStorage(), locale)
    await fireEvent.click(radio(texts.write, exerciseSwitch(texts.exercise)))

    await chooseLength(texts.noLimit)

    expect(heading(texts.writeHeading)).not.toBeNull()
  })

  it('keeps the exercise on the choice after the session is finished', async () => {
    renderChoice()
    await fireEvent.click(radio('Write notes'))
    await chooseLength(TEXTS.en.noLimit)

    await fireEvent.click(screen.getByRole('button', { name: TEXTS.en.finish }))

    expect(checkedIn()).toEqual(['Write notes'])
  })
})

describe('the chosen exercise', () => {
  it('is kept after a reload', async () => {
    const storage = createMemoryStorage()
    renderChoice(storage)
    await fireEvent.click(radio('Write notes'))

    reload(storage)

    expect(checkedIn()).toEqual(['Write notes'])
  })

  it('starts the session after a reload in Write notes', async () => {
    const storage = createMemoryStorage()
    renderChoice(storage)
    await fireEvent.click(radio('Write notes'))
    reload(storage)

    await chooseLength(TEXTS.en.noLimit)

    expect(writingColumn()).not.toBeNull()
  })

  it('is Read notes again after a reload once chosen back', async () => {
    const storage = createMemoryStorage()
    renderChoice(storage)
    await fireEvent.click(radio('Write notes'))
    await fireEvent.click(radio('Read notes'))

    reload(storage)

    expect(checkedIn()).toEqual(['Read notes'])
  })

  it('works until a reload with an unavailable storage', async () => {
    const storage = unavailableStorage()
    renderChoice(storage)
    await fireEvent.click(radio('Write notes'))
    await chooseLength(TEXTS.en.noLimit)
    expect(writingColumn()).not.toBeNull()

    reload(storage)

    expect(checkedIn()).toEqual(['Read notes'])
  })
})
