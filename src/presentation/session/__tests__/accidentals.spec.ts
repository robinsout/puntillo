import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { AccidentalSet, KeySignatureLimit, QuestionLength } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
import {
  button,
  closePanel,
  inPanel,
  modifiedCards,
  openPanel,
  PRESET_NAMES,
  reload,
  renderChoice,
} from '@/presentation/__tests__/customize'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
} from '@/presentation/__tests__/screen'

// Feature accidentals, slice 2: sharps and flats before the notes.
//
// The section Signs holds a second value, Accidentals: None and Sharp and flat (criterion 1; Sharp,
// flat and natural comes with slice 3), set by the presets as in spec 6.2 (criterion 2): none in
// First steps, sharps and flats in Confident reading and, until slice 3, in Advanced.
//
// The toggles ♯ and ♭ are offered with key signatures or accidentals (criterion 7). A sign before
// a note lasts to the end of the bar for the note at the same place (criterion 4): the note
// without a sign of its own after it is answered with the sign too. The review says where the
// alteration comes from when the note has no sign of its own (criterion 12), and when the answer
// sounds the same as the note but is written on another place, it says so (criterion 13). The
// stub of the staff shows the sign written before each note in data-signs.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    customize: 'Customize',
    signs: 'Signs',
    keySignatures: 'Key signatures',
    accidentals: 'Accidentals',
    values: ['None', 'Sharp and flat'],
    sharp: 'Sharp',
    flat: 'Flat',
    noLimit: 'No limit',
    check: 'Check',
  },
  ru: {
    customize: 'Настроить',
    signs: 'Знаки',
    keySignatures: 'Ключевые знаки',
    accidentals: 'Случайные знаки',
    values: ['Нет', 'Диез и бемоль'],
    sharp: 'Диез',
    flat: 'Бемоль',
    noLimit: 'Без ограничения',
    check: 'Проверить',
  },
  es: {
    customize: 'Personalizar',
    signs: 'Signos',
    keySignatures: 'Armaduras',
    accidentals: 'Alteraciones',
    values: ['Ninguna', 'Sostenido y bemol'],
    sharp: 'Sostenido',
    flat: 'Bemol',
    noLimit: 'Sin límite',
    check: 'Comprobar',
  },
} as const satisfies Record<Locale, Record<string, string | readonly string[]>>

const EN = TEXTS.en

type Texts = (typeof TEXTS)[Locale]

const section = (name: string, customize: string = EN.customize) =>
  inPanel(customize).getByRole('button', { name })
const accidentalsGroup = (texts: Texts = EN) =>
  inPanel(texts.customize).getByRole('group', { name: texts.accidentals })
const accidentalsRadio = (name: string, texts: Texts = EN) =>
  within(accidentalsGroup(texts)).getByRole('radio', { name }) as HTMLInputElement
const checkedAccidentals = () =>
  EN.values.find((name) => accidentalsRadio(name).checked) ?? 'nothing checked'
const signsOf = (image: HTMLElement) => image.getAttribute('data-signs')
const pitchesOf = (image: HTMLElement) => image.getAttribute('data-pitch')
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const example = () => inPanel().getByRole('img', { name: 'Example' })

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const status = () => screen.getByRole('status').textContent?.trim()

async function openSigns(texts: Texts = EN) {
  await openPanel(texts)
  await fireEvent.click(section(texts.signs, texts.customize))
}

async function choose(name: string, texts: Texts = EN) {
  const radio = accidentalsRadio(name, texts)
  if (radio.disabled) throw new Error('the value is unavailable')
  await fireEvent.click(radio)
}

