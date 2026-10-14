import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { forgetDialogs, isOpenAsModal, pressEscape } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  statusText,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature keyboard-shortcuts, slice 4: what tells of the keys. The start screen has the button
// Keyboard shortcuts, which opens a dialog with the keys of Read notes, of Write notes and of both;
// Close and Esc close it, the focus back on the button (criterion 12). On a desktop, an
// device whose pointer is fine, the question screens of both exercises have a hint above the
// answer, You can answer from the keyboard., with Keyboard shortcuts and Close; closed, it stays
// closed as a preference does (criterion 13, edge case 6). On a desktop the buttons show their
// keys in small text hidden from their names, and tell them through aria-keyshortcuts
// (criterion 14). The texts are in the three languages (criterion 15).
//
// jsdom has no matchMedia: the tests stand in for it, a fine pointer or a coarse one. Without it
// the page is not a desktop.

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')

afterEach(() => {
  cleanup()
  forgetDialogs()
  queries.clear()
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia)
  else Reflect.deleteProperty(window, 'matchMedia')
})

const FINE_POINTER = '(pointer: fine)'

let pointerIsFine = false
const queries = new Set<FakeMediaQueryList>()

class FakeMediaQueryList extends EventTarget {
  constructor(readonly media: string) {
    super()
  }

  get matches() {
    return this.media === FINE_POINTER && pointerIsFine
  }

  onchange = null

  addListener(listener: EventListener) {
    this.addEventListener('change', listener)
  }

  removeListener(listener: EventListener) {
    this.removeEventListener('change', listener)
  }
}

// The main pointer of the device: fine for a mouse or a touchpad, coarse for a finger.
function pointer(kind: 'fine' | 'coarse') {
  pointerIsFine = kind === 'fine'
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => {
      const query = new FakeMediaQueryList(media)
      queries.add(query)
      return query
    },
  })
}

// A mouse plugged in, or taken away, with the page open.
async function pointerChanges(kind: 'fine' | 'coarse') {
  pointerIsFine = kind === 'fine'
  for (const query of queries) {
    const event = Object.assign(new Event('change'), { matches: query.matches, media: query.media })
    query.dispatchEvent(event)
  }
  await settle()
}

// The characters an English layout types on these places.
const KEYS: Record<string, string> = {
  KeyA: 'a',
  KeyS: 's',
  KeyX: 'x',
  Digit1: '1',
  Enter: 'Enter',
}

// A press as the browser sends it: to the element with the focus, bubbling up to the document.
async function key(code: string, target: Element = document.activeElement ?? document.body) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { code, key: KEYS[code] ?? '', bubbles: true, cancelable: true }),
  )
  await settle()
}

async function keys(...codes: string[]) {
  for (const code of codes) await key(code)
}

// Lets the re-render and a focus move scheduled after it happen.
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note in 4/4, no signs, the name and the duration asked: a constant 0
// gives C4 (do), a whole note, then D4 (re). Its row of durations is 1/1 to 1/8.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

// Every button of Read notes by names: the names, Sharp and Flat, the durations and Dot.
const EVERY_BUTTON = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ accidentals: 'sharp-and-flat' })
  preferences.customize({ dots: true })
}

// A row of durations that does not start with the whole note: 1/2 to 1/16.
const HALF_TO_SIXTEENTH = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ duration: 'whole', on: false })
  preferences.customize({ duration: 'sixteenth', on: true })
}

// Write notes with every button: the signs, the durations and Dot.
const WRITE_EVERY_BUTTON = (preferences: Preferences) => {
  preferences.chooseExercise('write')
  ONE_NOTE(preferences)
  preferences.customize({ dots: true })
  preferences.customize({ keySignatures: 2 })
  preferences.customize({ accidentals: 'sharp-flat-and-natural' })
}

// First steps: do4 to do5, the name alone; a constant 0 asks D4 (re), then E4 (mi).
const FIRST_STEPS = (preferences: Preferences) => preferences.choosePreset('first-steps')
const WRITE_FIRST_STEPS = (preferences: Preferences) => {
  preferences.chooseExercise('write')
  FIRST_STEPS(preferences)
}
const PIANO = (preferences: Preferences) => {
  FIRST_STEPS(preferences)
  preferences.chooseNoteInput('keyboard')
}

interface Visit {
  setUp?: (preferences: Preferences) => void
  storage?: KeyValueStorage
  random?: Random
  locale?: Locale
}

