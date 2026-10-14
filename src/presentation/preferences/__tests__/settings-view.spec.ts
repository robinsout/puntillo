import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import type { Exercise } from '@/domain/session'
import {
  backToTrainer,
  content,
  goToSection,
  openSettings,
  renderApp,
  renderSettings,
  SETTINGS,
  TRAINER,
} from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  createMemoryStorage,
  fullStorage,
  storageWithOneNoteReading,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature navigation-and-settings, slice 1: the screen Settings at /settings (criteria 7, 8, 10,
// edge case 3). Three groups, each a section headed by an h2: General, Read notes, Write notes,
// all shown whatever the exercise chosen on the choice screen; the rules inside a group stay as
// they were on the choice screen. Slice 2: the screen is reached by the tab Settings of the
// navigation and left by the tab Trainer; the choice screen keeps neither a link Settings nor the
// button Keyboard shortcuts. How each setting works and is kept: the specs of each setting in
// session/__tests__.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    general: 'General',
    read: 'Read notes',
    write: 'Write notes',
    choice: 'Session length',
    notice: "Progress and settings won't be saved in this browser.",
  },
  ru: {
    general: 'Общие',
    read: 'Читать ноты',
    write: 'Записывать ноты',
    choice: 'Длина сессии',
    notice: 'Прогресс и настройки не сохранятся в этом браузере.',
  },
  es: {
    general: 'General',
    read: 'Leer notas',
    write: 'Escribir notas',
    choice: 'Duración de la sesión',
    notice: 'El progreso y los ajustes no se guardarán en este navegador.',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
const LOCALES = Object.keys(TEXTS) as Locale[]

const MOVED_BOXES = [
  'Show the right answer at once',
  'Open next question automatically',
  'Show note names on the staff',
  'Play the keys',
  'Use a MIDI keyboard',
  'Play sound for the MIDI keys',
]
const MOVED_LISTS = ['Language', 'Note names', 'Note input']

const heading = (name: string) => screen.getByRole('heading', { level: 2, name })

// The group under its heading: the controls inside it, as a screen reader moving by headings
// finds them.
function group(name: string) {
  const section = heading(name).closest('section')
  if (!section) throw new Error(`the heading ${name} heads no section`)
  return within(section)
}

const groupHeadings = () =>
  screen.getAllByRole('heading', { level: 2 }).map((each) => each.textContent?.trim())

async function choose(listName: string, optionName: string) {
  const list = screen.getByRole<HTMLSelectElement>('combobox', { name: listName })
  const option = within(list).getByRole<HTMLOptionElement>('option', { name: optionName })
  await fireEvent.update(list, option.value)
}

function storageWithExercise(exercise: Exercise) {
  const storage = storageWithOneNoteReading(createMemoryStorage())
  createPreferences(storage, ['en']).chooseExercise(exercise)
  return storage
}

describe('the screen Settings (criterion 7)', () => {
  it('is at its own address, headed Settings', async () => {
    const { router } = await renderSettings()

    expect(router.currentRoute.value.path).toBe('/settings')
    expect(screen.getByRole('heading', { level: 1, name: SETTINGS.en })).toBeTruthy()
  })

  it.each(LOCALES)('is headed in the language of the interface: %s', async (locale) => {
    await renderSettings({ locale })

    expect(screen.getByRole('heading', { level: 1, name: SETTINGS[locale] })).toBeTruthy()
  })

  it.each(LOCALES)('has the groups General, Read notes and Write notes in %s', async (locale) => {
    await renderSettings({ locale })

    const texts = TEXTS[locale]
    expect(groupHeadings()).toEqual([texts.general, texts.read, texts.write])
  })

  it('takes the focus on its heading when opened (criterion 6)', async () => {
    await renderApp()

    await openSettings()

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: SETTINGS.en }),
    )
  })

  // Loaded at its address, the screen is checked in e2e/settings.spec.ts: the mount of Testing
  // Library moves the rendered nodes, and jsdom drops the focus on the way.
  it('takes the focus on its heading when its address is opened', async () => {
    const { router } = await renderApp()

    await router.push('/settings')
    await screen.findByRole('heading', { level: 1, name: SETTINGS.en })

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: SETTINGS.en }),
    )
  })
})

describe('the group General', () => {
  it('has Language, Note names, both boxes of the answers and Keyboard shortcuts', async () => {
    await renderSettings()

    const general = group(EN.general)
    expect(general.getByRole('combobox', { name: 'Language' })).toBeTruthy()
    expect(general.getByRole('combobox', { name: 'Note names' })).toBeTruthy()
    expect(general.getByRole('checkbox', { name: 'Show the right answer at once' })).toBeTruthy()
    expect(general.getByRole('checkbox', { name: 'Open next question automatically' })).toBeTruthy()
    expect(general.getByRole('button', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })

  it('shows Seventh note only with the letter names', async () => {
    await renderSettings()
    expect(screen.queryByRole('group', { name: 'Seventh note' })).toBeNull()

    await choose('Note names', 'C, D, E')
    expect(group(EN.general).getByRole('group', { name: 'Seventh note' })).toBeTruthy()

    await choose('Note names', 'до, ре, ми')
    expect(screen.queryByRole('group', { name: 'Seventh note' })).toBeNull()
  })

  it('opens the dialog Keyboard shortcuts by its button', async () => {
    await renderSettings()

    await fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))

    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })

  it('switches the whole screen at once when another language is chosen', async () => {
    await renderSettings()

    await choose('Language', 'Español')

    expect(screen.getByRole('heading', { level: 1, name: SETTINGS.es })).toBeTruthy()
    expect(groupHeadings()).toEqual([TEXTS.es.general, TEXTS.es.read, TEXTS.es.write])
    expect(document.documentElement.lang).toBe('es')
  })
})

