import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, PianoSound, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { createKeySound } from '@/application/sound'
import { openSettings, renderApp } from '@/presentation/__tests__/app'
import { forgetDialogs, isOpenAsModal } from '@/presentation/__tests__/dialog'
import { fakeMicrophone, frequencyOf } from '@/presentation/__tests__/microphone'
import {
  startSession,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  startingOnG4,
  statusText,
} from '@/presentation/__tests__/screen'
import { microphoneKey } from '@/presentation/dependencies'

// Feature microphone-input, slice 1: in Read notes with Microphone, the question has no piano
// keyboard, no note names, no sharp or flat, no durations and no Check (criterion 6). The page
// listens while the question screen is shown and lets the microphone go when it is left: the
// results, the settings, another screen (criterion 5). A note held steady answers the current
// note; a note played is an answer, right or wrong, and the question is checked with no Check
// (criteria 6, 10). Only the pitch counts, by its sound and with its octave; the review names the
// note played as with the piano keyboard (criteria 7, 8). Open the next question automatically
// works as usual (criterion 10). The sound of the trainer does not play the notes heard
// (criterion 12). An unsteady sound, silence, noise and a sound beyond the range answer nothing
// (edge cases 1, 2, 4); nothing is heard on a question checked (edge case 8); Next and Enter work
// as usual (edge case 9). Edge case 7: with Microphone neither the hint of the wiki nor the dialog
// Keyboard shortcuts can be opened on a question still to answer: Why? comes with the review, and
// the dialog is left to the settings.

afterEach(() => {
  cleanup()
  forgetDialogs()
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia)
  else Reflect.deleteProperty(window, 'matchMedia')
})

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')

const EN = {
  keyboard: 'Piano keyboard',
  check: 'Check',
  next: 'Next',
  finish: 'Finish',
  correct: 'Correct',
  secondTry: 'Correct on the second try',
  tryAgain: 'Incorrect. Try again.',
}

// MIDI note numbers: C4 = 60.
const DO2 = 36
const DO4 = 60
const RE4 = 62
const FA_SHARP_4 = 66
const SOL4 = 67
const SOL_SHARP_4 = 68
const DO5 = 72
const SOL5 = 79
const DO8 = 108

// The values in turn, then 0.
function sequence(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// As in midi-input.spec.ts: F4, a quarter, with a sharp before it: fa♯ in the 1st space.
const FA_SHARP = () => sequence(3.5 / 12, 0.5, 0.9, 0)
// As in multi-note-trainer.spec.ts: C4, E4 and G4 in Confident reading.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note in 4/4, no signs: the difficulty asks for the duration, the
// microphone does not. On C4, a whole note, then D4.
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

// Several notes, their durations not asked.
const SEVERAL_PITCHES = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ askDuration: false })
}

const MICROPHONE = (preferences: Preferences) => preferences.chooseNoteInput('microphone')

const atOnce = (preferences: Preferences) => preferences.chooseShowAnswerAtOnce(true)
const quick = (preferences: Preferences) => preferences.chooseAutoAdvance(true)

// Records what the sound of the keys asks of the piano, by the numbers of the keys played.
function recordingPiano() {
  const played: number[] = []
  const piano: PianoSound = {
    load: () => {},
    play: ({ number }) => {
      played.push(number)
    },
  }
  return { piano, played }
}

interface Visit {
  random?: Random
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
}

// On the length choice, with Microphone chosen unless more changes it, and the sound of the keys
// over the preferences, as main.ts makes them.
function renderWithMicrophone({
  random = startingOnC4(),
  difficulty = ONE_NOTE,
  more = () => {},
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    MICROPHONE(preferences)
    more(preferences)
  })
  const preferences = preferencesFor(['en'], storage)
  const microphone = fakeMicrophone({ kind: 'ready' })
  const sound = recordingPiano()
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences,
    keySound: createKeySound(sound.piano, preferences),
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  return { ...microphone, played: sound.played }
}

async function startWithMicrophone(visit: Visit = {}) {
  const started = renderWithMicrophone(visit)
  await startSession('No limit')
  return started
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const shownPitch = () => staff().getAttribute('data-pitch')

// Enter as the browser sends it with the focus off the buttons, which take Enter for themselves.
async function enter() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true }),
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('the question with Microphone (criterion 6)', () => {
  it('has no piano keyboard', async () => {
    await startWithMicrophone()

    expect(screen.queryByRole('group', { name: EN.keyboard })).toBeNull()
  })

  it('has no note names, signs or durations to press', async () => {
    await startWithMicrophone({ difficulty: SIGNS })

    expect(screen.queryAllByRole('button', { pressed: false })).toEqual([])
    expect(screen.queryAllByRole('button', { pressed: true })).toEqual([])
  })

  it('has no Check', async () => {
    await startWithMicrophone()

    expect(queryButton(EN.check)).toBeNull()
  })

  it('says nothing before a note is played', async () => {
    await startWithMicrophone()

    expect(statusText()).toBe('')
  })
})

