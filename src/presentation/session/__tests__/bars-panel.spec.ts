import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import type { Duration } from '@/domain/question'
import {
  button,
  closePanel,
  DURATION_BOX_NAMES,
  inPanel,
  modifiedCards,
  openPanel,
  reload,
  renderChoice,
} from '@/presentation/__tests__/customize'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { chooseLength, constant } from '@/presentation/__tests__/screen'

// Feature multi-note-questions, slice 3: «Question length» gets One bar and Two bars, «Time
// signatures» joins the section Rhythm (criterion 1), the presets set both (criterion 2), and
// values that give no question are unavailable with the reason (criterion 3).

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    customize: 'Customize',
    rhythm: 'Rhythm',
    length: 'Question length',
    lengths: ['One note', '2–4 notes', 'One bar', 'Two bars'],
    timeSignatures: 'Time signatures',
    atLeastOne: 'At least one time signature',
    doesNotFit: "Doesn't fit the time signature",
  },
  ru: {
    customize: 'Настроить',
    rhythm: 'Ритм',
    length: 'Длина вопроса',
    lengths: ['Одна нота', '2–4 ноты', 'Один такт', 'Два такта'],
    timeSignatures: 'Размеры',
    atLeastOne: 'Нужен хотя бы один размер',
    doesNotFit: 'Не укладывается в размер',
  },
  es: {
    customize: 'Personalizar',
    rhythm: 'Ritmo',
    length: 'Longitud de la pregunta',
    lengths: ['Una nota', '2–4 notas', 'Un compás', 'Dos compases'],
    timeSignatures: 'Compases',
    atLeastOne: 'Hace falta al menos un compás',
    doesNotFit: 'No cabe en el compás',
  },
} as const satisfies Record<Locale, Record<string, string | readonly string[]>>

const EN = TEXTS.en
const TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8']

const radio = (name: string, customize: string = EN.customize) =>
  inPanel(customize).getByRole('radio', { name }) as HTMLInputElement
const timeBox = (name: string, customize: string = EN.customize) =>
  inPanel(customize).getByRole('checkbox', { name }) as HTMLInputElement
const durationBox = (duration: Duration['value']) =>
  inPanel().getByRole('checkbox', { name: DURATION_BOX_NAMES.en[duration] }) as HTMLInputElement
const labelOf = (input: HTMLElement) => (input as HTMLInputElement).labels?.[0]?.textContent?.trim()
const checkedTimeSignatures = () => TIME_SIGNATURES.filter((name) => timeBox(name).checked)
const checkedLength = () => EN.lengths.find((name) => radio(name).checked)
const describedBy = (role: 'radio' | 'checkbox', name: string, description: string) =>
  inPanel().queryByRole(role, { name, description })

const example = () => inPanel().getByRole('img', { name: 'Example' })
const exampleTime = () => example().getAttribute('data-time-signature')
const staff = () => screen.getByRole('img', { name: 'Music staff' })

const LENGTH: Record<string, number> = { whole: 16, half: 8, quarter: 4, eighth: 2, sixteenth: 1 }
const BAR: Record<string, number> = { '4/4': 16, '3/4': 12, '2/4': 8, '6/8': 12 }
const lengthOf = (durations: string | null) =>
  (durations ?? '').split(' ').reduce((total, value) => total + (LENGTH[value] ?? NaN), 0)

// As in a browser: an unavailable control cannot be pressed.
async function toggle(input: HTMLInputElement) {
  if (input.disabled) throw new Error(`"${labelOf(input)}" is unavailable`)
  await fireEvent.click(input)
}

async function openRhythm(texts: { customize: string; rhythm: string } = EN) {
  await openPanel(texts)
  await fireEvent.click(inPanel(texts.customize).getByRole('button', { name: texts.rhythm }))
}

async function choosePreset(name: string) {
  await fireEvent.click(button(name))
}

