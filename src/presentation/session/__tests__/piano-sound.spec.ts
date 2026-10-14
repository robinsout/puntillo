import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, PianoSound } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { createKeySound } from '@/application/sound'
import type { Locale } from '@/domain/language'
import { backToTrainer, renderApp, renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
} from '@/presentation/__tests__/screen'

// Feature piano-keyboard, slice 2: the box Play the keys under Note input, shown with Piano
// keyboard alone, on by default and saved (criteria 2, 16, 18). A key played on the piano keyboard
// sounds when the box is on, an inactive key does not (criteria 13, 15). The samples start loading
// on the first press or touch on the page with Piano keyboard and the sound on, not when it opens
// (criterion 14, edge case 3).
// Feature navigation-and-settings, slice 1: Note input and the box are on the settings screen.
//
// The sound of the keys is the scenario of the application over a piano that records what it is
// asked; that the samples load once and a key played before is silent is the piano's own matter.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    box: 'Play the keys',
    noteInput: 'Note input',
    names: 'Note names',
    keyboard: 'Piano keyboard',
  },
  ru: {
    box: 'Звук клавиш',
    noteInput: 'Ввод нот',
    names: 'Названия нот',
    keyboard: 'Клавиатура фортепиано',
  },
  es: {
    box: 'Sonido de las teclas',
    noteInput: 'Entrada de notas',
    names: 'Nombres de las notas',
    keyboard: 'Teclado de piano',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const box = (name: string = EN.box) => screen.getByRole<HTMLInputElement>('checkbox', { name })
const queryBox = (name: string = EN.box) => screen.queryByRole('checkbox', { name })
const noteInputList = (name: string = EN.noteInput) =>
  screen.getByRole<HTMLSelectElement>('combobox', { name })

async function chooseNoteInput(option: string) {
  const select = noteInputList()
  const { value } = within(select).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(select, value)
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// The settings screen over the storage; a new one over the same storage stands for a page reload.
const load = (storage: KeyValueStorage, locale: Locale = 'en') =>
  renderSettings({ storage, locale })

async function reload(storage: KeyValueStorage) {
  cleanup()
  await load(storage)
}

const KEYBOARD = (preferences: Preferences) => preferences.chooseNoteInput('keyboard')

describe('the box Play the keys', () => {
  it('is shown with Piano keyboard, ticked by default', async () => {
    await load(createMemoryStorage())

    await chooseNoteInput(EN.keyboard)

    expect(box().checked).toBe(true)
  })

  it('comes after the Note input list', async () => {
    await load(storageWith(KEYBOARD))

    const follows = noteInputList().compareDocumentPosition(box())
    expect(follows & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each(['en', 'ru', 'es'] as const)('is named in %s', async (locale) => {
    await load(storageWith(KEYBOARD), locale)

    expect(box(TEXTS[locale].box).checked).toBe(true)
  })

  it('is not shown with Note names', async () => {
    await load(createMemoryStorage())

    expect(queryBox()).toBeNull()
  })

  it('is shown with Write notes chosen on the choice screen', async () => {
    await load(
      storageWith((preferences) => {
        KEYBOARD(preferences)
        preferences.chooseExercise('write')
      }),
    )

    expect(box().checked).toBe(true)
  })

  it('is not on the choice screen', async () => {
    await renderApp({ storage: storageWith(KEYBOARD) })

    expect(queryBox()).toBeNull()
    expect(screen.queryByRole('combobox', { name: EN.noteInput })).toBeNull()
  })

  it('is not on the question screen', async () => {
    await renderApp({ storage: storageWith(KEYBOARD) })

    await chooseLength('No limit')

    expect(queryBox()).toBeNull()
  })

  it('keeps the box cleared over a reload', async () => {
    const storage = storageWith(KEYBOARD)
    await load(storage)

    await fireEvent.click(box())
    await reload(storage)

    expect(box().checked).toBe(false)
  })

  it('shows the choice saved before', async () => {
    await load(
      storageWith((preferences) => {
        KEYBOARD(preferences)
        preferences.choosePlayKeys(false)
      }),
    )

    expect(box().checked).toBe(false)
  })

  it('keeps its value while Note names hides it', async () => {
    const storage = storageWith(KEYBOARD)
    await load(storage)
    await fireEvent.click(box())

    await chooseNoteInput(EN.names)
    await chooseNoteInput(EN.keyboard)

    expect(box().checked).toBe(false)
  })

  it('keeps its value over a reload with Note names', async () => {
    const storage = storageWith(KEYBOARD)
    await load(storage)
    await fireEvent.click(box())
    await chooseNoteInput(EN.names)

    await reload(storage)
    await chooseNoteInput(EN.keyboard)

    expect(box().checked).toBe(false)
  })
})

// Records what the sound of the keys asks of the piano, by the numbers of the keys played.
function recordingPiano() {
  const calls: string[] = []
  const piano: PianoSound = {
    load: () => {
      calls.push('load')
    },
    play: ({ number }) => {
      calls.push(`play ${number}`)
    },
  }
  const played = () => calls.filter((call) => call.startsWith('play '))
  return { piano, calls, played }
}

// Confident reading with one note in 4/4, no signs, the duration asked: a whole C4 first, as in
// piano-keyboard.spec.ts; its keyboard spans do4 to sol5.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

const SIGNS = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ accidentals: 'sharp-and-flat' })
}

interface Visit {
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
}

// On the length choice with the piano keyboard chosen and the sound of the keys over the preferences
// of the page, as main.ts makes it.
function renderWithSound({ difficulty = ONE_NOTE, more = () => {} }: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    KEYBOARD(preferences)
    more(preferences)
  })
  const preferences = preferencesFor(['en'], storage)
  const recording = recordingPiano()
  renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences,
    keySound: createKeySound(recording.piano, preferences),
  })
  return recording
}

