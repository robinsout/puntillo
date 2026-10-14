import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, PianoSound, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { createKeySound } from '@/application/sound'
import { backToTrainer, renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs, isOpenAsModal } from '@/presentation/__tests__/dialog'
import { fakeMidiInput } from '@/presentation/__tests__/midi-input'
import {
  startSession,
  createManualClock,
  createMemoryStorage,
  drawStaff,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  startingOnG4,
  statusText,
  type StaffDrawing,
} from '@/presentation/__tests__/screen'

// Feature midi-input, slice 1: in Read notes with Piano keyboard and Use a MIDI keyboard, a key
// pressed on the instrument is a click of that key on the screen: it takes the pitch of the note,
// the key on the screen is pressed, the duration and Check follow; the quick mode answers as the
// key on the screen does (criterion 4). The key is graded by its sound and octave, a black key
// right for either of its names, the review naming the note as written (criterion 5). A key beyond
// the keyboard on the screen answers too, wrongly, and is named by the review; nothing is pressed
// on the screen (criterion 6). With Play sound for the MIDI keys the key sounds, without it it does
// not; Play the keys goes on with the keys on the screen alone (criterion 7). A key inactive on the
// screen does nothing from the instrument (criterion 8), and the keys on the screen still work
// along with the instrument (criterion 9). A chord fills the notes of a question one after another (edge case 1). Nothing
// is heard outside a question of Read notes (edge case 4), with the box cleared (edge case 5), under
// a modal dialog (edge case 6) or before the staff is drawn.
// Feature navigation-and-settings, slice 1: the boxes are on the settings screen, which hears
// nothing either.

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
  correct: 'Correct',
  incorrect: 'Incorrect',
  tryAgain: 'Incorrect. Try again.',
  playKeyAndDuration: 'Play a key and choose a duration',
  midi: 'Use a MIDI keyboard',
  midiSound: 'Play sound for the MIDI keys',
  playKeys: 'Play the keys',
}

// MIDI note numbers: C4 = 60.
const DO2 = 36
const DO4 = 60
const DO_SHARP_4 = 61
const RE4 = 62
const MI4 = 64
const FA_SHARP_4 = 66
const SOL4 = 67
const SOL_SHARP_4 = 68
const SI_FLAT_4 = 70
const DO5 = 72
const SOL5 = 79

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

// As in piano-keyboard.spec.ts: F4, a quarter, with a sharp before it: fa♯ in the 1st space.
const FA_SHARP = () => sequence(3.5 / 12, 0.5, 0.9, 0)
// As in hints.spec.ts: B4, a quarter, in a key of one flat, no sign before it: si♭ on the 3rd line.
const SI_FLAT_IN_KEY = () => sequence(6.5 / 12, 0.5, 0.5, 0.5, 0)
// As in multi-note-trainer.spec.ts: C4, E4 and G4 in Confident reading.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note in 4/4, no signs, the duration asked; its keyboard spans do4 to
// sol5.
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

const KEY_SIGNS = (preferences: Preferences) => {
  SIGNS(preferences)
  preferences.customize({ keySignatures: 2 })
}

// Several notes, their durations not asked, so a key alone answers a note.
const SEVERAL_PITCHES = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ askDuration: false })
}

const FIRST_STEPS = (preferences: Preferences) => preferences.choosePreset('first-steps')

const MIDI = (preferences: Preferences) => {
  preferences.chooseNoteInput('keyboard')
  preferences.chooseUseMidi(true)
}

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
  drawing?: StaffDrawing
}

// On the length choice, with Piano keyboard and Use a MIDI keyboard chosen unless more changes
// them, an instrument plugged in and the sound of the keys over the preferences, as main.ts makes
// them. By default on C4, a whole note, then D4.
function renderWithMidi({
  random = startingOnC4(),
  difficulty = ONE_NOTE,
  more = () => {},
  drawing = 'immediate',
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    MIDI(preferences)
    more(preferences)
  })
  const preferences = preferencesFor(['en'], storage)
  const midi = fakeMidiInput()
  const sound = recordingPiano()
  renderSessionWith(
    {
      random,
      clock: createManualClock().clock,
      preferences,
      keySound: createKeySound(sound.piano, preferences),
      midiInput: midi.midiInput,
    },
    drawing,
  )
  return { ...midi, played: sound.played }
}

