import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import type { Locale } from '@/domain/language'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  statusText,
  storageWithNoteNaming,
  storageWithPreset,
  storageWithSeventhNote,
} from '@/presentation/__tests__/screen'

// Feature m2-write-notes, slice 1: the question of Write notes. Over the staff, the heading Write
// the notes and the note to write, named in the chosen naming with its scientific octave: "sol4"
// (criterion 4). The staff shows the clef and the time signature, without the note (criterion 3).
// The note has a column on the staff, a vertical slider named "Note 1" whose value is the written
// note with its octave or "No note yet"; a touch in it writes the note on the nearest allowed step,
// One step up and One step down, and the arrow keys up and down on it, move the note a step
// (criterion 5, edge cases 1–2). Check, and Enter on the column, checks it (criterion 10); without
// a note it asks for one (edge case 3). The points, the second attempt, Show the right answer at
// once, the review with its Why? and the right note drawn on the staff go as in M1 (criteria 12,
// 13). The quick mode only drops the pause: the check is still made with Check.
//
// Here First steps asks for one note, the duration not asked; the range and the ledger lines are
// those of the difficulty. write-several-notes.spec.ts covers several notes and the duration.

afterEach(() => {
  cleanup()
  forgetDialogs()
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

// The height of a touch on each step of the stub's staff.
const AT = {
  A3: 90,
  C4: 80,
  D4: 75,
  E4: 70,
  F4: 65,
  G4: 60,
  A4: 55,
  B4: 50,
  C5: 45,
  F5: 30,
} as const

const TEXTS = {
  en: {
    write: 'Write notes',
    exercise: 'Exercise',
    noLimit: 'No limit',
    heading: 'Write the notes',
    note: 'Note 1',
    noNote: 'No note yet',
    up: 'One step up',
    down: 'One step down',
    check: 'Check',
    review: 'You wrote re4. The note sol4 is on the 2nd line.',
    why: 'Why?',
  },
  ru: {
    write: 'Записывать ноты',
    exercise: 'Упражнение',
    noLimit: 'Без ограничения',
    heading: 'Запишите ноты',
    note: 'Нота 1',
    noNote: 'Нота не поставлена',
    up: 'На ступень выше',
    down: 'На ступень ниже',
    check: 'Проверить',
    review: 'Вы написали ре4. Нота соль4 — на второй линейке.',
    why: 'Почему?',
  },
  es: {
    write: 'Escribir notas',
    exercise: 'Ejercicio',
    noLimit: 'Sin límite',
    heading: 'Escriba las notas',
    note: 'Nota 1',
    noNote: 'Sin nota',
    up: 'Un grado arriba',
    down: 'Un grado abajo',
    check: 'Comprobar',
    review: 'Escribiste re4. La nota sol4 está en la segunda línea.',
    why: '¿Por qué?',
  },
} as const

// First steps, which a new user starts in: D4–C5, C4 left out for its ledger line; seven steps,
// G4 in the middle. The first note is the k-th of the seven by floor(x × 7), each next one of the
// other six by floor(x × 6): 0.45 alternates G4 (sol4) and F4 (fa4); 0.75 alternates B4 and A4.
const ON_G4 = 0.45
const ON_B4 = 0.75

interface Writing {
  random?: Random
  storage?: KeyValueStorage
  locale?: Locale
  atOnce?: boolean
}

async function startWriting({
  random = constant(ON_G4),
  storage = createMemoryStorage(),
  locale = 'en',
  atOnce = false,
}: Writing = {}) {
  const texts = TEXTS[locale]
  const clock = createManualClock()
  renderSessionWith({ random, clock: clock.clock, preferences: preferencesFor([locale], storage) })
  const group =
    screen.queryByRole('group', { name: texts.exercise }) ??
    screen.getByRole('radiogroup', { name: texts.exercise })
  await fireEvent.click(within(group).getByRole('radio', { name: texts.write }))
  if (atOnce)
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Show the right answer at once' }))
  await chooseLength(texts.noLimit)
  return clock
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const column = (name: string = TEXTS.en.note) => screen.getByRole('slider', { name })
const written = (name?: string) => column(name).getAttribute('aria-valuetext')
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const drawn = () => staff().getAttribute('data-drawn')
const status = statusText

async function touch(y: number, name?: string) {
  await fireEvent.click(column(name), { clientX: 180, clientY: y })
}

async function press(key: 'ArrowUp' | 'ArrowDown' | 'Enter', name?: string) {
  column(name).focus()
  await fireEvent.keyDown(column(name), { key })
}

async function check(name: string = TEXTS.en.check) {
  await fireEvent.click(button(name))
}

// The mark must reach a screen reader too: it is the accessible description of the column.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

// The whole text of an element, however it is split between tags.
const textOf = (text: string) => (_: string, element: Element | null) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() === text &&
  [...element.children].every((child) => child.textContent?.replace(/\s+/g, ' ').trim() !== text)

describe('the question of Write notes', () => {
  it('is headed Write the notes', async () => {
    await startWriting()

    expect(screen.getByRole('heading', { name: 'Write the notes', level: 1 })).not.toBeNull()
  })

  it('names the note to write with its octave', async () => {
    await startWriting()

    expect(screen.getByText(textOf('sol4'))).not.toBeNull()
  })

  it.each([
    ['letters', storageWithNoteNaming('letter'), ON_G4, 'G4'],
    ['letters with H', storageWithSeventhNote('H', storageWithNoteNaming('letter')), ON_B4, 'H4'],
    ['Cyrillic syllables', storageWithNoteNaming('cyrillic-syllable'), ON_G4, 'соль4'],
    ['Latin syllables', createMemoryStorage(), ON_B4, 'si4'],
  ])('names the note in %s: %s', async (_, storage, value, name) => {
    await startWriting({ storage, random: constant(value) })

    expect(screen.getByText(textOf(name))).not.toBeNull()
  })

  it('draws the staff without the note', async () => {
    await startWriting()

    expect(drawn()).toBe('-')
  })

  it('offers no note names, no durations and no signs to choose', async () => {
    await startWriting()

    for (const name of ['sol', 'do', '1/4', '1/2', 'Sharp', 'Flat', 'Dot'])
      expect(queryButton(name)).toBeNull()
  })

  it('has one column for the note, a vertical slider with no note yet', async () => {
    await startWriting()

    expect(screen.getAllByRole('slider')).toHaveLength(1)
    expect(column().getAttribute('aria-orientation')).toBe('vertical')
    expect(written()).toBe('No note yet')
  })

  it('has One step up, One step down and Check', async () => {
    await startWriting()

    expect(button('One step up').disabled).toBe(false)
    expect(button('One step down').disabled).toBe(false)
    expect(button('Check').disabled).toBe(false)
  })

  it('shows the points of the session, nothing checked yet', async () => {
    await startWriting()

    expect(screen.getByText('Points: 0 of 0')).not.toBeNull()
  })
})

describe('writing the note', () => {
  it('writes it on the touched line', async () => {
    await startWriting()

    await touch(AT.G4)

    expect(written()).toBe('sol4')
    expect(drawn()).toBe('G4')
  })

  it('writes it in the touched space', async () => {
    await startWriting()

    await touch(AT.F4)

    expect(written()).toBe('fa4')
    expect(drawn()).toBe('F4')
  })

  it('writes it on the nearest step to the touch', async () => {
    await startWriting()

    await touch(AT.G4 + 2)

    expect(written()).toBe('sol4')
  })

  it('moves it to another touched step', async () => {
    await startWriting()
    await touch(AT.G4)

    await touch(AT.B4)

    expect(written()).toBe('si4')
    expect(drawn()).toBe('B4')
  })

  // Edge case 1.
  it('writes it on the top step of the range for a touch above it', async () => {
    await startWriting()

    await touch(AT.F5)

    expect(written()).toBe('do5')
  })

  it('writes it on the bottom step of the range for a touch below it', async () => {
    await startWriting()

    await touch(AT.C4)

    expect(written()).toBe('re4')
  })

  // Criterion 2: the range and the ledger lines of the difficulty hold in Write notes too.
  it('writes it within the range and the ledger lines of the chosen preset', async () => {
    await startWriting({ storage: storageWithPreset('advanced') })

    await touch(100)

    expect(written()).toBe('la3')
  })

  it('moves it one step with One step up and One step down', async () => {
    await startWriting()
    await touch(AT.G4)

    await fireEvent.click(button('One step up'))
    expect(written()).toBe('la4')
    expect(drawn()).toBe('A4')

    await fireEvent.click(button('One step down'))
    await fireEvent.click(button('One step down'))
    expect(written()).toBe('fa4')
  })

  it('moves it one step with the arrow keys up and down on the column', async () => {
    await startWriting()
    await touch(AT.G4)

    await press('ArrowUp')
    expect(written()).toBe('la4')

    await press('ArrowDown')
    await press('ArrowDown')
    expect(written()).toBe('fa4')
    expect(drawn()).toBe('F4')
  })

  // Edge case 2.
  it.each(['One step up', 'One step down'])(
    'writes it on the middle step of the range with %s before it is written',
    async (name) => {
      await startWriting()

      await fireEvent.click(button(name))

      expect(written()).toBe('sol4')
    },
  )

  it.each(['ArrowUp', 'ArrowDown'] as const)(
    'writes it on the middle step of the range with %s before it is written',
    async (key) => {
      await startWriting()

      await press(key)

      expect(written()).toBe('sol4')
    },
  )

  it('disables One step up on the top step', async () => {
    await startWriting()

    await touch(AT.C5)

    expect(button('One step up').disabled).toBe(true)
    expect(button('One step down').disabled).toBe(false)
  })

  it('disables One step down on the bottom step', async () => {
    await startWriting()

    await touch(AT.D4)

    expect(button('One step down').disabled).toBe(true)
    expect(button('One step up').disabled).toBe(false)
  })

  it('leaves the note on the top step with the arrow key up', async () => {
    await startWriting()
    await touch(AT.C5)

    await press('ArrowUp')

    expect(written()).toBe('do5')
  })

  // Slice 2: the length and the rhythm of the preset; until slice 3, no signs.
  it('asks for the notes of the preset without signs, a column for each note', async () => {
    await startWriting({ storage: storageWithPreset('advanced') })

    const notes = staff().getAttribute('data-pitch')?.split(' ') ?? []
    expect(screen.getAllByRole('slider')).toHaveLength(notes.length)
    expect(staff().getAttribute('data-key-signature')).toBe('none')
    expect(staff().getAttribute('data-signs')).toBe(notes.map(() => '-').join(' '))
  })
})

describe('checking the note', () => {
  // Edge case 3.
  it('asks for the note before it is written, as M1 asks for a name', async () => {
    await startWriting()

    await check()

    expect(status()).toBe('Place the note on the staff first')
    expect(queryButton('Next')).toBeNull()
    expect(screen.getByText('Points: 0 of 0')).not.toBeNull()
  })

  it('drops the request once the note is written', async () => {
    await startWriting()
    await check()

    await touch(AT.E4)

    expect(status()).toBe('')
  })

  it('says Correct for the right note and counts its point', async () => {
    await startWriting()
    await touch(AT.G4)

    await check()

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 1 of 1')).not.toBeNull()
    expect(screen.getByText('Streak: 1')).not.toBeNull()
  })

  it('checks with Enter on the column', async () => {
    await startWriting()
    await touch(AT.G4)

    await press('Enter')

    expect(status()).toBe('Correct')
  })

  it('checks a note placed and moved with the keyboard alone', async () => {
    await startWriting({ random: constant(ON_B4) })

    // G4 in the middle, then A4, then B4.
    await press('ArrowUp')
    await press('ArrowUp')
    await press('ArrowUp')
    await press('Enter')

    expect(written()).toBe('si4')
    expect(status()).toBe('Correct')
  })

  it('moves the focus to Next after the check', async () => {
    await startWriting()
    await touch(AT.G4)
    button('Check').focus()

    await check()

    await waitFor(() => expect(document.activeElement).toBe(queryButton('Next')))
  })

  it('locks the note once the question is over', async () => {
    await startWriting()
    await touch(AT.G4)

    await check()
    await touch(AT.E4)
    await press('ArrowUp')

    expect(written()).toBe('sol4')
    expect(button('One step up').disabled).toBe(true)
    expect(button('One step down').disabled).toBe(true)
  })

  it('opens the next note with Next, nothing written', async () => {
    await startWriting()
    await touch(AT.G4)
    await check()

    await fireEvent.click(button('Next'))

    expect(screen.getByText(textOf('fa4'))).not.toBeNull()
    expect(written()).toBe('No note yet')
    expect(drawn()).toBe('-')
    expect(status()).toBe('')
    expect(queryButton('Check')).not.toBeNull()
  })

  describe('a wrong note', () => {
    it('says Incorrect. Try again. without the right note', async () => {
      await startWriting()
      await touch(AT.E4)

      await check()

      expect(status()).toBe('Incorrect. Try again.')
      expect(drawn()).toBe('E4')
      expect(queryButton('Next')).toBeNull()
      expect(queryButton('Check')).not.toBeNull()
    })

    it('marks the column as incorrect, the note left where it was', async () => {
      await startWriting()
      await touch(AT.E4)

      await check()

      expect(description(column())).toBe('Incorrect')
      expect(written()).toBe('mi4')
    })

    it('lets the note be moved for the second attempt', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()

      await fireEvent.click(button('One step up'))

      expect(written()).toBe('fa4')
    })

    // As a rejected name in M1: a second Check by mistake does not spend the second attempt.
    it('asks to move the note on a check on the rejected step', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()

      await check()

      expect(status()).toBe('Move the note to another place first')
      expect(queryButton('Next')).toBeNull()
      expect(written()).toBe('mi4')
      expect(description(column())).toBe('Incorrect')
    })

    it('asks to move the note on Enter pressed twice', async () => {
      await startWriting()
      await touch(AT.E4)

      await press('Enter')
      await press('Enter')

      expect(status()).toBe('Move the note to another place first')
      expect(queryButton('Next')).toBeNull()
    })

    // As in M1, Incorrect. Try again. stays for the whole second attempt; only the request to
    // move the note goes once it is moved.
    it('drops the request once the note is moved, back to Incorrect. Try again.', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()
      await check()

      await fireEvent.click(button('One step up'))

      expect(status()).toBe('Incorrect. Try again.')
    })

    it('keeps Incorrect. Try again. while the note is moved in the second attempt', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()

      await fireEvent.click(button('One step up'))
      await touch(AT.B4)

      expect(status()).toBe('Incorrect. Try again.')
    })

    it('asks again for a note moved back onto the rejected step', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()
      await fireEvent.click(button('One step up'))
      await fireEvent.click(button('One step down'))

      await check()

      expect(status()).toBe('Move the note to another place first')
      expect(queryButton('Next')).toBeNull()
    })

    it('says Correct on the second try for the right note then, with no point', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()

      await touch(AT.G4)
      await check()

      expect(status()).toBe('Correct on the second try')
      expect(screen.getByText('Points: 0 of 1')).not.toBeNull()
      expect(queryButton('Next')).not.toBeNull()
    })

    it('explains the note after a wrong second try and draws the right one', async () => {
      await startWriting()
      await touch(AT.E4)
      await check()

      await touch(AT.D4)
      await check()

      expect(status()).toBe(TEXTS.en.review)
      expect(drawn()).toBe('G4')
      expect(queryButton('Next')).not.toBeNull()
    })

    it('explains the note at once with Show the right answer at once', async () => {
      await startWriting({ atOnce: true })
      await touch(AT.D4)

      await check()

      expect(status()).toBe(TEXTS.en.review)
      expect(drawn()).toBe('G4')
    })

    it.each(['ru', 'es'] as const)('explains the note in %s', async (locale) => {
      const texts = TEXTS[locale]
      const storage =
        locale === 'ru' ? storageWithNoteNaming('cyrillic-syllable') : createMemoryStorage()
      await startWriting({ locale, storage, atOnce: false })
      await touch(AT.E4, texts.note)
      await check(texts.check)

      await touch(AT.D4, texts.note)
      await check(texts.check)

      expect(status()).toBe(texts.review)
    })

    it('gives the explanation a Why?, described by it', async () => {
      await startWriting({ atOnce: true })
      await touch(AT.D4)

      await check()

      const why = screen.getByRole('button', { name: 'Why?' })
      expect(description(why)).toBe(TEXTS.en.review)
    })

    it('opens the hint of the notes on the treble staff with Why?', async () => {
      await startWriting({ atOnce: true })
      await touch(AT.D4)
      await check()

      await fireEvent.click(screen.getByRole('button', { name: 'Why?' }))

      expect(
        await screen.findByRole('dialog', { name: 'Notes on the treble staff' }),
      ).not.toBeNull()
    })
  })
})