describe('the group Read notes', () => {
  it('has Note input, with Note names chosen and nothing more', async () => {
    await renderSettings()

    const read = group(EN.read)
    expect(read.getByRole('combobox', { name: 'Note input' })).toBeTruthy()
    expect(read.queryAllByRole('checkbox')).toEqual([])
  })

  it('adds Play the keys and Use a MIDI keyboard with Piano keyboard', async () => {
    await renderSettings()

    await choose('Note input', 'Piano keyboard')

    const read = group(EN.read)
    expect(read.getByRole('checkbox', { name: 'Play the keys' })).toBeTruthy()
    expect(read.getByRole('checkbox', { name: 'Use a MIDI keyboard' })).toBeTruthy()
    expect(read.queryByRole('checkbox', { name: 'Play sound for the MIDI keys' })).toBeNull()
  })

  it('adds Play sound for the MIDI keys once Use a MIDI keyboard is ticked', async () => {
    await renderSettings()
    await choose('Note input', 'Piano keyboard')

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Use a MIDI keyboard' }))

    expect(
      group(EN.read).getByRole('checkbox', { name: 'Play sound for the MIDI keys' }),
    ).toBeTruthy()
  })

  it('hides the keys and the MIDI boxes again with Note names', async () => {
    await renderSettings()
    await choose('Note input', 'Piano keyboard')

    await choose('Note input', 'Note names')

    expect(group(EN.read).queryAllByRole('checkbox')).toEqual([])
  })
})

describe('the group Write notes', () => {
  it('has Show note names on the staff', async () => {
    await renderSettings()

    expect(
      group(EN.write).getByRole('checkbox', { name: 'Show note names on the staff' }),
    ).toBeTruthy()
  })
})

// Before, the choice screen hid the settings of the exercise not chosen.
describe.each<Exercise>(['read', 'write'])('with the exercise %s chosen', (exercise) => {
  it('shows every group with its settings', async () => {
    await renderSettings({ storage: storageWithExercise(exercise) })

    expect(groupHeadings()).toEqual([EN.general, EN.read, EN.write])
    expect(group(EN.read).getByRole('combobox', { name: 'Note input' })).toBeTruthy()
    expect(
      group(EN.write).getByRole('checkbox', { name: 'Show note names on the staff' }),
    ).toBeTruthy()
  })
})

describe('the choice screen', () => {
  it.each<Exercise>(['read', 'write'])(
    'no longer holds the settings with %s chosen',
    async (exercise) => {
      await renderApp({ storage: storageWithExercise(exercise) })

      for (const name of MOVED_BOXES) expect(screen.queryByRole('checkbox', { name })).toBeNull()
      for (const name of MOVED_LISTS) expect(screen.queryByRole('combobox', { name })).toBeNull()
      expect(screen.queryByRole('group', { name: 'Seventh note' })).toBeNull()
    },
  )

  it('has no link Settings of its own', async () => {
    await renderApp()

    expect(content().queryByRole('link', { name: SETTINGS.en })).toBeNull()
  })

  it.each(LOCALES)('opens Settings by its tab in %s', async (locale) => {
    const { router } = await renderApp({ locale })

    await openSettings(locale)

    expect(router.currentRoute.value.path).toBe('/settings')
  })

  it('no longer has the button Keyboard shortcuts: Settings has it', async () => {
    await renderApp()

    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull()
  })
})

describe('the tab Trainer from the screen Settings', () => {
  it.each(LOCALES)('leads back to the choice screen in %s', async (locale) => {
    const { router } = await renderSettings({ locale })

    await goToSection(TRAINER[locale], locale)

    expect(
      await screen.findByRole('heading', { level: 1, name: TEXTS[locale].choice }),
    ).toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('is the only way back: the screen has no link Trainer of its own', async () => {
    await renderSettings()

    expect(content().queryByRole('link', { name: TRAINER.en })).toBeNull()
  })

  it('brings the choice screen in the language chosen in Settings', async () => {
    await renderSettings()
    await choose('Language', 'Русский')

    await backToTrainer('ru')

    expect(screen.getByRole('heading', { level: 1, name: TEXTS.ru.choice })).toBeTruthy()
  })
})

// Criterion 10 and edge case 3; the notice on the choice screen: session/__tests__/storage-notice.
describe('the notice about settings that will not be saved on the screen Settings', () => {
  it('is not shown with a working storage', async () => {
    await renderSettings()

    expect(screen.queryByText(EN.notice)).toBeNull()
  })

  it.each(LOCALES)('is shown with an unavailable storage in %s', async (locale) => {
    await renderSettings({ storage: unavailableStorage(), locale })

    expect(screen.getAllByText(TEXTS[locale].notice)).toHaveLength(1)
  })

  it('is an empty status first, filled once a setting fails to save', async () => {
    await renderSettings({ storage: fullStorage() })
    const status = screen.getByRole('status')
    expect(status.textContent?.trim()).toBe('')

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Show the right answer at once' }))

    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent?.trim()).toBe(EN.notice)
  })

  it('is on both screens with an unavailable storage', async () => {
    await renderApp({ storage: unavailableStorage() })
    expect(screen.getAllByText(EN.notice)).toHaveLength(1)

    await openSettings()

    expect(screen.getAllByText(EN.notice)).toHaveLength(1)
  })

  it('keeps a setting changed on Settings until a reload, then forgets it', async () => {
    const storage = unavailableStorage()
    await renderSettings({ storage })
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Show note names on the staff' }))
    const box = () =>
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Show note names on the staff' })

    await backToTrainer()
    await openSettings()
    expect(box().checked).toBe(true)

    cleanup()
    await renderSettings({ storage })
    expect(box().checked).toBe(false)
  })
})
