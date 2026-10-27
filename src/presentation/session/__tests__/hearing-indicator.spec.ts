import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, MicrophoneStatus } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
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
} from '@/presentation/__tests__/screen'
import { microphoneKey } from '@/presentation/dependencies'

// Feature microphone-input, slice 4: over the staff of a question with Microphone, the indicator
// names the note heard, in the naming chosen and as the instrument writes it, and how far it is
// from that note in tune: "↑ 12" above, "↓ 8" below, "0" in tune (criteria 9, 13). The arrow is for
// the eye only; a screen reader reads "12 cents higher", "8 cents lower" or "in tune", in the
// three languages (criterion 17). The indicator is not a live region: it changes up to ten times a
// second. In silence, in noise and for a sound beyond the range it is empty (edge case 2). It is
// there only with Microphone, and not while the microphone cannot be used (criterion 14). Its
// readings come from the frames the notes are heard from: here sounds of 140 ms, too short to
// answer the question, then a frame of silence.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

// MIDI note numbers: C4 = 60.
const SI_FLAT_3 = 58
const DO4 = 60
const RE4 = 62
const MI4 = 64
const FA_SHARP_4 = 66

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note, no signs: on C4.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

const MICROPHONE = (preferences: Preferences) => preferences.chooseNoteInput('microphone')

const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }

interface Visit {
  more?: (preferences: Preferences) => void
  status?: MicrophoneStatus
  locale?: Locale
}

// On the question, with Microphone chosen unless more changes it.
async function startWithMicrophone({
  more = () => {},
  status = { kind: 'ready' },
  locale = 'en',
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    ONE_NOTE(preferences)
    MICROPHONE(preferences)
    preferences.chooseLanguage(locale)
    more(preferences)
  })
  const microphone = fakeMicrophone(status)
  renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
    provides: { [microphoneKey as symbol]: microphone.microphone },
  })
  await startSession(NO_LIMIT[locale])
  return microphone
}

// A note sounded for 140 ms, off by the cents given, then a frame of silence: long enough for a
// reading, too short to answer.
async function sing(microphone: FakeMicrophone, number: number, cents = 0) {
  await microphone.hear(...Array.from({ length: 8 }, () => frequencyOf(number, cents)), null)
}

// Silence long enough for a reading of its own.
const hush = (microphone: FakeMicrophone) =>
  microphone.hear(...Array.from({ length: 8 }, () => null))

const indicator = () => screen.getByTestId('hearing-indicator')
const queryIndicator = () => screen.queryByTestId('hearing-indicator')
const normalized = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''

// What the eye sees: the text without what is hidden from it.
function seen(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement
  for (const hidden of copy.querySelectorAll('.visually-hidden')) hidden.remove()
  return normalized(copy)
}

// What a screen reader reads: the text without what is hidden from it.
function heard(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return normalized(copy)
}

const staff = () => screen.getByRole('img', { name: 'Music staff' })
const follows = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('the indicator over the staff (criterion 13)', () => {
  it('is there on the question with Microphone, empty before a sound', async () => {
    await startWithMicrophone()

    expect(normalized(indicator())).toBe('')
  })

  it('stands over the staff', async () => {
    await startWithMicrophone()

    expect(follows(indicator(), staff())).toBe(true)
  })

  it('names the note heard', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4)

    expect(within(indicator()).getByText('re4')).toBeTruthy()
  })

  it('shows a note above its pitch with an arrow up and its cents', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4, 12)

    expect(seen(indicator())).toBe('re4 ↑ 12')
  })

  it('shows a note below its pitch with an arrow down and its cents', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4, -8)

    expect(seen(indicator())).toBe('re4 ↓ 8')
  })

  it('shows a note in tune with 0 and no arrow', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4)

    expect(seen(indicator())).toBe('re4 0')
  })

  it.each([
    [12, 're4 12 cents higher'],
    [1, 're4 1 cent higher'],
    [-8, 're4 8 cents lower'],
    [0, 're4 in tune'],
  ])('reads %i cents to a screen reader in words', async (cents, text) => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4, cents)

    expect(heard(indicator())).toBe(text)
  })

  it('hides the arrow from a screen reader', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4, 12)

    expect(within(indicator()).getByText('↑ 12').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('is no live region', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, RE4, 12)

    expect(
      indicator().closest('[aria-live], [role="status"], [role="alert"], [role="log"]'),
    ).toBeNull()
    expect(indicator().querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull()
  })

  it('follows the note played', async () => {
    const microphone = await startWithMicrophone()
    await sing(microphone, RE4, 12)

    await sing(microphone, MI4, -8)

    expect(seen(indicator())).toBe('mi4 ↓ 8')
  })

  it('is empty again in silence (edge case 2)', async () => {
    const microphone = await startWithMicrophone()
    await sing(microphone, RE4, 12)

    await hush(microphone)

    expect(normalized(indicator())).toBe('')
  })

  it('stays empty for a sound beyond the range (edge case 4)', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, 30)

    expect(normalized(indicator())).toBe('')
  })

  it('names a sound of a black key by both of its names', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, FA_SHARP_4)

    expect(seen(indicator())).toBe('fa♯4/sol♭4 0')
  })

  it('names the note in the naming chosen', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseNoteNaming('letter'),
    })

    await sing(microphone, RE4, 12)

    expect(seen(indicator())).toBe('D4 ↑ 12')
  })

  it('names the note as an instrument in B♭ writes it (criterion 9)', async () => {
    const microphone = await startWithMicrophone({
      more: (preferences) => preferences.chooseTuning('b-flat'),
    })

    await sing(microphone, SI_FLAT_3, -8)

    expect(seen(indicator())).toBe('do4 ↓ 8')
  })

  it('answers nothing by itself: the question waits for a note held', async () => {
    const microphone = await startWithMicrophone()

    await sing(microphone, DO4)

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })
})

describe('the cents read in words (criterion 17)', () => {
  it.each([
    ['ru', 12, 'на 12 центов выше'],
    ['ru', 1, 'на 1 цент выше'],
    ['ru', 3, 'на 3 цента выше'],
    ['ru', -21, 'на 21 цент ниже'],
    ['ru', -8, 'на 8 центов ниже'],
    ['ru', 0, 'точно в строе'],
    ['es', 12, '12 cents más alto'],
    ['es', -8, '8 cents más bajo'],
    ['es', 0, 'afinado'],
  ] as const)('in %s, says %i cents as "%s"', async (locale, cents, text) => {
    const microphone = await startWithMicrophone({ locale })

    await sing(microphone, RE4, cents)

    expect(heard(indicator())).toMatch(new RegExp(`\\S+ ${text}$`))
  })
})

describe('no indicator', () => {
  it.each([{ kind: 'denied' }, { kind: 'missing' }, { kind: 'unsupported' }] as const)(
    'while the microphone is $kind (criterion 14)',
    async (status) => {
      await startWithMicrophone({ status })

      expect(queryIndicator()).toBeNull()
    },
  )

  it('once the microphone is unplugged in the middle of the question', async () => {
    const microphone = await startWithMicrophone()
    await sing(microphone, RE4, 12)

    await microphone.becomes({ kind: 'missing' })

    expect(queryIndicator()).toBeNull()
  })

  it.each(['names', 'keyboard'] as const)('with %s', async (input) => {
    await startWithMicrophone({ more: (preferences) => preferences.chooseNoteInput(input) })

    expect(queryIndicator()).toBeNull()
  })
})