// The start screen of a page over the storage; a new render over the same storage is a reload.
function open({
  setUp = ONE_NOTE,
  storage = storageWith(setUp),
  random = startingOnC4(),
  locale = 'en',
}: Visit = {}) {
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  return storage
}

// The question screen of a session with no limit.
async function start(visit: Visit = {}) {
  const storage = open(visit)
  await chooseLength('No limit')
  return storage
}

function reload(storage: KeyValueStorage) {
  cleanup()
  forgetDialogs()
  return start({ storage })
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'

const HINT = 'You can answer from the keyboard.'
const queryHint = () => screen.queryByText(HINT)

// The keys written on a button: its text hidden from its accessible name.
const captionOf = (element: Element) =>
  [...element.querySelectorAll('[aria-hidden="true"]')]
    .map((hidden) => hidden.textContent?.trim() ?? '')
    .join(' ')

const shortcutOf = (element: Element) => element.getAttribute('aria-keyshortcuts')

const shortcutsDialog = (name = 'Keyboard shortcuts') => screen.getByRole('dialog', { name })

async function openShortcuts(opener: HTMLElement = button('Keyboard shortcuts')) {
  await fireEvent.click(opener)
  const dialog = shortcutsDialog()
  expect(isOpenAsModal(dialog)).toBe(true)
  return dialog
}

const normalized = (text: string | null) => text?.replace(/\s+/g, ' ').trim() ?? ''

// The rows of a section of the dialog, each as the text of its cells: what the keys do, the keys.
function rowsOf(dialog: HTMLElement, section: string) {
  const table = within(dialog).getByRole('table', { name: section }) as HTMLTableElement
  return [...table.rows]
    .filter((row) => row.querySelector('td'))
    .map((row) => [...row.cells].map((cell) => normalized(cell.textContent)))
}

// The keys of a row, each in its own <kbd>.
function kbdOf(dialog: HTMLElement, section: string, action: string) {
  const table = within(dialog).getByRole('table', { name: section })
  const row = within(table).getByRole('rowheader', { name: action }).closest('tr')
  if (!row) throw new Error(`no row ${action}`)
  return [...row.querySelectorAll('kbd')].map((kbd) => kbd.textContent?.trim())
}

describe('Keyboard shortcuts on the start screen (criterion 12)', () => {
  it.each([
    ['a desktop', () => pointer('fine')],
    ['a phone', () => pointer('coarse')],
    ['a browser that cannot tell', () => {}],
  ])('is a button on %s', (_device, setDevice) => {
    setDevice()
    open()

    expect(button('Keyboard shortcuts')).toBeTruthy()
  })

  it('opens a dialog named Keyboard shortcuts', async () => {
    open()

    const dialog = await openShortcuts()

    expect(within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })

  it('lists the keys of Read notes: the names, the signs, the piano keys and the octave', async () => {
    open()

    const dialog = await openShortcuts()

    expect(rowsOf(dialog, 'Read notes')).toEqual([
      ['Note names', 'A S D F G H J'],
      ['Sharp / flat', '= / −'],
      ['Piano keys', 'A…J white, W…U black'],
      ['Octave down / up', 'Z / X'],
    ])
  })

  it('lists the keys of Write notes: the note up and down and the signs', async () => {
    open()

    const dialog = await openShortcuts()

    expect(rowsOf(dialog, 'Write notes')).toEqual([
      ['Note up / down', '↑ / ↓'],
      ['Sharp / flat / natural', '= / − / 0'],
    ])
  })

  it('lists the keys of both: the durations, Check and Next, the notes of the question', async () => {
    open()

    const dialog = await openShortcuts()

    expect(rowsOf(dialog, 'Both')).toEqual([
      ['Durations', '1 2 3 4 5, dot: .'],
      ['Check, Next', 'Enter'],
      ['Previous / next note', '← / →'],
    ])
  })

  it('shows each key in its own <kbd>', async () => {
    open()

    const dialog = await openShortcuts()

    expect(kbdOf(dialog, 'Read notes', 'Note names')).toEqual(['A', 'S', 'D', 'F', 'G', 'H', 'J'])
    expect(kbdOf(dialog, 'Read notes', 'Sharp / flat')).toEqual(['=', '−'])
    expect(kbdOf(dialog, 'Read notes', 'Piano keys')).toEqual(['A', 'J', 'W', 'U'])
    expect(kbdOf(dialog, 'Write notes', 'Sharp / flat / natural')).toEqual(['=', '−', '0'])
    expect(kbdOf(dialog, 'Both', 'Durations')).toEqual(['1', '2', '3', '4', '5', '.'])
    expect(kbdOf(dialog, 'Both', 'Check, Next')).toEqual(['Enter'])
    expect(kbdOf(dialog, 'Both', 'Previous / next note')).toEqual(['←', '→'])
  })

  it('closes with Close, the focus back on Keyboard shortcuts', async () => {
    open()
    const dialog = await openShortcuts()

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(button('Keyboard shortcuts')))
  })

  it('closes with Esc, the focus back on Keyboard shortcuts', async () => {
    open()
    await openShortcuts()

    await pressEscape()

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(button('Keyboard shortcuts')))
  })

  it('opens again once closed', async () => {
    open()
    await openShortcuts()
    await pressEscape()

    const dialog = await openShortcuts()

    expect(rowsOf(dialog, 'Both')).toHaveLength(3)
  })
})

