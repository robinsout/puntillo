import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { forgetDialogs, isOpenAsModal, pressEscape } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  drawStaff,
  NAMES,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  statusText,
  type StaffDrawing,
} from '@/presentation/__tests__/screen'

// Feature keyboard-shortcuts, slice 1: Read notes answered by names from the keyboard of the
// computer. A key does what its button does, wherever the focus is (criteria 1, 3): A S D F G H J
// the names (criterion 4), = and − the sharp and the flat (criterion 5), 1–5 the durations and . the
// dot (criterion 8), Enter Check and then Next (criterion 9), ← → the notes of the question
// (criterion 10). A key is taken by its place, not by its character (criterion 2). Nothing happens
// on a held key repeating (edge case 1), before the staff is drawn (edge case 2) or under the hint
// of the wiki (edge case 5); the quick mode answers as with the buttons (edge case 4).
//
// The piano keyboard is slice 2: until then its letters do nothing.

afterEach(() => {
  cleanup()
  forgetDialogs()
  document.querySelectorAll('[data-test-field]').forEach((field) => field.remove())
})

// The characters an English layout types on these places.
const KEYS: Record<string, string> = {
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyF: 'f',
  KeyG: 'g',
  KeyH: 'h',
  KeyJ: 'j',
  KeyW: 'w',
  KeyE: 'e',
  KeyT: 't',
  KeyY: 'y',
  KeyU: 'u',
  KeyZ: 'z',
  KeyX: 'x',
  KeyQ: 'q',
  Equal: '=',
  Minus: '-',
  NumpadSubtract: '-',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Numpad1: '1',
  Numpad2: '2',
  Numpad4: '4',
  Period: '.',
  NumpadDecimal: '.',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
}

// A press as the browser sends it: to the element with the focus, bubbling up to the document.
// The event is returned, so a test can see whether the page took it from the browser.
async function key(
  code: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
) {
  const event = new KeyboardEvent('keydown', {
    code,
    key: KEYS[code] ?? '',
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  await settle()
  return event
}

async function keys(...codes: string[]) {
  for (const code of codes) await key(code)
}

// Enter with the focus off the buttons, which take Enter for themselves.
async function enter(code = 'Enter', init: KeyboardEventInit = {}) {
  focusNothing()
  return key(code, init)
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
// gives C4 (do), a whole note, then D4 (re), and so on. Its row of durations is 1/1 to 1/8.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

const SIGNS = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ accidentals: 'sharp-and-flat' })
}

const DOTS = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ dots: true })
}

// Confident reading with 2–4 notes in 4/4; DO_MI_SOL makes C4 half, E4 quarter and G4 quarter.
const SEVERAL = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
}

// The name alone, D4 (re) then E4 (mi) for a constant 0.
const FIRST_STEPS = (preferences: Preferences) => preferences.choosePreset('first-steps')

function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

interface Visit {
  random?: Random
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
  drawing?: StaffDrawing
}

async function start({
  random = startingOnC4(),
  difficulty = ONE_NOTE,
  more = () => {},
  drawing = 'immediate',
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    difficulty(preferences)
    more(preferences)
  })
  renderSessionWith(
    { random, clock: createManualClock().clock, preferences: preferencesFor(['en'], storage) },
    drawing,
  )
  await chooseLength('No limit')
}

const atOnce = (preferences: Preferences) => preferences.chooseShowAnswerAtOnce(true)
const pianoKeyboard = (preferences: Preferences) => preferences.chooseNoteInput('keyboard')

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'
const pressedNames = () => NAMES.filter(isPressed)
const shownPitch = () => screen.getByRole('img', { name: 'Music staff' }).getAttribute('data-pitch')
const autoNext = () => screen.getByRole('checkbox', { name: 'Open next question automatically' })
const currentNote = () =>
  screen
    .queryAllByRole('button', { name: /^Note \d+$/ })
    .find((target) => target.getAttribute('aria-current') === 'true')
    ?.getAttribute('aria-label')

const DURATIONS = ['1/1', '1/2', '1/4', '1/8']
const pressedDurations = () => DURATIONS.filter(isPressed)

