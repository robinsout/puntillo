import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { QuestionLength } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
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

// Feature multi-note-questions, slice 5: the box Dots in the section Rhythm (criterion 1), set by
// the presets as in spec 6.2 (criterion 2); dotted notes and rests in questions (criterion 7); the
// toggle Dot beside the row of durations, shown only with the dots on (criterion 13); a dotted
// duration right only with its dot (criterion 18).
//
// The fractions on the duration buttons stay as they are; the toggle Dot adds the dot to the
// duration of the current note. The dot is set before the duration, or the name, that completes
// the note: once a note is complete the highlight moves on, and in the quick mode the answer is
// checked. The answer under a dotted note ends with the dot: «do 1/2.».

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: { customize: 'Customize', rhythm: 'Rhythm', dots: 'Dots', dot: 'Dot', noLimit: 'No limit' },
  ru: {
    customize: 'Настроить',
    rhythm: 'Ритм',
    dots: 'Точки',
    dot: 'Точка',
    noLimit: 'Без ограничения',
  },
  es: {
    customize: 'Personalizar',
    rhythm: 'Ritmo',
    dots: 'Puntillos',
    dot: 'Puntillo',
    noLimit: 'Sin límite',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const dotsBox = (texts: { customize: string; dots: string } = EN) =>
  inPanel(texts.customize).getByRole('checkbox', { name: texts.dots }) as HTMLInputElement
const checkbox = (name: string) => inPanel().getByRole('checkbox', { name }) as HTMLInputElement
const radio = (name: string) => inPanel().getByRole('radio', { name }) as HTMLInputElement
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const example = () => inPanel().getByRole('img', { name: 'Example' })
const elementsOf = (image: HTMLElement) => image.getAttribute('data-elements')?.split(' ') ?? []
const hasDot = (image: HTMLElement) => elementsOf(image).some((each) => each.endsWith('.'))
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const status = () => screen.getByRole('status').textContent?.trim()
const dotButton = (name = 'Dot') => screen.getByRole('button', { name }) as HTMLButtonElement
const isPressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'
const isDisabled = (name: string) =>
  (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
const currentNote = () =>
  screen
    .queryAllByRole('button', { name: /^Note \d+$/ })
    .find((target) => target.getAttribute('aria-current') === 'true')
    ?.getAttribute('aria-label')

// As in a browser: an unavailable control cannot be pressed.
async function toggle(input: HTMLInputElement) {
  if (input.disabled) throw new Error('the control is unavailable')
  await fireEvent.click(input)
}

async function openRhythm(texts: { customize: string; rhythm: string } = EN) {
  await openPanel(texts)
  await fireEvent.click(inPanel(texts.customize).getByRole('button', { name: texts.rhythm }))
}

describe('the box Dots', () => {
  it.each(Object.entries(TEXTS))('is in Rhythm, in %s', async (locale, texts) => {
    renderChoice({ locale: locale as Locale })

    await openRhythm(texts)

    expect(dotsBox(texts)).toBeTruthy()
  })

  it.each([
    ['First steps', false],
    ['Confident reading', false],
    ['Advanced', true],
  ])('is set by %s: checked %s', async (preset, checked) => {
    renderChoice()
    await fireEvent.click(button(preset))

    await openRhythm()

    expect(dotsBox().checked).toBe(checked)
    expect(modifiedCards()).toEqual([])
  })

  it.each(PRESET_NAMES)(
    'is available in %s, whatever the length, and has no reason',
    async (preset) => {
      renderChoice()
      await fireEvent.click(button(preset))
      await openRhythm()

      for (const length of ['One note', '2–4 notes', 'One bar', 'Two bars']) {
        if (radio(length).disabled) continue
        await toggle(radio(length))
        expect({ length, disabled: dotsBox().disabled }).toEqual({ length, disabled: false })
        expect(dotsBox().getAttribute('aria-describedby')).toBeNull()
      }
    },
  )

  // Spec 6.1: a set of values that gives no question is blocked with its reason. Half notes
  // alone fill a bar of 3/4 only when dotted.
  it('lets half notes alone leave 4/4 for 3/4 once checked, and then cannot be unchecked', async () => {
    renderChoice()
    await openRhythm()
    await toggle(radio('One bar'))
    await toggle(checkbox('Quarter note 1/4'))
    await toggle(checkbox('3/4'))
    expect(checkbox('4/4').disabled).toBe(true)

    await toggle(dotsBox())
    expect(checkbox('4/4').disabled).toBe(false)
    await toggle(checkbox('4/4'))

    expect(dotsBox().disabled).toBe(true)
    expect(
      inPanel().getByRole('checkbox', {
        name: 'Dots',
        description: "Doesn't fit the time signature",
      }),
    ).toBeTruthy()
  })

  it('marks the card Modified, is kept after a reload, and Reset brings it back', async () => {
    const storage = renderChoice()
    await fireEvent.click(button('Advanced'))
    await openRhythm()
    await toggle(dotsBox())
    await closePanel()
    expect(modifiedCards()).toEqual(['Advanced'])

    reload(storage)

    expect(modifiedCards()).toEqual(['Advanced'])
    await openRhythm()
    expect(dotsBox().checked).toBe(false)
    await closePanel()
    await fireEvent.click(button('Reset'))
    await openRhythm()
    expect(dotsBox().checked).toBe(true)
  })

  // From First steps: one note, half notes first; a constant 0.9 asks for a dot wherever one may
  // stand.
  it('redraws the example with a dotted note once checked', async () => {
    renderChoice({ random: constant(0.9) })
    await openRhythm()
    expect(hasDot(example())).toBe(false)

    await toggle(dotsBox())

    expect(hasDot(example())).toBe(true)
  })

  it('runs the next session with dots once checked', async () => {
    renderChoice({ random: constant(0.9) })
    await openRhythm()
    await toggle(dotsBox())
    await closePanel()

    await chooseLength('No limit')

    expect(hasDot(staff())).toBe(true)
  })

  it('leaves the dots out once unchecked, whatever the source gives', async () => {
    renderChoice({ random: constant(0.9) })
    await fireEvent.click(button('Advanced'))
    await openRhythm()
    await toggle(dotsBox())
    await closePanel()

    await chooseLength('No limit')

    expect(hasDot(staff())).toBe(false)
  })
})

interface Setup {
  questionLength?: QuestionLength
  dots?: boolean
  askDuration?: boolean
  showAnswerAtOnce?: boolean
  quick?: boolean
  locale?: Locale
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading in 4/4 alone, with the dots on: C4–G5, whole, half, quarter and eighth notes.
// For one note, each question spends a value on the pitch, one of twelve, then one of eleven; one
// on the duration, one of four; one on the dot, at 3/4 or above.
async function renderTrainer(
  random: Random,
  {
    questionLength = 'one-note',
    dots = true,
    askDuration = true,
    showAnswerAtOnce = false,
    quick = false,
    locale = 'en',
  }: Setup = {},
) {
  const storage = storageWith((preferences) => {
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength })
    preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ dots })
    if (!askDuration) preferences.customize({ askDuration })
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
    if (quick) preferences.chooseAutoAdvance(true)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  await chooseLength(TEXTS[locale].noLimit)
}

// B4 (si), a dotted quarter; then A4, a dotted quarter, and so on.
const DOTTED_QUARTERS = () => cycle(6 / 12, 2 / 4, 0.9)
// B4 (si), a plain quarter; then A4, a plain quarter, and so on.
const PLAIN_QUARTERS = () => cycle(6 / 12, 2 / 4, 0)

// Two notes: C4 (do) a dotted half, D4 (re) a plain quarter. The questions after it are made of
// zeros: C4, then D4, and so on.
function DO_RE() {
  const queue = [0, 0, 0, 0.9, 0, 0, 0]
  return { next: () => queue.shift() ?? 0 }
}

describe('a dotted note in a question', () => {
  it('is drawn dotted on the staff', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    expect(elementsOf(staff())).toEqual(['B4/quarter.'])
  })
})

