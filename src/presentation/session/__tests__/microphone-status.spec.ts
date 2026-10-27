import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, MicrophoneStatus, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { renderApp, renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { fakeMicrophone, MICROPHONE_LINES } from '@/presentation/__tests__/microphone'
import {
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startSession,
  startingOnC4,
  statusText,
} from '@/presentation/__tests__/screen'
import { fakeScreenWakeLock } from '@/presentation/__tests__/screen-wake-lock'
import { microphoneKey, screenWakeLockKey } from '@/presentation/dependencies'

// Feature microphone-input, slice 4. Under the indicator of a question with Microphone, a line
// tells the state of the microphone: "Microphone: listening" while it is allowed, or what keeps it
// from being used: not allowed, no microphone, a browser that cannot use one (criterion 14). Not
// asked yet or waiting for the browser, there is no line. The line is a status, one node for the
// whole screen, not made anew for each question, so its changes are announced; a microphone
// unplugged in the middle of a question changes it at once and leaves the notes played (edge case
// 6). While the microphone cannot be used there is no indicator: the line is the message of the
// screen, and under it the button Change note input leads to the settings (edge case 5).
//
// On the settings screen, with Microphone, the same line stands under Instrument, only for a
// problem: there the microphone does not listen. It describes the list Note input.
//
// While the question with Microphone is shown, the screen of the device stays on; it is let go
// once the question screen is left. With another note input it is not kept on (criterion 15 on the
// screen). The texts are in the three languages (criterion 17).

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const LINES = MICROPHONE_LINES
const EN = LINES.en
const LOCALES = ['en', 'ru', 'es'] as const

const CHANGE: Record<Locale, string> = {
  en: 'Change note input',
  ru: 'Сменить способ ввода',
  es: 'Cambiar el modo de respuesta',
}

const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }

type Problem = 'denied' | 'missing' | 'unsupported'
const PROBLEMS: readonly Problem[] = ['denied', 'missing', 'unsupported']
const SILENT: MicrophoneStatus[] = [{ kind: 'idle' }, { kind: 'asking' }]

// MIDI note numbers: C4 = 60.
const DO4 = 60

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

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

// The values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// As in microphone-input.spec.ts: C4, E4 and G4 in Confident reading.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

const MICROPHONE = (preferences: Preferences) => preferences.chooseNoteInput('microphone')

interface Visit {
  status?: MicrophoneStatus
  locale?: Locale
  random?: Random
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
}

// On the question, with Microphone chosen unless more changes it.
async function startWithMicrophone({
  status = { kind: 'ready' },
  locale = 'en',
  random = startingOnC4(),
  difficulty = ONE_NOTE,
  more = () => {},
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    MICROPHONE(preferences)
    preferences.chooseLanguage(locale)
    more(preferences)
  })
  const microphone = fakeMicrophone(status)
  const wakeLock = fakeScreenWakeLock()
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
    provides: {
      [microphoneKey as symbol]: microphone.microphone,
      [screenWakeLockKey as symbol]: wakeLock.wakeLock,
    },
  })
  await startSession(NO_LIMIT[locale])
  return { ...microphone, wakeLock }
}