describe('the texts of Write notes', () => {
  it.each(['ru', 'es'] as const)('are said in %s', async (locale) => {
    const texts = TEXTS[locale]
    await startWriting({ locale })

    expect(screen.getByRole('heading', { name: texts.heading, level: 1 })).not.toBeNull()
    expect(written(texts.note)).toBe(texts.noNote)
    expect(screen.getByRole('button', { name: texts.up })).not.toBeNull()
    expect(screen.getByRole('button', { name: texts.down })).not.toBeNull()
    expect(screen.getByRole('button', { name: texts.check })).not.toBeNull()
  })

  it.each([
    ['ru', 'Сначала поставьте ноту на нотоносец'],
    ['es', 'Primero pon la nota en el pentagrama'],
  ] as const)('ask for the note in %s', async (locale, text) => {
    await startWriting({ locale })

    await check(TEXTS[locale].check)

    expect(status()).toBe(text)
  })

  it.each([
    ['ru', 'Сначала передвиньте ноту на другое место'],
    ['es', 'Primero mueve la nota a otro lugar'],
  ] as const)('ask to move the note in %s', async (locale, text) => {
    const texts = TEXTS[locale]
    await startWriting({ locale })
    await touch(AT.E4, texts.note)
    await check(texts.check)

    await check(texts.check)

    expect(status()).toBe(text)
  })
})

// Criterion 10: in Write notes the check is always made with Check; the quick mode only drops the
// pause, the result shown on the next question.
describe('Write notes in the quick mode', () => {
  const quickMode = () =>
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open next question automatically' }))

  it('keeps Check and does not check a written note by itself', async () => {
    await startWriting()
    await quickMode()

    await touch(AT.G4)

    expect(queryButton('Check')).not.toBeNull()
    expect(status()).toBe('')
    expect(screen.getByText(textOf('sol4'))).not.toBeNull()
  })

  it('opens the next note at once after a right check, its result shown there', async () => {
    await startWriting()
    await quickMode()
    await touch(AT.G4)

    await check()

    expect(screen.getByText(textOf('fa4'))).not.toBeNull()
    expect(written()).toBe('No note yet')
    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 1 of 1')).not.toBeNull()
  })

  it('stays on a wrong note for the second attempt', async () => {
    await startWriting()
    await quickMode()
    await touch(AT.E4)

    await check()

    expect(status()).toBe('Incorrect. Try again.')
    expect(screen.getByText(textOf('sol4'))).not.toBeNull()
  })
})
