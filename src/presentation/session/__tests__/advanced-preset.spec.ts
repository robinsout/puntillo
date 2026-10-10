import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import {
  ALL_DURATIONS,
  chooseLength,
  chooseShownDuration,
  constant,
  createManualClock,
  createMemoryStorage,
  cycle,
  DURATION_NAMES,
  DURATIONS,
  loadSession,
  preferencesFor,
  renderSessionWith,
  storageWithPreset,
} from '@/presentation/__tests__/screen'

// Feature difficulty-presets, slice 2: the card Advanced, criteria 3 (Advanced), 6 and 7 (A3–C6).

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const ADVANCED = 'Advanced'
const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }
const STAFF: Record<Locale, string> = { en: 'Music staff', ru: 'Нотоносец', es: 'Pentagrama' }
const CHECK: Record<Locale, string> = { en: 'Check', ru: 'Проверить', es: 'Comprobar' }
const AT_ONCE: Record<Locale, string> = {
  en: 'Show the right answer at once',
  ru: 'Сразу показывать правильный ответ',
  es: 'Mostrar la respuesta correcta de inmediato',
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const status = () => screen.getByRole('status').textContent?.trim()
const shownPitch = (locale: Locale = 'en') =>
  screen.getByRole('img', { name: STAFF[locale] }).getAttribute('data-pitch')
const shownDuration = () =>
  screen.getByRole('img', { name: STAFF.en }).getAttribute('data-duration')
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

// The duration buttons on the screen, in their order.
function durationRow(): string[] {
  return screen
    .getAllByRole('button')
    .map((element) => ALL_DURATIONS.find((name) => element === queryButton(name)))
    .filter((name) => name !== undefined)
}

// Advanced: the first note is the k-th of the seventeen A3–C6 by floor(next() × 17), and the
// duration the k-th of the five by floor(next() × 5). The middle of a step keeps off its edges.
const nthOfSeventeen = (index: number) => (index + 0.5) / 17

// A3, B3 are whole notes and A5, B5, C6 sixteenth notes for a constant of their step.
const ADVANCED_NOTES = {
  A3: { random: nthOfSeventeen(0), right: 'la', duration: 'whole' },
  B3: { random: nthOfSeventeen(1), right: 'si', duration: 'whole' },
  A5: { random: nthOfSeventeen(14), right: 'la', duration: 'sixteenth' },
  B5: { random: nthOfSeventeen(15), right: 'si', duration: 'sixteenth' },
  C6: { random: nthOfSeventeen(16), right: 'do', duration: 'sixteenth' },
} as const

type AdvancedNote = keyof typeof ADVANCED_NOTES

function renderNewUser() {
  renderSessionWith({
    random: constant(0),
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], createMemoryStorage()),
  })
}

// Advanced as it was before questions of bars (feature multi-note-questions, slice 3), key
// signatures and accidentals (feature accidentals, slices 1 and 2): one note in 4/4 without signs,
// so that a constant picks the pitch and the duration alone.
function storageWithOneNoteAdvanced() {
  const storage = storageWithPreset('advanced')
  const preferences = createPreferences(storage, ['en'])
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
  for (const timeSignature of [
    { beats: 3, beatValue: 4 },
    { beats: 2, beatValue: 4 },
    { beats: 6, beatValue: 8 },
  ])
    preferences.customize({ timeSignature, on: false })
  return storage
}

function renderAdvanced(random: Random, locale: Locale = 'en') {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storageWithOneNoteAdvanced()),
  })
}

async function startAdvanced(random: Random, locale: Locale = 'en', { atOnce = false } = {}) {
  renderAdvanced(random, locale)
  if (atOnce) await fireEvent.click(screen.getByRole('checkbox', { name: AT_ONCE[locale] }))
  await chooseLength(NO_LIMIT[locale])
}

async function answer(name: string, duration: string, check = CHECK.en) {
  await fireEvent.click(button(name))
  await fireEvent.click(button(duration))
  await fireEvent.click(button(check))
}

