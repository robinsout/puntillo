import { describe, expect, it } from 'vitest'
import type { Pitch } from '@/domain/pitch'
import { createQuestion, type Duration, type Grade, type Note } from '@/domain/question'
import {
  dueItems,
  EMPTY_REVIEW_QUEUE,
  recordQuestion,
  type ReviewItem,
  type ReviewQueue,
} from '@/domain/review-queue'

// Feature review-queue, slice 2: questions of several notes. Each note of a question is an item
// of its own (criterion 1). When more items are due than a question can hold, the generator takes
// them in the order dueItems gives: an earlier deadline first, and among items of the same
// deadline the ones wrong in both attempts first (criterion 7). An item the questions could not
// take by its deadline stays due until one takes it, and then counts as returned (edge case 3).
//
// The deadline is the question the item was drawn to return on (review-queue.spec.ts): 0 draws
// the third question after the mistake, almost 1 the tenth, or the fifth when wrong twice.

const ALMOST_ONE = 1 - Number.EPSILON

const roll = (value: number) => () => value

// Gives the values in turn; an extra draw fails the test.
function rolls(...values: number[]): () => number {
  const queue = [...values]
  return () => {
    const value = queue.shift()
    if (value === undefined) throw new Error('no roll left')
    return value
  }
}

const NO_DRAW = () => {
  throw new Error('nothing to draw for')
}

const QUARTER: Duration = { value: 'quarter' }

const quarter = (letter: Pitch['letter']): Note => ({
  pitch: { letter, octave: 4 },
  duration: QUARTER,
})

const C4 = quarter('C')
const E4 = quarter('E')
const G4 = quarter('G')

const itemOf = ({ pitch, duration }: Note): ReviewItem => ({ pitch, duration })

const FILLER = createQuestion({ pitch: { letter: 'G', octave: 5 }, duration: { value: 'whole' } })

const RIGHT = { pitch: true, duration: true } as const
const WRONG = { pitch: false, duration: true } as const

const filler = (queue: ReviewQueue) => recordQuestion(queue, FILLER, [RIGHT], null, NO_DRAW)

const fillers = (queue: ReviewQueue, count: number) =>
  Array.from({ length: count }).reduce<ReviewQueue>(filler, queue)

// One note wrong in the first attempt; right in the second unless wrong twice.
const missed = (queue: ReviewQueue, note: Note, draw: () => number, twice = false) =>
  recordQuestion(queue, createQuestion(note), [WRONG], [twice ? WRONG : RIGHT], draw)

describe('review queue with questions of several notes', () => {
  describe('each note of a question (criterion 1)', () => {
    it('becomes an item of its own when wrong in the first attempt', () => {
      const asked = createQuestion(C4, E4, G4)
      const firstGrade: Grade = [WRONG, RIGHT, { pitch: true, duration: false }]

      const queue = fillers(recordQuestion(EMPTY_REVIEW_QUEUE, asked, firstGrade, null, roll(0)), 2)

      expect(dueItems(queue)).toHaveLength(2)
      expect(dueItems(queue)).toEqual(expect.arrayContaining([itemOf(C4), itemOf(G4)]))
    })

    it('draws the return of each wrong note on its own', () => {
      const asked = createQuestion(C4, E4)
      const queue = recordQuestion(
        EMPTY_REVIEW_QUEUE,
        asked,
        [WRONG, WRONG],
        null,
        rolls(0, ALMOST_ONE),
      )

      expect(dueItems(fillers(queue, 2))).toHaveLength(1)
      expect(dueItems(fillers(queue, 9))).toHaveLength(2)
    })

    it('counts a right answer on a queued item among other notes', () => {
      const queue = fillers(missed(EMPTY_REVIEW_QUEUE, C4, roll(0)), 2)
      const asked = createQuestion(E4, C4, G4)

      const once = recordQuestion(queue, asked, [RIGHT, RIGHT, RIGHT], null, roll(0))

      expect(dueItems(once)).toEqual([])
      expect(dueItems(fillers(once, 2))).toEqual([itemOf(C4)])
    })
  })

  describe('the order of the items due (criterion 7)', () => {
    it('gives an item of an earlier deadline first, though it was wrong later', () => {
      // C4 is drawn for the tenth question after its mistake, E4 for the third after its own.
      const first = missed(EMPTY_REVIEW_QUEUE, C4, roll(ALMOST_ONE))
      const both = missed(filler(first), E4, roll(0))

      const queue = fillers(both, 8)

      expect(dueItems(queue)).toEqual([itemOf(E4), itemOf(C4)])
    })

    it('gives an item of an earlier deadline first when it was wrong first', () => {
      const first = missed(EMPTY_REVIEW_QUEUE, C4, roll(0))
      const both = missed(first, E4, roll(0))

      expect(dueItems(fillers(both, 2))).toEqual([itemOf(C4), itemOf(E4)])
    })

    it('gives the item wrong twice first among items of the same deadline', () => {
      const asked = createQuestion(C4, E4)
      const queue = recordQuestion(
        EMPTY_REVIEW_QUEUE,
        asked,
        [WRONG, WRONG],
        [RIGHT, WRONG],
        roll(0),
      )

      expect(dueItems(fillers(queue, 2))).toEqual([itemOf(E4), itemOf(C4)])
    })

    it('keeps the order of the notes when the first one was wrong twice', () => {
      const asked = createQuestion(C4, E4)
      const queue = recordQuestion(
        EMPTY_REVIEW_QUEUE,
        asked,
        [WRONG, WRONG],
        [WRONG, RIGHT],
        roll(0),
      )

      expect(dueItems(fillers(queue, 2))).toEqual([itemOf(C4), itemOf(E4)])
    })

    it('puts an earlier deadline before an item wrong twice', () => {
      // E4 wrong twice is drawn for the fifth question after its mistake, C4 wrong once and
      // later for the third after its own: one question earlier.
      const first = missed(EMPTY_REVIEW_QUEUE, E4, roll(ALMOST_ONE), true)
      const both = missed(first, C4, roll(0))

      const queue = fillers(both, 3)

      expect(dueItems(queue)).toEqual([itemOf(C4), itemOf(E4)])
    })

    it('gives an item past its deadline before the ones just due', () => {
      const first = missed(EMPTY_REVIEW_QUEUE, G4, roll(0))
      // G4 is due from here on; the questions do not take it.
      const late = fillers(first, 2)
      const both = missed(late, C4, roll(0))

      expect(dueItems(fillers(both, 2))).toEqual([itemOf(G4), itemOf(C4)])
    })
  })

  describe('an item the questions could not take by its deadline (edge case 3)', () => {
    it('stays due, once, on every question after its deadline', () => {
      const due = fillers(missed(EMPTY_REVIEW_QUEUE, C4, roll(0)), 2)

      for (let after = 0; after <= 12; after++)
        expect(dueItems(fillers(due, after))).toEqual([itemOf(C4)])
    })

    it('counts as returned on the question that takes it', () => {
      const late = fillers(missed(EMPTY_REVIEW_QUEUE, C4, roll(0)), 6)

      const once = recordQuestion(late, createQuestion(E4, C4), [RIGHT, RIGHT], null, roll(0))

      expect(dueItems(fillers(once, 1))).toEqual([])
      expect(dueItems(fillers(once, 2))).toEqual([itemOf(C4)])
    })
  })
})
