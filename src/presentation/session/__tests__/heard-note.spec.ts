import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, MicrophoneStatus, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  fakeMicrophone,
  frequencyOf,
  type FakeMicrophone,
} from '@/presentation/__tests__/microphone'
import {
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startSession,
  startingOnC4,
  startingOnG4,
  statusText,
} from '@/presentation/__tests__/screen'
import { microphoneKey } from '@/presentation/dependencies'

// Feature heard-note-on-staff, slice 1: on the question of Read notes with Microphone, the staff
// gets the note heard, as the text indicator reads it and as the instrument writes it (criteria 1,
// 4): its column is the current note of the question, after the check the last one (criterion 2);
// it is there before the answer, after a note is taken, after the check right or wrong, in the
// second attempt and in the review (criterion 3), and goes to the first note of the next question
// at once (edge case 5). In silence there is none (criterion 4). A note beyond three ledger lines
// is given as the side of the staff it lies on (edge case 3). A black key is written with a sharp
// in this slice. None while the microphone cannot be used, with another note input and in Write
// notes (edge cases 1, 2); it stays while a dialog is open (edge case 4). How the staff draws it is
// the adapter's (staff-view-heard.spec.ts); the stub gives it as data-heard (screen.ts).

afterEach(() => {
  cleanup()
  forgetDialogs()
})

// MIDI note numbers: C4 = 60.
const RE3 = 50
const MI3 = 52
const SI_FLAT_3 = 58
const DO4 = 60
const RE4 = 62
const MI4 = 64
const FA_SHARP_4 = 66
const SOL4 = 67
const LA4 = 69
const DO5 = 72
const FA6 = 89
const SOL6 = 91

const EN = {
  next: 'Next',
  correct: 'Correct',
  secondTry: 'Correct on the second try',
  tryAgain: 'Incorrect. Try again.',
}

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// As in microphone-input.spec.ts: C4, E4 and G4 in Confident reading.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note, no signs: on C4 unless the random says otherwise.
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

const MICROPHONE = (preferences: Preferences) => preferences.chooseNoteInput('microphone')
const atOnce = (preferences: Preferences) => preferences.chooseShowAnswerAtOnce(true)

interface Visit {
  random?: Random
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
  status?: MicrophoneStatus
}

// On the question, with Microphone chosen unless more changes it.
async function startWithMicrophone({
  random = startingOnC4(),
  difficulty = ONE_NOTE,
  more = () => {},
  status = { kind: 'ready' },
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    MICROPHONE(preferences)
    more(preferences)
  })
  const microphone = fakeMicrophone(status)
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  await startSession('No limit')
  return microphone
}

const startOnSeveral = (more?: Visit['more']) =>
  startWithMicrophone({ random: DO_MI_SOL(), difficulty: SEVERAL_PITCHES, more })

// A note sounded for 140 ms, then a frame of silence: long enough for a reading, too short to
// answer.
async function sing(microphone: FakeMicrophone, number: number) {
  await microphone.hear(...Array.from({ length: 8 }, () => frequencyOf(number)), null)
}

// Silence long enough for a reading of its own.
const hush = (microphone: FakeMicrophone) =>
  microphone.hear(...Array.from({ length: 8 }, () => null))

const staff = () => screen.getByRole('img', { name: 'Music staff' })
const shownPitch = () => staff().getAttribute('data-pitch')
// The column and the pitch of the note heard on the staff, null for none.
const heardOnStaff = () => staff().getAttribute('data-heard')
const anyHeard = () => document.querySelector('[data-heard]')
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

describe('the note heard on the staff (criteria 1, 4)', () => {
  it('is none before a sound', async () => {
    await startWithMicrophone()

    expect(heardOnStaff()).toBeNull()
  })

  it('is the note heard, in the column of the current note', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4)

    expect(heardOnStaff()).toBe('0 D4')
  })

  it('follows the sound', async () => {
    const microphone = await startWithMicrophone()
    await sing(microphone, RE4)

    await sing(microphone, LA4)

    expect(heardOnStaff()).toBe('0 A4')
  })

  it('is gone in silence', async () => {
    const microphone = await startWithMicrophone()
    await sing(microphone, RE4)

    await hush(microphone)

    expect(heardOnStaff()).toBeNull()
  })

  it('is the note as an instrument in B♭ writes it, a tone above the sound', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseTuning('b-flat'),
    })

    await sing(microphone, SI_FLAT_3)

    expect(heardOnStaff()).toBe('0 C4')
  })

  it('writes a black key with a sharp', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, FA_SHARP_4)

    expect(heardOnStaff()).toBe('0 F#4')
  })

  it.each([
    [FA6, '0 F6'],
    [MI3, '0 E3'],
  ])('is a head with three ledger lines: MIDI %i', async (number, heard) => {
    const microphone = await startWithMicrophone()

    await sing(microphone, number)

    expect(heardOnStaff()).toBe(heard)
  })

  it.each([
    [SOL6, '0 up'],
    [RE3, '0 down'],
  ])(
    'is the side of the staff beyond three ledger lines: MIDI %i (edge case 3)',
    async (number, heard) => {
      const microphone = await startWithMicrophone()

      await sing(microphone, number)

      expect(heardOnStaff()).toBe(heard)
    },
  )
})