describe('the texts of Keyboard shortcuts (criterion 15)', () => {
  it.each([
    [
      'ru' as const,
      {
        title: 'Сочетания клавиш',
        close: 'Закрыть',
        read: 'Читать ноты',
        write: 'Записывать ноты',
        both: 'В обоих',
        rows: {
          read: [
            ['Названия нот', 'A S D F G H J'],
            ['Диез / бемоль', '= / −'],
            ['Клавиши фортепиано', 'A…J белые, W…U чёрные'],
            ['Октава ниже / выше', 'Z / X'],
          ],
          write: [
            ['Нота выше / ниже', '↑ / ↓'],
            ['Диез / бемоль / бекар', '= / − / 0'],
          ],
          both: [
            ['Длительности', '1 2 3 4 5, точка: .'],
            ['Проверить, далее', 'Enter'],
            ['Предыдущая / следующая нота', '← / →'],
          ],
        },
      },
    ],
    [
      'es' as const,
      {
        title: 'Atajos de teclado',
        close: 'Cerrar',
        read: 'Leer notas',
        write: 'Escribir notas',
        both: 'En ambos',
        rows: {
          read: [
            ['Nombres de las notas', 'A S D F G H J'],
            ['Sostenido / bemol', '= / −'],
            ['Teclas del piano', 'A…J blancas, W…U negras'],
            ['Octava abajo / arriba', 'Z / X'],
          ],
          write: [
            ['Nota arriba / abajo', '↑ / ↓'],
            ['Sostenido / bemol / becuadro', '= / − / 0'],
          ],
          both: [
            ['Duraciones', '1 2 3 4 5, puntillo: .'],
            ['Comprobar, siguiente', 'Enter'],
            ['Nota anterior / siguiente', '← / →'],
          ],
        },
      },
    ],
  ])('are in %s', async (locale, texts) => {
    open({ locale })

    await fireEvent.click(button(texts.title))
    const dialog = shortcutsDialog(texts.title)

    expect(rowsOf(dialog, texts.read)).toEqual(texts.rows.read)
    expect(rowsOf(dialog, texts.write)).toEqual(texts.rows.write)
    expect(rowsOf(dialog, texts.both)).toEqual(texts.rows.both)
    expect(within(dialog).getByRole('button', { name: texts.close })).toBeTruthy()
  })

  it.each([
    [
      'ru' as const,
      'Отвечать можно с клавиатуры.',
      'Сочетания клавиш',
      'Закрыть',
      'Без ограничения',
    ],
    [
      'es' as const,
      'Puedes responder con el teclado.',
      'Atajos de teclado',
      'Cerrar',
      'Sin límite',
    ],
  ])('the hint on the question screen is in %s', async (locale, hint, shortcuts, close, length) => {
    pointer('fine')
    open({ locale })

    await chooseLength(length)

    expect(screen.getByText(hint)).toBeTruthy()
    expect(button(shortcuts)).toBeTruthy()
    expect(button(close)).toBeTruthy()
  })
})

