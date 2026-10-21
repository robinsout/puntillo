import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { CounterEvent, KeyValueStorage, VisitCounter } from '@/application/ports'
import { LETTERS } from '@/domain/pitch'
import { visitCounterKey } from '@/presentation/dependencies/visit-counter-key'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseShownDuration,
  createManualClock,
  NAMES,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  startSession,
  storageWithOneNoteReading,
  storageWithPreset,
} from '@/presentation/__tests__/screen'

// Feature visit-counter, slice 2 of 3, criteria 2 and 3: Start and Practice only these count an
// event session with the exercise and the preset, the results an event summary with the exercise,
// the points and the points possible. Questions start on C4 (do), a whole note, then D4 (re)…

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const EN = {
  noLimit: 'No limit',
  check: 'Check',
  next: 'Next',
  finish: 'Finish',
  practice: 'Practice only these',
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const shownPitch = () => document.querySelector('[data-pitch]')?.getAttribute('data-pitch')

function rightName(): string {
  const letter = shownPitch()?.charAt(0)
  const name = NAMES[LETTERS.findIndex((each) => each === letter)]
  if (!name) throw new Error(`no note name for ${letter}`)
  return name
}

function fakeCounter() {
  const events: CounterEvent[] = []
  const counter: VisitCounter = {
    count(event) {
      events.push(event)
    },
  }
  return { counter, events }
}

async function start(storage: KeyValueStorage) {
  const { counter, events } = fakeCounter()
  const clock = createManualClock()
  renderSessionWith({
    random: startingOnC4(),
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor(['en'], storage),
    provides: { [visitCounterKey as symbol]: counter },
  })
  await startSession(EN.noLimit)
  return events
}

// Confident reading with one note: the name and the duration are asked, 2 points a note.
async function answerRight() {
  await press(rightName())
  await chooseShownDuration()
  await press(EN.check)
}

async function answerWrong() {
  const [first, second] = NAMES.filter((name) => name !== rightName())
  if (!first || !second) throw new Error('not enough wrong names')
  await press(first)
  await chooseShownDuration()
  await press(EN.check)
  await press(second)
  await press(EN.check)
}

describe('the visit counter on the trainer', () => {
  it('counts a session on Start, with the exercise and the preset chosen', async () => {
    const events = await start(storageWithPreset('first-steps'))

    expect(events).toEqual([{ name: 'session', exercise: 'read', preset: 'first-steps' }])
  })

  it('counts a session of a modified preset as custom, and its summary on Finish', async () => {
    const events = await start(storageWithOneNoteReading())
    await answerWrong()
    await press(EN.next)
    await answerRight()

    await press(EN.finish)

    expect(events).toEqual([
      { name: 'session', exercise: 'read', preset: 'custom' },
      { name: 'summary', exercise: 'read', score: 3, total: 4 },
    ])
  })

  it('counts a new session on Practice only these', async () => {
    const events = await start(storageWithOneNoteReading())
    await answerWrong()
    await press(EN.finish)

    await press(EN.practice)

    expect(events.at(-1)).toEqual({ name: 'session', exercise: 'read', preset: 'custom' })
    expect(events.filter(({ name }) => name === 'session')).toHaveLength(2)
  })
})
