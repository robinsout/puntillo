import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { renderApp, renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { fakeMidiInput } from '@/presentation/__tests__/midi-input'
import { chooseLength, createMemoryStorage, preferencesFor } from '@/presentation/__tests__/screen'

// Feature midi-input, slice 1: under Play the keys, shown with Piano keyboard in Read notes alone,
// the box Use a MIDI keyboard, cleared by default and saved (criterion 1). Ticking it asks the
// browser for MIDI, and so does opening the app with it ticked before (criterion 2). Under it,
// shown while it is ticked, the box Play sound for the MIDI keys, cleared by default and saved
// (criterion 7). The texts are in the three languages (criterion 12).
// Feature navigation-and-settings, slice 1: the boxes are on the settings screen, in the group
// Read notes, shown whatever exercise is chosen on the choice screen.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    midi: 'Use a MIDI keyboard',
    midiSound: 'Play sound for the MIDI keys',
    playKeys: 'Play the keys',
  },
  ru: {
    midi: 'MIDI-клавиатура',
    midiSound: 'Звук для клавиш MIDI',
    playKeys: 'Звук клавиш',
  },
  es: {
    midi: 'Usar un teclado MIDI',
    midiSound: 'Sonido para las teclas MIDI',
    playKeys: 'Sonido de las teclas',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })
const queryBox = (name: string) => screen.queryByRole('checkbox', { name })
const midiBox = () => box(EN.midi)
const midiSoundBox = () => box(EN.midiSound)

