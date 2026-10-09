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
import { chooseLength } from '@/presentation/__tests__/screen'

// Feature multi-note-questions, slice 1: «Question length» in the section Rhythm, with One note
// and 2–4 notes (criterion 1); several notes share one 4/4 bar (criterion 4), so they cannot be
// whole notes alone.

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
    one: 'One note',
    several: '2–4 notes',
  },
  ru: {
    customize: 'Настроить',
    rhythm: 'Ритм',
    length: 'Длина вопроса',
    one: 'Одна нота',
    several: '2–4 ноты',
  },
  es: {
    customize: 'Personalizar',
    rhythm: 'Ritmo',
    length: 'Longitud de la pregunta',
    one: 'Una nota',
    several: '2–4 notas',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
const DOES_NOT_FIT = "Doesn't fit the time signature"

const radio = (name: string, customize: string = EN.customize) =>
  inPanel(customize).getByRole('radio', { name }) as HTMLInputElement
const durationBox = (duration: Duration['value']) =>
  inPanel().getByRole('checkbox', { name: DURATION_BOX_NAMES.en[duration] }) as HTMLInputElement
const exampleNotes = () =>
  inPanel().getByRole('img', { name: 'Example' }).getAttribute('data-pitch')?.split(' ') ?? []
const trainerNotes = () =>
  screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')?.split(' ') ?? []

// As in a browser: an unavailable control cannot be pressed.
async function toggle(input: HTMLInputElement) {
  if (input.disabled) throw new Error('the control is unavailable')
  await fireEvent.click(input)
}

async function openRhythm(texts: { customize: string; rhythm: string } = EN) {
  await openPanel(texts)
  await fireEvent.click(inPanel(texts.customize).getByRole('button', { name: texts.rhythm }))
}

describe('the question length', () => {
  it.each(Object.entries(TEXTS))(
    'is a choice of one note or two to four notes in Rhythm, in %s',
    async (locale, texts) => {
      renderChoice({ locale: locale as Locale })

      await openRhythm(texts)

      const group = inPanel(texts.customize).getByRole('group', { name: texts.length })
      expect(
        within(group)
          .getAllByRole('radio')
          .map((element) => (element as HTMLInputElement).labels?.[0]?.textContent?.trim()),
      ).toEqual([texts.one, texts.several])
    },
  )

  it('is one note for a new user', async () => {
    renderChoice()

    await openRhythm()

    expect(radio(EN.one).checked).toBe(true)
    expect(radio(EN.several).checked).toBe(false)
  })

  it('redraws the example with several notes', async () => {
    renderChoice()
    await openRhythm()
    expect(exampleNotes()).toHaveLength(1)

    await toggle(radio(EN.several))

    expect(radio(EN.several).checked).toBe(true)
    expect(exampleNotes().length).toBeGreaterThanOrEqual(2)
  })

  it('runs the next session with questions of several notes', async () => {
    renderChoice()
    await openRhythm()
    await toggle(radio(EN.several))

    await closePanel()
    await chooseLength('No limit')

    expect(trainerNotes().length).toBeGreaterThanOrEqual(2)
    expect(trainerNotes().length).toBeLessThanOrEqual(4)
  })

  it('marks the card Modified, is kept after a reload, and Reset brings one note back', async () => {
    const storage = renderChoice()
    await openRhythm()
    await toggle(radio(EN.several))
    await closePanel()
    expect(modifiedCards()).toEqual(['First steps'])

    reload(storage)

    expect(modifiedCards()).toEqual(['First steps'])
    await openRhythm()
    expect(radio(EN.several).checked).toBe(true)
    await closePanel()

    await fireEvent.click(button('Reset'))

    await openRhythm()
    expect(radio(EN.one).checked).toBe(true)
  })

  // Spec 6.1: values that give no question are unavailable, with the reason.
  describe('with the whole note', () => {
    async function onlyWhole() {
      renderChoice()
      await openRhythm()
      await toggle(durationBox('whole'))
      await toggle(durationBox('half'))
      await toggle(durationBox('quarter'))
    }

    it('cannot be several notes with the whole note alone, and says why', async () => {
      await onlyWhole()

      expect(radio(EN.several).disabled).toBe(true)
      expect(
        inPanel().getByRole('radio', { name: EN.several, description: DOES_NOT_FIT }),
      ).toBeTruthy()
      expect(radio(EN.one).disabled).toBe(false)
    })

    it('keeps the last duration shorter than the whole note while several notes are asked', async () => {
      renderChoice()
      await openRhythm()
      await toggle(durationBox('whole'))
      await toggle(radio(EN.several))

      await toggle(durationBox('quarter'))

      expect(durationBox('half').disabled).toBe(true)
      expect(
        inPanel().getByRole('checkbox', {
          name: DURATION_BOX_NAMES.en.half,
          description: DOES_NOT_FIT,
        }),
      ).toBeTruthy()
      expect(durationBox('whole').disabled).toBe(false)
      expect(inPanel().queryByText('At least one duration')).toBeNull()
    })

    it('lets several notes be chosen again once a shorter duration is back', async () => {
      await onlyWhole()

      await toggle(durationBox('eighth'))

      expect(radio(EN.several).disabled).toBe(false)
      expect(inPanel().queryByText(DOES_NOT_FIT)).toBeNull()
    })
  })
})
