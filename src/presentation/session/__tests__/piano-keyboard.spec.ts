import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  startingOnG4,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature piano-keyboard, slice 1: with Piano keyboard chosen, Read notes takes the pitch from a
// piano keyboard in place of the name buttons and the buttons ♯ ♭ (criterion 4). The keyboard
// spans the sounds of the difficulty from a white key to a white key (criterion 5); the white keys
// are labelled in the naming, the keys C with their octave too, the black keys not at all
// (criterion 6). A key is named for a screen reader by the note with its octave, a black key by
// both of its names (edge case 6). A key played is pressed, then Check grades it by its sound and
// octave (criteria 7, 8); the marks, the second attempt and the review are as with the names
// (criteria 9–12, edge case 7). The keyboard is one Tab stop; the arrows move between the keys
// (edge case 6). The places of the keys and their sizes are for the end-to-end tests.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    keyboard: 'Piano keyboard',
    noLimit: 'No limit',
    check: 'Check',
    correct: 'Correct',
    incorrect: 'Incorrect',
    tryAgain: 'Incorrect. Try again.',
    playKeyFirst: 'Play a key first',
    playKeyAndDuration: 'Play a key and choose a duration',
    why: 'Why?',
  },
  ru: {
    keyboard: 'Клавиатура фортепиано',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    correct: 'Верно',
    incorrect: 'Неверно',
    tryAgain: 'Неверно. Попробуйте ещё раз.',
    playKeyFirst: 'Сначала нажмите клавишу',
    playKeyAndDuration: 'Нажмите клавишу и выберите длительность',
    why: 'Почему?',
  },
  es: {
    keyboard: 'Teclado de piano',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    correct: 'Correcto',
    incorrect: 'Incorrecto',
    tryAgain: 'Incorrecto. Inténtalo de nuevo.',
    playKeyFirst: 'Primero toca una tecla',
    playKeyAndDuration: 'Toca una tecla y elige una duración',
    why: '¿Por qué?',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

// The values in turn, then 0.
function sequence(...values: number[]): Random {
  const queue = [...values]
  return { next: () => queue.shift() ?? 0 }
}

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// As in hints.spec.ts: F4, a quarter, with a sharp before it: fa♯ in the 1st space. Needs the
// sharps and flats of SIGNS.
const FA_SHARP = () => sequence(3.5 / 12, 0.5, 0.9, 0)
// As in multi-note-trainer.spec.ts: C4 half, E4 quarter and G4 quarter in Confident reading.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// Confident reading with one note in 4/4, no signs, the duration asked, as most screen tests; its
// keyboard spans do4 to sol5.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

// ONE_NOTE with sharps and flats: its keyboard spans si3 to la5.
const SIGNS = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ accidentals: 'sharp-and-flat' })
}

const SEVERAL = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
}

const FIRST_STEPS = (preferences: Preferences) => preferences.choosePreset('first-steps')

interface Visit {
  random?: Random
  locale?: Locale
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
}

