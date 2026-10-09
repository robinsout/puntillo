import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import {
  button,
  closePanel,
  DURATION_BOX_NAMES,
  inPanel,
  modifiedCards,
  openPanel,
  queryButton,
  reload,
  renderChoice,
} from '@/presentation/__tests__/customize'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { chooseLength, DURATION_NAMES, storageWithPreset } from '@/presentation/__tests__/screen'
import { DURATION_VALUES, type Duration } from '@/domain/question'

// Feature difficulty-presets, slice 4: the section Rhythm of the panel Customize, with the
// durations and the box Ask for the duration. Criteria 10 and 13 for the durations, and 5, 9, 11,
// 12 and 14 as far as the durations go.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    customize: 'Customize',
    pitch: 'Pitch',
    rhythm: 'Rhythm',
    durations: 'Durations',
    askDuration: 'Ask for the duration',
    atLeastOne: 'At least one duration',
  },
  ru: {
    customize: 'Настроить',
    pitch: 'Высота',
    rhythm: 'Ритм',
    durations: 'Длительности',
    askDuration: 'Спрашивать длительность',
    atLeastOne: 'Нужна хотя бы одна длительность',
  },
  es: {
    customize: 'Personalizar',
    pitch: 'Altura',
    rhythm: 'Ritmo',
    durations: 'Duraciones',
    askDuration: 'Preguntar la duración',
    atLeastOne: 'Hace falta al menos una duración',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
// The boxes and the buttons differ in name, so the tests speak of the durations themselves.
const [WHOLE, HALF, QUARTER, EIGHTH, SIXTEENTH] = DURATION_VALUES
const BOX_NAMES = DURATION_BOX_NAMES.en

const section = (name: string, customize: string = EN.customize) =>
  inPanel(customize).getByRole('button', { name })
const durationsGroup = (texts: { customize: string; durations: string } = EN) =>
  inPanel(texts.customize).getByRole('group', { name: texts.durations })
const box = (name: string, customize: string = EN.customize) =>
  inPanel(customize).getByRole('checkbox', { name }) as HTMLInputElement
const durationBox = (duration: Duration['value']) => box(BOX_NAMES[duration])
const askBox = () => box(EN.askDuration)
const checkedDurations = () => DURATION_VALUES.filter((duration) => durationBox(duration).checked)
const disabledDurations = () => DURATION_VALUES.filter((duration) => durationBox(duration).disabled)
const exampleDuration = () =>
  inPanel().getByRole('img', { name: 'Example' }).getAttribute('data-duration')
const trainerDuration = () =>
  screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-duration')
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

// The durations of the buttons of the trainer, in their order.
function durationRow(): Duration['value'][] {
  return screen
    .getAllByRole('button')
    .map((element) =>
      DURATION_VALUES.find((duration) => element === queryButton(DURATION_NAMES[duration])),
    )
    .filter((name) => name !== undefined)
}

// As in a browser: an unavailable box cannot be pressed.
async function toggle(input: HTMLInputElement) {
  if (input.disabled) throw new Error('the box is unavailable')
  await fireEvent.click(input)
}

async function openRhythm(texts: { customize: string; rhythm: string } = EN) {
  await openPanel(texts)
  await fireEvent.click(section(texts.rhythm, texts.customize))
}

async function startSession() {
  await closePanel()
  await chooseLength('No limit')
}

// Criterion 10.
describe('the section Rhythm', () => {
  it('comes after Pitch, before Done', async () => {
    renderChoice()

    await openPanel()

    const names = inPanel()
      .getAllByRole('button')
      .map((element) => element.textContent?.trim())
    expect(names).toEqual([EN.pitch, EN.rhythm, 'Done'])
  })

  it('is collapsed when the panel opens, Pitch expanded', async () => {
    renderChoice()

    await openPanel()

    expect(section(EN.rhythm).getAttribute('aria-expanded')).toBe('false')
    expect(section(EN.pitch).getAttribute('aria-expanded')).toBe('true')
    expect(inPanel().queryByRole('checkbox')).toBeNull()
    expect(inPanel().queryByRole('group', { name: EN.durations })).toBeNull()
  })

  it('expands on a press, Pitch staying expanded', async () => {
    renderChoice()

    await openRhythm()

    expect(section(EN.rhythm).getAttribute('aria-expanded')).toBe('true')
    expect(durationsGroup()).toBeTruthy()
    expect(askBox()).toBeTruthy()
    expect(section(EN.pitch).getAttribute('aria-expanded')).toBe('true')
    expect(inPanel().getAllByRole('combobox')).toHaveLength(2)
  })

  it('collapses on a press, hiding its values, and leaves Pitch as it was', async () => {
    renderChoice()
    await openRhythm()

    await fireEvent.click(section(EN.rhythm))

    expect(section(EN.rhythm).getAttribute('aria-expanded')).toBe('false')
    expect(inPanel().queryByRole('checkbox')).toBeNull()
    expect(inPanel().getAllByRole('combobox')).toHaveLength(2)
  })

  it('keeps its values when Pitch collapses', async () => {
    renderChoice()
    await openRhythm()

    await fireEvent.click(section(EN.pitch))

    expect(inPanel().queryByRole('combobox')).toBeNull()
    expect(inPanel().getAllByRole('checkbox')).toHaveLength(6)
  })

  it('is collapsed again when the panel opens again', async () => {
    renderChoice()
    await openRhythm()
    await closePanel()

    await openPanel()

    expect(section(EN.rhythm).getAttribute('aria-expanded')).toBe('false')
    expect(inPanel().queryByRole('checkbox')).toBeNull()
  })

  it('offers the five durations as boxes in a group, from the whole note to the sixteenth', async () => {
    renderChoice()

    await openRhythm()

    const group = within(durationsGroup())
    expect(group.getAllByRole('checkbox')).toEqual(
      Object.values(BOX_NAMES).map((name) => group.getByRole('checkbox', { name })),
    )
  })

  // Feature duration-fractions, criterion 3: the fraction takes the place of the drawing.
  it('labels each duration box with the duration and its fraction, the label being its name', async () => {
    renderChoice()

    await openRhythm()

    for (const duration of DURATION_VALUES) {
      const label = durationBox(duration).labels?.[0]
      expect(label?.textContent?.replace(/\s+/g, ' ').trim()).toBe(BOX_NAMES[duration])
      expect(label?.querySelector('svg, img')).toBeNull()
    }
  })

  it('offers Ask for the duration as a box of its own, apart from the durations', async () => {
    renderChoice()

    await openRhythm()

    expect(within(durationsGroup()).queryByRole('checkbox', { name: EN.askDuration })).toBeNull()
    expect(askBox()).toBeTruthy()
  })

  it('shows the values of First steps for a new user: half and quarter, not asked', async () => {
    renderChoice()

    await openRhythm()

    expect(checkedDurations()).toEqual([HALF, QUARTER])
    expect(askBox().checked).toBe(false)
  })

  it('shows the values of Confident reading: whole to eighth, asked', async () => {
    renderChoice({ storage: storageWithPreset('confident-reading') })

    await openRhythm()

    expect(checkedDurations()).toEqual([WHOLE, HALF, QUARTER, EIGHTH])
    expect(askBox().checked).toBe(true)
  })

  it('shows the values of Advanced: all five, asked', async () => {
    renderChoice()
    await fireEvent.click(button('Advanced'))

    await openRhythm()

    expect(checkedDurations()).toEqual(DURATION_VALUES)
    expect(askBox().checked).toBe(true)
  })

  it.each<[Locale]>([['ru'], ['es']])('is in %s', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    await openRhythm(texts)

    expect(section(texts.rhythm, texts.customize).getAttribute('aria-expanded')).toBe('true')
    const group = within(durationsGroup(texts))
    for (const name of Object.values(DURATION_BOX_NAMES[locale]))
      expect(group.getByRole('checkbox', { name })).toBeTruthy()
    expect(box(texts.askDuration, texts.customize)).toBeTruthy()
  })
})