// Criterion 1.
describe('the value Accidentals', () => {
  it('stands in Signs after Key signatures, with None and Sharp and flat', async () => {
    renderChoice()

    await openSigns()

    const groups = inPanel()
      .getAllByRole('group')
      .map((group) => group.querySelector('legend')?.textContent?.trim())
    expect(groups.slice(-2)).toEqual([EN.keySignatures, EN.accidentals])
    expect(
      within(accidentalsGroup())
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent?.trim()),
    ).toEqual(EN.values)
  })

  it('is hidden with Signs collapsed', async () => {
    renderChoice()

    await openPanel()

    expect(inPanel().queryByRole('group', { name: EN.accidentals })).toBeNull()
  })

  it.each(Object.entries(TEXTS))('is in %s', async (locale, texts) => {
    renderChoice({ locale: locale as Locale })

    await openSigns(texts)

    for (const name of texts.values) expect(accidentalsRadio(name, texts)).toBeTruthy()
  })

  // Criterion 2: spec 6.2.
  it.each([
    ['First steps', 'None'],
    ['Confident reading', 'Sharp and flat'],
    ['Advanced', 'Sharp and flat'],
  ])('is set by %s: %s', async (preset, value) => {
    renderChoice()
    await fireEvent.click(button(preset))

    await openSigns()

    expect(checkedAccidentals()).toBe(value)
    expect(modifiedCards()).toEqual([])
  })

  // An accidental changes no place on the staff, so no value of it leaves no question.
  it.each(PRESET_NAMES)('offers every value in %s, none unavailable', async (preset) => {
    renderChoice()
    await fireEvent.click(button(preset))

    await openSigns()

    for (const name of EN.values) {
      expect(accidentalsRadio(name).disabled).toBe(false)
      expect(accidentalsRadio(name).getAttribute('aria-describedby')).toBeNull()
    }
  })

  it('marks the card Modified, is kept after a reload, and Reset brings it back', async () => {
    const storage = renderChoice()
    await fireEvent.click(button('Confident reading'))
    await openSigns()
    await choose('None')
    await closePanel()
    expect(modifiedCards()).toEqual(['Confident reading'])

    reload(storage)

    expect(modifiedCards()).toEqual(['Confident reading'])
    await openSigns()
    expect(checkedAccidentals()).toBe('None')
    await closePanel()
    await fireEvent.click(button('Reset'))
    await openSigns()
    expect(checkedAccidentals()).toBe('Sharp and flat')
  })

  // First steps, one note: a constant 0.9 picks C5, a quarter, then a sign, a flat.
  it('redraws the example with a sign once accidentals are allowed', async () => {
    renderChoice({ random: constant(0.9) })
    await openSigns()
    expect(signsOf(example())).toBe('-')

    await choose('Sharp and flat')

    expect(signsOf(example())).toBe('flat')
    expect(pitchesOf(example())).toBe('Cb5')
  })

  it('runs the next session with accidentals once allowed', async () => {
    renderChoice({ random: constant(0.9) })
    await openSigns()
    await choose('Sharp and flat')
    await closePanel()

    await chooseLength('No limit')

    expect(signsOf(staff())).toBe('flat')
  })

  it('leaves the signs out once None is chosen, whatever the source gives', async () => {
    renderChoice({ random: constant(0.9) })
    await fireEvent.click(button('Confident reading'))
    await openSigns()
    await choose('None')
    await closePanel()

    await chooseLength('No limit')

    expect(
      signsOf(staff())
        ?.split(' ')
        .every((sign) => sign === '-'),
    ).toBe(true)
  })
})

interface Setup {
  questionLength?: QuestionLength
  keySignatures?: KeySignatureLimit
  accidentals?: AccidentalSet
  showAnswerAtOnce?: boolean
  locale?: Locale
  naming?: NoteNaming
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading in 4/4 alone, with sharps and flats and no key signature unless a test
// chooses otherwise: C4–G5, whole, half, quarter and eighth notes. For one note, a question spends
// a value on the pitch, one of twelve; one on the duration, one of four; then, with key signatures
// allowed, on the key signature; last one on the sign, from 3/4 on, and for a sign one on its
// kind: below 1/2 a sharp, from 1/2 on a flat.
async function renderTrainer(
  random: Random,
  {
    questionLength = 'one-note',
    keySignatures = 0,
    accidentals = 'sharp-and-flat',
    showAnswerAtOnce = false,
    locale = 'en',
    naming,
  }: Setup = {},
) {
  const storage = storageWith((preferences) => {
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength })
    preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ keySignatures })
    preferences.customize({ accidentals })
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
    if (naming) preferences.chooseNoteNaming(naming)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  await chooseLength(TEXTS[locale].noLimit)
}

