import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature m2-write-notes, slice 3: signs in Write notes (criteria 3, 4, 7, 11, 13).
//
// - The staff shows the key signature of the question.
// - Sharp, Flat and Natural are offered, all three, when the difficulty has key signatures or
//   accidentals, and only then. They put a sign before the current note; pressed again, the same
//   one takes it away. A sign chosen before the note is written goes with it once written.
// - The column says the note as written, its own sign included: "fa♯4", "fa♮4".
// - The task names each note as it sounds, its sign before the octave: "fa♯4", "B4" for B♭ with H.
// - A sign is right as the right notation of the question writes it; a courtesy sign may be left
//   out. The review says what is written and how the note is written, then why: the key signature
//   or a sign earlier in the bar already makes it sound so, a natural cancels one of them, or the
//   sign is needed as neither gives it. Each sentence has its Why?.
// - In the second attempt the rejected answer is the step and the sign together.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

// jsdom lays nothing out, so every element is a box 360 wide and 100 high at the top of the page.
// The staff of the stub spans the whole box: its lines run from y = 30 down to y = 70, a step 5.
beforeEach(() => {
  const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...box,
    toJSON: () => box,
  } as DOMRect)
})

const AT = { E4: 70, F4: 65, G4: 60, B4: 50 } as const

// Gives the values in turn, then 0 for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// Confident reading with one note in 4/4, the duration not asked, up to two signs in the key
// signature, and sharps, flats and naturals. A question spends a value on the pitch, one of
// twelve from C4; one on the duration; one on the number of signs in the key signature, of three,
// and, for some, one on sharps (below 0.5) or flats; one on whether the note takes a sign of its
// own (at 0.75 or above) and, for a natural note, one on a sharp (below 0.5) or a flat.
//
// G major, F4: sounds F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = () => inTurn(3.5 / 12, 0, 0.5, 0.4, 0)
// G major, F4 with a natural against the key signature.
const F_NATURAL_IN_G_MAJOR = () => inTurn(3.5 / 12, 0, 0.5, 0.4, 0.9)
// C major, F♯4 with its sharp.
const F_SHARP = () => inTurn(3.5 / 12, 0, 0, 0.9, 0.1)
// F major, B4: sounds B♭ by the key signature.
const B_IN_F_MAJOR = () => inTurn(6.5 / 12, 0, 0.5, 0.6, 0)

interface Setup {
  random: Random
  signs?: boolean
  locale?: Locale
  naming?: NoteNaming
  seventhNote?: SeventhNote
  showAnswerAtOnce?: boolean
}

const TEXTS = {
  en: { noLimit: 'No limit', check: 'Check', sharp: 'Sharp', flat: 'Flat', natural: 'Natural' },
  ru: {
    noLimit: 'Без ограничения',
    check: 'Проверить',
    sharp: 'Диез',
    flat: 'Бемоль',
    natural: 'Бекар',
  },
  es: {
    noLimit: 'Sin límite',
    check: 'Comprobar',
    sharp: 'Sostenido',
    flat: 'Bemol',
    natural: 'Becuadro',
  },
} as const

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

async function startWriting({
  random,
  signs = true,
  locale = 'en',
  naming,
  seventhNote,
  showAnswerAtOnce = false,
}: Setup) {
  const storage = storageWith((preferences) => {
    preferences.chooseExercise('write')
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength: 'one-note' })
    preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ dots: false })
    preferences.customize({ askDuration: false })
    preferences.customize({ keySignatures: signs ? 2 : 0 })
    preferences.customize({ accidentals: signs ? 'sharp-flat-and-natural' : 'none' })
    if (naming) preferences.chooseNoteNaming(naming)
    if (seventhNote) preferences.chooseSeventhNote(seventhNote)
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  await chooseLength(TEXTS[locale].noLimit)
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const column = () => screen.getAllByRole('slider')[0] as HTMLElement
const written = () => column().getAttribute('aria-valuetext')
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const drawnSigns = () => staff().getAttribute('data-drawn-signs')
const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'
const status = statusText

async function touch(y: number) {
  await fireEvent.click(column(), { clientX: 180, clientY: y })
}

const normalized = (text: string | null | undefined) => text?.replace(/\s+/g, ' ').trim() ?? ''