// The settings screen of the whole app over the same storage as renderWithMidi.
async function settingsWithMidi() {
  const storage = storageWith((preferences) => {
    ONE_NOTE(preferences)
    MIDI(preferences)
  })
  const midi = fakeMidiInput()
  await renderSettings({ storage, midiInput: midi.midiInput })
  return midi
}

async function startWithMidi(visit: Visit = {}) {
  const started = renderWithMidi(visit)
  await startSession('No limit')
  return started
}

const keyboard = () => screen.getByRole('group', { name: EN.keyboard })
const keys = () => within(keyboard()).getAllByRole('button')
const key = (name: string) => within(keyboard()).getByRole('button', { name })
const button = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const play = (name: string) => fireEvent.click(key(name))
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const shownPitch = () => staff().getAttribute('data-pitch')
const pressedKeys = () => keys().filter((each) => each.getAttribute('aria-pressed') === 'true')

// The mark reaches a screen reader as the description of the key.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const describedKeys = (text: string) => keys().filter((each) => description(each) === text)

describe('a key of the instrument (criterion 4)', () => {
  it('presses that key on the screen and only it', async () => {
    const midi = await startWithMidi()

    await midi.press(RE4)

    expect(pressedKeys()).toEqual([key('re4')])
  })

  it('moves the press to the next key of the instrument', async () => {
    const midi = await startWithMidi()

    await midi.press(RE4)
    await midi.press(DO4)

    expect(pressedKeys()).toEqual([key('do4')])
  })

  it('says Correct with the duration and Check', async () => {
    const midi = await startWithMidi()

    await midi.press(DO4)
    await press('1/1')
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })

  it('needs the duration still when it is asked', async () => {
    const midi = await startWithMidi()

    await midi.press(DO4)
    await press(EN.check)

    expect(statusText()).toBe(EN.playKeyAndDuration)
  })

  it('takes the duration chosen before it', async () => {
    const midi = await startWithMidi()

    await press('1/1')
    await midi.press(DO4)
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })
})

describe('the grade (criterion 5)', () => {
  it('follows a key an octave off to the second attempt', async () => {
    const midi = await startWithMidi()

    await midi.press(DO5)
    await press('1/1')
    await press(EN.check)

    expect(statusText()).toBe(EN.tryAgain)
    expect(key('do5').matches(':disabled')).toBe(true)
  })

  it('says Correct for the black key of a note with a sharp', async () => {
    const midi = await startWithMidi({ random: FA_SHARP(), difficulty: SIGNS })
    expect(shownPitch()).toBe('F#4')

    await midi.press(FA_SHARP_4)
    await press('1/4')
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })

  it('says Correct for the black key of a note with a flat', async () => {
    const midi = await startWithMidi({ random: SI_FLAT_IN_KEY(), difficulty: KEY_SIGNS })
    expect(shownPitch()).toBe('Bb4')

    await midi.press(SI_FLAT_4)
    await press('1/4')
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })

  it('names a black key by both of its names and the note as written', async () => {
    const midi = await startWithMidi({ random: FA_SHARP(), difficulty: SIGNS, more: atOnce })

    await midi.press(SOL_SHARP_4)
    await press('1/4')
    await press(EN.check)

    expect(statusText()).toBe('You played sol♯4/la♭4. This is fa♯4: the note in the 1st space.')
  })

  it('names the key played and the note with their octaves', async () => {
    const midi = await startWithMidi({ random: startingOnG4(), more: atOnce })

    await midi.press(SOL5)
    await press('1/2')
    await press(EN.check)

    expect(statusText()).toBe('You played sol5. This is sol4: the note on the 2nd line.')
    expect(describedKeys(EN.incorrect)).toEqual([key('sol5')])
    expect(describedKeys(EN.correct)).toEqual([key('sol4')])
  })
})

describe('a key beyond the keyboard on the screen (criterion 6)', () => {
  it('presses no key on the screen', async () => {
    const midi = await startWithMidi()

    await midi.press(DO2)

    expect(pressedKeys()).toEqual([])
  })

  it('answers, wrongly, and is named by the review', async () => {
    const midi = await startWithMidi({ random: startingOnG4(), more: atOnce })

    await midi.press(DO2)
    await press('1/2')
    await press(EN.check)

    expect(statusText()).toBe('You played do2. This is sol4: the note on the 2nd line.')
    expect(describedKeys(EN.incorrect)).toEqual([])
    expect(describedKeys(EN.correct)).toEqual([key('sol4')])
  })

  it('leads to the second attempt, every key on the screen still enabled', async () => {
    const midi = await startWithMidi()

    await midi.press(DO2)
    await press('1/1')
    await press(EN.check)

    expect(statusText()).toBe(EN.tryAgain)
    expect(keys().filter((each) => each.matches(':disabled'))).toEqual([])
  })

  it('takes the place of a key on the screen played before it', async () => {
    const midi = await startWithMidi({ random: startingOnG4(), more: atOnce })

    await play('sol4')
    await midi.press(DO2)
    await press('1/2')
    await press(EN.check)

    expect(pressedKeys()).toEqual([])
    expect(statusText()).toBe('You played do2. This is sol4: the note on the 2nd line.')
  })
})