// Criterion 13.
describe('the toggle Dot', () => {
  it.each(Object.entries(TEXTS))('is beside the durations, in %s', async (locale, texts) => {
    await renderTrainer(DOTTED_QUARTERS(), { locale: locale as Locale })

    expect(dotButton(texts.dot).getAttribute('aria-pressed')).toBe('false')
  })

  it('is not there with the dots off', async () => {
    await renderTrainer(PLAIN_QUARTERS(), { dots: false })

    expect(screen.queryByRole('button', { name: 'Dot' })).toBeNull()
  })

  it('is not there when the duration is not asked', async () => {
    await renderTrainer(DOTTED_QUARTERS(), { askDuration: false })

    expect(screen.queryByRole('button', { name: 'Dot' })).toBeNull()
  })

  it('is pressed and released in turn', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('Dot')
    expect(isPressed('Dot')).toBe(true)

    await press('Dot')
    expect(isPressed('Dot')).toBe(false)
  })

  it('leaves the fractions on the duration buttons as they are', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('Dot')
    await press('1/4')

    expect(isPressed('1/4')).toBe(true)
    expect(screen.queryByRole('button', { name: /1\/4\./ })).toBeNull()
  })
})

// Criterion 18.
describe('checking a dotted note', () => {
  it('takes the dotted quarter with the dot', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('si')
    await press('Dot')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 2 of 2')).toBeTruthy()
  })

  it('takes the dot pressed after the duration, before Check', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('1/4')
    await press('si')
    await press('Dot')
    await press('Check')

    expect(status()).toBe('Correct')
  })

  it('refuses the dotted quarter without the dot', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('si')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Incorrect. Try again.')
    expect(screen.getByText('Points: 1 of 2')).toBeTruthy()
  })

  it('refuses a plain quarter with a dot', async () => {
    await renderTrainer(PLAIN_QUARTERS())

    await press('si')
    await press('Dot')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Incorrect. Try again.')
  })

  it('makes the toggle unavailable once the question is over', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('si')
    await press('Dot')
    await press('1/4')
    await press('Check')

    expect(isDisabled('Dot')).toBe(true)
  })
})

