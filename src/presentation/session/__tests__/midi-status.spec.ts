import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, MidiStatus } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { fakeMidiInput, MIDI_READY } from '@/presentation/__tests__/midi-input'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
} from '@/presentation/__tests__/screen'

// Feature midi-input, slice 2: under Use a MIDI keyboard, while it is ticked, a line tells the
// state of MIDI: the names of the instruments connected, joined by a comma, or that none is, or
// that the browser did not allow MIDI. Not asked yet or waiting for the browser, there is no
// line. A browser without MIDI says so whether the box is ticked or not, and the box is inactive
// (criterion 3). The line is a status, so its changes are announced, and describes the box.
// Plugging an instrument in or out changes it at once. On the question of Read notes with Piano
// keyboard and MIDI on, the same line stands above the keyboard; with MIDI off there is none
// (criterion 10, assumption 2). An instrument unplugged in the middle of a question changes the
// line and leaves the answer chosen (edge case 3). The texts are in the three languages
// (criterion 12).

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    midi: 'Use a MIDI keyboard',
    connected: 'MIDI: Yamaha P-45',
    several: 'MIDI: Yamaha P-45, Pads',
    noInstrument: 'Connect a MIDI keyboard to this device.',
    denied: "The browser didn't allow MIDI. Allow it in the site settings.",
    unsupported: "This browser can't use MIDI keyboards. Try Chrome, Edge or Firefox.",
  },
  ru: {
    midi: 'MIDI-клавиатура',
    connected: 'MIDI: Yamaha P-45',
    several: 'MIDI: Yamaha P-45, Pads',
    noInstrument: 'Подключите MIDI-клавиатуру к этому устройству.',
    denied: 'Браузер не разрешил MIDI. Разрешите его в настройках сайта.',
    unsupported:
      'Этот браузер не работает с MIDI-клавиатурами. Попробуйте Chrome, Edge или Firefox.',
  },
  es: {
    midi: 'Usar un teclado MIDI',
    connected: 'MIDI: Yamaha P-45',
    several: 'MIDI: Yamaha P-45, Pads',
    noInstrument: 'Conecta un teclado MIDI a este dispositivo.',
    denied: 'El navegador no permitió MIDI. Permítelo en la configuración del sitio.',
    unsupported: 'Este navegador no puede usar teclados MIDI. Prueba Chrome, Edge o Firefox.',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
const LOCALES = ['en', 'ru', 'es'] as const

type Shown = 'connected' | 'several' | 'noInstrument' | 'denied' | 'unsupported'

const STATES: Record<Shown, MidiStatus> = {
  connected: MIDI_READY('Yamaha P-45'),
  several: MIDI_READY('Yamaha P-45', 'Pads'),
  noInstrument: MIDI_READY(),
  denied: { kind: 'denied' },
  unsupported: { kind: 'unsupported' },
}

const SHOWN = Object.keys(STATES) as Shown[]
const SILENT: MidiStatus[] = [{ kind: 'idle' }, { kind: 'asking' }]

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

const NAMES = (preferences: Preferences) => preferences.chooseNoteInput('names')
const KEYBOARD = (preferences: Preferences) => preferences.chooseNoteInput('keyboard')
const MIDI = (preferences: Preferences) => {
  KEYBOARD(preferences)
  preferences.chooseUseMidi(true)
}
const MIDI_WITH_NAMES = (preferences: Preferences) => {
  MIDI(preferences)
  NAMES(preferences)
}

function load(
  setUp: (preferences: Preferences) => void,
  status: MidiStatus = { kind: 'idle' },
  locale: Locale = 'en',
) {
  const midi = fakeMidiInput(status)
  renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storageWith(setUp)),
    midiInput: midi.midiInput,
  })
  return midi
}

async function question(
  setUp: (preferences: Preferences) => void,
  status: MidiStatus = { kind: 'idle' },
) {
  const midi = load(setUp, status)
  await chooseLength('No limit')
  return midi
}

const normalized = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''

const midiBox = (locale: Locale = 'en') =>
  screen.getByRole<HTMLInputElement>('checkbox', { name: TEXTS[locale].midi })

// The line read as a status: exactly one status says the text, nothing more.
function line(text: string): HTMLElement {
  const lines = screen.getAllByRole('status').filter((status) => normalized(status) === text)
  expect(lines.map(normalized)).toEqual([text])
  return lines[0] as HTMLElement
}

// Whatever the state, no text of the line is on the screen.
function expectNoLine(locale: Locale = 'en') {
  const texts = SHOWN.map((shown) => TEXTS[locale][shown])
  expect(texts.filter((text) => screen.queryByText(text) !== null)).toEqual([])
  expect(screen.queryByText(/^\s*MIDI:/)).toBeNull()
}

function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .join(' ')
    .trim()
}

const follows = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const keyboard = () => screen.getByRole('group', { name: 'Piano keyboard' })
const key = (name: string) => within(keyboard()).getByRole('button', { name })

