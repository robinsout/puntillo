import { describe, expect, it } from 'vitest'
import type { Random } from '@/application/ports'
import { createReviewQueueService, type ReviewQueueService } from '@/application/review-queue'
import { isSamePitch } from '@/domain/pitch'
import {
  createQuestion,
  isSameDuration,
  type Grade,
  type Note,
  type Question,
} from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

// Feature review-queue, slice 1: the queue as a service of its own with an explicit interface, so
// that it can be replaced by spaced repetition across sessions without changing the rest (spec
// 7.3). Its rules are the domain's (domain/review-queue); here the random source picks the return.

const ALMOST_ONE = 1 - Number.EPSILON

const constant = (value: number): Random => ({ next: () => value })

const C4_QUARTER: Note = { pitch: { letter: 'C', octave: 4 }, duration: { value: 'quarter' } }
const ASKED = createQuestion(C4_QUARTER)
const FILLER = createQuestion({ pitch: { letter: 'G', octave: 5 }, duration: { value: 'whole' } })

const RIGHT: Grade = [{ pitch: true, duration: true }]
const WRONG: Grade = [{ pitch: false, duration: true }]

function answerFillers(queue: ReviewQueueService, count: number) {
  for (let index = 0; index < count; index++) queue.record(FILLER, RIGHT, null)
}

// How many questions after the last recorded one the note is first due, the questions between
// answered right; null when not within 30.
function dueIn(queue: ReviewQueueService, asked: Question = ASKED): number | null {
  for (let questionsAfter = 1; questionsAfter <= 30; questionsAfter++) {
    const [note] = asked.notes
    const isNote = (item: ReviewItem) =>
      isSamePitch(item.pitch, note.pitch) && isSameDuration(item.duration, note.duration)
    if (queue.due.some(isNote)) return questionsAfter
    queue.record(FILLER, RIGHT, null)
  }
  return null
}

describe('review queue service', () => {
  it('starts with nothing due', () => {
    expect(createReviewQueueService(constant(0)).due).toEqual([])
  })

  it('brings a wrong note back 3 questions later when the source gives 0', () => {
    const queue = createReviewQueueService(constant(0))

    queue.record(ASKED, WRONG, null)

    expect(dueIn(queue)).toBe(3)
  })

  it('brings a wrong note back 10 questions later when the source gives almost 1', () => {
    const queue = createReviewQueueService(constant(ALMOST_ONE))

    queue.record(ASKED, WRONG, null)

    expect(dueIn(queue)).toBe(10)
  })

  it('brings a note wrong twice back within 5 questions', () => {
    const queue = createReviewQueueService(constant(ALMOST_ONE))

    queue.record(ASKED, WRONG, WRONG)

    expect(dueIn(queue)).toBe(5)
  })

  it('lists the due note as its pitch and duration', () => {
    const queue = createReviewQueueService(constant(0))
    queue.record(ASKED, WRONG, null)

    answerFillers(queue, 2)

    expect(queue.due).toEqual([
      { pitch: { letter: 'C', octave: 4 }, duration: { value: 'quarter' } },
    ])
  })

  it('lets the note go after two right answers in a row', () => {
    const queue = createReviewQueueService(constant(0))
    queue.record(ASKED, WRONG, null)
    answerFillers(queue, 2)
    queue.record(ASKED, RIGHT, null)
    answerFillers(queue, 2)

    queue.record(ASKED, RIGHT, null)

    expect(dueIn(queue)).toBeNull()
  })

  it('keeps two services apart', () => {
    const first = createReviewQueueService(constant(0))
    const second = createReviewQueueService(constant(0))

    first.record(ASKED, WRONG, null)

    expect(dueIn(second)).toBeNull()
  })
})

// Feature session-summary, slice 3: a service made with the items of Most mistakes has them all
// due on the first question, in the order of the list (criterion 11); from then on they are items
// like any other (criterion 12).
describe('review queue service filled beforehand', () => {
  const D4_HALF: ReviewItem = { pitch: { letter: 'D', octave: 4 }, duration: { value: 'half' } }
  const C4: ReviewItem = { pitch: C4_QUARTER.pitch, duration: C4_QUARTER.duration }

  it('has every given item due at once, in the given order', () => {
    const queue = createReviewQueueService(constant(0), [D4_HALF, C4])

    expect(queue.due).toEqual([D4_HALF, C4])
  })

  it('starts with nothing due when given no items', () => {
    expect(createReviewQueueService(constant(0), []).due).toEqual([])
  })

  it('keeps an item due until a question asks about it', () => {
    const queue = createReviewQueueService(constant(0), [D4_HALF, C4])

    answerFillers(queue, 3)

    expect(queue.due).toEqual([D4_HALF, C4])
  })

  it('brings an item answered right back 3 questions later, then lets it go', () => {
    const queue = createReviewQueueService(constant(0), [C4])

    queue.record(ASKED, RIGHT, null)
    expect(dueIn(queue)).toBe(3)
    queue.record(ASKED, RIGHT, null)

    expect(dueIn(queue)).toBeNull()
  })

  it('brings an item answered wrong back by the rules of a mistake', () => {
    const queue = createReviewQueueService(constant(ALMOST_ONE), [C4])

    queue.record(ASKED, WRONG, WRONG)

    expect(dueIn(queue)).toBe(5)
  })

  it('keeps two services filled with the same items apart', () => {
    const first = createReviewQueueService(constant(0), [C4])
    const second = createReviewQueueService(constant(0), [C4])

    first.record(ASKED, RIGHT, null)

    expect(second.due).toEqual([C4])
  })
})