describe('the card Advanced', () => {
  it('is the third card, after Confident reading', () => {
    renderNewUser()

    const names = screen.getAllByRole('button').map((element) => element.textContent?.trim())
    expect(names.slice(0, 3)).toEqual(['First steps', 'Confident reading', ADVANCED])
  })

  it('is the only one chosen once pressed', async () => {
    renderNewUser()

    await fireEvent.click(button(ADVANCED))

    const pressed = ['First steps', 'Confident reading', ADVANCED].filter(
      (name) => button(name).getAttribute('aria-pressed') === 'true',
    )
    expect(pressed).toEqual([ADVANCED])
  })

  it('is kept after a reload', async () => {
    const storage = createMemoryStorage()
    loadSession(storage)
    await fireEvent.click(button(ADVANCED))

    cleanup()
    loadSession(storage)

    expect(button(ADVANCED).getAttribute('aria-pressed')).toBe('true')
  })

  it('runs the next session with its notes and all five durations', async () => {
    renderNewUser()
    await fireEvent.click(button(ADVANCED))

    await chooseLength('No limit')

    // Two bars of 4/4 for a constant 0: a whole A3, then a whole B3.
    expect(shownPitch()).toBe('A3 B3')
    expect(shownDuration()).toBe('whole whole')
    expect(durationRow()).toEqual(ALL_DURATIONS)
  })
})

// Criteria 3 and 4: Advanced is A3–C6 with up to two ledger lines.
describe('the notes of Advanced', () => {
  it.each(Object.entries(ADVANCED_NOTES))(
    'include %s, picked by the source',
    async (pitch, { random, duration }) => {
      await startAdvanced(constant(random))

      expect(shownPitch()).toBe(pitch)
      expect(shownDuration()).toBe(duration)
    },
  )

  it('include every note from A3 to C6 and nothing beyond', async () => {
    const shown: (string | null)[] = []
    for (let index = 0; index < 17; index++) {
      await startAdvanced(constant(nthOfSeventeen(index)))
      shown.push(shownPitch())
      cleanup()
    }

    expect(shown).toEqual([
      'A3',
      'B3',
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
      'D5',
      'E5',
      'F5',
      'G5',
      'A5',
      'B5',
      'C6',
    ])
  })
})

// Criterion 6 and spec 5.1: the row holds the durations of the difficulty, the sixteenth fifth.
describe('the row of durations', () => {
  it('has five buttons in Advanced, from the whole note to the sixteenth', async () => {
    await startAdvanced(constant(0))

    expect(durationRow()).toEqual(['1/1', '1/2', '1/4', '1/8', '1/16'])
  })

  it('has no sixteenth in Confident reading', async () => {
    renderSessionWith({
      random: constant(0),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storageWithPreset('confident-reading')),
    })
    await chooseLength('No limit')

    expect(durationRow()).toEqual(DURATIONS)
    expect(queryButton(DURATION_NAMES.sixteenth)).toBeNull()
  })

  // Feature duration-fractions, criterion 1: the fractions are the same in every language.
  it.each<[Locale]>([['ru'], ['es']])('names the sixteenth "1/16" in %s too', async (locale) => {
    await startAdvanced(constant(0), locale)

    expect(durationRow()).toEqual(ALL_DURATIONS)
    expect(queryButton('1/16')).not.toBeNull()
  })

  // Feature duration-fractions, edge case 2: plain text, no drawing and no glyph a font may lack.
  it('writes "1/16" on the sixteenth as plain text, with no image', async () => {
    await startAdvanced(constant(0))

    expect(button(DURATION_NAMES.sixteenth).textContent?.trim()).toBe('1/16')
    expect(button(DURATION_NAMES.sixteenth).querySelector('svg, img')).toBeNull()
  })

  it('marks the sixteenth as chosen when pressed, and only it', async () => {
    await startAdvanced(constant(0))

    await fireEvent.click(button(DURATION_NAMES.sixteenth))

    const pressed = ALL_DURATIONS.filter(
      (name) => button(name).getAttribute('aria-pressed') === 'true',
    )
    expect(pressed).toEqual([DURATION_NAMES.sixteenth])
  })
})