describe('the hint on the question screen (criterion 13)', () => {
  it.each([
    ['Read notes by names', ONE_NOTE],
    ['Read notes on the piano keyboard', PIANO],
    ['Write notes', WRITE_FIRST_STEPS],
  ])('is shown on a desktop in %s, with Keyboard shortcuts and Close', async (_where, setUp) => {
    pointer('fine')

    await start({ setUp })

    expect(queryHint()).not.toBeNull()
    expect(button('Keyboard shortcuts')).toBeTruthy()
    expect(button('Close')).toBeTruthy()
  })

  it.each([
    ['a phone', () => pointer('coarse')],
    ['a browser that cannot tell', () => {}],
  ])('is not shown on %s', async (_device, setDevice) => {
    setDevice()

    await start()

    expect(queryHint()).toBeNull()
    expect(queryButton('Keyboard shortcuts')).toBeNull()
    expect(queryButton('Close')).toBeNull()
  })

  it('is not shown on a phone in Write notes', async () => {
    pointer('coarse')

    await start({ setUp: WRITE_FIRST_STEPS })

    expect(queryHint()).toBeNull()
  })

  it('comes when a mouse is plugged in, and goes when it is taken away', async () => {
    pointer('coarse')
    await start()

    await pointerChanges('fine')
    expect(queryHint()).not.toBeNull()

    await pointerChanges('coarse')
    expect(queryHint()).toBeNull()
  })

  it('stands above the answer: after the staff, before the names', async () => {
    pointer('fine')
    await start()

    const staff = screen.getByRole('img', { name: 'Music staff' })
    const hint = screen.getByText(HINT)

    expect(staff.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      hint.compareDocumentPosition(button('do')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('stands above the answer in Write notes: after the staff, before One step up', async () => {
    pointer('fine')
    await start({ setUp: WRITE_FIRST_STEPS })

    const staff = screen.getByRole('img', { name: 'Music staff' })
    const hint = screen.getByText(HINT)

    expect(staff.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const stepUp = button('One step up')
    expect(hint.compareDocumentPosition(stepUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('stays on the next question until closed', async () => {
    pointer('fine')
    await start({ setUp: FIRST_STEPS })

    await press('re')
    await press('Check')
    await press('Next')

    expect(queryHint()).not.toBeNull()
  })
})

describe('Close on the hint (criterion 13)', () => {
  it('hides the hint', async () => {
    pointer('fine')
    await start()

    await press('Close')

    expect(queryHint()).toBeNull()
    expect(queryButton('Keyboard shortcuts')).toBeNull()
  })

  it('puts the focus on the heading of the question, not losing it', async () => {
    pointer('fine')
    await start()

    await press('Close')

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })),
    )
  })

  it('puts the focus on the heading in Write notes too', async () => {
    pointer('fine')
    await start({ setUp: WRITE_FIRST_STEPS })

    await press('Close')

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { level: 1, name: 'Write the notes' }),
      ),
    )
  })

  it('hides it on the next question', async () => {
    pointer('fine')
    await start({ setUp: FIRST_STEPS })
    await press('Close')

    await press('re')
    await press('Check')
    await press('Next')

    expect(queryHint()).toBeNull()
  })

  it('hides it in the other exercise as well', async () => {
    pointer('fine')
    await start({ setUp: FIRST_STEPS })
    await press('Close')

    await press('Finish')
    await fireEvent.click(screen.getByRole('radio', { name: 'Write notes' }))
    await chooseLength('No limit')

    expect(button('One step up')).toBeTruthy()
    expect(queryHint()).toBeNull()
  })

  it('is saved: the hint does not come back after a reload', async () => {
    pointer('fine')
    const storage = await start()
    await press('Close')

    await reload(storage)

    expect(button('Check')).toBeTruthy()
    expect(queryHint()).toBeNull()
  })

  it('keeps the button Keyboard shortcuts on the start screen', async () => {
    pointer('fine')
    await start({ setUp: FIRST_STEPS })
    await press('Close')

    await press('Finish')

    expect(button('Keyboard shortcuts')).toBeTruthy()
  })

  // Edge case 6: what cannot be saved holds until the page is loaded again.
  it('with the storage unavailable, hides the hint until a reload', async () => {
    pointer('fine')
    const storage = unavailableStorage()
    await start({ storage, random: constant(0) })
    await press('Close')
    expect(queryHint()).toBeNull()

    await reload(storage)

    expect(queryHint()).not.toBeNull()
  })
})

describe('Keyboard shortcuts on the hint (criterion 13)', () => {
  it('opens the same dialog', async () => {
    pointer('fine')
    await start()

    const dialog = await openShortcuts()

    expect(rowsOf(dialog, 'Read notes')[0]).toEqual(['Note names', 'A S D F G H J'])
  })

  it('opens it in Write notes too', async () => {
    pointer('fine')
    await start({ setUp: WRITE_FIRST_STEPS })

    const dialog = await openShortcuts()

    expect(rowsOf(dialog, 'Write notes')[0]).toEqual(['Note up / down', '↑ / ↓'])
  })

  it('closes with Close, the focus back on Keyboard shortcuts and the hint still there', async () => {
    pointer('fine')
    await start()
    const dialog = await openShortcuts()

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    expect(queryHint()).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(button('Keyboard shortcuts')))
  })

  // Criterion 1: an open dialog keeps the keys of the answer.
  it('takes no key of the answer while open', async () => {
    pointer('fine')
    await start()
    const dialog = await openShortcuts()

    await keys('KeyA', 'Digit1')
    await key('Enter', dialog)

    expect(isOpenAsModal(dialog)).toBe(true)
    expect(isPressed('do')).toBe(false)
    expect(isPressed('1/1')).toBe(false)
    expect(statusText()).toBe('')
  })

  it('gives the keys back once closed with Esc', async () => {
    pointer('fine')
    await start()
    await openShortcuts()

    await pressEscape()
    await keys('KeyA', 'Digit1')

    expect(isPressed('do')).toBe(true)
    expect(isPressed('1/1')).toBe(true)
  })
})

describe('the keys on the buttons of Read notes (criterion 14)', () => {
  it.each([
    ['do', 'A'],
    ['re', 'S'],
    ['mi', 'D'],
    ['fa', 'F'],
    ['sol', 'G'],
    ['la', 'H'],
    ['si', 'J'],
  ])('%s shows %s and tells it to screen readers', async (name, letter) => {
    pointer('fine')
    await start({ setUp: EVERY_BUTTON })

    expect(captionOf(button(name))).toBe(letter)
    expect(shortcutOf(button(name))).toBe(letter)
  })

  it.each([
    ['Sharp', '=', '='],
    ['Flat', '−', '-'],
    ['1/1', '1', '1'],
    ['1/2', '2', '2'],
    ['1/4', '3', '3'],
    ['1/8', '4', '4'],
    ['Dot', '.', '.'],
  ])('%s shows %s', async (name, caption, shortcut) => {
    pointer('fine')
    await start({ setUp: EVERY_BUTTON })

    expect(captionOf(button(name))).toBe(caption)
    expect(shortcutOf(button(name))).toBe(shortcut)
  })

  it('numbers the durations by their place from the whole note, though the row lacks it', async () => {
    pointer('fine')
    await start({ setUp: HALF_TO_SIXTEENTH })

    expect(['1/2', '1/4', '1/8', '1/16'].map((name) => captionOf(button(name)))).toEqual([
      '2',
      '3',
      '4',
      '5',
    ])
    expect(['1/2', '1/4', '1/8', '1/16'].map((name) => shortcutOf(button(name)))).toEqual([
      '2',
      '3',
      '4',
      '5',
    ])
  })

  it('leaves the names of the buttons as they were', async () => {
    pointer('fine')
    await start({ setUp: EVERY_BUTTON })

    for (const name of ['do', 'si', 'Sharp', 'Flat', '1/1', '1/8', 'Dot', 'Check']) {
      expect(button(name)).toBeTruthy()
    }
  })

  it('shows none on a phone, and tells none', async () => {
    pointer('coarse')
    await start({ setUp: EVERY_BUTTON })

    for (const name of ['do', 'si', 'Sharp', 'Flat', '1/1', '1/8', 'Dot']) {
      expect(captionOf(button(name))).toBe('')
    }
    expect(document.querySelectorAll('[aria-keyshortcuts]')).toHaveLength(0)
  })

  it('shows none in a browser that cannot tell the pointer', async () => {
    await start({ setUp: EVERY_BUTTON })

    expect(captionOf(button('do'))).toBe('')
    expect(document.querySelectorAll('[aria-keyshortcuts]')).toHaveLength(0)
  })

  it('stays on the buttons with the hint closed', async () => {
    pointer('fine')
    await start({ setUp: EVERY_BUTTON })

    await press('Close')

    expect(captionOf(button('do'))).toBe('A')
    expect(shortcutOf(button('1/1'))).toBe('1')
  })
})

describe('the keys on the buttons of Write notes (criterion 14)', () => {
  it.each([
    ['One step up', '↑', 'ArrowUp'],
    ['One step down', '↓', 'ArrowDown'],
    ['Sharp', '=', '='],
    ['Flat', '−', '-'],
    ['Natural', '0', '0'],
    ['Whole note', '1', '1'],
    ['Half note', '2', '2'],
    ['Quarter note', '3', '3'],
    ['Eighth note', '4', '4'],
    ['Dot', '.', '.'],
  ])('%s shows %s', async (name, caption, shortcut) => {
    pointer('fine')
    await start({ setUp: WRITE_EVERY_BUTTON })

    expect(captionOf(button(name))).toBe(caption)
    expect(shortcutOf(button(name))).toBe(shortcut)
  })

  it('shows none on a phone, and tells none', async () => {
    pointer('coarse')
    await start({ setUp: WRITE_EVERY_BUTTON })

    for (const name of ['One step up', 'Sharp', 'Natural', 'Quarter note', 'Dot']) {
      expect(captionOf(button(name))).toBe('')
    }
    expect(document.querySelectorAll('[aria-keyshortcuts]')).toHaveLength(0)
  })
})

const piano = () => screen.getByRole('group', { name: 'Piano keyboard' })
const pianoKey = (name: string) => within(piano()).getByRole('button', { name })

// The keys of do4 to do5 in order, white and black.
const OCTAVE_FROM_DO4 = [
  'do4',
  'do sharp 4 or re flat 4',
  're4',
  're sharp 4 or mi flat 4',
  'mi4',
  'fa4',
  'fa sharp 4 or sol flat 4',
  'sol4',
  'sol sharp 4 or la flat 4',
  'la4',
  'la sharp 4 or si flat 4',
  'si4',
  'do5',
]

const pianoCaptions = () => OCTAVE_FROM_DO4.map((name) => captionOf(pianoKey(name)))
const pianoShortcuts = () => OCTAVE_FROM_DO4.map((name) => shortcutOf(pianoKey(name)))

describe('the keys on the piano keyboard (criterion 14)', () => {
  it('shows the keys of the working octave on its keys, white and black', async () => {
    pointer('fine')
    await start({ setUp: PIANO })

    expect(pianoCaptions()).toEqual([
      'A',
      'W',
      'S',
      'E',
      'D',
      'F',
      'T',
      'G',
      'Y',
      'H',
      'U',
      'J',
      '',
    ])
  })

  it('tells them to screen readers, and nothing on a key out of the octave', async () => {
    pointer('fine')
    await start({ setUp: PIANO })

    expect(pianoShortcuts()).toEqual([
      'A',
      'W',
      'S',
      'E',
      'D',
      'F',
      'T',
      'G',
      'Y',
      'H',
      'U',
      'J',
      null,
    ])
  })

  it('leaves the names of the keys as they were', async () => {
    pointer('fine')
    await start({ setUp: PIANO })

    expect(
      within(piano())
        .getAllByRole('button')
        .map((each) => each.getAttribute('aria-label')),
    ).toEqual(OCTAVE_FROM_DO4)
  })

  it('moves them up an octave with X', async () => {
    pointer('fine')
    await start({ setUp: PIANO })

    await key('KeyX')

    expect(pianoCaptions()).toEqual(['', '', '', '', '', '', '', '', '', '', '', '', 'A'])
    expect(shortcutOf(pianoKey('do5'))).toBe('A')
    expect(shortcutOf(pianoKey('do4'))).toBeNull()
  })

  it('moves them back down with Z', async () => {
    pointer('fine')
    await start({ setUp: PIANO })

    await keys('KeyX', 'KeyZ')

    expect(pianoCaptions()).toEqual([
      'A',
      'W',
      'S',
      'E',
      'D',
      'F',
      'T',
      'G',
      'Y',
      'H',
      'U',
      'J',
      '',
    ])
  })

  // First steps asks D4 (re4) first.
  it('brings them back to the octave of the middle on the next question', async () => {
    pointer('fine')
    await start({ setUp: PIANO })
    await key('KeyX')
    expect(captionOf(pianoKey('do5'))).toBe('A')

    await fireEvent.click(pianoKey('re4'))
    await press('Check')
    await press('Next')

    expect(captionOf(pianoKey('do4'))).toBe('A')
    expect(captionOf(pianoKey('do5'))).toBe('')
  })

  it('shows none on a phone', async () => {
    pointer('coarse')
    await start({ setUp: PIANO })

    expect(pianoCaptions()).toEqual(OCTAVE_FROM_DO4.map(() => ''))
    expect(document.querySelectorAll('[aria-keyshortcuts]')).toHaveLength(0)
  })
})
