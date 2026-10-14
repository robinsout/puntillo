import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  startSession,
  constant,
  createManualClock,
  createMemoryStorage,
  drawStaff,
  preferencesFor,
  renderSessionWith,
  statusText,
  type StaffDrawing,
} from '@/presentation/__tests__/screen'

// Feature keyboard-shortcuts, slice 3: Write notes answered from the keyboard of the computer. With
// the focus off the column of the staff, ↑ and ↓ move the current note a step as One step up and
// One step down do, = − 0 put the sharp, the flat and the natural as their buttons (criterion 11);
// 1–5 choose the durations and . the dot (criterion 8); Enter checks and then opens the next
// question (criterion 9); ← → go between the notes (criterion 10). The letters do nothing in Write
// notes (criterion 11). A key does what its button does, and nothing where the button is
// unavailable or absent (criterion 3). The column with the focus handles its arrows and Enter
// itself, so they act once.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

// The characters an English layout types on these places.
const KEYS: Record<string, string> = {
  KeyA: 'a',
  KeyS: 's',
  KeyJ: 'j',
  KeyW: 'w',
  KeyU: 'u',
  KeyZ: 'z',
  KeyX: 'x',
  Equal: '=',
  Minus: '-',
  NumpadSubtract: '-',
  Digit0: '0',
  Numpad0: '0',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Numpad2: '2',
  Period: '.',
  NumpadDecimal: '.',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
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
async function enter(code = 'Enter') {
  focusNothing()
  return key(code)
}

// Lets the re-render and a focus move scheduled after it happen.
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

// The focus where no button has it, as when the page has just opened the question.
function focusNothing() {
  ;(document.activeElement as HTMLElement | null)?.blur()
}

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

// First steps, one note, the duration not asked: D4–C5, G4 in the middle. A constant 0.45 asks
// G4 (sol4), then F4 (fa4); 0.75 asks B4 (si4).
const FIRST_STEPS = (preferences: Preferences) => preferences.choosePreset('first-steps')
const ON_G4 = 0.45
const ON_B4 = 0.75

// Confident reading with one note in 4/4, the duration not asked, up to two signs in the key
// signature and every accidental: Sharp, Flat and Natural are offered.
const SIGNS = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ dots: false })
  preferences.customize({ askDuration: false })
  preferences.customize({ keySignatures: 2 })
  preferences.customize({ accidentals: 'sharp-flat-and-natural' })
}

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// G major, F4: sounds F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = () => inTurn(3.5 / 12, 0, 0.5, 0.4, 0)

// Confident reading, C4–G5, whole to eighth notes, no signs, the duration asked. ONE_NOTE asks one
// note; SEVERAL asks 2–4, and DO_MI_SOL makes them C4 half, E4 quarter and G4 quarter.
const ONE_NOTE = (preferences: Preferences) => {
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'none' })
}

const DOTS = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ dots: true })
}

const SEVERAL = (preferences: Preferences) => {
  ONE_NOTE(preferences)
  preferences.customize({ questionLength: 'two-to-four-notes' })
}

const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

const atOnce = (preferences: Preferences) => preferences.chooseShowAnswerAtOnce(true)
const quickMode = (preferences: Preferences) => preferences.chooseAutoAdvance(true)

interface Visit {
  random?: Random
  difficulty?: (preferences: Preferences) => void
  more?: (preferences: Preferences) => void
  drawing?: StaffDrawing
}