// With the piano keyboard chosen; by default on C4, a whole note, then D4.
async function renderKeyboard({
  random = startingOnC4(),
  locale = 'en',
  difficulty = ONE_NOTE,
  more = () => {},
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    preferences.chooseNoteInput('keyboard')
    more(preferences)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  await chooseLength(TEXTS[locale].noLimit)
}

const atOnce = (preferences: Preferences) => preferences.chooseShowAnswerAtOnce(true)

const keyboard = (name: string = EN.keyboard) => screen.getByRole('group', { name })
const queryKeyboard = (name: string = EN.keyboard) => screen.queryByRole('group', { name })
const keys = (name: string = EN.keyboard) => within(keyboard(name)).getAllByRole('button')
const key = (name: string, group: string = EN.keyboard) =>
  within(keyboard(group)).getByRole('button', { name })
const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const play = (name: string) => fireEvent.click(key(name))
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')

async function playAndCheck(name: string, duration: string, check: string = EN.check) {
  await play(name)
  await press(duration)
  await press(check)
}

// The mark reaches a screen reader as the description of the key.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const visibleLabels = () => keys().map((each) => each.textContent?.trim() ?? '')
const pressedKeys = () => keys().filter((each) => each.getAttribute('aria-pressed') === 'true')
const describedKeys = (text: string) => keys().filter((each) => description(each) === text)

const LATIN: Record<string, string> = {
  C: 'do',
  D: 're',
  E: 'mi',
  F: 'fa',
  G: 'sol',
  A: 'la',
  B: 'si',
}

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

describe('the question with the piano keyboard (criterion 4)', () => {
  it('shows the keyboard as a group named Piano keyboard', async () => {
    await renderKeyboard()

    expect(keyboard()).toBeTruthy()
  })

  it('shows no name buttons', async () => {
    await renderKeyboard()

    for (const name of ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'])
      expect(queryButton(name)).toBeNull()
  })

  it('shows no buttons Sharp and Flat when the difficulty has signs', async () => {
    await renderKeyboard({ random: FA_SHARP(), difficulty: SIGNS })

    expect(queryButton('Sharp')).toBeNull()
    expect(queryButton('Flat')).toBeNull()
  })

  it('keeps the durations and Check', async () => {
    await renderKeyboard()

    expect(button('1/1')).toBeTruthy()
    expect(button(EN.check)).toBeTruthy()
  })

  it('is not shown with Note names chosen', async () => {
    await renderKeyboard({ more: (preferences) => preferences.chooseNoteInput('names') })

    expect(queryKeyboard()).toBeNull()
    expect(button('do')).toBeTruthy()
  })

  // Criterion 3.
  it('is not shown in Write notes', async () => {
    await renderKeyboard({
      difficulty: FIRST_STEPS,
      more: (preferences) => preferences.chooseExercise('write'),
    })

    expect(queryKeyboard()).toBeNull()
  })
})

describe('the keys (criteria 5, 6, edge case 6)', () => {
  it('span do4 to do5 in First steps, white and black in order', async () => {
    await renderKeyboard({ difficulty: FIRST_STEPS })

    expect(keys()).toHaveLength(13)
    expect(keys()).toEqual(OCTAVE_FROM_DO4.map((name) => key(name)))
  })

  it('span do4 to sol5 in Confident reading without signs', async () => {
    await renderKeyboard()

    const all = keys()
    expect(all).toHaveLength(20)
    expect(all[0]).toBe(key('do4'))
    expect(all.at(-1)).toBe(key('sol5'))
  })

  it('add si3 below and la5 above with sharps and flats', async () => {
    await renderKeyboard({ random: FA_SHARP(), difficulty: SIGNS })

    const all = keys()
    expect(all).toHaveLength(23)
    expect(all[0]).toBe(key('si3'))
    expect(all.at(-1)).toBe(key('la5'))
  })

  it('label the white keys by name, the keys do with the octave, the black keys not at all', async () => {
    await renderKeyboard()

    expect(visibleLabels()).toEqual([
      'do4',
      '',
      're',
      '',
      'mi',
      'fa',
      '',
      'sol',
      '',
      'la',
      '',
      'si',
      'do5',
      '',
      're',
      '',
      'mi',
      'fa',
      '',
      'sol',
    ])
  })

  // The letters are named by their symbols, joined to the octave as on the labels.
  it.each([
    ['en', 'B', ['C4', 'C♯4 or D♭4', 'D4'], 'A♯4 or B♭4'],
    ['en', 'H', ['C4', 'C♯4 or D♭4', 'D4'], 'A♯4 or B4'],
    ['ru', 'B', ['C4', 'C♯4 или D♭4', 'D4'], 'A♯4 или B♭4'],
    ['es', 'B', ['C4', 'C♯4 o D♭4', 'D4'], 'A♯4 o B♭4'],
  ] as const)(
    'are named by the letters in %s with %s for the seventh note',
    async (locale, seventhNote, first, black) => {
      await renderKeyboard({
        locale,
        difficulty: FIRST_STEPS,
        more: (preferences) => {
          preferences.chooseNoteNaming('letter')
          preferences.chooseSeventhNote(seventhNote)
        },
      })

      const group = TEXTS[locale].keyboard
      expect(keys(group).slice(0, 3)).toEqual(first.map((name) => key(name, group)))
      expect(keys(group)[10]).toBe(key(black, group))
    },
  )

  it('follow the letters, with H for the seventh note', async () => {
    await renderKeyboard({
      difficulty: FIRST_STEPS,
      more: (preferences) => {
        preferences.chooseNoteNaming('letter')
        preferences.chooseSeventhNote('H')
      },
    })

    expect(key('C4').textContent?.trim()).toBe('C4')
    expect(key('D4').textContent?.trim()).toBe('D')
    expect(key('H4').textContent?.trim()).toBe('H')
    expect(key('C5')).toBeTruthy()
  })

  it('are marked Russian with the Cyrillic names, whatever the interface language', async () => {
    await renderKeyboard({
      difficulty: FIRST_STEPS,
      more: (preferences) => preferences.chooseNoteNaming('cyrillic-syllable'),
    })

    expect(key('до4').getAttribute('lang')).toBe('ru')
    expect(key('соль4').textContent?.trim()).toBe('соль')
  })

  it.each([
    ['ru', 'cyrillic-syllable', 'до4', 'до-диез 4 или ре-бемоль 4'],
    ['es', 'latin-syllable', 'do4', 'do sostenido 4 o re bemol 4'],
  ] as const)('are named in %s', async (locale, naming, white, black) => {
    await renderKeyboard({
      locale,
      difficulty: FIRST_STEPS,
      more: (preferences) => preferences.chooseNoteNaming(naming),
    })

    const group = TEXTS[locale].keyboard
    expect(keys(group)[0]).toBe(key(white, group))
    expect(keys(group)[1]).toBe(key(black, group))
  })
})

describe('playing a key (criterion 7)', () => {
  it('presses the key played and only it', async () => {
    await renderKeyboard()

    await play('re4')

    expect(pressedKeys()).toEqual([key('re4')])
  })

  it('moves the press to the next key played', async () => {
    await renderKeyboard()

    await play('re4')
    await play('do sharp 4 or re flat 4')

    expect(pressedKeys()).toEqual([key('do sharp 4 or re flat 4')])
  })

  it('says Correct for the key of the note with its duration', async () => {
    await renderKeyboard()

    await playAndCheck('do4', '1/1')

    expect(statusText()).toBe(EN.correct)
  })

  it('says Correct for the black key of a note with a sharp', async () => {
    await renderKeyboard({ random: FA_SHARP(), difficulty: SIGNS })

    await playAndCheck('fa sharp 4 or sol flat 4', '1/4')

    expect(statusText()).toBe(EN.correct)
  })
})

describe('Check without an answer', () => {
  it('asks for a key and a duration when the duration is asked', async () => {
    await renderKeyboard()

    await press(EN.check)

    expect(statusText()).toBe(EN.playKeyAndDuration)
  })

  it('asks for a key when only the duration is chosen', async () => {
    await renderKeyboard()

    await press('1/1')
    await press(EN.check)

    expect(statusText()).toBe(EN.playKeyAndDuration)
  })

  it('asks for a key first when the duration is not asked', async () => {
    await renderKeyboard({ difficulty: FIRST_STEPS })

    await press(EN.check)

    expect(statusText()).toBe(EN.playKeyFirst)
  })

  it.each(['ru', 'es'] as const)('asks in %s', async (locale) => {
    await renderKeyboard({ locale })

    await press(TEXTS[locale].check)

    expect(statusText()).toBe(TEXTS[locale].playKeyAndDuration)
  })

  it.each(['ru', 'es'] as const)('asks for a key first in %s', async (locale) => {
    await renderKeyboard({ locale, difficulty: FIRST_STEPS })

    await press(TEXTS[locale].check)

    expect(statusText()).toBe(TEXTS[locale].playKeyFirst)
  })

  it('asks for every note on a question of several notes', async () => {
    await renderKeyboard({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await press(EN.check)

    expect(statusText()).toBe('Answer every note')
  })
})

describe('the second attempt (criteria 9, 10)', () => {
  it('follows a key an octave off', async () => {
    await renderKeyboard()

    await playAndCheck('do5', '1/1')

    expect(statusText()).toBe(EN.tryAgain)
    expect(shownPitch()).toBe('C4')
  })

  it('disables the key rejected and marks it Incorrect', async () => {
    await renderKeyboard()

    await playAndCheck('do5', '1/1')

    expect(key('do5').matches(':disabled')).toBe(true)
    expect(describedKeys(EN.incorrect)).toEqual([key('do5')])
  })

  it('marks no key Correct and leaves the others enabled, none pressed', async () => {
    await renderKeyboard()

    await playAndCheck('do5', '1/1')

    expect(describedKeys(EN.correct)).toEqual([])
    expect(keys().filter((each) => each.matches(':disabled'))).toEqual([key('do5')])
    expect(pressedKeys()).toEqual([])
  })

  it('takes the right key on the second try', async () => {
    await renderKeyboard()
    await playAndCheck('do5', '1/1')

    await play('do4')
    await press(EN.check)

    expect(statusText()).toBe('Correct on the second try')
  })

  // Edge case 7.
  it('disables the whole keyboard when only the duration was wrong', async () => {
    await renderKeyboard()

    await playAndCheck('do4', '1/2')

    expect(keys().every((each) => each.matches(':disabled'))).toBe(true)
    expect(pressedKeys()).toEqual([key('do4')])
  })
})

describe('the review (criteria 10–12)', () => {
  it('names the key played and the note with their octaves and the place of the note', async () => {
    await renderKeyboard({ random: startingOnG4(), more: atOnce })

    await playAndCheck('sol5', '1/2')

    expect(statusText()).toBe('You played sol5. This is sol4: the note on the 2nd line.')
  })

  it('names a black key by both of its names and the note as written', async () => {
    await renderKeyboard({ random: FA_SHARP(), difficulty: SIGNS, more: atOnce })

    await playAndCheck('sol sharp 4 or la flat 4', '1/4')

    expect(statusText()).toBe('You played sol♯4/la♭4. This is fa♯4: the note in the 1st space.')
  })

  it('names the white key of the letter of a note with a sharp, with no sentence on the sound', async () => {
    await renderKeyboard({ random: FA_SHARP(), difficulty: SIGNS, more: atOnce })

    await playAndCheck('fa4', '1/4')

    expect(statusText()).toBe('You played fa4. This is fa♯4: the note in the 1st space.')
    expect(statusText()).not.toMatch(/sounds the same/)
  })

  it('marks the key played Incorrect and the right key Correct', async () => {
    await renderKeyboard({ random: startingOnG4(), more: atOnce })

    await playAndCheck('sol5', '1/2')

    expect(describedKeys(EN.incorrect)).toEqual([key('sol5')])
    expect(describedKeys(EN.correct)).toEqual([key('sol4')])
  })

  it('reviews a wrong second try as well', async () => {
    await renderKeyboard({ random: startingOnG4() })
    await playAndCheck('sol5', '1/2')

    await play('la4')
    await press(EN.check)

    expect(statusText()).toBe('You played la4. This is sol4: the note on the 2nd line.')
  })

  // Feature piano-keyboard, criterion 17.
  it('opens the hint on the piano keyboard by its Why? for the key an octave off', async () => {
    await renderKeyboard({ random: startingOnG4(), more: atOnce })
    await playAndCheck('sol5', '1/2')

    await press(EN.why)

    const hint = await screen.findByRole('dialog')
    expect(within(hint).getByRole('heading').textContent?.trim()).toBe('The piano keyboard')
  })

  it('opens the hint on the notes on the staff by its Why? for another wrong key', async () => {
    await renderKeyboard({ random: startingOnG4(), more: atOnce })
    await playAndCheck('la4', '1/2')

    await press(EN.why)

    const hint = await screen.findByRole('dialog')
    expect(within(hint).getByRole('heading').textContent?.trim()).toBe('Notes on the treble staff')
  })

  it.each([
    ['ru', 'cyrillic-syllable', 'соль5', 'Вы нажали соль5. Это соль4 — нота на второй линейке.'],
    ['es', 'latin-syllable', 'sol5', 'Tocaste sol5. Es sol4: la nota en la segunda línea.'],
  ] as const)('is said in %s', async (locale, naming, played, review) => {
    await renderKeyboard({
      locale,
      random: startingOnG4(),
      more: (preferences) => {
        atOnce(preferences)
        preferences.chooseNoteNaming(naming)
      },
    })

    await fireEvent.click(key(played, TEXTS[locale].keyboard))
    await press('1/2')
    await press(TEXTS[locale].check)

    expect(statusText()).toBe(review)
  })
})

// Feature piano-keyboard, criterion 17: the key of the same sound in another octave is a mistake
// of the octave alone, its Why? opening the hint on the piano keyboard; the sound was read right,
// so the review gives no reason for the sign of the note. Any other wrong key keeps the reason.
describe('the review of a key an octave off (criterion 17)', () => {
  // As in hints.spec.ts: F5, a quarter, in a key of one sharp, no sign before it: fa♯ on the 5th
  // line.
  const FA_SHARP_IN_KEY = () => sequence(10.5 / 12, 0.5, 0.5, 0, 0)
  const KEY_SIGNS = (preferences: Preferences) => {
    SIGNS(preferences)
    preferences.customize({ keySignatures: 2 })
  }
  const whyButtons = () => screen.queryAllByRole('button', { name: EN.why })

  async function renderOnFaSharpInKey() {
    await renderKeyboard({ random: FA_SHARP_IN_KEY(), difficulty: KEY_SIGNS, more: atOnce })
  }

  it('names the key played alone, with no reason for the sign', async () => {
    await renderOnFaSharpInKey()

    await playAndCheck('fa sharp 4 or sol flat 4', '1/4')

    expect(statusText()).toBe('You played fa♯4/sol♭4. This is fa♯5: the note on the 5th line.')
    expect(whyButtons()).toHaveLength(1)
  })

  it('opens the hint on the piano keyboard by its Why?', async () => {
    await renderOnFaSharpInKey()
    await playAndCheck('fa sharp 4 or sol flat 4', '1/4')

    await press(EN.why)

    const hint = await screen.findByRole('dialog')
    expect(within(hint).getByRole('heading').textContent?.trim()).toBe('The piano keyboard')
  })

  it('keeps the reason for the sign for another wrong key', async () => {
    await renderOnFaSharpInKey()

    await playAndCheck('fa5', '1/4')

    expect(statusText()).toBe(
      'You played fa5. This is fa♯5: the note on the 5th line. The sharp comes from the key signature.',
    )
    expect(whyButtons()).toHaveLength(2)
  })
})

describe('a question of several notes (criterion 12)', () => {
  const target = (number: number) => button(`Note ${number}`)

  it('captions each note by the key played and the duration', async () => {
    await renderKeyboard({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await play('do4')
    await press('1/2')
    await play('fa sharp 4 or sol flat 4')
    await press('1/4')

    expect(description(target(1))).toBe('do4 1/2')
    expect(description(target(2))).toBe('fa♯4/sol♭4 1/4')
    expect(description(target(3))).toBe('')
  })

  it('takes a key for each note in turn and grades them', async () => {
    await renderKeyboard({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await play('do4')
    await press('1/2')
    await play('mi4')
    await press('1/4')
    await play('sol4')
    await press('1/4')
    await press(EN.check)

    expect(statusText()).toBe(EN.correct)
  })
})

describe('the quick mode (criterion 7)', () => {
  it('answers with the key and the duration, and opens the next question', async () => {
    await renderKeyboard({ more: (preferences) => preferences.chooseAutoAdvance(true) })

    await play('do4')
    await press('1/1')

    expect(shownPitch()).toBe('D4')
    expect(statusText()).toBe(EN.correct)
  })

  it('answers with the key alone when the duration is not asked', async () => {
    await renderKeyboard({
      difficulty: FIRST_STEPS,
      more: (preferences) => preferences.chooseAutoAdvance(true),
    })
    const first = shownPitch() ?? ''
    const [, letter = '', octave = ''] = /^([A-G])(\d)$/.exec(first) ?? []

    await play(`${LATIN[letter]}${octave}`)

    expect(shownPitch()).not.toBe(first)
    expect(statusText()).toBe(EN.correct)
  })
})

describe('the keyboard from the computer keyboard (edge case 6)', () => {
  const tabStops = () => keys().filter((each) => each.tabIndex === 0)

  it('is one Tab stop', async () => {
    await renderKeyboard()

    expect(tabStops()).toHaveLength(1)
    expect(keys().filter((each) => each.tabIndex !== 0 && each.tabIndex !== -1)).toEqual([])
  })

  it('moves the focus to the next key by the right arrow', async () => {
    await renderKeyboard()
    key('re4').focus()

    await fireEvent.keyDown(key('re4'), { key: 'ArrowRight' })

    expect(document.activeElement).toBe(key('re sharp 4 or mi flat 4'))
  })

  it('moves the focus to the previous key by the left arrow', async () => {
    await renderKeyboard()
    key('re4').focus()

    await fireEvent.keyDown(key('re4'), { key: 'ArrowLeft' })

    expect(document.activeElement).toBe(key('do sharp 4 or re flat 4'))
  })

  it('makes the key reached the Tab stop', async () => {
    await renderKeyboard()
    key('re4').focus()

    await fireEvent.keyDown(key('re4'), { key: 'ArrowRight' })
    await fireEvent.keyDown(key('re sharp 4 or mi flat 4'), { key: 'ArrowRight' })

    expect(tabStops()).toEqual([key('mi4')])
  })

  // The Tab stop is the key of the current note, or the white key in the middle: the white key
  // number floor(whites / 2) from 0, sol4 among the eight of First steps.
  it('is the white key in the middle when no key is played', async () => {
    await renderKeyboard({ difficulty: FIRST_STEPS })

    expect(tabStops()).toEqual([key('sol4')])
  })

  it('is si4, the middle of the twelve white keys do4 to sol5', async () => {
    await renderKeyboard()

    expect(tabStops()).toEqual([key('si4')])
  })

  it('is the key played for the current note', async () => {
    await renderKeyboard()

    await play('re4')

    expect(tabStops()).toEqual([key('re4')])
  })

  it('follows the current note of a question of several notes', async () => {
    await renderKeyboard({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await play('do4')
    await press('1/2')
    // Note 2 has no key yet: the middle of the fourteen white keys si3 to la5.
    expect(tabStops()).toEqual([key('si4')])

    await press('Note 1')
    expect(tabStops()).toEqual([key('do4')])
  })

  it('stops at the last key by the right arrow', async () => {
    await renderKeyboard()
    key('sol5').focus()

    await fireEvent.keyDown(key('sol5'), { key: 'ArrowRight' })

    expect(document.activeElement).toBe(key('sol5'))
  })

  it('stops at the first key by the left arrow', async () => {
    await renderKeyboard()
    key('do4').focus()

    await fireEvent.keyDown(key('do4'), { key: 'ArrowLeft' })

    expect(document.activeElement).toBe(key('do4'))
  })

  it('skips a disabled key', async () => {
    await renderKeyboard()
    await playAndCheck('do5', '1/1')
    key('si4').focus()

    await fireEvent.keyDown(key('si4'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(key('do sharp 5 or re flat 5'))

    await fireEvent.keyDown(key('do sharp 5 or re flat 5'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(key('si4'))
  })

  it('does not press a key by an arrow', async () => {
    await renderKeyboard()
    key('re4').focus()

    await fireEvent.keyDown(key('re4'), { key: 'ArrowRight' })

    expect(pressedKeys()).toEqual([])
  })
})