const byWholeText = (text: string) => (_: string, element: Element | null) =>
  normalized(element?.textContent) === text &&
  [...(element?.children ?? [])].every((child) => normalized(child.textContent) !== text)

const task = (text: string) => screen.queryByText(byWholeText(text))

function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

describe('the question with signs', () => {
  it('draws the key signature on the staff', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })

    expect(staff().getAttribute('data-key-signature')).toBe('1 sharp')
  })

  it.each<[string, Partial<Setup>, () => Random, string]>([
    ['a sharp from the key signature', {}, F_IN_G_MAJOR, 'fa♯4'],
    ['a natural note', {}, F_NATURAL_IN_G_MAJOR, 'fa4'],
    ['a flat from the key signature', {}, B_IN_F_MAJOR, 'si♭4'],
    ['a flat in letters', { naming: 'letter' }, B_IN_F_MAJOR, 'B♭4'],
    ['B♭ with H', { naming: 'letter', seventhNote: 'H' }, B_IN_F_MAJOR, 'B4'],
    ['a sharp in Cyrillic', { naming: 'cyrillic-syllable' }, F_SHARP, 'фа♯4'],
  ])('names the note in the task as it sounds: %s', async (_, setup, random, name) => {
    await startWriting({ random: random(), ...setup })

    expect(task(name)).not.toBeNull()
  })
})

describe('the sign buttons', () => {
  it('offers Sharp, Flat and Natural when the difficulty has signs', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })

    for (const name of ['Sharp', 'Flat', 'Natural']) expect(isPressed(name)).toBe(false)
  })

  it('offers none of them without key signatures and accidentals', async () => {
    await startWriting({ random: inTurn(3.5 / 12), signs: false })

    for (const name of ['Sharp', 'Flat', 'Natural']) expect(queryButton(name)).toBeNull()
  })

  it.each(['ru', 'es'] as const)('names them in %s', async (locale) => {
    const texts = TEXTS[locale]
    await startWriting({ random: F_IN_G_MAJOR(), locale })

    for (const name of [texts.sharp, texts.flat, texts.natural])
      expect(queryButton(name)).not.toBeNull()
  })

  it('puts the sign before the written note and says it in the column', async () => {
    await startWriting({ random: F_SHARP() })
    await touch(AT.F4)

    await press('Sharp')

    expect(isPressed('Sharp')).toBe(true)
    expect(drawnSigns()).toBe('sharp')
    expect(written()).toBe('fa♯4')
  })

  it('says a written natural in the column', async () => {
    await startWriting({ random: F_NATURAL_IN_G_MAJOR() })
    await touch(AT.F4)

    await press('Natural')

    expect(written()).toBe('fa♮4')
    expect(drawnSigns()).toBe('natural')
  })

  it('takes the sign away when pressed again', async () => {
    await startWriting({ random: F_SHARP() })
    await touch(AT.F4)
    await press('Sharp')

    await press('Sharp')

    expect(isPressed('Sharp')).toBe(false)
    expect(drawnSigns()).toBe('-')
    expect(written()).toBe('fa4')
  })

  it('replaces the sign with another one', async () => {
    await startWriting({ random: F_SHARP() })
    await touch(AT.F4)
    await press('Sharp')

    await press('Flat')

    expect(isPressed('Sharp')).toBe(false)
    expect(isPressed('Flat')).toBe(true)
    expect(drawnSigns()).toBe('flat')
  })

  it('keeps a sign chosen before the note is written and draws it once written', async () => {
    await startWriting({ random: F_SHARP() })

    await press('Sharp')
    expect(isPressed('Sharp')).toBe(true)
    expect(written()).toBe('No note yet')

    await touch(AT.F4)
    expect(drawnSigns()).toBe('sharp')
    expect(written()).toBe('fa♯4')
  })
})