// The focus where no button has it, as when the page has just opened the question.
function focusNothing() {
  ;(document.activeElement as HTMLElement | null)?.blur()
}

describe('the note names from the keyboard (criterion 4)', () => {
  it.each([
    ['KeyA', 'do'],
    ['KeyS', 're'],
    ['KeyD', 'mi'],
    ['KeyF', 'fa'],
    ['KeyG', 'sol'],
    ['KeyH', 'la'],
    ['KeyJ', 'si'],
  ])('%s chooses %s', async (code, name) => {
    await start()

    await key(code)

    expect(pressedNames()).toEqual([name])
  })

  it('takes the last letter pressed, as with the buttons', async () => {
    await start()

    await keys('KeyA', 'KeyG')

    expect(pressedNames()).toEqual(['sol'])
  })

  // Criterion 1: wherever the focus is.
  it('works with the focus on another button', async () => {
    await start()
    button('1/2').focus()

    await key('KeyD')

    expect(pressedNames()).toEqual(['mi'])
  })

  it('takes the key from the page, so the browser does nothing more with it', async () => {
    await start()

    const event = await key('KeyA')

    expect(event.defaultPrevented).toBe(true)
  })

  // Criterion 2: the place of the key counts, not the character it types.
  it('takes the place of A in a Russian layout, where it types ф, for do', async () => {
    await start()

    await key('KeyA', { key: 'ф' })

    expect(pressedNames()).toEqual(['do'])
  })

  it('takes the place of Q in a French layout, where it types a, for nothing', async () => {
    await start()

    await key('KeyQ', { key: 'a' })

    expect(pressedNames()).toEqual([])
  })
})

describe('the sharp and the flat from the keyboard (criterion 5)', () => {
  it('= presses the sharp, and = again releases it', async () => {
    await start({ difficulty: SIGNS })

    await key('Equal')
    expect(isPressed('Sharp')).toBe(true)

    await key('Equal')
    expect(isPressed('Sharp')).toBe(false)
  })

  it.each(['Minus', 'NumpadSubtract'])(
    '%s presses the flat in place of the sharp',
    async (code) => {
      await start({ difficulty: SIGNS })
      await key('Equal')

      await key(code)

      expect(isPressed('Flat')).toBe(true)
      expect(isPressed('Sharp')).toBe(false)
    },
  )

  it.each(['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyZ', 'KeyX'])(
    '%s does nothing with the names',
    async (code) => {
      await start({ difficulty: SIGNS })

      await key(code)

      expect(pressedNames()).toEqual([])
      expect(isPressed('Sharp')).toBe(false)
      expect(isPressed('Flat')).toBe(false)
    },
  )
})

describe('the durations and the dot from the keyboard (criterion 8)', () => {
  it.each([
    ['Digit1', '1/1'],
    ['Digit2', '1/2'],
    ['Digit3', '1/4'],
    ['Digit4', '1/8'],
    ['Numpad1', '1/1'],
    ['Numpad4', '1/8'],
  ])('%s chooses %s', async (code, name) => {
    await start()

    await key(code)

    expect(pressedDurations()).toEqual([name])
  })

  it('5 does nothing when the row has no sixteenth note', async () => {
    await start()
    await key('Digit2')

    await key('Digit5')

    expect(queryButton('1/16')).toBeNull()
    expect(pressedDurations()).toEqual(['1/2'])
  })

  it.each(['Period', 'NumpadDecimal'])('%s presses Dot, and again releases it', async (code) => {
    await start({ difficulty: DOTS })

    await key(code)
    expect(isPressed('Dot')).toBe(true)

    await key(code)
    expect(isPressed('Dot')).toBe(false)
  })

  it('a digit and the dot do nothing when the duration is not asked', async () => {
    await start({ difficulty: FIRST_STEPS })

    await keys('Digit2', 'Period', 'KeyS')
    await enter()

    expect(statusText()).toBe('Correct')
  })

  it('the name and the duration from the keyboard are checked as with the buttons', async () => {
    await start()

    await keys('KeyA', 'Digit1')
    await press('Check')

    expect(statusText()).toBe('Correct')
  })
})