// Criterion 9.
describe('the example', () => {
  // First steps: a constant 0 picks the first of its durations, the half note.
  it('shows a note of a duration of the current values', async () => {
    renderChoice()

    await openRhythm()

    expect(exampleDuration()).toBe('half')
  })

  it('shows a note of the new durations when one is taken away', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(HALF))

    expect(exampleDuration()).toBe('quarter')
  })

  it('takes the durations from the longest whatever the order of the presses', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(HALF))
    await toggle(durationBox(WHOLE))

    expect(exampleDuration()).toBe('whole')
  })
})

// Criteria 5 and 11: the next session runs with the changed values at once.
describe('the next session after a change in Rhythm', () => {
  it('offers exactly the checked durations in the row', async () => {
    renderChoice({ storage: storageWithPreset('confident-reading') })
    await openRhythm()
    await toggle(durationBox(WHOLE))
    await toggle(durationBox(EIGHTH))

    await startSession()

    expect(durationRow()).toEqual([HALF, QUARTER])
    expect(trainerDuration()).toBe('half')
  })

  it('offers the sixteenth fifth once it is checked', async () => {
    renderChoice({ storage: storageWithPreset('confident-reading') })
    await openRhythm()
    await toggle(durationBox(SIXTEENTH))

    await startSession()

    expect(durationRow()).toEqual(DURATION_VALUES)
  })

  it('keeps the row in its order whatever the order of the presses', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox(SIXTEENTH))
    await toggle(durationBox(WHOLE))
    await toggle(askBox())

    await startSession()

    expect(durationRow()).toEqual([WHOLE, HALF, QUARTER, SIXTEENTH])
  })

  it('asks for the duration in First steps once Ask for the duration is checked', async () => {
    renderChoice()
    await openRhythm()
    await toggle(askBox())

    await startSession()

    expect(durationRow()).toEqual([HALF, QUARTER])
    await fireEvent.click(button('Check'))
    expect(screen.getByRole('status').textContent?.trim()).toBe('Choose a note name and a duration')
  })

  // Confident reading: a constant 0 gives C4 (do) first.
  it('shows no row and counts a point a note once Ask for the duration is unchecked', async () => {
    renderChoice({ storage: storageWithPreset('confident-reading') })
    await openRhythm()
    await toggle(askBox())

    await startSession()

    expect(durationRow()).toEqual([])
    await fireEvent.click(button('do'))
    await fireEvent.click(button('Check'))
    expect(screen.getByRole('status').textContent?.trim()).toBe('Correct')
    expect(exactText('Points: 1 of 1')).not.toBeNull()
  })

  it('still draws the notes in the checked durations without asking for them', async () => {
    renderChoice({ storage: storageWithPreset('confident-reading') })
    await openRhythm()
    await toggle(askBox())
    await toggle(durationBox(WHOLE))

    await startSession()

    expect(trainerDuration()).toBe('half')
  })
})