// The settings screen with the note input of the storage.
async function loadSettings(
  setUp: (preferences: Preferences) => void,
  status: MicrophoneStatus = { kind: 'idle' },
  locale: Locale = 'en',
) {
  const microphone = fakeMicrophone(status)
  await renderSettings({
    locale,
    storage: storageWith((preferences) => {
      setUp(preferences)
      preferences.chooseLanguage(locale)
    }),
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  return microphone
}

const normalized = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''

// The line read as a status: exactly one status says the text, nothing more.
function line(text: string): HTMLElement {
  const lines = screen.getAllByRole('status').filter((status) => normalized(status) === text)
  expect(lines.map(normalized)).toEqual([text])
  return lines[0] as HTMLElement
}

// Whatever the state, no text of the line is on the screen.
function expectNoLine(locale: Locale = 'en') {
  const texts = Object.values(LINES[locale])
  expect(texts.filter((text) => screen.queryByText(text) !== null)).toEqual([])
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

const button = (name: string) => screen.getByRole('button', { name })
const link = (name: string) => screen.getByRole('link', { name })
const queryLink = (name: string) => screen.queryByRole('link', { name })
const combobox = (name: string) => screen.getByRole<HTMLSelectElement>('combobox', { name })
const indicator = () => screen.getByTestId('hearing-indicator')
const target = (number: number) => screen.getByRole('button', { name: `Note ${number}` })

async function chooseNoteInput(option: string) {
  const list = combobox('Note input')
  const { value } = within(list).getByRole<HTMLOptionElement>('option', { name: option })
  await fireEvent.update(list, value)
}

describe('the line on the question (criterion 14)', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    it('says the microphone listens', async () => {
      await startWithMicrophone({ locale })

      expect(line(LINES[locale].ready)).toBeTruthy()
    })

    it.each(PROBLEMS)('says %s', async (kind) => {
      await startWithMicrophone({ status: { kind }, locale })

      expect(line(LINES[locale][kind])).toBeTruthy()
    })
  })

  it.each(SILENT)('is not there while the state is $kind', async (status) => {
    await startWithMicrophone({ status })

    expectNoLine()
  })

  it.each(['names', 'keyboard'] as const)('is not there with %s', async (input) => {
    await startWithMicrophone({ more: (preferences) => preferences.chooseNoteInput(input) })

    expectNoLine()
  })

  it('stands under the indicator', async () => {
    await startWithMicrophone()

    expect(follows(indicator(), line(EN.ready))).toBe(true)
  })

  it('is no part of the message of the question', async () => {
    const microphone = await startWithMicrophone()

    await microphone.play(DO4)

    expect(statusText()).toBe('Correct')
    expect(line(EN.ready)).toBeTruthy()
  })

  it('shows the answer of the browser', async () => {
    const microphone = await startWithMicrophone({ status: { kind: 'asking' } })

    await microphone.becomes({ kind: 'ready' })

    expect(line(EN.ready)).toBeTruthy()
  })

  it('is the same node through the questions', async () => {
    const microphone = await startWithMicrophone()
    const first = line(EN.ready)
    await microphone.play(DO4)

    await fireEvent.click(button('Next'))

    expect(line(EN.ready)).toBe(first)
  })

  it('stops listening to the state once the screen is gone', async () => {
    const microphone = await startWithMicrophone()
    expect(microphone.statusListeners()).toBeGreaterThan(0)

    cleanup()

    expect(microphone.statusListeners()).toBe(0)
  })
})

describe('a microphone unplugged in the middle of a question (edge case 6)', () => {
  it('changes the line at once, the same node', async () => {
    const microphone = await startWithMicrophone()
    const listening = line(EN.ready)

    await microphone.becomes({ kind: 'missing' })

    expect(line(EN.missing)).toBe(listening)
    expect(screen.queryByText(EN.ready)).toBeNull()
  })

  it('leaves the notes played', async () => {
    const microphone = await startWithMicrophone({
      random: DO_MI_SOL(),
      difficulty: SEVERAL_PITCHES,
    })
    await microphone.play(DO4)

    await microphone.becomes({ kind: 'missing' })

    expect(description(target(1))).toBe('do4')
  })

  it('offers Change note input', async () => {
    const microphone = await startWithMicrophone()

    await microphone.becomes({ kind: 'missing' })

    expect(link(CHANGE.en)).toBeTruthy()
  })

  it('tells the microphone plugged in again', async () => {
    const microphone = await startWithMicrophone()
    await microphone.becomes({ kind: 'missing' })

    await microphone.becomes({ kind: 'ready' })

    expect(line(EN.ready)).toBeTruthy()
    expect(queryLink(CHANGE.en)).toBeNull()
  })
})

describe('Change note input (edge case 5)', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    it.each(PROBLEMS)('is offered under the line while the microphone is %s', async (kind) => {
      await startWithMicrophone({ status: { kind }, locale })

      expect(follows(line(LINES[locale][kind]), link(CHANGE[locale]))).toBe(true)
    })
  })

  it.each([{ kind: 'ready' }, ...SILENT] as const)(
    'is not offered while the microphone is $kind',
    async (status) => {
      await startWithMicrophone({ status })

      expect(queryLink(CHANGE.en)).toBeNull()
    },
  )

  it('leads to the settings', async () => {
    const storage = storageWith((preferences) => {
      ONE_NOTE(preferences)
      MICROPHONE(preferences)
    })
    const microphone = fakeMicrophone({ kind: 'denied' })
    await renderApp({ storage, provides: { [microphoneKey as symbol]: microphone.microphone } })
    await startSession('No limit')

    await fireEvent.click(link(CHANGE.en))

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(combobox('Note input')).toBeTruthy()
  })
})