describe('the question length', () => {
  it.each(Object.entries(TEXTS))(
    'offers one note, 2–4 notes, one bar and two bars in Rhythm, in %s',
    async (locale, texts) => {
      renderChoice({ locale: locale as Locale })

      await openRhythm(texts)

      const group = inPanel(texts.customize).getByRole('group', { name: texts.length })
      expect(within(group).getAllByRole('radio').map(labelOf)).toEqual(texts.lengths)
    },
  )

  it('runs the next session with a full bar once One bar is chosen', async () => {
    renderChoice()
    await openRhythm()
    await toggle(radio('One bar'))
    await closePanel()

    await chooseLength('No limit')

    expect(staff().getAttribute('data-time-signature')).toBe('4/4')
    expect(lengthOf(staff().getAttribute('data-duration'))).toBe(16)
  })

  it('runs the next session with two full bars once Two bars is chosen', async () => {
    renderChoice()
    await openRhythm()
    await toggle(radio('Two bars'))
    await closePanel()

    await chooseLength('No limit')

    expect(lengthOf(staff().getAttribute('data-duration'))).toBe(32)
  })

  it('marks the card Modified, is kept after a reload, and Reset brings one note back', async () => {
    const storage = renderChoice()
    await openRhythm()
    await toggle(radio('Two bars'))
    await closePanel()
    expect(modifiedCards()).toEqual(['First steps'])

    reload(storage)

    expect(modifiedCards()).toEqual(['First steps'])
    await openRhythm()
    expect(checkedLength()).toBe('Two bars')
    await closePanel()
    await fireEvent.click(button('Reset'))
    await openRhythm()
    expect(checkedLength()).toBe('One note')
  })
})

describe('the time signatures', () => {
  it.each(Object.entries(TEXTS))(
    'are four boxes in Rhythm, 4/4, 3/4, 2/4 and 6/8, in %s',
    async (locale, texts) => {
      renderChoice({ locale: locale as Locale })

      await openRhythm(texts)

      const group = inPanel(texts.customize).getByRole('group', { name: texts.timeSignatures })
      expect(within(group).getAllByRole('checkbox').map(labelOf)).toEqual(TIME_SIGNATURES)
    },
  )

  it('are 4/4 alone for a new user', async () => {
    renderChoice()

    await openRhythm()

    expect(checkedTimeSignatures()).toEqual(['4/4'])
  })

  it.each(Object.entries(TEXTS))(
    'keep the last one checked, unavailable with the reason, in %s',
    async (locale, texts) => {
      renderChoice({ locale: locale as Locale })
      await openRhythm(texts)

      const last = timeBox('4/4', texts.customize)
      expect(last.checked).toBe(true)
      expect(last.disabled).toBe(true)
      expect(
        inPanel(texts.customize).getByRole('checkbox', {
          name: '4/4',
          description: texts.atLeastOne,
        }),
      ).toBeTruthy()
      for (const name of ['3/4', '2/4', '6/8'])
        expect(timeBox(name, texts.customize).disabled).toBe(false)
    },
  )

  it('let 4/4 go once another one is checked, and redraw the example in what is left', async () => {
    renderChoice()
    await openRhythm()

    await toggle(timeBox('3/4'))
    expect(timeBox('4/4').disabled).toBe(false)
    expect(inPanel().queryByText(EN.atLeastOne)).toBeNull()

    await toggle(timeBox('4/4'))

    expect(checkedTimeSignatures()).toEqual(['3/4'])
    expect(timeBox('3/4').disabled).toBe(true)
    expect(exampleTime()).toBe('3/4')
  })

  it('run the next session in the checked time signature, a bar filled exactly', async () => {
    renderChoice()
    await openRhythm()
    await toggle(timeBox('6/8'))
    await toggle(timeBox('4/4'))
    await toggle(radio('One bar'))
    await closePanel()

    await chooseLength('No limit')

    expect(staff().getAttribute('data-time-signature')).toBe('6/8')
    expect(lengthOf(staff().getAttribute('data-duration'))).toBe(BAR['6/8'])
  })

  it('mark the card Modified and are kept after a reload', async () => {
    const storage = renderChoice()
    await openRhythm()
    await toggle(timeBox('2/4'))
    await closePanel()
    expect(modifiedCards()).toEqual(['First steps'])

    reload(storage)

    await openRhythm()
    expect(checkedTimeSignatures()).toEqual(['4/4', '2/4'])
  })
})