async function startWriting({
  random = constant(ON_G4),
  difficulty = FIRST_STEPS,
  more = () => {},
  drawing = 'immediate',
}: Visit = {}) {
  const storage = storageWith((preferences) => {
    preferences.chooseExercise('write')
    difficulty(preferences)
    more(preferences)
  })
  renderSessionWith(
    { random, clock: createManualClock().clock, preferences: preferencesFor(['en'], storage) },
    drawing,
  )
  await startSession('No limit')
  focusNothing()
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'
const column = (name = 'Note 1') => screen.getByRole('slider', { name })
const written = (name?: string) => column(name).getAttribute('aria-valuetext')
const currentColumn = () =>
  screen
    .queryAllByRole('slider')
    .filter((each) => each.getAttribute('aria-current') === 'true')
    .map((each) => each.getAttribute('aria-label'))
const status = statusText

const DURATIONS = ['Whole note', 'Half note', 'Quarter note', 'Eighth note']
const pressedDurations = () => DURATIONS.filter(isPressed)
const SIGN_BUTTONS = ['Sharp', 'Flat', 'Natural']
const pressedSigns = () => SIGN_BUTTONS.filter(isPressed)

// The whole text of an element, however it is split between tags.
const textOf = (text: string) => (_: string, element: Element | null) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() === text &&
  [...element.children].every((child) => child.textContent?.replace(/\s+/g, ' ').trim() !== text)

describe('the arrows up and down in Write notes (criterion 11)', () => {
  it('↑ writes the note on the middle step before it is written, as One step up does', async () => {
    await startWriting()

    await key('ArrowUp')

    expect(written()).toBe('sol4')
  })

  it('↑ and ↓ move the note a step each', async () => {
    await startWriting()

    await keys('ArrowUp', 'ArrowUp')
    expect(written()).toBe('la4')

    await keys('ArrowDown', 'ArrowDown')
    expect(written()).toBe('fa4')
  })

  it('takes the arrow from the page, so it does not scroll it', async () => {
    await startWriting()

    const event = await key('ArrowUp')

    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the focus where it was, not in the column', async () => {
    await startWriting()

    await key('ArrowUp')

    expect(document.activeElement).not.toBe(column())
  })

  // Criterion 3: One step up is unavailable on the top step, do5 in First steps.
  it('↑ does nothing on the top step', async () => {
    await startWriting()

    await keys('ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp')
    expect(written()).toBe('do5')
    expect(button('One step up').disabled).toBe(true)

    await key('ArrowUp')

    expect(written()).toBe('do5')
  })

  it('do nothing once the question is over, the note locked', async () => {
    await startWriting()
    await key('ArrowUp')
    await enter()
    expect(status()).toBe('Correct')

    await keys('ArrowUp', 'ArrowDown')

    expect(written()).toBe('sol4')
  })

  // The column with the focus moves the note itself; the page does not move it a second time.
  it('move the note one step, not two, with the focus in the column', async () => {
    await startWriting()
    await key('ArrowUp')
    column().focus()

    await key('ArrowUp')
    expect(written()).toBe('la4')

    await key('ArrowDown')
    expect(written()).toBe('sol4')
  })
})

describe('the signs in Write notes (criterion 11)', () => {
  it.each([
    ['Equal', 'Sharp'],
    ['Minus', 'Flat'],
    ['NumpadSubtract', 'Flat'],
    ['Digit0', 'Natural'],
    ['Numpad0', 'Natural'],
  ])('%s presses %s', async (code, name) => {
    await startWriting({ random: F_IN_G_MAJOR(), difficulty: SIGNS })

    await key(code)

    expect(pressedSigns()).toEqual([name])
  })

  it('= puts the sharp before the written note and says it in the column', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), difficulty: SIGNS })
    await key('ArrowUp')
    const step = written()

    await key('Equal')

    expect(written()).toMatch(/♯\d$/)
    expect(written()?.replace('♯', '')).toBe(step)
  })

  it('0 puts the natural, and 0 again takes it away', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), difficulty: SIGNS })
    await key('ArrowUp')

    await key('Digit0')
    expect(written()).toMatch(/♮\d$/)

    await key('Digit0')
    expect(written()).not.toMatch(/♮/)
    expect(pressedSigns()).toEqual([])
  })

  it('− puts the flat in place of the sharp', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), difficulty: SIGNS })

    await keys('Equal', 'Minus')

    expect(pressedSigns()).toEqual(['Flat'])
  })

  it('take the key from the page', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), difficulty: SIGNS })

    const event = await key('Digit0')

    expect(event.defaultPrevented).toBe(true)
  })

  // Criterion 3: no sign buttons without key signatures and accidentals.
  it.each(['Equal', 'Minus', 'Digit0'])(
    '%s does nothing where no signs are offered',
    async (code) => {
      await startWriting()
      await key('ArrowUp')

      await key(code)

      expect(queryButton('Sharp')).toBeNull()
      expect(written()).toBe('sol4')
    },
  )

  it('do nothing once the question is over, the sign buttons unavailable', async () => {
    await startWriting({ random: F_IN_G_MAJOR(), difficulty: SIGNS, more: atOnce })
    await key('ArrowUp')
    await enter()
    expect(button('Sharp').disabled).toBe(true)

    await keys('Equal', 'Minus', 'Digit0')

    expect(pressedSigns()).toEqual([])
  })
})

describe('the durations and the dot in Write notes (criterion 8)', () => {
  it.each([
    ['Digit1', 'Whole note'],
    ['Digit2', 'Half note'],
    ['Digit3', 'Quarter note'],
    ['Digit4', 'Eighth note'],
    ['Numpad2', 'Half note'],
  ])('%s chooses %s', async (code, name) => {
    await startWriting({ random: constant(0), difficulty: ONE_NOTE })

    await key(code)

    expect(pressedDurations()).toEqual([name])
  })

  it('5 does nothing when the row has no sixteenth note', async () => {
    await startWriting({ random: constant(0), difficulty: ONE_NOTE })
    await key('Digit2')

    await key('Digit5')

    expect(queryButton('Sixteenth note')).toBeNull()
    expect(pressedDurations()).toEqual(['Half note'])
  })

  it.each(['Period', 'NumpadDecimal'])('%s presses Dot, and again releases it', async (code) => {
    await startWriting({ random: constant(0), difficulty: DOTS })

    await key(code)
    expect(isPressed('Dot')).toBe(true)

    await key(code)
    expect(isPressed('Dot')).toBe(false)
  })

  it('a digit and the dot do nothing when the duration is not asked', async () => {
    await startWriting()

    await keys('Digit1', 'Period', 'ArrowUp')
    await enter()

    expect(queryButton('Whole note')).toBeNull()
    expect(status()).toBe('Correct')
  })
})

