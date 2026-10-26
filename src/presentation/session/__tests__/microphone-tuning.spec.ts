import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { backToTrainer, renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { fakeMicrophone } from '@/presentation/__tests__/microphone'
import {
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startSession,
  startingOnC4,
  statusText,
} from '@/presentation/__tests__/screen'
import { microphoneKey } from '@/presentation/dependencies'

// Feature microphone-input, slice 3. With Microphone, the list Instrument under Note input on the
// settings screen offers an instrument in C, the default, or in B♭; the choice is saved like the
// other options, and hidden with the other note inputs, its value kept (criterion 2). On the
// question an instrument in B♭ is heard a major second above its sound: the trumpet's written C4
// sounds B♭3, and B♭3 played answers C4; the caption under the staff and the review name the note
// played as the instrument writes it (criterion 9).

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const EN = {
  noteInput: 'Note input',
  keyboard: 'Piano keyboard',
  names: 'Note names',
  microphone: 'Microphone',
  instrument: 'Instrument',
  inC: 'In C: flute, violin, oboe',
  inBFlat: 'In B♭: trumpet, clarinet',
  correct: 'Correct',
  tryAgain: 'Incorrect. Try again.',
}

// MIDI note numbers: C4 = 60.
const SI_FLAT_3 = 58
const DO4 = 60
const MI4 = 64

const combobox = (name: string) => screen.getByRole<HTMLSelectElement>('combobox', { name })
const queryCombobox = (name: string) => screen.queryByRole('combobox', { name })
const chosenIn = (name: string) => combobox(name).selectedOptions[0]?.textContent?.trim()
const optionsOf = (name: string) =>
  within(combobox(name))
    .getAllByRole('option')
    .map((option) => option.textContent?.trim())

async function choose(name: string, option: string) {
  const list = combobox(name)
  const { value } = within(list).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(list, value)
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

const MICROPHONE = (preferences: Preferences) => preferences.chooseNoteInput('microphone')
const IN_B_FLAT = (preferences: Preferences) => preferences.chooseTuning('b-flat')

// The settings screen over the storage; a new one over the same storage stands for a page reload.
async function loadSettings(storage: KeyValueStorage = createMemoryStorage()) {
  const microphone = fakeMicrophone()
  await renderSettings({
    storage,
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  return microphone
}

describe('Instrument in the settings (criterion 2)', () => {
  it('shows with Microphone, In C chosen by default', async () => {
    await loadSettings()

    await choose(EN.noteInput, EN.microphone)

    expect(chosenIn(EN.instrument)).toBe(EN.inC)
  })

  it('offers In C and In B♭', async () => {
    await loadSettings(storageWith(MICROPHONE))

    expect(optionsOf(EN.instrument)).toEqual([EN.inC, EN.inBFlat])
  })

  it('can be In B♭', async () => {
    await loadSettings(storageWith(MICROPHONE))

    await choose(EN.instrument, EN.inBFlat)

    expect(chosenIn(EN.instrument)).toBe(EN.inBFlat)
  })

  it('is kept over a reload', async () => {
    const storage = storageWith(MICROPHONE)
    await loadSettings(storage)
    await choose(EN.instrument, EN.inBFlat)

    cleanup()
    await loadSettings(storage)

    expect(chosenIn(EN.instrument)).toBe(EN.inBFlat)
  })

  it.each([EN.names, EN.keyboard])('is hidden with %s', async (input) => {
    await loadSettings(storageWith(MICROPHONE))

    await choose(EN.noteInput, input)

    expect(queryCombobox(EN.instrument)).toBeNull()
  })

  it('is hidden before Microphone is chosen', async () => {
    await loadSettings()

    expect(queryCombobox(EN.instrument)).toBeNull()
  })

  it('keeps In B♭ while another note input is chosen', async () => {
    await loadSettings(storageWith(MICROPHONE))
    await choose(EN.instrument, EN.inBFlat)
    await choose(EN.noteInput, EN.keyboard)

    await choose(EN.noteInput, EN.microphone)

    expect(chosenIn(EN.instrument)).toBe(EN.inBFlat)
  })
})

// The values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// As in microphone-input.spec.ts: C4, E4 and G4 in Confident reading.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

// Confident reading with one note, no signs: on C4, then D4.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

// Several notes, their durations not asked.
const SEVERAL_PITCHES = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ askDuration: false })
}

const atOnce = (preferences: Preferences) => preferences.chooseShowAnswerAtOnce(true)

interface Visit {
  random?: Random
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
}

// On the question, with Microphone and an instrument in B♭ chosen unless more changes it.
async function startInBFlat({
  random = startingOnC4(),
  difficulty = ONE_NOTE,
  more = () => {},
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    MICROPHONE(preferences)
    IN_B_FLAT(preferences)
    more(preferences)
  })
  const microphone = fakeMicrophone({ kind: 'ready' })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  await startSession('No limit')
  return microphone
}

const target = (number: number) => screen.getByRole('button', { name: `Note ${number}` })

function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

describe('the question with an instrument in B♭ (criterion 9)', () => {
  it('says Correct for B♭3 played on C4', async () => {
    const microphone = await startInBFlat()

    await microphone.play(SI_FLAT_3)

    expect(statusText()).toBe(EN.correct)
  })

  it('takes C4 played, the sound of the written D4, for a wrong note', async () => {
    const microphone = await startInBFlat()

    await microphone.play(DO4)

    expect(statusText()).toBe(EN.tryAgain)
  })

  it('names the note played as the instrument writes it', async () => {
    const microphone = await startInBFlat({ more: atOnce })

    await microphone.play(DO4)

    expect(statusText()).toContain('You played re4. This is do4')
  })

  it('captions each note taken under the staff as the instrument writes it', async () => {
    const microphone = await startInBFlat({ random: DO_MI_SOL(), difficulty: SEVERAL_PITCHES })

    await microphone.play(SI_FLAT_3)
    await microphone.play(MI4)

    expect(description(target(1))).toBe('do4')
    expect(description(target(2))).toBe('fa♯4/sol♭4')
  })

  it('hears as written once In C is chosen again', async () => {
    const microphone = await startInBFlat({
      more: (preferences) => preferences.chooseTuning('c'),
    })

    await microphone.play(DO4)

    expect(statusText()).toBe(EN.correct)
  })
})

describe('In B♭ chosen in the settings (criteria 2, 9)', () => {
  it('is heard on the question that follows', async () => {
    const storage = storageWith((preferences) => {
      ONE_NOTE(preferences)
      MICROPHONE(preferences)
    })
    const microphone = fakeMicrophone({ kind: 'ready' })
    await renderSettings({
      storage,
      random: startingOnC4(),
      provides: { [microphoneKey as symbol]: microphone.microphone },
    })
    await choose(EN.instrument, EN.inBFlat)
    await backToTrainer()
    await startSession('No limit')

    await microphone.play(SI_FLAT_3)

    expect(statusText()).toBe(EN.correct)
  })
})