describe('a key inactive on the screen (criterion 8)', () => {
  it('does nothing when it was rejected in the first attempt', async () => {
    const { press: pressMidi, played } = await startWithMidi({
      more: (preferences) => preferences.chooseMidiSound(true),
    })
    await pressMidi(DO5)
    await press('1/1')
    await press(EN.check)

    await pressMidi(DO5)

    expect(pressedKeys()).toEqual([])
    expect(played).toEqual([DO5])
  })

  it('does nothing once the question is checked', async () => {
    const { press: pressMidi, played } = await startWithMidi({
      more: (preferences) => preferences.chooseMidiSound(true),
    })
    await pressMidi(DO4)
    await press('1/1')
    await press(EN.check)

    await pressMidi(RE4)

    expect(pressedKeys()).toEqual([key('do4')])
    expect(statusText()).toBe(EN.correct)
    expect(played).toEqual([DO4])
  })

  it('does nothing when only the duration was wrong, the pitch counted', async () => {
    const midi = await startWithMidi()
    await midi.press(DO4)
    await press('1/2')
    await press(EN.check)

    await midi.press(RE4)

    expect(pressedKeys()).toEqual([key('do4')])
  })

  it('leaves the keys still active to the second attempt', async () => {
    const midi = await startWithMidi()
    await midi.press(DO5)
    await press('1/1')
    await press(EN.check)

    await midi.press(DO4)
    await press(EN.check)

    expect(statusText()).toBe('Correct on the second try')
  })
})

describe('with the keys on the screen (criterion 9)', () => {
  it('lets a key on the screen replace a key of the instrument', async () => {
    const midi = await startWithMidi()

    await midi.press(RE4)
    await play('do4')
    await press('1/1')
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })

  it('lets a key of the instrument replace a key on the screen', async () => {
    const midi = await startWithMidi()

    await play('re4')
    await midi.press(DO4)
    await press('1/1')
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })
})

describe('the sound of a key of the instrument (criterion 7)', () => {
  it('is silent with Play sound for the MIDI keys cleared', async () => {
    const midi = await startWithMidi()

    await midi.press(DO4)

    expect(midi.played).toEqual([])
  })

  it('sounds with Play sound for the MIDI keys ticked', async () => {
    const midi = await startWithMidi({
      more: (preferences) => preferences.chooseMidiSound(true),
    })

    await midi.press(DO4)
    await midi.press(DO_SHARP_4)

    expect(midi.played).toEqual([DO4, DO_SHARP_4])
  })

  it('sounds beyond the keyboard on the screen', async () => {
    const midi = await startWithMidi({
      more: (preferences) => preferences.chooseMidiSound(true),
    })

    await midi.press(DO2)

    expect(midi.played).toEqual([DO2])
  })

  it('sounds with Play the keys cleared, a key on the screen staying silent', async () => {
    const midi = await startWithMidi({
      more: (preferences) => {
        preferences.chooseMidiSound(true)
        preferences.choosePlayKeys(false)
      },
    })

    await midi.press(DO4)
    await play('re4')

    expect(midi.played).toEqual([DO4])
  })

  it('is silent with Play the keys ticked, a key on the screen sounding', async () => {
    const midi = await startWithMidi()

    await midi.press(DO4)
    await play('re4')

    expect(midi.played).toEqual([RE4])
  })
})

describe('a chord (edge case 1)', () => {
  it('fills the notes of the question one after another', async () => {
    const midi = await startWithMidi({ random: DO_MI_SOL(), difficulty: SEVERAL_PITCHES })
    expect(shownPitch()).toBe('C4 E4 G4')

    await midi.press(DO4, MI4, SOL4)
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })

  it('takes the last key for a question of one note', async () => {
    const midi = await startWithMidi()

    await midi.press(RE4, DO4)

    expect(pressedKeys()).toEqual([key('do4')])
  })
})