describe('the line on the choice screen (criterion 3)', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    it.each(SHOWN)('says %s with the box ticked', (shown) => {
      load(MIDI, STATES[shown], locale)

      expect(line(TEXTS[locale][shown])).toBeTruthy()
    })
  })

  it.each(SILENT)('is not there while the state is $kind', (status) => {
    load(MIDI, status)

    expectNoLine()
  })

  it.each(['connected', 'noInstrument', 'denied'] as const)(
    'is not there with the box cleared, the state %s',
    (shown) => {
      load(KEYBOARD, STATES[shown])

      expectNoLine()
    },
  )

  it('describes the box', () => {
    load(MIDI, STATES.connected)

    expect(description(midiBox())).toBe(EN.connected)
  })

  it('comes after the box', () => {
    load(MIDI, STATES.connected)

    expect(follows(midiBox(), line(EN.connected))).toBe(true)
  })

  it('shows once the box is ticked', async () => {
    load(KEYBOARD, STATES.connected)

    await fireEvent.click(midiBox())

    expect(line(EN.connected)).toBeTruthy()
  })

  it('goes once the box is cleared', async () => {
    load(MIDI, STATES.connected)

    await fireEvent.click(midiBox())

    expectNoLine()
  })

  it('shows the answer of the browser', async () => {
    const midi = load(KEYBOARD)
    await fireEvent.click(midiBox())

    await midi.becomes({ kind: 'asking' })
    expectNoLine()
    await midi.becomes(STATES.connected)

    expect(line(EN.connected)).toBeTruthy()
  })

  it('shows a refusal of the browser', async () => {
    const midi = load(MIDI, { kind: 'asking' })

    await midi.becomes(STATES.denied)

    expect(line(EN.denied)).toBeTruthy()
  })

  it('changes at once when an instrument is plugged in', async () => {
    const midi = load(MIDI, STATES.noInstrument)

    await midi.becomes(STATES.connected)
    expect(line(EN.connected)).toBeTruthy()
    await midi.becomes(STATES.several)

    expect(line(EN.several)).toBeTruthy()
  })

  it('changes at once when the instrument is unplugged', async () => {
    const midi = load(MIDI, STATES.connected)

    await midi.becomes(STATES.noInstrument)

    expect(line(EN.noInstrument)).toBeTruthy()
    expect(screen.queryByText(EN.connected)).toBeNull()
  })

  it('is not there with Note names', () => {
    load(MIDI_WITH_NAMES, STATES.connected)

    expectNoLine()
  })
})

describe('a browser without MIDI (criterion 3)', () => {
  it.each(LOCALES)('is said with the box cleared, in %s', (locale) => {
    load(KEYBOARD, STATES.unsupported, locale)

    expect(line(TEXTS[locale].unsupported)).toBeTruthy()
  })

  it('makes the box inactive and cleared as it was', () => {
    load(KEYBOARD, STATES.unsupported)

    expect(midiBox().disabled).toBe(true)
    expect(midiBox().checked).toBe(false)
  })

  it('makes the box inactive and leaves it ticked as it was saved', () => {
    load(MIDI, STATES.unsupported)

    expect(midiBox().disabled).toBe(true)
    expect(midiBox().checked).toBe(true)
  })

  it('describes the box', () => {
    load(KEYBOARD, STATES.unsupported)

    expect(description(midiBox())).toBe(EN.unsupported)
  })

  it('leaves the box active in a browser with MIDI', () => {
    load(KEYBOARD, STATES.noInstrument)

    expect(midiBox().disabled).toBe(false)
  })

  it('is not said with Note names', () => {
    load(NAMES, STATES.unsupported)

    expectNoLine()
  })
})

describe('the line on the question screen (criterion 10)', () => {
  it.each(SHOWN)('says %s with MIDI on', async (shown) => {
    await question(MIDI, STATES[shown])

    expect(line(EN[shown])).toBeTruthy()
  })

  it('stands above the keyboard', async () => {
    await question(MIDI, STATES.connected)

    expect(follows(line(EN.connected), keyboard())).toBe(true)
  })

  it.each(['connected', 'noInstrument', 'unsupported'] as const)(
    'is not there with MIDI off, the state %s (assumption 2)',
    async (shown) => {
      await question(KEYBOARD, STATES[shown])

      expectNoLine()
    },
  )

  it('is not there with Note names', async () => {
    await question(MIDI_WITH_NAMES, STATES.connected)

    expectNoLine()
  })

  it.each(SILENT)('is not there while the state is $kind', async (status) => {
    await question(MIDI, status)

    expectNoLine()
  })

  it('changes at once when an instrument is plugged in', async () => {
    const midi = await question(MIDI, STATES.noInstrument)

    await midi.becomes(STATES.connected)

    expect(line(EN.connected)).toBeTruthy()
  })

  it('changes when the instrument is unplugged and keeps the key chosen (edge case 3)', async () => {
    const midi = await question(MIDI, STATES.connected)
    await midi.press(62)

    await midi.becomes(STATES.noInstrument)

    expect(line(EN.noInstrument)).toBeTruthy()
    expect(key('re4').getAttribute('aria-pressed')).toBe('true')
  })

  it('stops listening to the state once the screen is gone', async () => {
    const midi = await question(MIDI, STATES.connected)
    expect(midi.statusListeners()).toBeGreaterThan(0)

    cleanup()

    expect(midi.statusListeners()).toBe(0)
  })
})

describe('the choice screen gone', () => {
  it('stops listening to the state', () => {
    const midi = load(MIDI, STATES.connected)
    expect(midi.statusListeners()).toBeGreaterThan(0)

    cleanup()

    expect(midi.statusListeners()).toBe(0)
  })
})