describe('the arrows left and right in Write notes (criterion 10)', () => {
  it('→ goes to the next note and ← back, as the buttons do', async () => {
    await startWriting({ random: DO_MI_SOL(), difficulty: SEVERAL })
    expect(currentColumn()).toEqual(['Note 1'])

    await key('ArrowRight')
    expect(currentColumn()).toEqual(['Note 2'])

    await key('ArrowRight')
    expect(currentColumn()).toEqual(['Note 3'])

    await key('ArrowLeft')
    expect(currentColumn()).toEqual(['Note 2'])
  })

  it('leave the focus where it was, not in the column of the note', async () => {
    await startWriting({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await key('ArrowRight')

    expect(document.activeElement?.getAttribute('role')).not.toBe('slider')
  })

  it('← does nothing on the first note, where Previous note is unavailable', async () => {
    await startWriting({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await key('ArrowLeft')

    expect(currentColumn()).toEqual(['Note 1'])
  })

  it('↑ then moves the note made current by →', async () => {
    await startWriting({ random: DO_MI_SOL(), difficulty: SEVERAL })

    await keys('ArrowRight', 'ArrowUp')

    expect(written('Note 1')).toBe('No note yet')
    expect(written('Note 2')).not.toBe('No note yet')
  })

  // The column with the focus goes to its neighbour itself; the page does not move a second time.
  it('go one note, not two, with the focus in the column', async () => {
    await startWriting({ random: DO_MI_SOL(), difficulty: SEVERAL })
    column('Note 1').focus()

    await key('ArrowRight')

    expect(currentColumn()).toEqual(['Note 2'])
  })
})

describe('Enter in Write notes (criterion 9)', () => {
  it('checks the note', async () => {
    await startWriting()
    await key('ArrowUp')

    await enter()

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 1 of 1')).not.toBeNull()
  })

  it.each(['Enter', 'NumpadEnter'])(
    '%s checks a wrong note to the second attempt',
    async (code) => {
      await startWriting()
      await keys('ArrowUp', 'ArrowUp')

      await enter(code)

      expect(status()).toBe('Incorrect. Try again.')
      expect(queryButton('Next')).toBeNull()
    },
  )

  it('asks for the note before it is written, as Check does', async () => {
    await startWriting()

    await enter()

    expect(status()).toBe('Place the note on the staff first')
  })

  it('moves the focus to Next once checked, as Check does', async () => {
    await startWriting()
    await key('ArrowUp')

    await enter()

    expect(document.activeElement).toBe(button('Next'))
  })

  it('opens the next question after the result', async () => {
    await startWriting()
    await key('ArrowUp')
    await enter()

    await enter()

    expect(screen.getByText(textOf('fa4'))).not.toBeNull()
    expect(written()).toBe('No note yet')
    expect(queryButton('Next')).toBeNull()
  })

  it('answers a question with the arrows and Enter alone', async () => {
    await startWriting({ random: constant(ON_B4) })

    await keys('ArrowUp', 'ArrowUp', 'ArrowUp')
    await enter()

    expect(written()).toBe('si4')
    expect(status()).toBe('Correct')
  })

  // The column with the focus checks on Enter itself; a second check would ask to change the note.
  it('checks once, not twice, with the focus in the column', async () => {
    await startWriting()
    await keys('ArrowUp', 'ArrowUp')
    column().focus()

    await key('Enter')

    expect(status()).toBe('Incorrect. Try again.')
  })

  it('in the quick mode checks and opens the next question, its result shown there', async () => {
    await startWriting({ more: quickMode })
    await key('ArrowUp')

    await enter()

    expect(screen.getByText(textOf('fa4'))).not.toBeNull()
    expect(status()).toBe('Correct')
  })
})

describe('the letters in Write notes (criterion 11)', () => {
  it.each(['KeyA', 'KeyS', 'KeyJ', 'KeyW', 'KeyU', 'KeyZ', 'KeyX'])(
    '%s does nothing and is left to the browser',
    async (code) => {
      await startWriting()

      const event = await key(code)

      expect(written()).toBe('No note yet')
      expect(event.defaultPrevented).toBe(false)
    },
  )
})

describe('a key before the staff is drawn in Write notes (edge case 2)', () => {
  it('does nothing while the answer buttons are not there', async () => {
    await startWriting({ drawing: 'held' })

    await keys('ArrowUp', 'Enter')
    drawStaff()
    await settle()

    expect(written()).toBe('No note yet')
    expect(status()).toBe('')
  })
})

describe('a key held down in Write notes (edge case 1)', () => {
  it('counts once: the repeats of ↑ leave the note a step up', async () => {
    await startWriting()
    await key('ArrowUp')

    await key('ArrowUp')
    await key('ArrowUp', { repeat: true })
    await key('ArrowUp', { repeat: true })

    expect(written()).toBe('la4')
  })
})

describe('Enter on a focused button in Write notes (criterion 9)', () => {
  it('Enter on Next with the focus is left to the button', async () => {
    await startWriting()
    await key('ArrowUp')
    await fireEvent.click(button('Check'))
    button('Next').focus()

    const event = await key('Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(screen.getByText(textOf('sol4'))).not.toBeNull()
  })
})