// The wrong duration is dropped with its dot; the rejected one is the value and the dot together.
describe('the second attempt after a missed dot', () => {
  async function missedDot() {
    await renderTrainer(DOTTED_QUARTERS())
    await press('si')
    await press('1/4')
    await press('Check')
  }

  it('releases the toggle and makes the plain quarter unavailable', async () => {
    await missedDot()

    expect(isPressed('Dot')).toBe(false)
    expect(isPressed('1/4')).toBe(false)
    expect(isDisabled('1/4')).toBe(true)
  })

  it('offers the quarter again once the dot is pressed: the dotted quarter was not tried', async () => {
    await missedDot()

    await press('Dot')

    expect(isDisabled('1/4')).toBe(false)
  })

  it('takes the dotted quarter on the second try', async () => {
    await missedDot()

    await press('Dot')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Correct on the second try')
  })

  it('keeps the name, which was right', async () => {
    await missedDot()

    expect(isPressed('si')).toBe(true)
    expect(isDisabled('si')).toBe(true)
  })
})

describe('the second attempt after a right dotted duration', () => {
  it('keeps the duration and its dot pressed and unavailable', async () => {
    await renderTrainer(DOTTED_QUARTERS())

    await press('la')
    await press('Dot')
    await press('1/4')
    await press('Check')

    expect(isPressed('1/4')).toBe(true)
    expect(isPressed('Dot')).toBe(true)
    expect(isDisabled('Dot')).toBe(true)
  })
})

