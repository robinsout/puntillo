import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
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
  preferencesFor,
  renderSessionWith,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature multi-note-questions, slice 4: the box Rests in the section Rhythm (criterion 1), set by
// the presets as in spec 6.2 (criterion 2); rests in questions of bars that need no answer and are
// worth no points (criterion 6), passed by the highlight (criterion 10). The notes are numbered
// without the rests: «Note 2» is the second note of the question.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: { customize: 'Customize', rhythm: 'Rhythm', rests: 'Rests' },
  ru: { customize: 'Настроить', rhythm: 'Ритм', rests: 'Паузы' },
  es: { customize: 'Personalizar', rhythm: 'Ritmo', rests: 'Silencios' },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const restsBox = (texts: { customize: string; rests: string } = EN) =>
  inPanel(texts.customize).getByRole('checkbox', { name: texts.rests }) as HTMLInputElement
const radio = (name: string) => inPanel().getByRole('radio', { name }) as HTMLInputElement
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const example = () => inPanel().getByRole('img', { name: 'Example' })
const elementsOf = (image: HTMLElement) => image.getAttribute('data-elements')?.split(' ') ?? []
const hasRest = (image: HTMLElement) => elementsOf(image).some((each) => each.startsWith('rest/'))
const targets = () =>
  screen
    .queryAllByRole('button', { name: /^Note \d+$/ })
    .map((target) => target.getAttribute('aria-label'))
const currentNote = () =>
  screen
    .queryAllByRole('button', { name: /^Note \d+$/ })
    .find((target) => target.getAttribute('aria-current') === 'true')
    ?.getAttribute('aria-label')
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const status = statusText

// As in a browser: an unavailable control cannot be pressed.
async function toggle(input: HTMLInputElement) {
  if (input.disabled) throw new Error('the control is unavailable')
  await fireEvent.click(input)
}

async function openRhythm(texts: { customize: string; rhythm: string } = EN) {
  await openPanel(texts)
  await fireEvent.click(inPanel(texts.customize).getByRole('button', { name: texts.rhythm }))
}

describe('the box Rests', () => {
  it.each(Object.entries(TEXTS))('is in Rhythm, in %s', async (locale, texts) => {
    renderChoice({ locale: locale as Locale })

    await openRhythm(texts)

    expect(restsBox(texts)).toBeTruthy()
  })

  it.each([
    ['First steps', false],
    ['Confident reading', true],
    ['Advanced', true],
  ])('is set by %s: checked %s', async (preset, checked) => {
    renderChoice()
    await fireEvent.click(button(preset))

    await openRhythm()

    expect(restsBox().checked).toBe(checked)
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
        expect({ length, disabled: restsBox().disabled }).toEqual({ length, disabled: false })
        expect(restsBox().getAttribute('aria-describedby')).toBeNull()
      }
    },
  )

  it('marks the card Modified, is kept after a reload, and Reset brings it back', async () => {
    const storage = renderChoice()
    await fireEvent.click(button('Confident reading'))
    await openRhythm()
    await toggle(restsBox())
    await closePanel()
    expect(modifiedCards()).toEqual(['Confident reading'])

    reload(storage)

    expect(modifiedCards()).toEqual(['Confident reading'])
    await openRhythm()
    expect(restsBox().checked).toBe(false)
    await closePanel()
    await fireEvent.click(button('Reset'))
    await openRhythm()
    expect(restsBox().checked).toBe(true)
  })

  // From First steps with One bar: a constant 0.9 asks for a rest wherever one may stand.
  it('redraws the example with rests once checked', async () => {
    renderChoice({ random: constant(0.9) })
    await openRhythm()
    await toggle(radio('One bar'))
    expect(hasRest(example())).toBe(false)

    await toggle(restsBox())

    expect(hasRest(example())).toBe(true)
  })

  it('runs the next session with rests once checked', async () => {
    renderChoice({ random: constant(0.9) })
    await openRhythm()
    await toggle(radio('One bar'))
    await toggle(restsBox())
    await closePanel()

    await chooseLength('No limit')

    expect(hasRest(staff())).toBe(true)
  })

  it('leaves the rests out once unchecked, whatever the source gives', async () => {
    renderChoice({ random: constant(0.9) })
    await fireEvent.click(button('Confident reading'))
    await openRhythm()
    await toggle(restsBox())
    await closePanel()

    await chooseLength('No limit')

    expect(hasRest(staff())).toBe(false)
  })
})