describe('listening (criteria 4, 5)', () => {
  it('starts with the question', async () => {
    const microphone = await startWithMicrophone()

    expect(microphone.listens()).toBe(1)
    expect(microphone.isListening()).toBe(true)
  })

  it('does not start on the length choice', () => {
    const microphone = renderWithMicrophone()

    expect(microphone.isListening()).toBe(false)
  })

  it('goes on through the next question', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)

    await press(EN.next)

    expect(microphone.isListening()).toBe(true)
  })

  it('stops on the results', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)

    await press(EN.finish)

    expect(screen.getByRole('heading', { level: 1 })).not.toBeNull()
    expect(microphone.isListening()).toBe(false)
  })

  it('stops when the question is left with nothing checked', async () => {
    const microphone = await startWithMicrophone()

    await press(EN.finish)

    expect(microphone.isListening()).toBe(false)
  })

  it('stops when the page goes away', async () => {
    const microphone = await startWithMicrophone()

    cleanup()

    expect(microphone.isListening()).toBe(false)
  })

  it('stops on the settings', async () => {
    const storage = storageWith((preferences) => {
      ONE_NOTE(preferences)
      MICROPHONE(preferences)
    })
    const microphone = fakeMicrophone({ kind: 'ready' })
    const { router } = await renderApp({
      storage,
      provides: { [microphoneKey as symbol]: microphone.microphone },
    })
    await startSession('No limit')
    expect(microphone.isListening()).toBe(true)

    // The question has no navigation of the sections: the settings are reached by their address.
    await router.push('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    expect(microphone.isListening()).toBe(false)
  })

  it('does not start in Write notes', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseExercise('write'),
    })

    expect(microphone.listens()).toBe(0)
  })

  it('does not start with Note names', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseNoteInput('names'),
    })

    expect(microphone.listens()).toBe(0)
  })
})

describe('a note played (criteria 6, 8, 10)', () => {
  it('says Correct for the note of the question, with no Check', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(DO4)

    expect(statusText()).toBe(EN.correct)
  })

  it('offers Next after it', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(DO4)
    await press(EN.next)

    expect(shownPitch()).toBe('D4')
  })

  it('opens the second attempt for a note an octave off', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(DO5)

    expect(statusText()).toBe(EN.tryAgain)
  })

  it('takes the next note played for the second attempt', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO5)

    await microphone.play(DO4)

    expect(statusText()).toBe(EN.secondTry)
  })

  // Lead's decision: a note played is always an answer, the note rejected in the first attempt too.
  it('takes the note rejected, played again, for the second attempt, which is wrong', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO5)

    await microphone.play(DO5)

    expect(statusText()).not.toBe(EN.tryAgain)
    expect(statusText()).not.toBe('')
    expect(button(EN.next)).not.toBeNull()
  })

  it('says Correct for the sound of a note with a sharp', async () => {
    const microphone = await startWithMicrophone({ random: FA_SHARP(), difficulty: SIGNS })
    expect(shownPitch()).toBe('F#4')

    await microphone.play(FA_SHARP_4)

    expect(statusText()).toBe(EN.correct)
  })

  it('names the note played with its octave and the note as written', async () => {
    const microphone = await startWithMicrophone({ random: startingOnG4(), more: atOnce })

    await microphone.play(SOL5)

    expect(statusText()).toBe('You played sol5. This is sol4: the note on the 2nd line.')
  })

  it('names a sound of a black key by both of its names', async () => {
    const microphone = await startWithMicrophone({
      random: FA_SHARP(),
      difficulty: SIGNS,
      more: atOnce,
    })

    await microphone.play(SOL_SHARP_4)

    expect(statusText()).toBe('You played sol♯4/la♭4. This is fa♯4: the note in the 1st space.')
  })

  it('names a note far below the staff', async () => {
    const microphone = await startWithMicrophone({ random: startingOnG4(), more: atOnce })

    await microphone.play(DO2 + 7)

    expect(statusText()).toBe('You played sol2. This is sol4: the note on the 2nd line.')
  })

  it('plays nothing on the speakers, Play the keys ticked (criterion 12)', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.choosePlayKeys(true),
    })

    await microphone.play(DO4)
    await press(EN.next)
    await microphone.play(SOL4)

    expect(microphone.played).toEqual([])
  })
})