// Criterion 6: a sixteenth note is answered and graded like any other duration.
describe('a sixteenth note', () => {
  // C6, the highest note, is a sixteenth note.
  const onC6 = () => constant(ADVANCED_NOTES.C6.random)

  it('is correct for its name and "1/16", for two points', async () => {
    await startAdvanced(onC6())

    await answer('do', DURATION_NAMES.sixteenth)

    expect(status()).toBe('Correct')
    expect(exactText('Points: 2 of 2')).not.toBeNull()
  })

  it('takes "1/8" as wrong', async () => {
    await startAdvanced(onC6())

    await answer('do', DURATION_NAMES.eighth)

    expect(status()).toBe('Incorrect. Try again.')
  })

  it.each<[Locale, string, string]>([
    ['en', DURATION_NAMES.eighth, 'You chose an eighth note. This is a sixteenth note.'],
    ['ru', DURATION_NAMES.eighth, 'Вы выбрали восьмую. Это шестнадцатая.'],
    ['es', DURATION_NAMES.eighth, 'Elegiste una corchea. Es una semicorchea.'],
  ])('is explained in %s when another duration is chosen', async (locale, chosen, review) => {
    await startAdvanced(onC6(), locale, { atOnce: true })

    await answer('do', chosen, CHECK[locale])

    expect(status()).toBe(review)
  })

  it.each<[Locale, string, string]>([
    ['en', DURATION_NAMES.sixteenth, 'You chose a sixteenth note. This is a whole note.'],
    ['ru', DURATION_NAMES.sixteenth, 'Вы выбрали шестнадцатую. Это целая.'],
    ['es', DURATION_NAMES.sixteenth, 'Elegiste una semicorchea. Es una redonda.'],
  ])('is explained in %s when chosen for another duration', async (locale, chosen, review) => {
    // A3 is a whole note.
    await startAdvanced(constant(ADVANCED_NOTES.A3.random), locale, { atOnce: true })

    await answer('la', chosen, CHECK[locale])

    expect(status()).toBe(review)
  })

  it('is answered with two presses in the quick mode', async () => {
    // C6, then the note of the same value among the other sixteen: B5, again a sixteenth note.
    await startAdvanced(onC6())
    await fireEvent.click(
      screen.getByRole('checkbox', { name: 'Open next question automatically' }),
    )

    await fireEvent.click(button('do'))
    await fireEvent.click(button(DURATION_NAMES.sixteenth))

    expect(status()).toBe('Correct')
    expect(shownPitch()).toBe('B5')
    expect(exactText('Points: 2 of 2')).not.toBeNull()
  })
})

// Criterion 7: the review names the place of every note of Advanced beyond C4–G5.
describe('the review of a note beyond C4–G5', () => {
  describe.each([
    {
      locale: 'en' as const,
      review: (chosen: string, expected: string, place: string) =>
        `You chose ${chosen}. This is ${expected}: the note ${place}.`,
      places: {
        A3: 'on the second ledger line below the staff',
        B3: 'below the first ledger line',
        A5: 'on the first ledger line above the staff',
        B5: 'above the first ledger line',
        C6: 'on the second ledger line above the staff',
      },
    },
    {
      locale: 'ru' as const,
      review: (chosen: string, expected: string, place: string) =>
        `Вы выбрали ${chosen}. Это ${expected} — нота ${place}.`,
      places: {
        A3: 'на второй добавочной линейке снизу',
        B3: 'под первой добавочной линейкой',
        A5: 'на первой добавочной линейке сверху',
        B5: 'над первой добавочной линейкой',
        C6: 'на второй добавочной линейке сверху',
      },
    },
    {
      locale: 'es' as const,
      review: (chosen: string, expected: string, place: string) =>
        `Elegiste ${chosen}. Es ${expected}: la nota ${place}.`,
      places: {
        A3: 'en la segunda línea adicional inferior',
        B3: 'debajo de la primera línea adicional',
        A5: 'en la primera línea adicional superior',
        B5: 'encima de la primera línea adicional',
        C6: 'en la segunda línea adicional superior',
      },
    },
  ])('in the $locale language', (texts) => {
    it.each(Object.keys(ADVANCED_NOTES) as AdvancedNote[])(
      'names the place of %s',
      async (pitch) => {
        const note = ADVANCED_NOTES[pitch]
        const chosen = note.right === 'do' ? 're' : 'do'
        await startAdvanced(cycle(note.random, 0), texts.locale, { atOnce: true })
        expect(shownPitch(texts.locale)).toBe(pitch)

        await fireEvent.click(button(chosen))
        await chooseShownDuration()
        await fireEvent.click(button(CHECK[texts.locale]))

        expect(status()).toBe(texts.review(chosen, note.right, texts.places[pitch]))
      },
    )
  })
})