// Criterion 12.
describe('a changed value in Rhythm', () => {
  it('marks the card Modified when a duration is taken away', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(HALF))

    expect(modifiedCards()).toEqual(['First steps'])
    expect(button('Reset')).toBeTruthy()
  })

  it('marks the card Modified when a duration is added', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(EIGHTH))

    expect(modifiedCards()).toEqual(['First steps'])
  })

  it('marks the card Modified when Ask for the duration changes', async () => {
    renderChoice({ storage: storageWithPreset('advanced') })
    await openRhythm()

    await toggle(askBox())

    expect(modifiedCards()).toEqual(['Advanced'])
  })

  it('loses the mark when the values are set back by hand', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox(HALF))
    await toggle(askBox())

    await toggle(durationBox(HALF))
    await toggle(askBox())

    expect(modifiedCards()).toEqual([])
    expect(queryButton('Reset')).toBeNull()
  })

  it('is undone with Reset', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox(HALF))
    await toggle(durationBox(SIXTEENTH))
    await toggle(askBox())
    await closePanel()

    await fireEvent.click(button('Reset'))

    expect(modifiedCards()).toEqual([])
    await openRhythm()
    expect(checkedDurations()).toEqual([HALF, QUARTER])
    expect(askBox().checked).toBe(false)
  })

  it('gives way to the values of another preset when it is chosen', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox(HALF))
    await closePanel()

    await fireEvent.click(button('Confident reading'))

    expect(modifiedCards()).toEqual([])
    await openRhythm()
    expect(checkedDurations()).toEqual([WHOLE, HALF, QUARTER, EIGHTH])
    expect(askBox().checked).toBe(true)
  })
})

