import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  createManualClock,
  preferencesFor,
  queryProgressBar,
  renderSessionWith,
  startingOnC4,
  startSession,
  storageWithOneNoteReading,
  storageWithQuickMode,
} from '@/presentation/__tests__/screen'
import type { IconName } from '@/presentation/ui'
import UiIcon from '@/presentation/ui/UiIcon.vue'

// Feature staff-progress-row, slice 3: under each passed note of the row a mark of its first
// attempt — the check of "right" or the cross of "wrong", right on the second try among the wrong
// ones (criterion 8). The marks are drawn for the eye only: the layer is hidden from screen readers,
// the staff keeps its name and the bar of the session its progress, and no mark takes the focus
// (criterion 14). The current question has no mark; questions of several notes have no row and no
// marks (edge case 1). In the quick mode a note answered passes with its mark at once (edge case 3).
//
// The lead's decision: the marks are UiIcon `check` and `cross`, laid over the staff by the places
// of the passed notes the staff reports when drawn (`layout.passed`), in the element that holds the
// staff. Their places on the screen are measured in a real browser (e2e/staff-row.spec.ts).
//
// The session runs in Confident reading with one note in 4/4, the duration asked: the questions
// alternate C4 (do), D4 (re), whole notes.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const staff = () => screen.getByRole('img', { name: 'Music staff' })

async function start(storage: KeyValueStorage = storageWithOneNoteReading()) {
  renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
  })
  await startSession('10')
}

const rightName = () => (staff().getAttribute('data-pitch') === 'C4' ? 'do' : 're')
const wrongName = () => (rightName() === 'do' ? 'mi' : 'fa')

async function answer(name: string) {
  await press(name)
  await press('1/1')
  await press('Check')
}

async function answerRight() {
  await answer(rightName())
}

// Wrong on the first attempt, right on the second.
async function answerWrongThenRight() {
  const right = rightName()
  await answer(wrongName())
  await answer(right)
}

async function goOn(...answers: (() => Promise<void>)[]) {
  for (const each of answers) {
    await each()
    await press('Next')
  }
}

function drawingOf(name: IconName): string {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(UiIcon, { name }) })
  app.mount(host)
  const drawing = host.querySelector('svg')?.innerHTML ?? ''
  app.unmount()
  return drawing
}

// The icons by the staff, in their order, the stub of the staff drawing none of its own.
const markIcons = () => [...(staff().parentElement?.querySelectorAll('svg') ?? [])]

const marks = () =>
  markIcons().map((icon) => {
    const drawing = icon.innerHTML
    if (drawing === drawingOf('check')) return '✓'
    if (drawing === drawingOf('cross')) return '✗'
    return '?'
  })

describe('the marks under the passed notes (criterion 8)', () => {
  it('are none on the first question of a row', async () => {
    await start()

    expect(markIcons()).toEqual([])
  })

  it('are none for the current question once it is checked', async () => {
    await start()

    await answerRight()

    expect(markIcons()).toEqual([])
  })

  it('give a check under a note answered right, in the order of the row', async () => {
    await start()

    await goOn(answerRight, answerRight, answerRight)

    expect(marks()).toEqual(['✓', '✓', '✓'])
  })

  it('give a cross under a note answered right on the second try', async () => {
    await start()

    await goOn(answerRight, answerWrongThenRight, answerRight)

    expect(marks()).toEqual(['✓', '✗', '✓'])
  })

  it('give a cross under a note answered wrong twice', async () => {
    await start()

    await goOn(async () => {
      await answer(wrongName())
      await answer(rightName() === 'do' ? 'sol' : 'la')
    })

    expect(marks()).toEqual(['✗'])
  })

  it('add the mark of the question passed, the current one still without', async () => {
    await start()
    await goOn(answerRight)
    expect(marks()).toEqual(['✓'])

    await answerWrongThenRight()
    expect(marks()).toEqual(['✓'])

    await press('Next')
    expect(marks()).toEqual(['✓', '✗'])
  })

  it('are gone on the first question of the next row', async () => {
    renderSessionWith({
      random: startingOnC4(),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storageWithOneNoteReading()),
    })
    await startSession('20')

    for (let index = 0; index < 10; index++) await goOn(answerRight)

    expect(queryProgressBar('Question 11 of 20')).not.toBeNull()
    expect(markIcons()).toEqual([])
  })

  it('give the mark at once in the quick mode (edge case 3)', async () => {
    await start(storageWithQuickMode())

    await press('1/1')
    await press('do')

    expect(staff().getAttribute('data-pitch')).toBe('D4')
    expect(marks()).toEqual(['✓'])
  })
})

describe('the marks and the screen reader (criterion 14)', () => {
  it('are hidden from screen readers, the layer of them all', async () => {
    await start()

    await goOn(answerRight, answerWrongThenRight)

    expect(markIcons()).toHaveLength(2)
    for (const icon of markIcons())
      expect(icon.parentElement?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('say nothing and take no focus: the staff keeps its name, the session its progress', async () => {
    await start()

    await goOn(answerRight, answerWrongThenRight)

    const holder = staff().parentElement as HTMLElement
    expect(holder.querySelectorAll('button, a, [tabindex]')).toHaveLength(0)
    expect(staff().getAttribute('aria-label')).toBe('Music staff')
    expect(queryProgressBar('Question 3 of 10')).not.toBeNull()
  })
})

// Edge case 1.
describe('no marks', () => {
  it('for questions of several notes', async () => {
    const storage = storageWithOneNoteReading()
    createPreferences(storage, ['en']).customize({ questionLength: 'two-to-four-notes' })
    await start(storage)

    expect(markIcons()).toEqual([])
  })
})