const keyboard = () => screen.getByRole('group', { name: EN.keyboard })
const key = (name: string) => within(keyboard()).getByRole('button', { name })
const play = (name: string) => fireEvent.click(key(name))
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

describe('a key played (criteria 13, 15)', () => {
  it('sounds with the sound on', async () => {
    const { played } = renderWithSound()
    await chooseLength('No limit')

    await play('do4')

    expect(played()).toEqual(['play 60'])
  })

  it('sounds a black key', async () => {
    const { played } = renderWithSound({ difficulty: SIGNS })
    await chooseLength('No limit')

    await play('do sharp 4 or re flat 4')

    expect(played()).toEqual(['play 61'])
  })

  it('sounds each time a key is played, the same one again too', async () => {
    const { played } = renderWithSound()
    await chooseLength('No limit')

    await play('do4')
    await play('sol4')
    await play('sol4')

    expect(played()).toEqual(['play 60', 'play 67', 'play 67'])
  })

  it('is silent with the box cleared on the settings screen', async () => {
    const { visit, calls } = visitWithSound((preferences) => {
      ONE_NOTE(preferences)
      KEYBOARD(preferences)
    })
    await visit('/settings')
    await fireEvent.click(box())
    await backToTrainer()
    await chooseLength('No limit')

    await play('do4')

    expect(calls).toEqual([])
  })

  it('is silent when the key is inactive in the second attempt', async () => {
    const { played } = renderWithSound()
    await chooseLength('No limit')
    await play('do5')
    await press('1/1')
    await press('Check')

    await play('do5')

    expect(played()).toEqual(['play 72'])
  })

  it('sounds in the second attempt for a key still active', async () => {
    const { played } = renderWithSound()
    await chooseLength('No limit')
    await play('do5')
    await press('1/1')
    await press('Check')

    await play('do4')

    expect(played()).toEqual(['play 72', 'play 60'])
  })

  it('sounds in the quick mode, where it answers the note', async () => {
    const { played } = renderWithSound({
      more: (preferences) => preferences.chooseAutoAdvance(true),
    })
    await chooseLength('No limit')

    await play('do4')
    await press('1/1')

    expect(played()).toEqual(['play 60'])
  })
})

// The whole app, as the first press may come on any screen of it.
function visitWithSound(setUp: (preferences: Preferences) => void) {
  const storage = storageWith(setUp)
  const preferences = preferencesFor(['en'], storage)
  const recording = recordingPiano()
  return {
    ...recording,
    visit: (path = '/') =>
      renderApp({
        path,
        storage,
        preferences,
        keySound: createKeySound(recording.piano, preferences),
      }),
  }
}

describe('the samples (criterion 14, edge case 3)', () => {
  it('are not loaded when the page opens', async () => {
    const { visit, calls } = visitWithSound(KEYBOARD)

    await visit()

    expect(calls).toEqual([])
  })

  it('start loading on the first touch on the page', async () => {
    const { visit, calls } = visitWithSound(KEYBOARD)
    await visit()

    await fireEvent.pointerDown(document.body)

    expect(calls).toEqual(['load'])
  })

  it('start loading on the first key pressed on the computer keyboard', async () => {
    const { visit, calls } = visitWithSound(KEYBOARD)
    await visit()

    await fireEvent.keyDown(document.body, { key: 'Tab' })

    expect(calls).toEqual(['load'])
  })

  it('are not loaded with Note names', async () => {
    const { visit, calls } = visitWithSound(() => {})
    await visit()

    await fireEvent.pointerDown(document.body)
    await fireEvent.keyDown(document.body, { key: 'Tab' })

    expect(calls).toEqual([])
  })

  it('are not loaded with the sound off', async () => {
    const { visit, calls } = visitWithSound((preferences) => {
      KEYBOARD(preferences)
      preferences.choosePlayKeys(false)
    })
    await visit()

    await fireEvent.pointerDown(document.body)

    expect(calls).toEqual([])
  })

  it('start loading on the next touch once the sound is turned on', async () => {
    const { visit, calls } = visitWithSound((preferences) => {
      KEYBOARD(preferences)
      preferences.choosePlayKeys(false)
    })
    await visit('/settings')
    await fireEvent.pointerDown(document.body)

    await fireEvent.click(box())
    await fireEvent.pointerDown(document.body)

    expect(calls).toEqual(['load'])
  })

  it('start loading on the next touch once Piano keyboard is chosen', async () => {
    const { visit, calls } = visitWithSound(() => {})
    await visit('/settings')
    await fireEvent.pointerDown(document.body)

    await chooseNoteInput(EN.keyboard)
    await fireEvent.pointerDown(document.body)

    expect(calls).toEqual(['load'])
  })
})
