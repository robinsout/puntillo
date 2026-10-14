import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { backToTrainer, renderSettings } from '@/presentation/__tests__/app'
import {
  startSession,
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature m2-write-notes, slice 4, criterion 14: the box Show note names on the staff on the
// length choice, for a beginner. It is shown only with Write notes chosen, off by default, and
// saved like the other boxes. When on, each written note has a caption under the staff in its
// column: its name in the chosen naming with its octave and its own sign, as written: «sol4»,
// «fa♯4». The caption is hidden from screen readers, aria-hidden, as the column already says the
// same in its value. It follows the steps and the signs; with the box off or no note written
// there is none.
// Feature navigation-and-settings, slice 1: the box is on the settings screen, in the group Write
// notes, shown whatever exercise is chosen on the choice screen.

afterEach(() => {
  cleanup()
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

const AT = { C4: 80, E4: 70, F4: 65, G4: 60 } as const

const TEXTS = {
  en: {
    box: 'Show note names on the staff',
    exercise: 'Exercise',
    read: 'Read notes',
    write: 'Write notes',
    noLimit: 'No limit',
  },
  ru: {
    box: 'Подписывать ноты на нотоносце',
    exercise: 'Упражнение',
    read: 'Читать ноты',
    write: 'Записывать ноты',
    noLimit: 'Без ограничения',
  },
  es: {
    box: 'Mostrar los nombres en el pentagrama',
    exercise: 'Ejercicio',
    read: 'Leer notas',
    write: 'Escribir notas',
    noLimit: 'Sin límite',
  },
} as const

// Gives the values in turn, then 0 for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// First steps, a new user: D4–C5, one note, the duration not asked; 0.45 asks for G4 (sol4).
const ON_G4 = () => constant(0.45)

function exerciseSwitch(name: string = TEXTS.en.exercise) {
  const group = screen.queryByRole('group', { name }) ?? screen.queryByRole('radiogroup', { name })
  if (!group) throw new Error(`no group named "${name}"`)
  return group
}

const box = (name: string = TEXTS.en.box) =>
  screen.queryByRole<HTMLInputElement>('checkbox', { name })
const tick = () => fireEvent.click(screen.getByRole('checkbox', { name: TEXTS.en.box }))

async function chooseExercise(name: string, group = exerciseSwitch()) {
  await fireEvent.click(within(group).getByRole('radio', { name }))
}

function renderChoice(
  storage: KeyValueStorage = createMemoryStorage(),
  { random = ON_G4(), locale = 'en' }: { random?: Random; locale?: Locale } = {},
) {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Write notes with the box ticked, in First steps unless the storage says otherwise.
async function startWithNames(storage?: KeyValueStorage, random: Random = ON_G4()) {
  renderChoice(
    storage ??
      storageWith((preferences) => {
        preferences.chooseExercise('write')
        preferences.chooseShowNoteNames(true)
      }),
    { random },
  )
  await startSession('No limit')
}

const column = (number = 1) => screen.getByRole('slider', { name: `Note ${number}` })

async function touch(y: number, number = 1) {
  await fireEvent.click(column(number), { clientX: 180, clientY: y })
}

// The texts hidden from screen readers, each as a whole: the captions of the written notes.
const captions = () =>
  [...document.querySelectorAll('[aria-hidden="true"]')]
    .filter((element) => !element.closest('svg'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)

// The settings screen; a new one over the same storage stands for a reload.
const renderSettingsOver = (storage: KeyValueStorage, locale: Locale = 'en') =>
  renderSettings({ storage, locale, random: ON_G4() })

async function reload(storage: KeyValueStorage) {
  cleanup()
  await renderSettingsOver(storage)
}

const WRITING = (preferences: Preferences) => preferences.chooseExercise('write')

describe('the box Show note names on the staff', () => {
  it('is on the settings screen, unticked by default', async () => {
    await renderSettingsOver(createMemoryStorage())

    expect(box()?.checked).toBe(false)
  })

  it('is shown with Write notes chosen on the choice screen as well', async () => {
    await renderSettingsOver(storageWith(WRITING))

    expect(box()?.checked).toBe(false)
  })

  it('is not on the choice screen, with either exercise', async () => {
    renderChoice()
    expect(box()).toBeNull()

    await chooseExercise('Write notes')

    expect(box()).toBeNull()
  })

  it('is kept ticked after a reload', async () => {
    const storage = createMemoryStorage()
    await renderSettingsOver(storage)
    await tick()

    await reload(storage)

    expect(box()?.checked).toBe(true)
  })

  it('stays unticked after a reload once unticked again', async () => {
    const storage = createMemoryStorage()
    await renderSettingsOver(storage)
    await tick()
    await tick()

    await reload(storage)

    expect(box()?.checked).toBe(false)
  })

  it('works until a reload with an unavailable storage', async () => {
    const storage = unavailableStorage()
    await renderSettingsOver(storage)
    await tick()
    await backToTrainer()
    await chooseExercise('Write notes')
    await startSession('No limit')
    await touch(AT.G4)
    expect(captions()).toContain('sol4')

    await reload(storage)

    expect(box()?.checked).toBe(false)
  })

  it.each(['ru', 'es'] as const)('is said in %s', async (locale) => {
    await renderSettingsOver(createMemoryStorage(), locale)

    expect(box(TEXTS[locale].box)?.checked).toBe(false)
  })
})

describe('the caption of a written note', () => {
  it('is there with the box ticked: the name with its octave, hidden from screen readers', async () => {
    await startWithNames()

    await touch(AT.G4)

    expect(captions()).toEqual(['sol4'])
  })

  it('is not there before the note is written', async () => {
    await startWithNames()

    expect(captions()).toEqual([])
  })

  it('is not there with the box unticked', async () => {
    await startWithNames(storageWith((preferences) => preferences.chooseExercise('write')))

    await touch(AT.G4)

    expect(captions()).toEqual([])
  })

  it('follows a step of the note', async () => {
    await startWithNames()
    await touch(AT.G4)

    await fireEvent.click(screen.getByRole('button', { name: 'One step up' }))

    expect(captions()).toEqual(['la4'])
  })

  it('follows a new touch', async () => {
    await startWithNames()
    await touch(AT.G4)

    await touch(AT.E4)

    expect(captions()).toEqual(['mi4'])
  })

  it.each([
    ['letter', 'G4'],
    ['cyrillic-syllable', 'соль4'],
  ] as const)('is said in the %s naming', async (naming, caption) => {
    await startWithNames(
      storageWith((preferences) => {
        preferences.chooseExercise('write')
        preferences.chooseShowNoteNames(true)
        preferences.chooseNoteNaming(naming)
      }),
    )

    await touch(AT.G4)

    expect(captions()).toEqual([caption])
  })

  // Confident reading with one note and signs: C major, F♯4 with its sharp (see write-signs.spec.ts).
  it('says the sign written before the note, and follows it', async () => {
    await startWithNames(
      storageWith((preferences) => {
        preferences.chooseExercise('write')
        preferences.chooseShowNoteNames(true)
        preferences.choosePreset('confident-reading')
        preferences.customize({ questionLength: 'one-note' })
        preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
        preferences.customize({ askDuration: false })
        preferences.customize({ accidentals: 'sharp-flat-and-natural' })
      }),
      inTurn(3.5 / 12, 0, 0, 0.9, 0.1),
    )
    await touch(AT.F4)

    await fireEvent.click(screen.getByRole('button', { name: 'Sharp' }))
    expect(captions()).toEqual(['fa♯4'])

    await fireEvent.click(screen.getByRole('button', { name: 'Natural' }))
    expect(captions()).toEqual(['fa♮4'])
  })

  // Confident reading with 2–4 notes: C4 half, E4 quarter, G4 quarter (see write-several-notes).
  it('is there under each written note only', async () => {
    await startWithNames(
      storageWith((preferences) => {
        preferences.chooseExercise('write')
        preferences.chooseShowNoteNames(true)
        preferences.choosePreset('confident-reading')
        preferences.customize({ questionLength: 'two-to-four-notes' })
        preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
        preferences.customize({ keySignatures: 0 })
        preferences.customize({ accidentals: 'none' })
      }),
      inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0),
    )

    await touch(AT.C4, 1)
    await touch(AT.G4, 3)

    expect(captions()).toEqual(['do4', 'sol4'])
  })
})
