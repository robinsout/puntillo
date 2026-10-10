import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { KeySignatureLimit, QuestionLength } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
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
  cycle,
  preferencesFor,
  renderSessionWith,
} from '@/presentation/__tests__/screen'

// Feature accidentals, slice 1: key signatures.
//
// The panel Customize has a third section, Signs, collapsed whenever the panel opens, as Rhythm
// is (spec 6.3); in it the value Key signatures: None, Up to 2, Up to 4, All 7 (criterion 1), set
// by the presets as in spec 6.2 (criterion 2).
//
// With key signatures the question screen offers the toggles ♯ and ♭, named Sharp and Flat, beside
// the note names (criterion 7); without them it is as before (edge case 1). They exclude each
// other and are pressed before the press that completes the note, as Dot is. The answer is the
// note as it sounds in the key: in a key of one sharp the note on the 5th line is «fa♯», and «fa»
// is wrong (criterion 8). The answer under a note writes the symbol: «fa♯ 1/4» (criterion 9). The
// review says the alteration in words of the interface language (criteria 10 and 11) and where it
// comes from (criterion 12).

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const SHARP = '♯'
const FLAT = '♭'

const TEXTS = {
  en: {
    customize: 'Customize',
    pitch: 'Pitch',
    rhythm: 'Rhythm',
    signs: 'Signs',
    keySignatures: 'Key signatures',
    values: ['None', 'Up to 2', 'Up to 4', 'All 7'],
    sharp: 'Sharp',
    flat: 'Flat',
    noLimit: 'No limit',
    check: 'Check',
  },
  ru: {
    customize: 'Настроить',
    pitch: 'Высота',
    rhythm: 'Ритм',
    signs: 'Знаки',
    keySignatures: 'Ключевые знаки',
    values: ['Нет', 'До 2', 'До 4', 'Все 7'],
    sharp: 'Диез',
    flat: 'Бемоль',
    noLimit: 'Без ограничения',
    check: 'Проверить',
  },
  es: {
    customize: 'Personalizar',
    pitch: 'Altura',
    rhythm: 'Ritmo',
    signs: 'Signos',
    keySignatures: 'Armaduras',
    values: ['Ninguna', 'Hasta 2', 'Hasta 4', 'Las 7'],
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
const keySignaturesGroup = (texts: Texts = EN) =>
  inPanel(texts.customize).getByRole('group', { name: texts.keySignatures })
const keySignatureRadio = (name: string, texts: Texts = EN) =>
  within(keySignaturesGroup(texts)).getByRole('radio', { name }) as HTMLInputElement
const checkedKeySignature = () =>
  EN.values.find((name) => keySignatureRadio(name).checked) ?? 'nothing checked'
const keySignatureOf = (image: HTMLElement) => image.getAttribute('data-key-signature')
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const example = () => inPanel().getByRole('img', { name: 'Example' })

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const status = () => screen.getByRole('status').textContent?.trim()
const toggle = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const isPressed = (name: string) => toggle(name).getAttribute('aria-pressed') === 'true'
const isDisabled = (name: string) => toggle(name).disabled

async function openSigns(texts: Texts = EN) {
  await openPanel(texts)
  await fireEvent.click(section(texts.signs, texts.customize))
}

async function choose(name: string, texts: Texts = EN) {
  const radio = keySignatureRadio(name, texts)
  if (radio.disabled) throw new Error('the value is unavailable')
  await fireEvent.click(radio)
}

// Criterion 1 and spec 6.3.
describe('the section Signs', () => {
  it('comes after Rhythm, before Done', async () => {
    renderChoice()

    await openPanel()

    const names = inPanel()
      .getAllByRole('button')
      .map((element) => element.textContent?.trim())
    expect(names).toEqual([EN.pitch, EN.rhythm, EN.signs, 'Done'])
  })

  it('is collapsed when the panel opens, Pitch expanded', async () => {
    renderChoice()

    await openPanel()

    expect(section(EN.signs).getAttribute('aria-expanded')).toBe('false')
    expect(section(EN.pitch).getAttribute('aria-expanded')).toBe('true')
    expect(inPanel().queryByRole('group', { name: EN.keySignatures })).toBeNull()
  })

  it('expands on a press into Key signatures, Pitch staying expanded', async () => {
    renderChoice()

    await openSigns()

    expect(section(EN.signs).getAttribute('aria-expanded')).toBe('true')
    expect(section(EN.pitch).getAttribute('aria-expanded')).toBe('true')
    expect(
      within(keySignaturesGroup())
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent?.trim()),
    ).toEqual(EN.values)
  })

  it('collapses on a press, hiding its values', async () => {
    renderChoice()
    await openSigns()

    await fireEvent.click(section(EN.signs))

    expect(section(EN.signs).getAttribute('aria-expanded')).toBe('false')
    expect(inPanel().queryByRole('group', { name: EN.keySignatures })).toBeNull()
  })

  it('is collapsed again when the panel opens again', async () => {
    renderChoice()
    await openSigns()
    await closePanel()

    await openPanel()

    expect(section(EN.signs).getAttribute('aria-expanded')).toBe('false')
  })

  it.each(Object.entries(TEXTS))('is in %s', async (locale, texts) => {
    renderChoice({ locale: locale as Locale })

    await openSigns(texts)

    expect(section(texts.signs, texts.customize).getAttribute('aria-expanded')).toBe('true')
    for (const name of texts.values) expect(keySignatureRadio(name, texts)).toBeTruthy()
  })
})

// Criterion 2: spec 6.2.
describe('the value Key signatures', () => {
  it.each([
    ['First steps', 'None'],
    ['Confident reading', 'Up to 2'],
    ['Advanced', 'All 7'],
  ])('is set by %s: %s', async (preset, value) => {
    renderChoice()
    await fireEvent.click(button(preset))

    await openSigns()

    expect(checkedKeySignature()).toBe(value)
    expect(modifiedCards()).toEqual([])
  })

  // A key signature changes no place on the staff, so no value of it leaves no question.
  it.each(PRESET_NAMES)('offers every value in %s, none unavailable', async (preset) => {
    renderChoice()
    await fireEvent.click(button(preset))

    await openSigns()

    for (const name of EN.values) {
      expect(keySignatureRadio(name).disabled).toBe(false)
      expect(keySignatureRadio(name).getAttribute('aria-describedby')).toBeNull()
    }
  })

  it.each(EN.values)('is chosen: %s', async (value) => {
    renderChoice()
    await fireEvent.click(button('Advanced'))
    await openSigns()

    await choose(value)

    expect(checkedKeySignature()).toBe(value)
  })

  it('marks the card Modified, is kept after a reload, and Reset brings it back', async () => {
    const storage = renderChoice()
    await fireEvent.click(button('Confident reading'))
    await openSigns()
    await choose('All 7')
    await closePanel()
    expect(modifiedCards()).toEqual(['Confident reading'])

    reload(storage)

    expect(modifiedCards()).toEqual(['Confident reading'])
    await openSigns()
    expect(checkedKeySignature()).toBe('All 7')
    await closePanel()
    await fireEvent.click(button('Reset'))
    await openSigns()
    expect(checkedKeySignature()).toBe('Up to 2')
  })

  // First steps, one note: a constant 0.9 asks for the most signs allowed, and for flats.
  it('redraws the example with a key signature once one is allowed', async () => {
    renderChoice({ random: constant(0.9) })
    await openSigns()
    expect(keySignatureOf(example())).toBe('none')

    await choose('Up to 2')

    expect(keySignatureOf(example())).toBe('2 flat')
  })

  it('runs the next session with key signatures once allowed', async () => {
    renderChoice({ random: constant(0.9) })
    await openSigns()
    await choose('Up to 4')
    await closePanel()

    await chooseLength('No limit')

    expect(keySignatureOf(staff())).toBe('4 flat')
  })

  it('leaves the key signatures out once None is chosen, whatever the source gives', async () => {
    renderChoice({ random: constant(0.9) })
    await fireEvent.click(button('Advanced'))
    await openSigns()
    await choose('None')
    await closePanel()

    await chooseLength('No limit')

    expect(keySignatureOf(staff())).toBe('none')
  })
})

interface Setup {
  questionLength?: QuestionLength
  keySignatures?: KeySignatureLimit
  askDuration?: boolean
  showAnswerAtOnce?: boolean
  quick?: boolean
  locale?: Locale
  naming?: NoteNaming
  seventhNote?: SeventhNote
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading in 4/4 alone, up to two signs: C4–G5, whole, half, quarter and eighth notes.
// For one note, each question spends a value on the pitch, one of twelve, then one of eleven; one
// on the duration, one of four; then one on the number of signs, floor(next × 3), and for one
// sign or two one on their kind: below 1/2 sharps, from 1/2 on flats.
async function renderTrainer(
  random: Random,
  {
    questionLength = 'one-note',
    keySignatures = 2,
    askDuration = true,
    showAnswerAtOnce = false,
    quick = false,
    locale = 'en',
    naming,
    seventhNote,
  }: Setup = {},
) {
  const storage = storageWith((preferences) => {
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength })
    preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ keySignatures })
    if (!askDuration) preferences.customize({ askDuration })
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
    if (quick) preferences.chooseAutoAdvance(true)
    if (naming) preferences.chooseNoteNaming(naming)
    if (seventhNote) preferences.chooseSeventhNote(seventhNote)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  await chooseLength(TEXTS[locale].noLimit)
}