// Criterion 2: the values of spec 6.2.
describe('the presets', () => {
  it.each([
    ['First steps', 'One note', ['4/4']],
    ['Confident reading', 'One bar', ['4/4', '3/4']],
    ['Advanced', 'Two bars', ['4/4', '3/4', '2/4', '6/8']],
  ])('set %s to %s in %j', async (preset, length, timeSignatures) => {
    renderChoice()
    await choosePreset(preset)

    await openRhythm()

    expect(checkedLength()).toBe(length)
    expect(checkedTimeSignatures()).toEqual(timeSignatures)
    expect(modifiedCards()).toEqual([])
  })

  it('ask Confident reading in a bar of 4/4 or 3/4', async () => {
    renderChoice({ random: constant(0.7) })
    await choosePreset('Confident reading')

    await chooseLength('No limit')

    // 0.7 picks 3/4, a note rather than a rest each time, and eighth notes: six of them fill the
    // bar.
    expect(staff().getAttribute('data-time-signature')).toBe('3/4')
    expect(staff().getAttribute('data-duration')).toBe(Array(6).fill('eighth').join(' '))
  })
})

// Criterion 3 and spec 6.1: no value leaves a set that gives no question.
describe('values that do not fit the time signature', () => {
  // From First steps: 3/4 alone, then the whole and the half note. A half note fits one note of
  // 3/4, but neither two of them nor a full bar.
  async function threeFourWithWholeAndHalf() {
    renderChoice()
    await openRhythm()
    await toggle(timeBox('3/4'))
    await toggle(timeBox('4/4'))
    await toggle(durationBox('whole'))
    await toggle(durationBox('quarter'))
  }

  it.each(Object.entries(TEXTS))(
    'leave the longer lengths unavailable with the reason, in %s',
    async (locale, texts) => {
      renderChoice({ locale: locale as Locale })
      await openRhythm(texts)
      const box = (name: string) => timeBox(name, texts.customize)
      await toggle(box('3/4'))
      await toggle(box('4/4'))
      await toggle(
        inPanel(texts.customize).getByRole('checkbox', {
          name: DURATION_BOX_NAMES[locale as Locale].whole,
        }) as HTMLInputElement,
      )
      await toggle(
        inPanel(texts.customize).getByRole('checkbox', {
          name: DURATION_BOX_NAMES[locale as Locale].quarter,
        }) as HTMLInputElement,
      )

      const [one, ...longer] = texts.lengths
      expect(radio(one, texts.customize).disabled).toBe(false)
      for (const name of longer) {
        expect({ name, disabled: radio(name, texts.customize).disabled }).toEqual({
          name,
          disabled: true,
        })
        expect(
          inPanel(texts.customize).getByRole('radio', { name, description: texts.doesNotFit }),
        ).toBeTruthy()
      }
    },
  )

  it('keep the half note: the whole note alone does not fit 3/4', async () => {
    await threeFourWithWholeAndHalf()

    expect(durationBox('half').disabled).toBe(true)
    expect(describedBy('checkbox', DURATION_BOX_NAMES.en.half, EN.doesNotFit)).toBeTruthy()
    expect(durationBox('whole').disabled).toBe(false)
  })

  it('let One bar be chosen once the quarter note is back', async () => {
    await threeFourWithWholeAndHalf()

    await toggle(durationBox('quarter'))

    expect(radio('One bar').disabled).toBe(false)
    expect(inPanel().queryByText(EN.doesNotFit)).toBeNull()
  })

  it('keep 4/4 while only it fits: one bar of whole notes', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox('whole'))
    await toggle(durationBox('half'))
    await toggle(durationBox('quarter'))
    await toggle(radio('One bar'))

    await toggle(timeBox('3/4'))

    expect(timeBox('4/4').disabled).toBe(true)
    expect(describedBy('checkbox', '4/4', EN.doesNotFit)).toBeTruthy()
    expect(timeBox('3/4').disabled).toBe(false)
  })

  it('leave Two bars unavailable for sixteenths in 4/4, and available once 2/4 is checked', async () => {
    renderChoice()
    await openRhythm()
    await toggle(durationBox('sixteenth'))
    await toggle(durationBox('half'))
    await toggle(durationBox('quarter'))

    expect(radio('Two bars').disabled).toBe(true)
    expect(describedBy('radio', 'Two bars', EN.doesNotFit)).toBeTruthy()
    expect(radio('One bar').disabled).toBe(false)

    await toggle(timeBox('2/4'))

    expect(radio('Two bars').disabled).toBe(false)
  })
})