describe('the quick mode (criterion 4)', () => {
  it('answers with the key and the duration, and opens the next question', async () => {
    const midi = await startWithMidi({ more: quick })

    await midi.press(DO4)
    await press('1/1')

    expect(shownPitch()).toBe('D4')
    expect(statusText()).toBe(EN.correct)
  })

  it('answers with the key alone when the duration is not asked', async () => {
    const midi = await startWithMidi({ difficulty: FIRST_STEPS, more: quick })
    expect(shownPitch()).toBe('D4')

    await midi.press(RE4)

    expect(shownPitch()).not.toBe('D4')
    expect(statusText()).toBe(EN.correct)
  })

  it('stops on a wrong key for the second attempt', async () => {
    const midi = await startWithMidi({ difficulty: FIRST_STEPS, more: quick })

    await midi.press(DO4)

    expect(shownPitch()).toBe('D4')
    expect(statusText()).toBe(EN.tryAgain)
  })

  it('is heard in the next question as well', async () => {
    const midi = await startWithMidi({ more: quick })
    await midi.press(DO4)
    await press('1/1')

    await midi.press(RE4)
    await press('1/1')

    expect(statusText()).toBe(EN.correct)
    expect(shownPitch()).toBe('C4')
  })
})

describe('when nothing is heard', () => {
  it('on the choice screen, a key there counting for nothing in the question (edge case 4)', async () => {
    const midi = renderWithMidi()

    await midi.press(DO4)
    await startSession('No limit')
    await press('1/1')
    await press(EN.check)

    expect(pressedKeys()).toEqual([])
    expect(statusText()).toBe(EN.playKeyAndDuration)
  })

  it('in Write notes (edge case 4)', async () => {
    const midi = await startWithMidi({
      difficulty: FIRST_STEPS,
      more: (preferences) => preferences.chooseExercise('write'),
    })
    const drawn = staff().getAttribute('data-drawn')

    await midi.press(DO4)
    await midi.press(SOL4)

    expect(staff().getAttribute('data-drawn')).toBe(drawn)
    expect(statusText()).toBe('')
  })

  it('with Use a MIDI keyboard cleared', async () => {
    const midi = await startWithMidi({
      more: (preferences) => {
        preferences.chooseMidiSound(true)
        preferences.chooseUseMidi(false)
      },
    })

    await midi.press(DO4)

    expect(pressedKeys()).toEqual([])
    expect(midi.played).toEqual([])
  })

  it('on the settings screen, a key there counting for nothing in the question (edge case 4)', async () => {
    const midi = await settingsWithMidi()

    await midi.press(DO4)
    await backToTrainer()
    await startSession('No limit')
    await press('1/1')
    await press(EN.check)

    expect(pressedKeys()).toEqual([])
    expect(statusText()).toBe(EN.playKeyAndDuration)
  })

  it('once Use a MIDI keyboard is cleared on the settings screen (edge case 5)', async () => {
    const midi = await settingsWithMidi()

    await fireEvent.click(screen.getByRole('checkbox', { name: EN.midi }))
    await backToTrainer()
    await startSession('No limit')
    await midi.press(DO4)

    expect(pressedKeys()).toEqual([])
  })

  it('with Note names', async () => {
    const midi = await startWithMidi({
      more: (preferences) => preferences.chooseNoteInput('names'),
    })

    await midi.press(DO4)
    await press('1/1')
    await press(EN.check)

    expect(
      screen.getAllByRole('button').filter((each) => each.getAttribute('aria-pressed') === 'true'),
    ).toEqual([button('1/1')])
    expect(statusText()).not.toBe(EN.correct)
  })

  it('before the staff is drawn', async () => {
    const midi = await startWithMidi({ drawing: 'held' })

    await midi.press(DO4)
    drawStaff()
    await midi.press()

    expect(pressedKeys()).toEqual([])
    expect(statusText()).toBe('')
  })

  it('under the dialog Keyboard shortcuts (edge case 6)', async () => {
    // A desktop: the question screen offers the keyboard shortcuts in its hint.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (media: string) =>
        Object.assign(new EventTarget(), { media, matches: media === '(pointer: fine)' }),
    })
    const midi = await startWithMidi()
    await press('Keyboard shortcuts')
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(isOpenAsModal(dialog)).toBe(true)

    await midi.press(DO4)

    expect(pressedKeys()).toEqual([])
  })
})