describe('the line on the settings screen (criterion 14)', () => {
  describe.each(LOCALES)('in %s', (locale) => {
    it.each(PROBLEMS)('says %s with Microphone', async (kind) => {
      await loadSettings(MICROPHONE, { kind }, locale)

      expect(line(LINES[locale][kind])).toBeTruthy()
    })
  })

  it('says nothing of a microphone that is allowed: it does not listen there', async () => {
    await loadSettings(MICROPHONE, { kind: 'ready' })

    expectNoLine()
  })

  it.each(SILENT)('is not there while the state is $kind', async (status) => {
    await loadSettings(MICROPHONE, status)

    expectNoLine()
  })

  it.each(['names', 'keyboard'] as const)(
    'is not there with %s, the microphone unsupported',
    async (input) => {
      await loadSettings((preferences) => preferences.chooseNoteInput(input), {
        kind: 'unsupported',
      })

      expectNoLine()
    },
  )

  it('stands under Instrument', async () => {
    await loadSettings(MICROPHONE, { kind: 'denied' })

    expect(follows(combobox('Instrument'), line(EN.denied))).toBe(true)
  })

  it('describes the list Note input', async () => {
    await loadSettings(MICROPHONE, { kind: 'denied' })

    expect(description(combobox('Note input'))).toBe(EN.denied)
  })

  it('leaves the list Note input undescribed while there is no problem', async () => {
    await loadSettings(MICROPHONE, { kind: 'ready' })

    expect(description(combobox('Note input'))).toBe('')
  })

  it('shows a refusal of the browser once Microphone is chosen', async () => {
    const microphone = await loadSettings((preferences) => preferences.chooseNoteInput('names'))
    await chooseNoteInput('Microphone')

    await microphone.becomes({ kind: 'asking' })
    expectNoLine()
    await microphone.becomes({ kind: 'denied' })

    expect(line(EN.denied)).toBeTruthy()
    expect(description(combobox('Note input'))).toBe(EN.denied)
  })

  it('goes once another note input is chosen', async () => {
    await loadSettings(MICROPHONE, { kind: 'denied' })
    expect(line(EN.denied)).toBeTruthy()

    await chooseNoteInput('Note names')

    expectNoLine()
  })

  it('stops listening to the state once the screen is gone', async () => {
    const microphone = await loadSettings(MICROPHONE, { kind: 'denied' })
    expect(microphone.statusListeners()).toBeGreaterThan(0)

    cleanup()

    expect(microphone.statusListeners()).toBe(0)
  })
})

describe('the screen kept on (criterion 15 on the screen)', () => {
  it('is kept on while the question with Microphone is shown', async () => {
    const { wakeLock } = await startWithMicrophone()

    expect(wakeLock.isOn()).toBe(true)
  })

  it('stays on through the next question', async () => {
    const microphone = await startWithMicrophone()
    await microphone.play(DO4)

    await fireEvent.click(button('Next'))

    expect(microphone.wakeLock.isOn()).toBe(true)
  })

  it('is let go on the results', async () => {
    const { wakeLock } = await startWithMicrophone()

    await fireEvent.click(button('Finish'))

    expect(wakeLock.keeps()).toBeGreaterThan(0)
    expect(wakeLock.isOn()).toBe(false)
  })

  it('is let go when the page goes away', async () => {
    const { wakeLock } = await startWithMicrophone()
    expect(wakeLock.isOn()).toBe(true)

    cleanup()

    expect(wakeLock.isOn()).toBe(false)
  })

  it('is let go on the settings', async () => {
    const storage = storageWith((preferences) => {
      ONE_NOTE(preferences)
      MICROPHONE(preferences)
    })
    const wakeLock = fakeScreenWakeLock()
    const { router } = await renderApp({
      storage,
      provides: {
        [microphoneKey as symbol]: fakeMicrophone({ kind: 'ready' }).microphone,
        [screenWakeLockKey as symbol]: wakeLock.wakeLock,
      },
    })
    await startSession('No limit')
    expect(wakeLock.isOn()).toBe(true)

    await router.push('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    expect(wakeLock.isOn()).toBe(false)
  })

  it.each(['names', 'keyboard'] as const)('is not asked for with %s', async (input) => {
    const { wakeLock } = await startWithMicrophone({
      more: (preferences) => preferences.chooseNoteInput(input),
    })

    expect(wakeLock.keeps()).toBe(0)
  })

  it('is not asked for in Write notes', async () => {
    const { wakeLock } = await startWithMicrophone({
      more: (preferences) => preferences.chooseExercise('write'),
    })

    expect(wakeLock.keeps()).toBe(0)
  })

  it('is not asked for on the length choice', () => {
    const wakeLock = fakeScreenWakeLock()
    renderSessionWith({
      random: startingOnC4(),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storageWith(MICROPHONE)),
      provides: { [screenWakeLockKey as symbol]: wakeLock.wakeLock },
    })

    expect(wakeLock.keeps()).toBe(0)
  })
})