// F5 (the 11th of twelve), a quarter, in a key of one sharp: fa♯ on the 5th line.
const FA_SHARP = () => cycle(10.5 / 12, 0.5, 0.5, 0)
// B4 (the 7th of twelve), a quarter, in a key of one flat: si♭ on the 3rd line.
const SI_FLAT = () => cycle(6.5 / 12, 0.5, 0.5, 0.5)
// G4 (the 5th of twelve), a quarter, in a key of one sharp: a natural sol on the 2nd line.
const SOL = () => cycle(4.5 / 12, 0.5, 0.5, 0)

describe('a question in a key signature', () => {
  it('is drawn with its key signature, the note as it sounds in it', async () => {
    await renderTrainer(FA_SHARP())

    expect(keySignatureOf(staff())).toBe('1 sharp')
    expect(staff().getAttribute('data-pitch')).toBe('F#5')
  })
})

// Criterion 7 and edge cases 1 and 3.
describe('the toggles Sharp and Flat', () => {
  it.each(Object.entries(TEXTS))(
    'are beside the note names, released, showing ♯ and ♭, in %s',
    async (locale, texts) => {
      await renderTrainer(FA_SHARP(), { locale: locale as Locale })

      expect(toggle(texts.sharp).getAttribute('aria-pressed')).toBe('false')
      expect(toggle(texts.flat).getAttribute('aria-pressed')).toBe('false')
      expect(toggle(texts.sharp).textContent?.trim()).toBe(SHARP)
      expect(toggle(texts.flat).textContent?.trim()).toBe(FLAT)
    },
  )

  it.each([2, 4, 7] as const)('are there with up to %i key signatures', async (keySignatures) => {
    await renderTrainer(FA_SHARP(), { keySignatures })

    expect(toggle('Sharp')).toBeTruthy()
    expect(toggle('Flat')).toBeTruthy()
  })

  it('are not there without key signatures', async () => {
    await renderTrainer(FA_SHARP(), { keySignatures: 0 })

    expect(screen.queryByRole('button', { name: 'Sharp' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Flat' })).toBeNull()
  })

  it('are there when the duration is not asked', async () => {
    await renderTrainer(FA_SHARP(), { askDuration: false })

    expect(toggle('Sharp')).toBeTruthy()
  })

  it('are pressed and released in turn', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    expect(isPressed('Sharp')).toBe(true)

    await press('Sharp')
    expect(isPressed('Sharp')).toBe(false)
  })

  it('exclude each other', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    await press('Flat')
    expect([isPressed('Sharp'), isPressed('Flat')]).toEqual([false, true])

    await press('Sharp')
    expect([isPressed('Sharp'), isPressed('Flat')]).toEqual([true, false])
  })

  it('leave the note names as they are', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    await press('fa')

    expect(isPressed('fa')).toBe(true)
    expect(screen.queryByRole('button', { name: `fa${SHARP}` })).toBeNull()
  })
})

