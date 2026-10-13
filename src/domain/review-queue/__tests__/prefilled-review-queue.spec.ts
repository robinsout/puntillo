import { describe, expect, it } from 'vitest'
import type { Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  createQuestion,
  createQuestionOf,
  type Duration,
  type Grade,
  type Note,
  type Question,
} from '@/domain/question'
import {
  dueItems,
  isSameItem,
  recordQuestion,
  reviewQueueOf,
  type ReviewItem,
  type ReviewQueue,
} from '@/domain/review-queue'

// Feature session-summary, slice 3: Practice only these starts a session whose review queue is
// filled beforehand with the items of Most mistakes, every one of them due, in the order of the
// list, from the first question on (criterion 11). From then on they are items like any other
// (criterion 12): one answered right comes back 3 to 10 questions later and leaves after the second
// right answer in a row; one answered wrong comes back by the rules of a mistake; one the question
// could not take waits for the next question (feature review-queue, criterion 6).

const ALMOST_ONE = 1 - Number.EPSILON

const roll = (value: number) => () => value

// Only a mistake or a queued item draws: a draw anywhere else fails the test.
const NO_DRAW = () => {
  throw new Error('nothing to draw for')
}

const pitch = (letter: Pitch['letter'], octave: number, alteration?: Pitch['alteration']): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const QUARTER: Duration = { value: 'quarter' }
const HALF: Duration = { value: 'half' }

const F_SHARP4_QUARTER: Note = { pitch: pitch('F', 4, 1), duration: QUARTER }
const D4_HALF: Note = { pitch: pitch('D', 4), duration: HALF }
const B_FLAT4_QUARTER: Note = { pitch: pitch('B', 4, -1), duration: QUARTER }
const E5_QUARTER: Note = { pitch: pitch('E', 5), duration: QUARTER }

const itemOf = ({ pitch, duration }: Note): ReviewItem => ({ pitch, duration })

// Most mistakes as the results list it: F♯4 a quarter, D4 a half, B♭4 a quarter.
const LIST: readonly ReviewItem[] = [F_SHARP4_QUARTER, D4_HALF, B_FLAT4_QUARTER].map(itemOf)
const [FIRST, SECOND, THIRD] = LIST as [ReviewItem, ReviewItem, ReviewItem]

// Never an item of the list: answered right between the questions that matter.
const FILLER = createQuestion({ pitch: pitch('G', 5), duration: { value: 'whole' } })

const RIGHT: Grade = [{ pitch: true, duration: true }]
const WRONG: Grade = [{ pitch: false, duration: true }]

const question = (note: Note): Question => createQuestion(note)

const filler = (queue: ReviewQueue) => recordQuestion(queue, FILLER, RIGHT, null, NO_DRAW)

const fillers = (queue: ReviewQueue, count: number) =>
  Array.from({ length: count }).reduce<ReviewQueue>(filler, queue)

// The first question of the session asks about the first item of the list.
const firstAnswered = (grade: Grade, second: Grade | null = null, draw = roll(0)) =>
  recordQuestion(reviewQueueOf(LIST), question(F_SHARP4_QUARTER), grade, second, draw)

const isDue = (queue: ReviewQueue, item: ReviewItem) =>
  dueItems(queue).some((due) => isSameItem(due, item))

// How many questions after the last recorded one the item is first due, the fillers between
// answered right; null when not within 30.
function dueIn(queue: ReviewQueue, item: ReviewItem): number | null {
  let current = queue
  for (let questionsAfter = 1; questionsAfter <= 30; questionsAfter++) {
    if (isDue(current, item)) return questionsAfter
    current = filler(current)
  }
  return null
}

describe('a review queue filled beforehand with the items of Most mistakes', () => {
  describe('on the first question (criterion 11)', () => {
    it('has every item of the list due, in the order of the list', () => {
      expect(dueItems(reviewQueueOf(LIST))).toEqual(LIST)
    })

    it('keeps the order of the list whatever the items', () => {
      const reversed = [...LIST].reverse()

      expect(dueItems(reviewQueueOf(reversed))).toEqual(reversed)
    })

    it('has one item due when the list has one', () => {
      expect(dueItems(reviewQueueOf([FIRST]))).toEqual([FIRST])
    })

    it('has nothing due when the list is empty', () => {
      expect(dueItems(reviewQueueOf([]))).toEqual([])
    })

    it('counts the questions from the first: a mistake on it comes back on the fourth', () => {
      const queue = recordQuestion(reviewQueueOf([]), question(E5_QUARTER), WRONG, null, roll(0))

      expect(dueIn(queue, itemOf(E5_QUARTER))).toBe(3)
    })
  })

  describe('an item the question did not take (feature review-queue, criterion 6)', () => {
    it('waits for the next question, the items still in the order of the list', () => {
      const queue = filler(reviewQueueOf(LIST))

      expect(dueItems(queue)).toEqual(LIST)
    })

    it('stays due question after question until a question takes it', () => {
      const queue = fillers(reviewQueueOf(LIST), 12)

      expect(dueItems(queue)).toEqual(LIST)
    })

    it('leaves the rest of the list due after the first item is asked', () => {
      const queue = firstAnswered(RIGHT)

      expect(dueItems(queue)).toEqual([SECOND, THIRD])
    })

    it('leaves the rest due when a question of several notes takes two of them', () => {
      const asked = createQuestionOf(COMMON_TIME, [F_SHARP4_QUARTER, B_FLAT4_QUARTER])

      const queue = recordQuestion(reviewQueueOf(LIST), asked, [...RIGHT, ...RIGHT], null, roll(0))

      expect(dueItems(queue)).toEqual([SECOND])
    })

    it('goes before a later mistake whose return comes while it still waits', () => {
      const mistake = recordQuestion(
        reviewQueueOf(LIST),
        question(E5_QUARTER),
        WRONG,
        null,
        roll(0),
      )

      const queue = fillers(mistake, 2)

      expect(dueItems(queue)).toEqual([...LIST, itemOf(E5_QUARTER)])
    })
  })

  describe('an item answered right (criterion 12)', () => {
    it('comes back 3 questions later at the earliest', () => {
      expect(dueIn(firstAnswered(RIGHT, null, roll(0)), FIRST)).toBe(3)
    })

    it('comes back 10 questions later at the latest', () => {
      expect(dueIn(firstAnswered(RIGHT, null, roll(ALMOST_ONE)), FIRST)).toBe(10)
    })

    it('leaves after the second right answer in a row', () => {
      const back = fillers(firstAnswered(RIGHT), 2)
      expect(isDue(back, FIRST)).toBe(true)

      const queue = recordQuestion(back, question(F_SHARP4_QUARTER), RIGHT, null, NO_DRAW)

      expect(dueIn(queue, FIRST)).toBeNull()
    })
  })

  describe('an item answered wrong (criterion 12)', () => {
    it('comes back 3 to 10 questions later as a new mistake', () => {
      expect(dueIn(firstAnswered(WRONG, RIGHT, roll(0)), FIRST)).toBe(3)
      expect(dueIn(firstAnswered(WRONG, RIGHT, roll(ALMOST_ONE)), FIRST)).toBe(10)
    })

    it('comes back within 5 questions when wrong twice', () => {
      expect(dueIn(firstAnswered(WRONG, WRONG, roll(ALMOST_ONE)), FIRST)).toBe(5)
    })

    it('needs two right answers in a row after it to leave', () => {
      const back = fillers(firstAnswered(WRONG), 2)

      const once = recordQuestion(back, question(F_SHARP4_QUARTER), RIGHT, null, roll(0))

      expect(dueIn(once, FIRST)).toBe(3)
    })
  })
})