describe('the review of a dotted duration', () => {
  it.each([
    ['en', 'You chose a quarter note. This is a dotted quarter note.'],
    ['ru', 'Вы выбрали четверть. Это четверть с точкой.'],
    ['es', 'Elegiste una negra. Es una negra con puntillo.'],
  ] as const)('names the missing dot, in %s', async (locale, review) => {
    await renderTrainer(DOTTED_QUARTERS(), { showAnswerAtOnce: true, locale })

    await press('si')
    await press('1/4')
    await press({ en: 'Check', ru: 'Проверить', es: 'Comprobar' }[locale])

    expect(status()).toBe(review)
  })

  it.each([
    ['en', 'You chose a dotted quarter note. This is a quarter note.'],
    ['ru', 'Вы выбрали четверть с точкой. Это четверть.'],
    ['es', 'Elegiste una negra con puntillo. Es una negra.'],
  ] as const)('names the extra dot, in %s', async (locale, review) => {
    await renderTrainer(PLAIN_QUARTERS(), { showAnswerAtOnce: true, locale })

    await press('si')
    await press({ en: 'Dot', ru: 'Точка', es: 'Puntillo' }[locale])
    await press('1/4')
    await press({ en: 'Check', ru: 'Проверить', es: 'Comprobar' }[locale])

    expect(status()).toBe(review)
  })

  it.each([
    ['en', 'You chose a dotted half note. This is a dotted quarter note.'],
    ['ru', 'Вы выбрали половинную с точкой. Это четверть с точкой.'],
    ['es', 'Elegiste una blanca con puntillo. Es una negra con puntillo.'],
  ] as const)('names both dotted durations, in %s', async (locale, review) => {
    await renderTrainer(DOTTED_QUARTERS(), { showAnswerAtOnce: true, locale })

    await press('si')
    await press({ en: 'Dot', ru: 'Точка', es: 'Puntillo' }[locale])
    await press('1/2')
    await press({ en: 'Check', ru: 'Проверить', es: 'Comprobar' }[locale])

    expect(status()).toBe(review)
  })

  it('names the dotted duration after a wrong second attempt', async () => {
    await renderTrainer(DOTTED_QUARTERS())
    await press('si')
    await press('1/4')
    await press('Check')

    await press('1/2')
    await press('Check')

    expect(status()).toBe('You chose a half note. This is a dotted quarter note.')
  })
})

describe('a question of several notes with a dotted one', () => {
  it('writes the dot in the answer under the note', async () => {
    await renderTrainer(DO_RE(), { questionLength: 'two-to-four-notes' })

    await press('do')
    await press('Dot')
    await press('1/2')
    await press('re')
    await press('1/4')

    expect(screen.getByRole('button', { name: 'Note 1', description: 'do 1/2.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Note 2', description: 're 1/4' })).toBeTruthy()
  })

  it('moves the highlight on with the duration, not with the dot', async () => {
    await renderTrainer(DO_RE(), { questionLength: 'two-to-four-notes' })

    await press('do')
    await press('Dot')
    expect(currentNote()).toBe('Note 1')

    await press('1/2')
    expect(currentNote()).toBe('Note 2')
    expect(isPressed('Dot')).toBe(false)
  })

  it('shows the dot of the current note on the toggle', async () => {
    await renderTrainer(DO_RE(), { questionLength: 'two-to-four-notes' })
    await press('do')
    await press('Dot')
    await press('1/2')

    await press('Note 1')

    expect(isPressed('Dot')).toBe(true)
  })

  it('reviews the dotted note by its number', async () => {
    await renderTrainer(DO_RE(), { questionLength: 'two-to-four-notes', showAnswerAtOnce: true })

    await press('do')
    await press('1/2')
    await press('re')
    await press('1/4')
    await press('Check')

    expect(status()).toBe('Note 1: You chose a half note. This is a dotted half note.')
  })
})

// Criterion 19: the dot does not answer by itself; it goes with the press that completes the
// answer.
describe('the toggle Dot in the quick mode', () => {
  it('answers the dotted quarter right with the dot pressed first', async () => {
    await renderTrainer(DOTTED_QUARTERS(), { quick: true })

    await press('Dot')
    await press('si')
    await press('1/4')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 2 of 2')).toBeTruthy()
    expect(isPressed('Dot')).toBe(false)
  })

  it('does not answer by itself', async () => {
    await renderTrainer(DOTTED_QUARTERS(), { quick: true })

    await press('1/4')
    await press('Dot')

    expect(screen.getByText('Points: 0 of 0')).toBeTruthy()
    expect(isPressed('Dot')).toBe(true)
  })

  it('comes too late after the press that completes the answer', async () => {
    await renderTrainer(DOTTED_QUARTERS(), { quick: true })

    await press('si')
    await press('1/4')

    expect(status()).toBe('Incorrect. Try again.')
  })

  it('answers the second attempt with the dot', async () => {
    await renderTrainer(DOTTED_QUARTERS(), { quick: true })
    await press('si')
    await press('1/4')

    await press('Dot')
    await press('1/4')

    expect(status()).toBe('Correct on the second try')
  })
})
