import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { Random } from '@/application/ports'
import { LETTERS } from '@/domain/pitch'
import {
  startSession,
  chooseShownDuration,
  NAMES,
  renderSession,
} from '@/presentation/__tests__/screen'

// Feature review-queue, slice 1: a note wrong in both attempts comes back 3 to 5 questions later
// (criterion 4). The screen runs in Confident reading with one note in 4/4 (see preferencesFor).
//
// The seed is one with which the first note does not come again within the next five questions
// by chance, so only the queue can bring it back. Whatever the queue draws, the note is back by
// the sixth question: on its due question, or earlier by chance.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// mulberry32: a deterministic seeded generator.
function seeded(seed: number): Random {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

const SEED = 1

const staff = () => screen.getByRole('img', { name: 'Music staff' })
const shownNote = () =>
  `${staff().getAttribute('data-pitch')}/${staff().getAttribute('data-duration')}`
const button = (name: string) => screen.getByRole('button', { name })

// One note in Confident reading here: no signs, so the pitch is a letter and an octave.
function rightName(): string {
  const letter = staff().getAttribute('data-pitch')?.charAt(0)
  const name = NAMES[LETTERS.findIndex((each) => each === letter)]
  if (!name) throw new Error(`no note name for ${letter}`)
  return name
}

const wrongNames = () => NAMES.filter((name) => name !== rightName())

async function answerRight() {
  await fireEvent.click(button(rightName()))
  await chooseShownDuration()
  await fireEvent.click(button('Check'))
}

async function answerWrongTwice() {
  const [first, second] = wrongNames()
  if (!first || !second) throw new Error('not enough wrong names')
  await fireEvent.click(button(first))
  await chooseShownDuration()
  await fireEvent.click(button('Check'))
  await fireEvent.click(button(second))
  await fireEvent.click(button('Check'))
}

async function next() {
  await fireEvent.click(button('Next'))
}

describe('review queue on the screen', () => {
  it('brings a note wrong twice back within the next five questions', async () => {
    renderSession(seeded(SEED))
    await startSession('No limit')
    const missed = shownNote()
    await answerWrongTwice()
    await next()

    const later: string[] = []
    for (let question = 2; question <= 6; question++) {
      later.push(shownNote())
      await answerRight()
      await next()
    }

    expect(later).toContain(missed)
  })
})