describe('checking the signs', () => {
  it('says Correct for F4 without a sign in G major', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })
    await touch(AT.F4)

    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('says Correct for a needed sharp', async () => {
    await startWriting({ random: F_SHARP() })
    await touch(AT.F4)
    await press('Sharp')

    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('gives a second try for a sharp the key signature gives already', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })
    await touch(AT.F4)
    await press('Sharp')

    await press('Check')

    expect(status()).toBe('Incorrect. Try again.')
    expect(description(column())).toBe('Incorrect')
    expect(written()).toBe('fa♯4')
  })

  it('does not take the rejected step with the rejected sign again', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })
    await touch(AT.F4)
    await press('Sharp')
    await press('Check')

    await press('Check')

    expect(status()).toBe('Change the note first')
  })

  it('takes the same step without the sign as another answer', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })
    await touch(AT.F4)
    await press('Sharp')
    await press('Check')

    await press('Sharp')
    await press('Check')

    expect(status()).toBe('Correct on the second try')
  })

  it('takes no sign once the question is over', async () => {
    await startWriting({ random: F_IN_G_MAJOR() })
    await touch(AT.F4)
    await press('Check')

    expect(button('Sharp').disabled).toBe(true)
    expect(button('Flat').disabled).toBe(true)
    expect(button('Natural').disabled).toBe(true)
  })
})

describe('the review of a sign', () => {
  it('explains a sharp the key signature gives already', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), showAnswerAtOnce: true })
    await touch(AT.F4)
    await press('Sharp')

    await press('Check')

    expect(status()).toBe(
      'You wrote fa♯4, but the note is written fa4. ' +
        'The key signature already makes it fa♯: no sign needed.',
    )
    expect(drawnSigns()).toBe('-')
  })

  it('explains a natural left out against the key signature', async () => {
    await startWriting({ random: F_NATURAL_IN_G_MAJOR(), showAnswerAtOnce: true })
    await touch(AT.F4)

    await press('Check')

    expect(status()).toBe(
      'You wrote fa4, but the note is written fa♮4. ' +
        'The natural cancels the sharp in the key signature.',
    )
    expect(drawnSigns()).toBe('natural')
  })

  it('explains a needed sharp left out', async () => {
    await startWriting({ random: F_SHARP(), showAnswerAtOnce: true })
    await touch(AT.F4)

    await press('Check')

    expect(status()).toBe(
      'You wrote fa4, but the note is written fa♯4. ' +
        'Neither the key signature nor a sign earlier in the bar makes it fa♯: the sign is needed.',
    )
  })

  it('explains a natural where none is needed', async () => {
    // A natural note with no key signature: C major, F4, no sign of its own.
    await startWriting({ random: inTurn(3.5 / 12, 0, 0, 0), showAnswerAtOnce: true })
    await touch(AT.F4)
    await press('Natural')

    await press('Check')

    expect(status()).toBe(
      'You wrote fa♮4, but the note is written fa4. ' +
        'Neither the key signature nor a sign earlier in the bar alters this note: no sign needed.',
    )
  })

  it('explains a wrong step by its place, the written sign in the name', async () => {
    await startWriting({ random: F_SHARP(), showAnswerAtOnce: true })
    await touch(AT.G4)
    await press('Sharp')

    await press('Check')

    expect(status()).toBe('You wrote sol♯4. The note fa♯4 is in the 1st space.')
  })

  it('gives each sentence a Why?, the key signature one opening the hint on key signatures', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), showAnswerAtOnce: true })
    await touch(AT.F4)
    await press('Sharp')
    await press('Check')

    const whys = screen.getAllByRole('button', { name: 'Why?' })
    expect(whys).toHaveLength(2)
    await fireEvent.click(whys[1] as HTMLElement)

    expect(await screen.findByRole('dialog', { name: 'Key signatures' })).not.toBeNull()
  })

  it('opens the hint on accidentals with the Why? of the written sign', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), showAnswerAtOnce: true })
    await touch(AT.F4)
    await press('Sharp')
    await press('Check')

    await fireEvent.click(screen.getAllByRole('button', { name: 'Why?' })[0] as HTMLElement)

    expect(await screen.findByRole('dialog', { name: 'Sharp, flat and natural' })).not.toBeNull()
  })

  it.each([
    [
      'ru',
      'cyrillic-syllable',
      'Вы написали фа♯4, а нота пишется фа4. Знаки при ключе уже дают фа♯: свой знак не нужен.',
    ],
    [
      'es',
      'latin-syllable',
      'Escribiste fa♯4, pero la nota se escribe fa4. La armadura ya da fa♯: no hace falta alteración.',
    ],
  ] as const)('explains it in %s', async (locale, naming, text) => {
    const texts = TEXTS[locale]
    await startWriting({ random: F_IN_G_MAJOR(), locale, naming, showAnswerAtOnce: true })
    await touch(AT.F4)
    await press(texts.sharp)

    await press(texts.check)

    expect(status()).toBe(text)
  })
})