describe('a sound that answers nothing', () => {
  it('a note too short to hold (edge case 1)', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(RE4, 100)

    expect(statusText()).toBe('')
  })

  it('a trill between two notes (edge case 1)', async () => {
    const microphone = await startWithMicrophone()
    const trill = Array.from({ length: 40 }, (_, index) => frequencyOf(index % 2 ? RE4 : DO4))

    await microphone.hear(...trill)

    expect(statusText()).toBe('')
  })

  it('silence and noise (edge case 2)', async () => {
    const microphone = await startWithMicrophone()

    await microphone.hear(...Array.from({ length: 50 }, () => null))

    expect(statusText()).toBe('')
  })

  it('a sound beyond the range (edge case 4)', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(DO8)
    await microphone.play(DO2 - 6)

    expect(statusText()).toBe('')
  })

  it('leaves the question to the note held after it', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(RE4, 100)

    await microphone.play(DO4)

    expect(statusText()).toBe(EN.correct)
  })
})

describe('a question checked (edge cases 8, 9)', () => {
  it('takes no note played', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)

    await microphone.play(RE4)

    expect(statusText()).toBe(EN.correct)
    expect(shownPitch()).toBe('C4')
  })

  it('takes no note after a wrong second attempt', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO5)
    await microphone.play(RE4)
    const review = statusText()

    await microphone.play(DO4)

    expect(statusText()).toBe(review)
  })

  it('goes to the next question with Enter, which takes notes again', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)

    await enter()
    expect(shownPitch()).toBe('D4')
    await microphone.play(RE4)

    expect(statusText()).toBe(EN.correct)
  })
})

describe('the quick mode (criterion 10)', () => {
  it('opens the next question after a right note', async () => {
    const microphone = await startWithMicrophone({ more: quick })

    await microphone.play(DO4)

    expect(shownPitch()).toBe('D4')
    expect(statusText()).toBe(EN.correct)
  })

  it('stays on the question for the second attempt after a wrong note', async () => {
    const microphone = await startWithMicrophone({ more: quick })

    await microphone.play(RE4)

    expect(shownPitch()).toBe('C4')
    expect(statusText()).toBe(EN.tryAgain)
  })

  it('hears the next question as well', async () => {
    const microphone = await startWithMicrophone({ more: quick })
    await microphone.play(DO4)

    await microphone.play(RE4)

    expect(shownPitch()).toBe('C4')
    expect(statusText()).toBe(EN.correct)
  })
})

// A desktop: the screens offer the keyboard shortcuts.
function onDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) =>
      Object.assign(new EventTarget(), { media, matches: media === '(pointer: fine)' }),
  })
}

// Feature microphone-input, criterion 6 as agreed with the designer: no moves between the notes,
// no hint about answering from the keyboard, whose text is wrong for the microphone; the dialog
// Keyboard shortcuts stays, in the settings. The note taken is captioned by its name under the
// staff, as a key played is; after the check by itself the focus is on Next.
describe('the question with Microphone, as agreed (criterion 6)', () => {
  it('has no Previous note and Next note', async () => {
    await startWithMicrophone({ random: DO_MI_SOL(), difficulty: SEVERAL_PITCHES })
    expect(shownPitch()).toBe('C4 E4 G4')

    expect(queryButton('Previous note')).toBeNull()
    expect(queryButton('Next note')).toBeNull()
  })

  it('has no hint about answering from the keyboard on a desktop', async () => {
    onDesktop()
    await startWithMicrophone()

    expect(screen.queryByText('You can answer from the keyboard.')).toBeNull()
  })

  it('leaves the dialog Keyboard shortcuts to the settings', async () => {
    onDesktop()
    const storage = storageWith((preferences) => {
      ONE_NOTE(preferences)
      MICROPHONE(preferences)
    })
    const microphone = fakeMicrophone({ kind: 'ready' })
    await renderApp({ storage, provides: { [microphoneKey as symbol]: microphone.microphone } })

    await openSettings()
    await press('Keyboard shortcuts')

    expect(isOpenAsModal(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }))).toBe(true)
  })

  it('captions a note taken by its name under the staff', async () => {
    const microphone = await startWithMicrophone({
      random: DO_MI_SOL(),
      difficulty: SEVERAL_PITCHES,
    })
    expect(screen.queryByText('do4', { exact: true })).toBeNull()

    await microphone.play(DO4)

    expect(screen.getByText('do4', { exact: true })).not.toBeNull()
  })

  it('captions a sound of a black key by both of its names', async () => {
    const microphone = await startWithMicrophone({
      random: DO_MI_SOL(),
      difficulty: SEVERAL_PITCHES,
    })

    await microphone.play(FA_SHARP_4)

    expect(screen.getByText('fa♯4/sol♭4', { exact: true })).not.toBeNull()
  })

  it('puts the focus on Next after the check by itself', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(DO4)

    expect(document.activeElement).toBe(button(EN.next))
  })

  it('puts the focus on Next after a wrong second attempt', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO5)

    await microphone.play(RE4)

    expect(document.activeElement).toBe(button(EN.next))
  })
})