describe('the column of the note heard (criteria 2, 3)', () => {
  it('goes on to the next note once a note is taken', async () => {
    const microphone = await startOnSeveral()
    expect(shownPitch()).toBe('C4 E4 G4')

    await microphone.play(DO4)
    await sing(microphone, LA4)

    expect(heardOnStaff()).toBe('1 A4')
  })

  it('is the last note once the question is checked', async () => {
    const microphone = await startOnSeveral()
    await microphone.play(DO4)
    await microphone.play(MI4)
    await microphone.play(SOL4)
    expect(statusText()).toBe(EN.correct)

    await sing(microphone, LA4)

    expect(heardOnStaff()).toBe('2 A4')
  })

  it('is the last note in the review of a wrong answer', async () => {
    const microphone = await startOnSeveral(atOnce)
    await microphone.play(RE4)
    await microphone.play(MI4)
    await microphone.play(LA4)

    await sing(microphone, DO5)

    expect(heardOnStaff()).toBe('2 C5')
  })

  it('follows the notes of the second attempt', async () => {
    const microphone = await startOnSeveral()
    await microphone.play(RE4)
    await microphone.play(MI4)
    await microphone.play(LA4)
    expect(statusText()).toBe(EN.tryAgain)

    await sing(microphone, DO5)
    expect(heardOnStaff()).toBe('0 C5')

    await microphone.play(DO4)
    await sing(microphone, DO5)
    expect(heardOnStaff()).toBe('2 C5')
  })

  it('goes to the first note of the next question at once (edge case 5)', async () => {
    const microphone = await startOnSeveral()
    await microphone.play(DO4)
    await microphone.play(MI4)
    await microphone.play(SOL4)
    await sing(microphone, LA4)
    expect(heardOnStaff()).toBe('2 A4')

    await press(EN.next)

    expect(heardOnStaff()).toBe('0 A4')
  })
})

describe('the note heard through the question (criterion 3)', () => {
  it('is there after a right answer', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)
    expect(statusText()).toBe(EN.correct)

    await sing(microphone, RE4)

    expect(heardOnStaff()).toBe('0 D4')
  })

  it('is there in the second attempt', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO5)
    expect(statusText()).toBe(EN.tryAgain)

    await sing(microphone, RE4)

    expect(heardOnStaff()).toBe('0 D4')
  })

  it('is there after a right second attempt', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO5)
    await microphone.play(DO4)
    expect(statusText()).toBe(EN.secondTry)

    await sing(microphone, RE4)

    expect(heardOnStaff()).toBe('0 D4')
  })

  it('is there in the review of a wrong answer', async () => {
    const microphone = await startWithMicrophone({ more: atOnce })
    await microphone.play(RE4)

    await sing(microphone, MI4)

    expect(heardOnStaff()).toBe('0 E4')
  })

  it('is on the next question after Next', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)
    await press(EN.next)
    expect(shownPitch()).not.toBe('C4')

    await sing(microphone, MI4)

    expect(heardOnStaff()).toBe('0 E4')
  })
})

describe('the note heard with a dialog open (edge case 4)', () => {
  // The hint of the wiki opens from Why? in the review.
  async function hintOpen() {
    const microphone = await startWithMicrophone({ random: startingOnG4(), more: atOnce })
    await microphone.play(LA4)
    await sing(microphone, RE4)
    await press('Why?')
    await screen.findByRole('dialog')
    return microphone
  }

  it('stays when the hint opens', async () => {
    await hintOpen()

    expect(heardOnStaff()).toBe('0 D4')
  })

  it('follows the sound while the hint is open', async () => {
    const microphone = await hintOpen()

    await sing(microphone, MI4)

    expect(heardOnStaff()).toBe('0 E4')
  })
})

describe('no note heard on the staff (edge cases 1, 2)', () => {
  it.each([{ kind: 'denied' }, { kind: 'missing' }, { kind: 'unsupported' }] as const)(
    'while the microphone is $kind',
    async (status) => {
      const microphone = await startWithMicrophone({ status })

      await sing(microphone, RE4)

      expect(anyHeard()).toBeNull()
    },
  )

  it('once the microphone is unplugged in the middle of the question', async () => {
    const microphone = await startWithMicrophone()
    await sing(microphone, RE4)

    await microphone.becomes({ kind: 'missing' })

    expect(anyHeard()).toBeNull()
  })

  it.each(['names', 'keyboard'] as const)('with %s', async (input) => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseNoteInput(input),
    })

    await sing(microphone, RE4)

    expect(anyHeard()).toBeNull()
  })

  it('in Write notes', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseExercise('write'),
    })

    await sing(microphone, RE4)

    expect(anyHeard()).toBeNull()
  })
})
