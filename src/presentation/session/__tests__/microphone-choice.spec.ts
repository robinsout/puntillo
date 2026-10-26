import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { fakeMicrophone } from '@/presentation/__tests__/microphone'
import { createMemoryStorage } from '@/presentation/__tests__/screen'
import { microphoneKey } from '@/presentation/dependencies'

// Feature microphone-input, slice 1: Microphone in the list Note input on the settings screen is
// saved like the other options (criterion 1). Choosing it asks the browser for the microphone
// (criterion 4). With it, Play the keys and the boxes of the MIDI keyboard are hidden, their
// values kept (criterion 3).

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const EN = {
  noteInput: 'Note input',
  keyboard: 'Piano keyboard',
  names: 'Note names',
  microphone: 'Microphone',
  playKeys: 'Play the keys',
  midi: 'Use a MIDI keyboard',
  midiSound: 'Play sound for the MIDI keys',
}

const list = () => screen.getByRole<HTMLSelectElement>('combobox', { name: EN.noteInput })
const chosen = () => list().selectedOptions[0]?.textContent?.trim()
const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })
const queryBox = (name: string) => screen.queryByRole('checkbox', { name })

async function chooseNoteInput(option: string) {
  const { value } = within(list()).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(list(), value)
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// The settings screen over the storage; a new one over the same storage stands for a page reload.
async function load(storage: KeyValueStorage = createMemoryStorage()) {
  const microphone = fakeMicrophone()
  await renderSettings({
    storage,
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  return microphone
}

describe('Microphone in Note input (criterion 1)', () => {
  it('can be chosen', async () => {
    await load()

    await chooseNoteInput(EN.microphone)

    expect(chosen()).toBe(EN.microphone)
  })

  it('is kept over a reload', async () => {
    const storage = createMemoryStorage()
    await load(storage)
    await chooseNoteInput(EN.microphone)

    cleanup()
    await load(storage)

    expect(chosen()).toBe(EN.microphone)
  })
})

describe('the access to the microphone (criterion 4)', () => {
  it('is asked for when Microphone is chosen', async () => {
    const microphone = await load()

    await chooseNoteInput(EN.microphone)

    expect(microphone.requests()).toBe(1)
  })

  it('is not asked for by the other options', async () => {
    const microphone = await load()

    await chooseNoteInput(EN.keyboard)
    await chooseNoteInput(EN.names)

    expect(microphone.requests()).toBe(0)
  })

  it('is not listened to on the settings', async () => {
    const microphone = await load()

    await chooseNoteInput(EN.microphone)

    expect(microphone.isListening()).toBe(false)
  })
})

describe('with Microphone (criterion 3)', () => {
  const MIDI = (preferences: Preferences) => {
    preferences.chooseNoteInput('keyboard')
    preferences.choosePlayKeys(false)
    preferences.chooseUseMidi(true)
    preferences.chooseMidiSound(true)
  }

  it('hides Play the keys and the boxes of the MIDI keyboard', async () => {
    await load(storageWith(MIDI))

    await chooseNoteInput(EN.microphone)

    expect(queryBox(EN.playKeys)).toBeNull()
    expect(queryBox(EN.midi)).toBeNull()
    expect(queryBox(EN.midiSound)).toBeNull()
  })

  it('hides them when saved before', async () => {
    await load(storageWith((preferences) => preferences.chooseNoteInput('microphone')))

    expect(queryBox(EN.playKeys)).toBeNull()
    expect(queryBox(EN.midi)).toBeNull()
  })

  it('keeps their values for Piano keyboard', async () => {
    await load(storageWith(MIDI))
    await chooseNoteInput(EN.microphone)

    await chooseNoteInput(EN.keyboard)

    expect(box(EN.playKeys).checked).toBe(false)
    expect(box(EN.midi).checked).toBe(true)
    expect(box(EN.midiSound).checked).toBe(true)
  })
})