// The values in turn, then 0: the questions after the first are plain whole notes.
function sequence(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// F4 (the 4th of twelve), a quarter, with a sharp before it: fa♯ in the 1st space.
const FA_SHARP = () => sequence(3.5 / 12, 0.5, 0.9, 0)
// E4 (the 3rd of twelve), a quarter, with a flat before it: mi♭ on the 1st line.
const MI_FLAT = () => sequence(2.5 / 12, 0.5, 0.9, 0.5)
// E4, a quarter, with a sharp before it: mi♯ on the 1st line.
const MI_SHARP = () => sequence(2.5 / 12, 0.5, 0.9, 0)
// F4, a quarter, without a sign.
const FA = () => sequence(3.5 / 12, 0.5, 0)

// Three quarters in a bar of 4/4: the number of notes, the 2nd of 2, 3 and 4; F4, then G4 and F4
// among the other eleven, each a quarter, the 2nd of the durations that leave room for the notes
// after it. Then the signs: a sharp before the first F4, none before G4, and the second F4 may
// take none, the sharp lasting.
const FA_SHARP_SOL_FA = () =>
  sequence(0.5, 3.5 / 12, 0.5, 3.5 / 11, 0.5, 3.5 / 11, 0.5, 0.9, 0, 0, 0.9)
// The same with a flat before the first F4.
const FA_FLAT_SOL_FA = () =>
  sequence(0.5, 3.5 / 12, 0.5, 3.5 / 11, 0.5, 3.5 / 11, 0.5, 0.9, 0.5, 0, 0)
// Two quarters in a bar of 4/4: F4 with a sharp, then F5, the 10th of the other eleven, with a
// courtesy natural.
const FA_SHARP_FA = () => sequence(0, 3.5 / 12, 0.5, 9.5 / 11, 0.5, 0.9, 0, 0)

const SEVERAL = { questionLength: 'two-to-four-notes' } as const

describe('a question with accidentals', () => {
  it('shows the sign before the note, the note as it sounds', async () => {
    await renderTrainer(FA_SHARP())

    expect(signsOf(staff())).toBe('sharp')
    expect(pitchesOf(staff())).toBe('F#4')
  })

  it('shows a note after a sign in the bar without a sign of its own, sounding with it', async () => {
    await renderTrainer(FA_SHARP_SOL_FA(), SEVERAL)

    expect(signsOf(staff())).toBe('sharp - -')
    expect(pitchesOf(staff())).toBe('F#4 G4 F#4')
  })

  it('shows a courtesy natural before the note of the letter in another octave', async () => {
    await renderTrainer(FA_SHARP_FA(), SEVERAL)

    expect(signsOf(staff())).toBe('sharp natural')
    expect(pitchesOf(staff())).toBe('F#4 F5')
  })
})

// Criterion 7.
describe('the toggles Sharp and Flat with accidentals', () => {
  it('are there with accidentals and no key signatures', async () => {
    await renderTrainer(FA())

    expect(screen.getByRole('button', { name: 'Sharp' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flat' })).toBeTruthy()
  })

  // Edge case 1.
  it('are not there without key signatures and accidentals', async () => {
    await renderTrainer(FA(), { accidentals: 'none' })

    expect(screen.queryByRole('button', { name: 'Sharp' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Flat' })).toBeNull()
  })
})

// Criteria 4 and 8.
describe('checking notes with accidentals', () => {
  it('takes «fa♯» for the note with a sharp before it', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('refuses «fa» for it', async () => {
    await renderTrainer(FA_SHARP())

    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Incorrect. Try again.')
  })

  it('takes «mi♭» for the note with a flat before it', async () => {
    await renderTrainer(MI_FLAT())

    await press('Flat')
    await press('mi')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('takes «fa♯» for the note at the same place later in the bar', async () => {
    await renderTrainer(FA_SHARP_SOL_FA(), SEVERAL)

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('sol')
    await press('1/4')
    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 6 of 6')).toBeTruthy()
  })

  it('refuses «fa» for the note at the same place later in the bar', async () => {
    await renderTrainer(FA_SHARP_SOL_FA(), { ...SEVERAL, showAnswerAtOnce: true })

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('sol')
    await press('1/4')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(screen.getByText('Points: 5 of 6')).toBeTruthy()
  })

  it('takes «fa» for the note with a courtesy natural', async () => {
    await renderTrainer(FA_SHARP_FA(), SEVERAL)

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
  })
})

// Criterion 12.
describe('the review of a note altered by a sign earlier in the bar', () => {
  async function answerFaWithoutSharp(locale: Locale) {
    await renderTrainer(FA_SHARP_SOL_FA(), { ...SEVERAL, showAnswerAtOnce: true, locale })
    await press(TEXTS[locale].sharp)
    await press('fa')
    await press('1/4')
    await press('sol')
    await press('1/4')
    await press('fa')
    await press('1/4')
    await press(TEXTS[locale].check)
  }

  it.each([
    [
      'en',
      'Note 3: You chose fa. This is fa sharp: the note in the 1st space. The sharp comes from the sharp earlier in the bar.',
    ],
    [
      'ru',
      'Нота 3: Вы выбрали fa. Это fa-диез — нота в первом промежутке. Диез — от диеза раньше в такте.',
    ],
    [
      'es',
      'Nota 3: Elegiste fa. Es fa sostenido: la nota en el primer espacio. El sostenido viene del sostenido anterior en el compás.',
    ],
  ] as const)(
    'says the sharp comes from the sharp earlier in the bar, in %s',
    async (locale, review) => {
      await answerFaWithoutSharp(locale)

      expect(status()).toBe(review)
    },
  )

  it('says the flat comes from the flat earlier in the bar', async () => {
    await renderTrainer(FA_FLAT_SOL_FA(), { ...SEVERAL, showAnswerAtOnce: true })

    await press('Flat')
    await press('fa')
    await press('1/4')
    await press('sol')
    await press('1/4')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe(
      'Note 3: You chose fa. This is fa flat: the note in the 1st space. The flat comes from the flat earlier in the bar.',
    )
  })

  // The sign stands right before the note: there is nothing to explain about where it comes from.
  it('gives no reason for a note with its own sign', async () => {
    await renderTrainer(FA_SHARP(), { showAnswerAtOnce: true })

    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('You chose fa. This is fa sharp: the note in the 1st space.')
  })

  it('gives no reason for a note with a courtesy natural', async () => {
    await renderTrainer(FA_SHARP_FA(), { ...SEVERAL, showAnswerAtOnce: true })

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Note 2: You chose fa sharp. This is fa: the note on the 5th line.')
  })
})

// Criterion 13: the answer sounds the same as the note but is written on another place.
describe('the review of an answer that sounds the same', () => {
  async function chooseSolFlat(locale: Locale, naming?: NoteNaming, name = 'sol') {
    await renderTrainer(FA_SHARP(), { showAnswerAtOnce: true, locale, naming })
    await press(TEXTS[locale].flat)
    await press(name)
    await press('1/4')
    await press(TEXTS[locale].check)
  }

  it.each([
    [
      'en',
      'You chose sol flat. This is fa sharp: the note in the 1st space. sol flat sounds the same as fa sharp, but this note is written on fa.',
    ],
    [
      'ru',
      'Вы выбрали sol-бемоль. Это fa-диез — нота в первом промежутке. sol-бемоль звучит так же, как fa-диез, но эта нота записана на месте fa.',
    ],
    [
      'es',
      'Elegiste sol bemol. Es fa sostenido: la nota en el primer espacio. sol bemol suena igual que fa sostenido, pero esta nota está escrita en fa.',
    ],
  ] as const)('says so after the review, in %s', async (locale, review) => {
    await chooseSolFlat(locale)

    expect(status()).toBe(review)
  })

  it('names the notes in Cyrillic', async () => {
    await chooseSolFlat('ru', 'cyrillic-syllable', 'соль')

    expect(status()).toBe(
      'Вы выбрали соль-бемоль. Это фа-диез — нота в первом промежутке. соль-бемоль звучит так же, как фа-диез, но эта нота записана на месте фа.',
    )
  })

  it('names the notes in letters', async () => {
    await chooseSolFlat('en', 'letter', 'G')

    expect(status()).toBe(
      'You chose G♭. This is F♯: the note in the 1st space. G♭ sounds the same as F♯, but this note is written on F.',
    )
  })

  it('says so for a natural answer to a note with a sharp: fa for mi♯', async () => {
    await renderTrainer(MI_SHARP(), { showAnswerAtOnce: true })

    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe(
      'You chose fa. This is mi sharp: the note on the 1st line. fa sounds the same as mi sharp, but this note is written on mi.',
    )
  })

  it('says so before the reason of the key signature', async () => {
    // F5, the 11th of twelve, a quarter, one sharp in the key signature; no sign may stand there.
    await renderTrainer(sequence(10.5 / 12, 0.5, 0.5, 0, 0), {
      keySignatures: 2,
      showAnswerAtOnce: true,
    })

    await press('Flat')
    await press('sol')
    await press('1/4')
    await press('Check')

    expect(status()).toBe(
      'You chose sol flat. This is fa sharp: the note on the 5th line. sol flat sounds the same as fa sharp, but this note is written on fa. The sharp comes from the key signature.',
    )
  })

  it('is not said for an answer that sounds otherwise', async () => {
    await renderTrainer(FA_SHARP(), { showAnswerAtOnce: true })

    await press('Sharp')
    await press('sol')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('You chose sol sharp. This is fa sharp: the note in the 1st space.')
  })

  it('is said on the second attempt too', async () => {
    await renderTrainer(FA_SHARP())
    await press('fa')
    await press('1/4')
    await press('Check')

    await press('Flat')
    await press('sol')
    await press('Check')

    expect(status()).toBe(
      'You chose sol flat. This is fa sharp: the note in the 1st space. sol flat sounds the same as fa sharp, but this note is written on fa.',
    )
  })
})
