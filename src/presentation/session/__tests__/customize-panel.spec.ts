import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import {
  button,
  closePanel,
  inPanel,
  modifiedCards,
  openPanel,
  panel,
  PRESET_NAMES,
  queryButton,
  reload,
  renderChoice,
} from '@/presentation/__tests__/customize'
import {
  forgetDialogs,
  isOpenAsModal,
  pressEscape,
  pressOutside,
} from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  constant,
  failStaffLoading,
  loadSession,
  storageWithNoteNaming,
  storageWithPreset,
  storageWithSeventhNote,
} from '@/presentation/__tests__/screen'

// Feature difficulty-presets, slice 3: the panel Customize with the live example and the section
// Pitch, the mark Modified and Reset, the values kept. Criteria 8–12, 13 for the range and the
// ledger lines, 14; edge cases 1, 2 and 4.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    customize: 'Customize',
    done: 'Done',
    pitch: 'Pitch',
    rhythm: 'Rhythm',
    from: 'From',
    to: 'To',
    ledgerLines: 'Ledger lines',
    none: 'None',
    upToOne: 'Up to one',
    upToTwo: 'Up to two',
    modified: 'Modified',
    reset: 'Reset',
    tooFewNotes: 'Too few notes',
    example: 'Example',
    firstSteps: 'First steps',
    staffLoadError: "Couldn't load the staff. Reload the page.",
  },
  ru: {
    customize: 'Настроить',
    done: 'Готово',
    pitch: 'Высота',
    rhythm: 'Ритм',
    from: 'От',
    to: 'До',
    ledgerLines: 'Добавочные линейки',
    none: 'Нет',
    upToOne: 'До одной',
    upToTwo: 'До двух',
    modified: 'Изменено',
    reset: 'Сбросить',
    tooFewNotes: 'Слишком мало нот',
    example: 'Пример',
    firstSteps: 'Первые шаги',
    staffLoadError: 'Не удалось загрузить нотоносец. Перезагрузите страницу.',
  },
  es: {
    customize: 'Personalizar',
    done: 'Listo',
    pitch: 'Altura',
    rhythm: 'Ritmo',
    from: 'Desde',
    to: 'Hasta',
    ledgerLines: 'Líneas adicionales',
    none: 'Ninguna',
    upToOne: 'Hasta una',
    upToTwo: 'Hasta dos',
    modified: 'Modificado',
    reset: 'Restablecer',
    tooFewNotes: 'Muy pocas notas',
    example: 'Ejemplo',
    firstSteps: 'Primeros pasos',
    staffLoadError: 'No se pudo cargar el pentagrama. Recarga la página.',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

// The seventeen notes of the lists From and To, A3–C6, in each naming.
const LATIN = ['la3', 'si3']
  .concat(['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].map((name) => `${name}4`))
  .concat(['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].map((name) => `${name}5`))
  .concat(['do6'])
const CYRILLIC = ['ля3', 'си3']
  .concat(['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си'].map((name) => `${name}4`))
  .concat(['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си'].map((name) => `${name}5`))
  .concat(['до6'])
const LETTERS_H = ['A3', 'H3']
  .concat(['C', 'D', 'E', 'F', 'G', 'A', 'H'].map((name) => `${name}4`))
  .concat(['C', 'D', 'E', 'F', 'G', 'A', 'H'].map((name) => `${name}5`))
  .concat(['C6'])

// An unavailable value says why in its own text, which is all a list option can carry.
const tooFew = (name: string, reason: string = EN.tooFewNotes) => `${name} — ${reason}`

const list = (name: string, texts: { customize: string } = EN) =>
  inPanel(texts.customize).getByRole('combobox', { name }) as HTMLSelectElement
const radio = (name: string, texts: { customize: string } = EN) =>
  inPanel(texts.customize).getByRole('radio', { name }) as HTMLInputElement
const optionTexts = (select: HTMLSelectElement) =>
  [...select.options].map((option) => option.textContent?.trim())
const enabledOptionTexts = (select: HTMLSelectElement) =>
  [...select.options]
    .filter((option) => !option.disabled)
    .map((option) => option.textContent?.trim())
const chosenOption = (select: HTMLSelectElement) => select.selectedOptions[0]?.textContent?.trim()
const checkedRadio = () => [EN.none, EN.upToOne, EN.upToTwo].filter((name) => radio(name).checked)
const example = (texts: { customize: string; example: string } = EN) =>
  inPanel(texts.customize).getByRole('img', { name: texts.example })
const examplePitch = () => example().getAttribute('data-pitch')
const trainerPitch = () =>
  screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')

// As in a browser: an unavailable option cannot be picked.
async function choose(select: HTMLSelectElement, text: string) {
  const option = within(select).getByRole('option', { name: text }) as HTMLOptionElement
  if (option.disabled) throw new Error(`"${text}" is unavailable`)
  option.selected = true
  await fireEvent.change(select)
}

async function check(input: HTMLInputElement) {
  if (input.disabled) throw new Error('the radio button is unavailable')
  await fireEvent.click(input)
}

describe('the button Customize', () => {
  it('comes under the preset cards, before the lengths', () => {
    renderChoice()

    const names = screen.getAllByRole('button').map((element) => element.textContent?.trim())
    expect(names.slice(0, 5)).toEqual([...PRESET_NAMES, EN.customize, '10'])
  })

  it.each<[Locale]>([['ru'], ['es']])('is named in %s', (locale) => {
    renderChoice({ locale })

    expect(button(TEXTS[locale].customize)).toBeTruthy()
  })

  it('is not on the question screen', async () => {
    renderChoice()

    await chooseLength('No limit')

    expect(queryButton(EN.customize)).toBeNull()
  })

  it('leaves the panel closed until pressed', () => {
    renderChoice()

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// Criterion 8, edge case 4.
describe('the panel', () => {
  it('opens as a modal dialog named Customize', async () => {
    renderChoice()

    const dialog = await openPanel()

    expect(isOpenAsModal(dialog)).toBe(true)
  })

  it('closes with Done, the focus back on Customize', async () => {
    renderChoice()
    await openPanel()

    await closePanel()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button(EN.customize))
  })

  it('closes with Esc, the focus back on Customize', async () => {
    renderChoice()
    await openPanel()

    await pressEscape()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button(EN.customize))
  })

  it('closes with a press outside it, the focus back on Customize', async () => {
    renderChoice()
    const dialog = await openPanel()

    await pressOutside(dialog)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button(EN.customize))
  })

  it('stays open on a press inside it off the controls', async () => {
    renderChoice()
    await openPanel()

    await fireEvent.click(example())
    await fireEvent.click(inPanel().getByRole('group', { name: EN.ledgerLines }))

    expect(isOpenAsModal(panel())).toBe(true)
  })

  it('opens again after closing', async () => {
    renderChoice()
    await openPanel()
    await pressEscape()

    const dialog = await openPanel()

    expect(isOpenAsModal(dialog)).toBe(true)
  })

  it('takes the focus inside it when opened', async () => {
    renderChoice()

    const dialog = await openPanel()

    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})

// Criterion 10.
describe('the section Pitch', () => {
  it('is expanded when the panel opens', async () => {
    renderChoice()

    await openPanel()

    const section = inPanel().getByRole('button', { name: EN.pitch })
    expect(section.getAttribute('aria-expanded')).toBe('true')
    expect(list(EN.from)).toBeTruthy()
    expect(list(EN.to)).toBeTruthy()
    expect(inPanel().getByRole('group', { name: EN.ledgerLines })).toBeTruthy()
  })

  it('collapses on a press, hiding its values, and expands again', async () => {
    renderChoice()
    await openPanel()
    const section = inPanel().getByRole('button', { name: EN.pitch })

    await fireEvent.click(section)

    expect(section.getAttribute('aria-expanded')).toBe('false')
    expect(inPanel().queryByRole('combobox')).toBeNull()
    expect(inPanel().queryByRole('radio')).toBeNull()

    await fireEvent.click(section)

    expect(section.getAttribute('aria-expanded')).toBe('true')
    expect(inPanel().getAllByRole('combobox')).toHaveLength(2)
  })

  it('is expanded again when the panel opens again', async () => {
    renderChoice()
    await openPanel()
    await fireEvent.click(inPanel().getByRole('button', { name: EN.pitch }))
    await closePanel()

    await openPanel()

    expect(inPanel().getByRole('button', { name: EN.pitch }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })

  it('offers the seventeen notes A3–C6 in From and To, in do, re, mi', async () => {
    renderChoice({ storage: storageWithPreset('advanced') })

    await openPanel()

    // In Advanced only From C6 and To A3 leave fewer than two notes.
    expect(optionTexts(list(EN.from))).toEqual([...LATIN.slice(0, -1), tooFew('do6')])
    expect(optionTexts(list(EN.to))).toEqual([tooFew('la3'), ...LATIN.slice(1)])
  })

  it('names the notes in the chosen naming: до, ре, ми', async () => {
    renderChoice({
      storage: storageWithNoteNaming('cyrillic-syllable', storageWithPreset('advanced')),
    })

    await openPanel()

    expect(enabledOptionTexts(list(EN.from))).toEqual(CYRILLIC.slice(0, -1))
  })

  it('names the notes in the chosen naming: C, D, E with H', async () => {
    renderChoice({
      storage: storageWithSeventhNote(
        'H',
        storageWithNoteNaming('letter', storageWithPreset('advanced')),
      ),
    })

    await openPanel()

    expect(enabledOptionTexts(list(EN.to))).toEqual(LETTERS_H.slice(1))
  })

  it('offers None, Up to one and Up to two for the ledger lines', async () => {
    renderChoice()

    await openPanel()

    const group = within(inPanel().getByRole('group', { name: EN.ledgerLines }))
    expect(group.getAllByRole('radio')).toEqual(
      [EN.none, EN.upToOne, EN.upToTwo].map((name) => group.getByRole('radio', { name })),
    )
  })

  it('shows the values of First steps for a new user: C4–C5, no ledger lines', async () => {
    renderChoice()

    await openPanel()

    expect(chosenOption(list(EN.from))).toBe('do4')
    expect(chosenOption(list(EN.to))).toBe('do5')
    expect(checkedRadio()).toEqual([EN.none])
  })

  it('shows the values of Advanced: A3–C6, up to two ledger lines', async () => {
    renderChoice()
    await fireEvent.click(button('Advanced'))

    await openPanel()

    expect(chosenOption(list(EN.from))).toBe('la3')
    expect(chosenOption(list(EN.to))).toBe('do6')
    expect(checkedRadio()).toEqual([EN.upToTwo])
  })

  it.each<[Locale]>([['ru'], ['es']])('is in %s', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    await openPanel(texts)

    const inside = within(panel(texts.customize))
    expect(inside.getByRole('button', { name: texts.pitch })).toBeTruthy()
    expect(inside.getByRole('combobox', { name: texts.from })).toBeTruthy()
    expect(inside.getByRole('combobox', { name: texts.to })).toBeTruthy()
    const group = inside.getByRole('group', { name: texts.ledgerLines })
    for (const name of [texts.none, texts.upToOne, texts.upToTwo])
      expect(within(group).getByRole('radio', { name })).toBeTruthy()
    expect(inside.getByRole('button', { name: texts.done })).toBeTruthy()
    expect(example(texts)).toBeTruthy()
  })
})

// Criterion 9, edge case 2.
describe('the example', () => {
  it('shows a note of the current values: D4, the lowest of First steps', async () => {
    renderChoice()

    await openPanel()

    expect(examplePitch()).toBe('D4')
  })

  it('shows a new note of the new range when From changes', async () => {
    renderChoice()
    await openPanel()

    await choose(list(EN.from), 'sol4')

    expect(examplePitch()).toBe('G4')
  })

  it('shows a new note of the new range when To changes', async () => {
    // A constant near 1 picks the highest note: C5 in First steps.
    renderChoice({ random: constant(0.999) })
    await openPanel()
    expect(examplePitch()).toBe('C5')

    await choose(list(EN.to), 'la4')

    expect(examplePitch()).toBe('A4')
  })

  it('shows a new note when the ledger lines change', async () => {
    renderChoice()
    await openPanel()

    await check(radio(EN.upToOne))

    // C4 needs one ledger line, so it is the lowest note now.
    expect(examplePitch()).toBe('C4')
  })

  it('shows the staff, with no error, while it is still loading', async () => {
    renderChoice({ drawing: 'held' })

    await openPanel()

    expect(example()).toBeTruthy()
    expect(inPanel().queryByRole('alert')).toBeNull()
  })

  it.each<[Locale]>([['en'], ['ru'], ['es']])(
    'gives way to the text of the trainer when the staff fails to load, in %s',
    async (locale) => {
      const texts = TEXTS[locale]
      renderChoice({ locale, drawing: 'held' })
      await openPanel(texts)

      failStaffLoading()
      await screen.findByRole('alert')

      const inside = within(panel(texts.customize))
      expect(inside.getByRole('alert').textContent?.trim()).toBe(texts.staffLoadError)
      expect(inside.queryByRole('img', { name: texts.example })).toBeNull()
    },
  )

  it('leaves the values working when the staff fails to load', async () => {
    renderChoice({ drawing: 'held' })
    await openPanel()
    failStaffLoading()
    await screen.findByRole('alert')

    await choose(list(EN.from), 'sol4')

    expect(chosenOption(list(EN.from))).toBe('sol4')
    expect(modifiedCards()).toEqual([EN.firstSteps])
  })
})

// Criteria 11 and 12.
describe('a changed value', () => {
  it('runs the next session at once, with no Save', async () => {
    renderChoice()
    await openPanel()
    await choose(list(EN.from), 'sol4')
    await closePanel()

    await chooseLength('No limit')

    expect(trainerPitch()).toBe('G4')
  })

  it('has no Save button to press', async () => {
    renderChoice()

    await openPanel()

    // The help buttons of the parameters (feature wiki, slice 4) save nothing either.
    const names = inPanel()
      .getAllByRole('button', { name: (name) => !name.startsWith('Help: ') })
      .map((element) => element.textContent?.trim())
    expect(names.sort()).toEqual([EN.done, EN.pitch, EN.rhythm, 'Signs'])
  })

  it('marks the card of the chosen preset Modified and offers Reset', async () => {
    renderChoice()
    await openPanel()

    await choose(list(EN.from), 'sol4')

    expect(modifiedCards()).toEqual([EN.firstSteps])
    expect(screen.getByText(EN.modified)).toBeTruthy()
    expect(button(EN.reset)).toBeTruthy()
  })

  it('leaves the card chosen', async () => {
    renderChoice()
    await openPanel()

    await check(radio(EN.upToTwo))

    expect(button(EN.firstSteps).getAttribute('aria-pressed')).toBe('true')
  })

  it('marks the card of Advanced when it is the chosen one', async () => {
    renderChoice({ storage: storageWithPreset('advanced') })
    await openPanel()

    await check(radio(EN.upToOne))

    expect(modifiedCards()).toEqual(['Advanced'])
  })

  it('shows no mark and no Reset before a change', () => {
    renderChoice()

    expect(modifiedCards()).toEqual([])
    expect(screen.queryByText(EN.modified)).toBeNull()
    expect(queryButton(EN.reset)).toBeNull()
  })

  it('loses the mark when the values are set back by hand', async () => {
    renderChoice()
    await openPanel()
    await choose(list(EN.from), 'sol4')

    await choose(list(EN.from), 'do4')

    expect(modifiedCards()).toEqual([])
    expect(queryButton(EN.reset)).toBeNull()
  })

  it('is undone with Reset: the values of the preset, no mark, the focus on its card', async () => {
    renderChoice()
    await openPanel()
    await choose(list(EN.from), 'sol4')
    await check(radio(EN.upToOne))
    await closePanel()

    await fireEvent.click(button(EN.reset))

    expect(modifiedCards()).toEqual([])
    expect(queryButton(EN.reset)).toBeNull()
    expect(document.activeElement).toBe(button(EN.firstSteps))
    await openPanel()
    expect(chosenOption(list(EN.from))).toBe('do4')
    expect(checkedRadio()).toEqual([EN.none])
  })

  it('gives way to all values of another preset when it is chosen', async () => {
    renderChoice()
    await openPanel()
    await choose(list(EN.from), 'sol4')
    await closePanel()

    await fireEvent.click(button('Advanced'))

    expect(modifiedCards()).toEqual([])
    await openPanel()
    expect(chosenOption(list(EN.from))).toBe('la3')
    expect(chosenOption(list(EN.to))).toBe('do6')
    expect(checkedRadio()).toEqual([EN.upToTwo])
  })

  it.each<[Locale]>([['ru'], ['es']])('is marked in %s', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })
    await openPanel(texts)

    await choose(list(texts.from, texts), 'sol4')

    expect(
      screen.getByRole('button', { name: texts.firstSteps, description: texts.modified }),
    ).toBeTruthy()
    expect(button(texts.reset)).toBeTruthy()
  })
})

// Criterion 14, edge case 1.
describe('the values after a reload', () => {
  it('are kept, with the mark', async () => {
    const storage = renderChoice()
    await openPanel()
    await choose(list(EN.from), 'sol4')
    await check(radio(EN.upToOne))

    reload(storage)

    expect(modifiedCards()).toEqual([EN.firstSteps])
    await openPanel()
    expect(chosenOption(list(EN.from))).toBe('sol4')
    expect(checkedRadio()).toEqual([EN.upToOne])
  })

  it('give First steps, unmarked, when the saved ones are damaged', async () => {
    loadSession({ get: () => 'garbage', set: () => {}, canSave: () => true })

    expect(button(EN.firstSteps).getAttribute('aria-pressed')).toBe('true')
    expect(modifiedCards()).toEqual([])
    await openPanel()
    expect(chosenOption(list(EN.from))).toBe('do4')
    expect(chosenOption(list(EN.to))).toBe('do5')
    expect(checkedRadio()).toEqual([EN.none])
  })
})

// Criterion 13 for the range and the ledger lines.
describe('an incompatible value', () => {
  it('is unavailable in From and To with the reason, in First steps', async () => {
    renderChoice()

    await openPanel()

    // C4–C5 without ledger lines: From C5 and above, or To D4 and below, leaves one note or none.
    expect(optionTexts(list(EN.from))).toEqual([
      ...LATIN.slice(0, 9),
      ...LATIN.slice(9).map((name) => tooFew(name)),
    ])
    expect(enabledOptionTexts(list(EN.from))).toEqual(LATIN.slice(0, 9))
    expect(optionTexts(list(EN.to))).toEqual([
      ...LATIN.slice(0, 4).map((name) => tooFew(name)),
      ...LATIN.slice(4),
    ])
    expect(enabledOptionTexts(list(EN.to))).toEqual(LATIN.slice(4))
  })

  it('follows the other bound: To below or at From G4 is unavailable', async () => {
    renderChoice()
    await openPanel()

    await choose(list(EN.from), 'sol4')

    expect(enabledOptionTexts(list(EN.to))).toEqual(LATIN.slice(7))
  })

  it('follows the ledger lines: with one, To D4 is available, C4 is not', async () => {
    renderChoice()
    await openPanel()

    await check(radio(EN.upToOne))

    expect(enabledOptionTexts(list(EN.to))).toEqual(LATIN.slice(3))
  })

  it('is unavailable among the ledger lines with the reason: None for A3–C4', async () => {
    renderChoice({ storage: storageWithPreset('advanced') })
    await openPanel()

    await choose(list(EN.to), 'do4')

    expect(radio(EN.none).disabled).toBe(true)
    expect(
      inPanel().getByRole('radio', { name: EN.none, description: EN.tooFewNotes }),
    ).toBeTruthy()
    for (const name of [EN.upToOne, EN.upToTwo]) {
      expect(radio(name).disabled).toBe(false)
      expect(
        inPanel().getByRole('radio', { name, description: (text) => text === '' }),
      ).toBeTruthy()
    }
  })

  it('leaves every ledger line available with the reason nowhere in First steps', async () => {
    renderChoice()

    await openPanel()

    expect([EN.none, EN.upToOne, EN.upToTwo].filter((name) => radio(name).disabled)).toEqual([])
    expect(inPanel().queryByText(EN.tooFewNotes)).toBeNull()
  })

  it.each<[Locale]>([['ru'], ['es']])('says why in %s', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    await openPanel(texts)

    expect(optionTexts(list(texts.to, texts))[0]).toBe(tooFew('la3', texts.tooFewNotes))
  })
})