// The given values in turn, then 0 over and over.
function queued(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// Confident reading: 4/4 out of 4/4 and 3/4; then a note C4 half; a quarter rest, the 2nd of
// half, quarter and eighth that fit what is left; a note D4 quarter. Each element spends a value
// on being a rest first: 0.9 makes one, 0 a note. The questions after it are a whole note each.
const DO_REST_RE = () => queued(0, 0, 0, 0.3, 0.9, 0.4, 0, 0, 0)
// 3/4 this time: C4 half and a quarter rest, one note alone.
const DO_AND_A_REST = () => queued(0.9, 0, 0, 0, 0.9, 0)

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

async function renderReading(random: Random, { showAnswerAtOnce = false } = {}) {
  const storage = storageWith((preferences) => {
    preferences.choosePreset('confident-reading')
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
  })
  await chooseLength('No limit')
}

async function answerAll(...answers: [string, string][]) {
  for (const [name, duration] of answers) {
    await press(name)
    await press(duration)
  }
}

describe('a question with a rest in Confident reading', () => {
  it('draws the rest between the notes and puts a target over each note alone', async () => {
    await renderReading(DO_REST_RE())

    expect(elementsOf(staff())).toEqual(['C4/half', 'rest/quarter', 'D4/quarter'])
    expect(targets()).toEqual(['Note 1', 'Note 2'])
    expect(currentNote()).toBe('Note 1')
  })

  it('moves the highlight from the answered note past the rest to the next note', async () => {
    await renderReading(DO_REST_RE())

    await answerAll(['do', '1/2'])

    expect(currentNote()).toBe('Note 2')
  })

  it('moves between the notes with Next note and Previous note, past the rest', async () => {
    await renderReading(DO_REST_RE())

    await press('Next note')
    expect(currentNote()).toBe('Note 2')
    expect((screen.getByRole('button', { name: 'Next note' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    await press('Previous note')
    expect(currentNote()).toBe('Note 1')
  })

  it('is checked by its notes alone: two points a note, none for the rest', async () => {
    await renderReading(DO_REST_RE())

    await answerAll(['do', '1/2'], ['re', '1/4'])
    await press('Check')

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 4 of 4')).toBeTruthy()
  })

  it('reviews a wrong note by its number among the notes', async () => {
    await renderReading(DO_REST_RE(), { showAnswerAtOnce: true })

    await answerAll(['do', '1/2'], ['mi', '1/4'])
    await press('Check')

    expect(status()).toBe('Note 2: You chose mi. This is re: the note just below the staff.')
    expect(screen.getByText('Points: 3 of 4')).toBeTruthy()
  })

  it('writes the answers under the notes alone', async () => {
    await renderReading(DO_REST_RE())

    await answerAll(['do', '1/2'], ['re', '1/4'])

    expect(screen.getByRole('button', { name: 'Note 1', description: 'do 1/2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Note 2', description: 're 1/4' })).toBeTruthy()
  })
})

// Edge case 1: a question of one note looks and works as before, the rest drawn beside it.
describe('a question of one note and a rest', () => {
  it('has no targets and no moves between notes', async () => {
    await renderReading(DO_AND_A_REST())

    expect(elementsOf(staff())).toEqual(['C4/half', 'rest/quarter'])
    expect(targets()).toEqual([])
    expect(screen.queryByRole('button', { name: 'Next note' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Previous note' })).toBeNull()
  })

  it('is reviewed without a number', async () => {
    await renderReading(DO_AND_A_REST(), { showAnswerAtOnce: true })

    await answerAll(['re', '1/2'])
    await press('Check')

    expect(status()).toBe(
      'You chose re. This is do: the note on the first ledger line below the staff.',
    )
  })
})