describe('Enter (criterion 9)', () => {
  it('checks the answer', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    focusNothing()

    await key('Enter')

    expect(statusText()).toBe('Correct')
  })

  it('moves the focus to Next once checked, as Check does', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    focusNothing()

    await key('Enter')

    expect(document.activeElement).toBe(button('Next'))
  })

  it('checks a wrong answer to the second attempt', async () => {
    await start()
    await keys('KeyS', 'Digit1')
    focusNothing()

    await key('Enter')

    expect(statusText()).toBe('Incorrect. Try again.')
  })

  it('opens the next question after the result', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    focusNothing()
    await key('Enter')
    focusNothing()

    await key('Enter')

    expect(shownPitch()).toBe('D4')
    expect(queryButton('Next')).toBeNull()
  })

  it.each(['Enter', 'NumpadEnter'])(
    '%s answers a whole question with the letters',
    async (code) => {
      await start()

      await keys('KeyA', 'Digit1')
      await enter(code)
      await enter(code)
      await keys('KeyS', 'Digit1')
      await enter(code)

      expect(shownPitch()).toBe('D4')
      expect(statusText()).toBe('Correct')
      expect(screen.getByText('Points: 4 of 4')).toBeTruthy()
    },
  )

  // jsdom does not press a focused button on Enter as a browser does, so here the press is not
  // there at all: the page leaves Enter to the button.
  it('is left to the button that has the focus', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    await press('Check')
    button('Next').focus()

    const event = await key('Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(shownPitch()).toBe('C4')
    expect(button('Next')).toBeTruthy()
  })
})

describe('the arrows (criterion 10)', () => {
  it('→ goes to the next note and ← back, as the buttons do', async () => {
    await start({ difficulty: SEVERAL, random: DO_MI_SOL() })
    expect(currentNote()).toBe('Note 1')

    await key('ArrowRight')
    expect(currentNote()).toBe('Note 2')

    await key('ArrowRight')
    expect(currentNote()).toBe('Note 3')

    await key('ArrowLeft')
    expect(currentNote()).toBe('Note 2')
  })

  it('take the arrow from the page, so it does not scroll it', async () => {
    await start({ difficulty: SEVERAL, random: DO_MI_SOL() })

    const event = await key('ArrowRight')

    expect(event.defaultPrevented).toBe(true)
  })

  it('← does nothing on the first note, where Previous note is unavailable', async () => {
    await start({ difficulty: SEVERAL, random: DO_MI_SOL() })

    await key('ArrowLeft')

    expect(currentNote()).toBe('Note 1')
  })

  it('do nothing with one note, where there are no buttons to move', async () => {
    await start()

    await key('ArrowRight')

    expect(queryButton('Next note')).toBeNull()
    expect(shownPitch()).toBe('C4')
  })

  it('move between the keys, not the notes, with the focus in the piano keyboard', async () => {
    await start({ difficulty: SEVERAL, random: DO_MI_SOL(), more: pianoKeyboard })
    const piano = screen.getByRole('group', { name: 'Piano keyboard' })
    within(piano).getByRole('button', { name: 'do4' }).focus()

    await key('ArrowRight')

    expect(currentNote()).toBe('Note 1')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('do sharp 4 or re flat 4')
  })
})

describe('the keys left to the browser (criterion 1)', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'])('a letter with %s does nothing', async (modifier) => {
    await start()

    const event = await key('KeyA', { [modifier]: true })

    expect(pressedNames()).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('Enter with Ctrl does not check', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    focusNothing()

    await key('Enter', { ctrlKey: true })

    expect(button('Check')).toBeTruthy()
    expect(statusText()).toBe('')
  })

  // The question screen has no field of its own; one elsewhere on the page stands for it.
  it.each(['select', 'input', 'textarea'])(
    'a letter with the focus in a field (%s) does nothing',
    async (tag) => {
      await start()
      const field = document.body.appendChild(document.createElement(tag))
      field.setAttribute('data-test-field', '')
      if (tag === 'select') field.appendChild(document.createElement('option'))
      field.focus()

      const event = await key('KeyA')

      expect(pressedNames()).toEqual([])
      expect(event.defaultPrevented).toBe(false)
    },
  )

  // A box is no field to type in: only Space is its own.
  it('a letter, a digit and Enter work with the focus on the box Open next question automatically', async () => {
    await start()
    autoNext().focus()

    await keys('KeyA', 'Digit1', 'Enter')

    expect(pressedNames()).toEqual(['do'])
    expect(statusText()).toBe('Correct')
  })
})