async function chooseNoteInput(option: string) {
  const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Note input' })
  const { value } = within(select).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(select, value)
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

const KEYBOARD = (preferences: Preferences) => preferences.chooseNoteInput('keyboard')
const MIDI = (preferences: Preferences) => {
  KEYBOARD(preferences)
  preferences.chooseUseMidi(true)
}
const KEYBOARD_WRITING = (preferences: Preferences) => {
  KEYBOARD(preferences)
  preferences.chooseExercise('write')
}
const MIDI_WRITING = (preferences: Preferences) => {
  MIDI(preferences)
  preferences.chooseExercise('write')
}

// The settings screen over the storage; a new one over the same storage stands for a page reload.
async function load(storage: KeyValueStorage, locale: Locale = 'en') {
  const midi = fakeMidiInput()
  await renderSettings({ storage, locale, midiInput: midi.midiInput })
  return midi
}

function reload(storage: KeyValueStorage) {
  cleanup()
  return load(storage)
}

const follows = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('the box Use a MIDI keyboard (criterion 1)', () => {
  it('is shown with Piano keyboard, cleared by default', async () => {
    await load(createMemoryStorage())

    await chooseNoteInput('Piano keyboard')

    expect(midiBox().checked).toBe(false)
  })

  it('comes after Play the keys', async () => {
    await load(storageWith(KEYBOARD))

    expect(follows(box(EN.playKeys), midiBox())).toBe(true)
  })

  it.each(['en', 'ru', 'es'] as const)('is named in %s', async (locale) => {
    await load(storageWith(KEYBOARD), locale)

    expect(box(TEXTS[locale].midi).checked).toBe(false)
  })

  it('is not shown with Note names', async () => {
    await load(createMemoryStorage())

    expect(queryBox(EN.midi)).toBeNull()
  })

  it('is shown with Write notes chosen on the choice screen', async () => {
    await load(storageWith(KEYBOARD_WRITING))

    expect(midiBox().checked).toBe(false)
  })

  it('is not on the choice screen', async () => {
    await renderApp({ storage: storageWith(MIDI) })

    expect(queryBox(EN.midi)).toBeNull()
    expect(queryBox(EN.midiSound)).toBeNull()
  })

  it('is not on the question screen', async () => {
    await renderApp({ storage: storageWith(MIDI) })

    await chooseLength('No limit')

    expect(queryBox(EN.midi)).toBeNull()
    expect(queryBox(EN.midiSound)).toBeNull()
  })

  it('keeps the box ticked over a reload', async () => {
    const storage = storageWith(KEYBOARD)
    await load(storage)

    await fireEvent.click(midiBox())
    await reload(storage)

    expect(midiBox().checked).toBe(true)
  })

  it('shows the choice saved before', async () => {
    await load(storageWith(MIDI))

    expect(midiBox().checked).toBe(true)
  })

  it('can be cleared again and stays cleared', async () => {
    const storage = storageWith(MIDI)
    await load(storage)

    await fireEvent.click(midiBox())
    await reload(storage)

    expect(midiBox().checked).toBe(false)
  })

  it('keeps its value while Note names hides it', async () => {
    await load(storageWith(KEYBOARD))
    await fireEvent.click(midiBox())

    await chooseNoteInput('Note names')
    await chooseNoteInput('Piano keyboard')

    expect(midiBox().checked).toBe(true)
  })

  it('keeps its value over a reload with Note names', async () => {
    const storage = storageWith(KEYBOARD)
    await load(storage)
    await fireEvent.click(midiBox())
    await chooseNoteInput('Note names')

    await reload(storage)
    await chooseNoteInput('Piano keyboard')

    expect(midiBox().checked).toBe(true)
  })

  it('leaves Play the keys as it was', async () => {
    await load(storageWith(KEYBOARD))

    await fireEvent.click(midiBox())

    expect(box(EN.playKeys).checked).toBe(true)
  })
})

describe('the access to MIDI (criterion 2)', () => {
  it('is not asked for while the box is cleared', async () => {
    const midi = await load(storageWith(KEYBOARD))

    await chooseNoteInput('Note names')
    await chooseNoteInput('Piano keyboard')

    expect(midi.connects()).toBe(0)
  })

  it('is asked for when the box is ticked', async () => {
    const midi = await load(storageWith(KEYBOARD))

    await fireEvent.click(midiBox())

    expect(midi.connects()).toBeGreaterThan(0)
  })

  it('is not asked for when the box is cleared', async () => {
    const midi = await load(storageWith(MIDI))
    const before = midi.connects()

    await fireEvent.click(midiBox())

    expect(midi.connects()).toBe(before)
  })

  it('is asked for when the app opens with the box ticked before', async () => {
    const storage = storageWith(MIDI)
    const midi = fakeMidiInput()

    await renderApp({
      storage,
      preferences: preferencesFor(['en'], storage),
      midiInput: midi.midiInput,
    })

    expect(midi.connects()).toBeGreaterThan(0)
  })

  it('is asked for when the app opens on another page with the box ticked before', async () => {
    const storage = storageWith(MIDI)
    const midi = fakeMidiInput()

    await renderApp({
      path: '/wiki',
      storage,
      preferences: preferencesFor(['en'], storage),
      midiInput: midi.midiInput,
    })

    expect(midi.connects()).toBeGreaterThan(0)
  })

  it('is not asked for when the app opens with the box cleared', async () => {
    const storage = storageWith(KEYBOARD)
    const midi = fakeMidiInput()

    await renderApp({
      storage,
      preferences: preferencesFor(['en'], storage),
      midiInput: midi.midiInput,
    })

    expect(midi.connects()).toBe(0)
  })
})

describe('the box Play sound for the MIDI keys (criterion 7)', () => {
  it('is shown once Use a MIDI keyboard is ticked, cleared by default', async () => {
    await load(storageWith(KEYBOARD))
    expect(queryBox(EN.midiSound)).toBeNull()

    await fireEvent.click(midiBox())

    expect(midiSoundBox().checked).toBe(false)
  })

  it('comes after Use a MIDI keyboard', async () => {
    await load(storageWith(MIDI))

    expect(follows(midiBox(), midiSoundBox())).toBe(true)
  })

  it.each(['en', 'ru', 'es'] as const)('is named in %s', async (locale) => {
    await load(storageWith(MIDI), locale)

    expect(box(TEXTS[locale].midiSound).checked).toBe(false)
  })

  it('is hidden once Use a MIDI keyboard is cleared', async () => {
    await load(storageWith(MIDI))

    await fireEvent.click(midiBox())

    expect(queryBox(EN.midiSound)).toBeNull()
  })

  it('is not shown with Note names', async () => {
    await load(storageWith(MIDI))

    await chooseNoteInput('Note names')

    expect(queryBox(EN.midiSound)).toBeNull()
  })

  it('is shown with Write notes chosen on the choice screen', async () => {
    await load(storageWith(MIDI_WRITING))

    expect(midiSoundBox().checked).toBe(false)
  })

  it('keeps the box ticked over a reload', async () => {
    const storage = storageWith(MIDI)
    await load(storage)

    await fireEvent.click(midiSoundBox())
    await reload(storage)

    expect(midiSoundBox().checked).toBe(true)
  })

  it('keeps its value while Use a MIDI keyboard hides it', async () => {
    await load(storageWith(MIDI))
    await fireEvent.click(midiSoundBox())

    await fireEvent.click(midiBox())
    await fireEvent.click(midiBox())

    expect(midiSoundBox().checked).toBe(true)
  })

  it('leaves Play the keys as it was', async () => {
    await load(storageWith(MIDI))

    await fireEvent.click(midiSoundBox())

    expect(box(EN.playKeys).checked).toBe(true)
  })
})