// Criterion 8.
describe('checking a note in a key signature', () => {
  it('takes «fa♯» for the note on the 5th line in a key of one sharp', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 2 of 2')).toBeTruthy()
  })

  it('takes the sharp pressed after the name, before Check', async () => {
    await renderTrainer(FA_SHARP())

    await press('1/4')
    await press('fa')
    await press('Sharp')
    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('refuses «fa» without the sharp', async () => {
    await renderTrainer(FA_SHARP())

    await press('fa')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Incorrect. Try again.')
    expect(screen.getByText('Points: 1 of 2')).toBeTruthy()
  })

  // The writing counts: sol♭ sounds as fa♯, yet it is another note.
  it('refuses «sol♭» for fa♯', async () => {
    await renderTrainer(FA_SHARP())

    await press('Flat')
    await press('sol')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Incorrect. Try again.')
  })

  it('takes «si♭» in a key of one flat', async () => {
    await renderTrainer(SI_FLAT())

    await press('Flat')
    await press('si')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('takes a natural «sol» in a key of one sharp, and refuses «sol♯»', async () => {
    await renderTrainer(SOL())

    await press('Sharp')
    await press('sol')
    await press('1/4')
    await press('Check')
    expect(status()).toBe('Incorrect. Try again.')
    expect(isPressed('Sharp')).toBe(false)

    await press('sol')
    await press('Check')
    expect(status()).toBe('Correct on the second try')
  })

  it('makes the toggles unavailable once the question is over', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('Check')

    expect(isDisabled('Sharp')).toBe(true)
    expect(isDisabled('Flat')).toBe(true)
  })
})

// The wrong pitch is dropped with its alteration; the rejected one is the name and the alteration
// together.
describe('the second attempt after a missed sharp', () => {
  async function missedSharp() {
    await renderTrainer(FA_SHARP())
    await press('fa')
    await press('1/4')
    await press('Check')
  }

  it('releases the toggles and makes «fa» unavailable', async () => {
    await missedSharp()

    expect(isPressed('Sharp')).toBe(false)
    expect(isPressed('fa')).toBe(false)
    expect(isDisabled('fa')).toBe(true)
  })

  it('offers «fa» again once Sharp is pressed: «fa♯» was not tried', async () => {
    await missedSharp()

    await press('Sharp')

    expect(isDisabled('fa')).toBe(false)
  })

  it('takes «fa♯» on the second try', async () => {
    await missedSharp()

    await press('Sharp')
    await press('fa')
    await press('Check')

    expect(status()).toBe('Correct on the second try')
  })

  it('keeps the duration, which was right', async () => {
    await missedSharp()

    expect(isPressed('1/4')).toBe(true)
    expect(isDisabled('1/4')).toBe(true)
  })
})

describe('the second attempt after a right altered name', () => {
  it('keeps the name and its sharp pressed, the toggles unavailable', async () => {
    await renderTrainer(FA_SHARP())

    await press('Sharp')
    await press('fa')
    await press('1/2')
    await press('Check')

    expect(isPressed('fa')).toBe(true)
    expect(isPressed('Sharp')).toBe(true)
    expect(isDisabled('Sharp')).toBe(true)
    expect(isDisabled('Flat')).toBe(true)
  })
})

// Criteria 10–12.
describe('the review of a note in a key signature', () => {
  async function chooseFa(locale: Locale, naming?: NoteNaming, name = 'fa') {
    await renderTrainer(FA_SHARP(), { showAnswerAtOnce: true, locale, naming })
    await press(name)
    await press('1/4')
    await press(TEXTS[locale].check)
  }

  it.each([
    [
      'en',
      'You chose fa. This is fa sharp: the note on the 5th line. The sharp comes from the key signature.',
    ],
    ['ru', 'Вы выбрали fa. Это fa-диез — нота на пятой линейке. Диез — из ключевых знаков.'],
    [
      'es',
      'Elegiste fa. Es fa sostenido: la nota en la quinta línea. El sostenido viene de la armadura.',
    ],
  ] as const)('says the sharp and where it comes from, in %s', async (locale, review) => {
    await chooseFa(locale)

    expect(status()).toBe(review)
  })

  it('says the sharp in words after a Cyrillic name', async () => {
    await chooseFa('ru', 'cyrillic-syllable', 'фа')

    expect(status()).toBe(
      'Вы выбрали фа. Это фа-диез — нота на пятой линейке. Диез — из ключевых знаков.',
    )
  })

  it('writes the sharp as a symbol in letters', async () => {
    await chooseFa('en', 'letter', 'F')

    expect(status()).toBe(
      `You chose F. This is F${SHARP}: the note on the 5th line. The sharp comes from the key signature.`,
    )
  })

  it('names the sharp after another wrong name too', async () => {
    await chooseFa('en', undefined, 'mi')

    expect(status()).toBe(
      'You chose mi. This is fa sharp: the note on the 5th line. The sharp comes from the key signature.',
    )
  })

  it.each([
    [
      'en',
      'You chose si. This is si flat: the note on the 3rd line. The flat comes from the key signature.',
    ],
    ['ru', 'Вы выбрали si. Это si-бемоль — нота на третьей линейке. Бемоль — из ключевых знаков.'],
    ['es', 'Elegiste si. Es si bemol: la nota en la tercera línea. El bemol viene de la armadura.'],
  ] as const)('says the flat and where it comes from, in %s', async (locale, review) => {
    await renderTrainer(SI_FLAT(), { showAnswerAtOnce: true, locale })

    await press('si')
    await press('1/4')
    await press(TEXTS[locale].check)

    expect(status()).toBe(review)
  })

  // Criterion 11: with H, si is H and si-flat is B.
  it('names si-flat B and si H in letters with H', async () => {
    await renderTrainer(SI_FLAT(), { showAnswerAtOnce: true, naming: 'letter', seventhNote: 'H' })

    await press('H')
    await press('1/4')
    await press('Check')

    expect(status()).toBe(
      'You chose H. This is B: the note on the 3rd line. The flat comes from the key signature.',
    )
  })

  // A natural note in the key has nothing to say about the key signature.
  it('says the sharp chosen for a natural note, with no reason', async () => {
    await renderTrainer(SOL(), { showAnswerAtOnce: true })

    await press('Sharp')
    await press('sol')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('You chose sol sharp. This is sol: the note on the 2nd line.')
  })

  it('reviews a wrong second try with the sharp it missed', async () => {
    await renderTrainer(FA_SHARP())
    await press('fa')
    await press('1/4')
    await press('Check')

    await press('sol')
    await press('Check')

    expect(status()).toBe(
      'You chose sol. This is fa sharp: the note on the 5th line. The sharp comes from the key signature.',
    )
  })
})

// Two notes in 4/4, then the key: the number of notes, the first of 2, 3 or 4; F5 a quarter (the
// 2nd of the half, quarter and eighth that leave room for the next); C4 a quarter; one sharp.
function FA_DO() {
  const queue = [0, 10.5 / 12, 0.5, 0, 0.5, 0.5, 0]
  return { next: () => queue.shift() ?? 0 }
}

// Criterion 9.
describe('a question of several notes in a key signature', () => {
  it('writes the answer under the note with the symbol', async () => {
    await renderTrainer(FA_DO(), { questionLength: 'two-to-four-notes' })
    expect(staff().getAttribute('data-pitch')).toBe('F#5 C4')

    await press('Sharp')
    await press('fa')
    await press('1/4')
    await press('do')
    await press('1/4')

    expect(
      screen.getByRole('button', { name: 'Note 1', description: `fa${SHARP} 1/4` }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Note 2', description: 'do 1/4' })).toBeTruthy()
  })

  it('writes the symbol in letters too', async () => {
    await renderTrainer(FA_DO(), { questionLength: 'two-to-four-notes', naming: 'letter' })

    await press('Sharp')
    await press('F')
    await press('1/4')

    expect(
      screen.getByRole('button', { name: 'Note 1', description: `F${SHARP} 1/4` }),
    ).toBeTruthy()
  })

  it('moves the highlight on with the duration, not with the sharp, releasing it', async () => {
    await renderTrainer(FA_DO(), { questionLength: 'two-to-four-notes' })

    await press('fa')
    await press('Sharp')
    expect(isPressed('Sharp')).toBe(true)

    await press('1/4')
    expect(isPressed('Sharp')).toBe(false)
  })

  it('shows the alteration of the current note on the toggles', async () => {
    await renderTrainer(FA_DO(), { questionLength: 'two-to-four-notes' })
    await press('Sharp')
    await press('fa')
    await press('1/4')

    await press('Note 1')

    expect(isPressed('Sharp')).toBe(true)
  })

  it('reviews the note by its number', async () => {
    await renderTrainer(FA_DO(), { questionLength: 'two-to-four-notes', showAnswerAtOnce: true })

    await press('fa')
    await press('1/4')
    await press('do')
    await press('1/4')
    await press('Check')

    expect(status()).toBe(
      'Note 1: You chose fa. This is fa sharp: the note on the 5th line. The sharp comes from the key signature.',
    )
  })
})

// The toggles do not answer by themselves; they go with the press that completes the answer.
describe('the toggles in the quick mode', () => {
  it('answer «fa♯» right with Sharp pressed first', async () => {
    await renderTrainer(FA_SHARP(), { quick: true })

    await press('Sharp')
    await press('fa')
    await press('1/4')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 2 of 2')).toBeTruthy()
    expect(isPressed('Sharp')).toBe(false)
  })

  it('do not answer by themselves', async () => {
    await renderTrainer(FA_SHARP(), { quick: true })

    await press('1/4')
    await press('Sharp')

    expect(screen.getByText('Points: 0 of 0')).toBeTruthy()
    expect(isPressed('Sharp')).toBe(true)
  })
})