describe('a key held down (edge case 1)', () => {
  it('counts once: the repeats of = leave the sharp pressed', async () => {
    await start({ difficulty: SIGNS })

    await key('Equal')
    await key('Equal', { repeat: true })
    await key('Equal', { repeat: true })

    expect(isPressed('Sharp')).toBe(true)
  })

  it('counts once: the repeats of Enter leave the result on the screen', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    focusNothing()

    await key('Enter')
    focusNothing()
    await key('Enter', { repeat: true })

    expect(shownPitch()).toBe('C4')
    expect(statusText()).toBe('Correct')
  })
})

describe('a key before the staff is drawn (edge case 2)', () => {
  it('does nothing while the answer buttons are not there', async () => {
    await start({ drawing: 'held' })

    await keys('KeyA', 'Digit1', 'Enter')
    drawStaff()
    await settle()

    expect(pressedNames()).toEqual([])
    expect(pressedDurations()).toEqual([])
    expect(statusText()).toBe('')
  })
})

describe('a key on a button that is unavailable (criterion 3)', () => {
  it('does nothing with the name rejected on the first attempt', async () => {
    await start()
    await keys('KeyS', 'Digit1')
    await press('Check')
    expect(button('re').matches(':disabled')).toBe(true)

    await key('KeyS')

    expect(pressedNames()).toEqual([])
  })

  it('does nothing after the result, where the names are unavailable', async () => {
    await start()
    await keys('KeyA', 'Digit1')
    await press('Check')

    await key('KeyS')

    expect(pressedNames()).toEqual(['do'])
  })
})

describe('the quick mode (edge case 4)', () => {
  it('answers on the key that completes the note and opens the next question', async () => {
    await start()
    await fireEvent.click(autoNext())
    focusNothing()

    await keys('Digit1', 'KeyA')

    expect(shownPitch()).toBe('D4')
    expect(statusText()).toBe('Correct')
  })

  it('stops on a wrong key for the second attempt, as the button does', async () => {
    await start()
    await fireEvent.click(autoNext())
    focusNothing()

    await keys('Digit1', 'KeyS')

    expect(shownPitch()).toBe('C4')
    expect(statusText()).toBe('Incorrect. Try again.')
  })
})

describe('the hint of the wiki over the question (edge case 5)', () => {
  async function openHint() {
    await start({ more: atOnce })
    await keys('KeyS', 'Digit1')
    await press('Check')
    const [why] = screen.getAllByRole('button', { name: 'Why?' })
    if (!why) throw new Error('the review has no button Why?')
    await fireEvent.click(why)
    const hint = await screen.findByRole('dialog')
    expect(isOpenAsModal(hint)).toBe(true)
    return hint
  }

  it('takes no key of the answer: Enter does not open the next question', async () => {
    const hint = await openHint()

    await key('Enter', {}, hint)

    expect(shownPitch()).toBe('C4')
  })

  it('gives the keys back once closed with Esc', async () => {
    await openHint()

    await pressEscape()
    await enter()

    expect(shownPitch()).toBe('D4')
  })
})

describe('the piano keyboard, until its slice', () => {
  it('takes no letter', async () => {
    await start({ more: pianoKeyboard })
    const piano = screen.getByRole('group', { name: 'Piano keyboard' })

    await keys('KeyA', 'KeyS', 'KeyW')

    const pressed = within(piano)
      .getAllByRole('button')
      .filter((each) => each.getAttribute('aria-pressed') === 'true')
    expect(pressed).toEqual([])
  })

  it('takes the digits for the durations', async () => {
    await start({ more: pianoKeyboard })

    await key('Digit2')

    expect(pressedDurations()).toEqual(['1/2'])
  })
})