// Criterion 13 for the durations.
describe('the last checked duration', () => {
  it('cannot be unchecked: unavailable with the reason', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(HALF))

    expect(checkedDurations()).toEqual([QUARTER])
    expect(disabledDurations()).toEqual([QUARTER])
    expect(
      inPanel().getByRole('checkbox', { name: BOX_NAMES.quarter, description: EN.atLeastOne }),
    ).toBeTruthy()
    for (const duration of [WHOLE, HALF, EIGHTH, SIXTEENTH])
      expect(
        inPanel().getByRole('checkbox', {
          name: BOX_NAMES[duration],
          description: (text) => text === '',
        }),
      ).toBeTruthy()
  })

  it('shows the reason as text, not inside the name of the box', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(HALF))

    expect(inPanel().getByText(EN.atLeastOne)).toBeTruthy()
    expect(durationBox(QUARTER)).toBeTruthy()
  })

  it('becomes available again once another duration is checked', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox(HALF))

    await toggle(durationBox(EIGHTH))

    expect(disabledDurations()).toEqual([])
    expect(inPanel().queryByText(EN.atLeastOne)).toBeNull()
  })

  it('is not there while two or more durations are checked', async () => {
    renderChoice()

    await openRhythm()

    expect(disabledDurations()).toEqual([])
    expect(inPanel().queryByText(EN.atLeastOne)).toBeNull()
  })

  it('leaves Ask for the duration available', async () => {
    renderChoice()
    await openRhythm()

    await toggle(durationBox(HALF))

    expect(askBox().disabled).toBe(false)
  })

  it.each<[Locale]>([['ru'], ['es']])('says why in %s', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })
    await openRhythm(texts)

    await toggle(box(DURATION_BOX_NAMES[locale].half, texts.customize))

    expect(
      inPanel(texts.customize).getByRole('checkbox', {
        name: DURATION_BOX_NAMES[locale].quarter,
        description: texts.atLeastOne,
      }),
    ).toBeTruthy()
  })
})

// Criterion 14.
describe('the values of Rhythm after a reload', () => {
  it('are kept, with the mark', async () => {
    const storage = renderChoice()
    await openRhythm()
    await toggle(durationBox(HALF))
    await toggle(durationBox(EIGHTH))
    await toggle(askBox())

    reload(storage)

    expect(modifiedCards()).toEqual(['First steps'])
    await openRhythm()
    expect(checkedDurations()).toEqual([QUARTER, EIGHTH])
    expect(askBox().checked).toBe(true)
  })

  it('run the next session with them', async () => {
    const storage = renderChoice()
    await openRhythm()
    await toggle(durationBox(HALF))
    await toggle(durationBox(EIGHTH))
    await toggle(askBox())

    reload(storage)
    await chooseLength('No limit')

    expect(durationRow()).toEqual([QUARTER, EIGHTH])
  })
})
