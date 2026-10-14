import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import { createPreferences } from '@/application/preferences'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseShownDuration,
  createManualClock,
  DURATION_NAMES,
  DURATIONS,
  NAMES,
  preferencesFor,
  renderSession,
  renderSessionWith,
  startingOnC4,
  startSession,
  storageWithOneNoteReading,
} from '@/presentation/__tests__/screen'

// Feature design-system, slice 2, criteria 3, 8 and 12: the answer buttons of Read notes are keys
// of the design system. After a check a key carries its mark in data-mark: "rejected" for the
// choice rejected on the first attempt, "wrong" for the last choice when it is wrong, "correct" for
// the right choice on the review; the keys of the piano keyboard carry the same marks. A right
// answer marks nothing, as before. The descriptions of the marks for screen readers are covered by
// mistake-review.spec.ts and duration-input.spec.ts.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const markOf = (name: string) => button(name).getAttribute('data-mark')
// The names and the durations with a mark, by their marks.
const marked = (names: readonly string[]) =>
  Object.fromEntries(
    names
      .filter((name) => button(name).hasAttribute('data-mark'))
      .map((name) => [name, markOf(name)]),
  )

async function check() {
  await fireEvent.click(button('Check'))
}

// Question 1 is C4, a whole note: do and 1/1 are right.
async function startOnC4() {
  renderSession(startingOnC4())
  await startSession('No limit')
}

describe('the marks of the note names', () => {
  it('are none before the check', async () => {
    await startOnC4()

    expect(marked(NAMES)).toEqual({})
    expect(marked(DURATIONS)).toEqual({})
  })

  it('are none after a right answer', async () => {
    await startOnC4()
    await fireEvent.click(button('do'))
    await chooseShownDuration()

    await check()

    expect(marked(NAMES)).toEqual({})
    expect(marked(DURATIONS)).toEqual({})
  })

  it('mark the name rejected on the first attempt, which is disabled', async () => {
    await startOnC4()
    await fireEvent.click(button('mi'))
    await chooseShownDuration()

    await check()

    expect(marked(NAMES)).toEqual({ mi: 'rejected' })
    expect(button('mi').disabled).toBe(true)
    // The duration was right on the first attempt and stays as it is.
    expect(marked(DURATIONS)).toEqual({})
  })

  it('mark the rejected name, the wrong last one and the right one on the review', async () => {
    await startOnC4()
    await fireEvent.click(button('mi'))
    await chooseShownDuration()
    await check()

    await fireEvent.click(button('fa'))
    await check()

    expect(marked(NAMES)).toEqual({ mi: 'rejected', fa: 'wrong', do: 'correct' })
  })

  it('keep the rejected name marked when the second attempt is right', async () => {
    await startOnC4()
    await fireEvent.click(button('mi'))
    await chooseShownDuration()
    await check()

    await fireEvent.click(button('do'))
    await check()

    expect(markOf('mi')).toBe('rejected')
    expect(markOf('fa')).toBeNull()
  })

  it('are gone on the next question', async () => {
    await startOnC4()
    await fireEvent.click(button('mi'))
    await chooseShownDuration()
    await check()
    await fireEvent.click(button('fa'))
    await check()

    await fireEvent.click(button('Next'))

    expect(marked(NAMES)).toEqual({})
  })

  it('keep the names pressed as before: the chosen one alone', async () => {
    await startOnC4()

    await fireEvent.click(button('sol'))

    expect(button('sol').getAttribute('aria-pressed')).toBe('true')
    for (const name of NAMES.filter((name) => name !== 'sol'))
      expect(button(name).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('the marks of the durations', () => {
  it('mark the duration rejected on the first attempt', async () => {
    await startOnC4()
    await fireEvent.click(button('do'))
    await fireEvent.click(button(DURATION_NAMES.half))

    await check()

    expect(marked(DURATIONS)).toEqual({ [DURATION_NAMES.half]: 'rejected' })
    expect(marked(NAMES)).toEqual({})
  })

  it('mark the rejected duration, the wrong last one and the right one on the review', async () => {
    await startOnC4()
    await fireEvent.click(button('do'))
    await fireEvent.click(button(DURATION_NAMES.half))
    await check()

    await fireEvent.click(button(DURATION_NAMES.quarter))
    await check()

    expect(marked(DURATIONS)).toEqual({
      [DURATION_NAMES.half]: 'rejected',
      [DURATION_NAMES.quarter]: 'wrong',
      [DURATION_NAMES.whole]: 'correct',
    })
  })
})

describe('the marks of Sharp and Flat', () => {
  it('are none: a sign is no answer of its own', async () => {
    const storage = storageWithOneNoteReading()
    createPreferences(storage, ['en']).customize({ accidentals: 'sharp-and-flat' })
    renderSessionWith({
      random: startingOnC4(),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storage),
    })
    await startSession('No limit')
    await fireEvent.click(button('mi'))
    await chooseShownDuration()
    await check()
    await fireEvent.click(button('fa'))
    await check()

    for (const name of ['Sharp', 'Flat']) expect(button(name).hasAttribute('data-mark')).toBe(false)
  })
})

describe('the marks of the piano keys', () => {
  async function startOnKeys() {
    const storage = storageWithOneNoteReading()
    createPreferences(storage, ['en']).chooseNoteInput('keyboard')
    renderSessionWith({
      random: startingOnC4(),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en'], storage),
    })
    await startSession('No limit')
  }

  const keyboard = () => within(screen.getByRole('group', { name: 'Piano keyboard' }))
  const key = (name: string) => keyboard().getByRole<HTMLButtonElement>('button', { name })
  const markedKeys = () =>
    Object.fromEntries(
      keyboard()
        .getAllByRole('button')
        .filter((each) => each.hasAttribute('data-mark'))
        .map((each) => [each.getAttribute('aria-label'), each.getAttribute('data-mark')]),
    )

  it('mark the key rejected on the first attempt', async () => {
    await startOnKeys()
    await fireEvent.click(key('mi4'))
    await chooseShownDuration()

    await check()

    expect(markedKeys()).toEqual({ mi4: 'rejected' })
  })

  it('mark the rejected key, the wrong last one and the right one on the review', async () => {
    await startOnKeys()
    await fireEvent.click(key('mi4'))
    await chooseShownDuration()
    await check()

    await fireEvent.click(key('fa4'))
    await check()

    expect(markedKeys()).toEqual({ mi4: 'rejected', fa4: 'wrong', do4: 'correct' })
  })

  it('are none after a right answer', async () => {
    await startOnKeys()
    await fireEvent.click(key('do4'))
    await chooseShownDuration()

    await check()

    expect(markedKeys()).toEqual({})
  })
})
