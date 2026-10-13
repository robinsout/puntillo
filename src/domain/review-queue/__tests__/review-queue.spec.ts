import { describe, expect, it } from 'vitest'
import { isSamePitch, type Pitch } from '@/domain/pitch'
import {
  createQuestion,
  createQuestionOf,
  COMMON_TIME,
  isSameDuration,
  type Duration,
  type Grade,
  type Note,
  type Question,
} from '@/domain/question'
import {
  dueItems,
  EMPTY_REVIEW_QUEUE,
  recordQuestion,
  type ReviewItem,
  type ReviewQueue,
} from '@/domain/review-queue'

// Feature review-queue, slice 1: questions of one note. A note wrong in the first attempt becomes
// an item, a pitch as written and a duration (criterion 1). It is due a random number of questions
// after the mistake: 3 to 10, or 3 to 5 when the second attempt was wrong too (criteria 4 and 5).
// A right answer on a queued item, returned or met by chance, is the first of the two it needs;
// two in a row take it off the queue (criteria 8, 9 and 11). Only the first attempt counts as
// right or wrong (criterion 10).
//
// "Due on question k" means the generator has to put the item into question k. The roll gives a
// number in [0, 1) at the moment of the mistake; the window is picked from it as one of its whole
// numbers, by floor(roll × size), as the generator picks: 0 gives the earliest question,
// almost 1 the latest.

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

const C4_QUARTER: Note = { pitch: pitch('C', 4), duration: QUARTER }
const itemOf = ({ pitch, duration }: Note): ReviewItem => ({ pitch, duration })

// Never the note under test: answered right between the questions that matter.
const FILLER = createQuestion({ pitch: pitch('G', 5), duration: { value: 'whole' } })

const RIGHT: Grade = [{ pitch: true, duration: true }]
const WRONG_PITCH: Grade = [{ pitch: false, duration: true }]
const WRONG_DURATION: Grade = [{ pitch: true, duration: false }]
const WRONG_BOTH: Grade = [{ pitch: false, duration: false }]
// The duration is not asked.
const NAME_RIGHT: Grade = [{ pitch: true, duration: null }]
const NAME_WRONG: Grade = [{ pitch: false, duration: null }]

const question = (note: Note = C4_QUARTER): Question => createQuestion(note)

// Wrong in the first attempt and in the second.
const wrongTwice = (queue: ReviewQueue, asked: Question, draw: () => number = roll(0)) =>
  recordQuestion(queue, asked, WRONG_PITCH, WRONG_PITCH, draw)

// Wrong in the first attempt, right in the second.
const wrongThenRight = (queue: ReviewQueue, asked: Question, draw: () => number = roll(0)) =>
  recordQuestion(queue, asked, WRONG_PITCH, RIGHT, draw)

const right = (queue: ReviewQueue, asked: Question, draw: () => number = roll(0)) =>
  recordQuestion(queue, asked, RIGHT, null, draw)

const filler = (queue: ReviewQueue) => recordQuestion(queue, FILLER, RIGHT, null, NO_DRAW)

const fillers = (queue: ReviewQueue, count: number) =>
  Array.from({ length: count }).reduce<ReviewQueue>(filler, queue)

const hasDue = (queue: ReviewQueue, item: ReviewItem) =>
  dueItems(queue).some(
    (due) => isSamePitch(due.pitch, item.pitch) && isSameDuration(due.duration, item.duration),
  )

// How many questions after the last recorded one the item is first due: 3 means the third
// question after it. Null when it is not due within the next 30 questions, the fillers between
// answered right.
function dueIn(queue: ReviewQueue, item: ReviewItem = itemOf(C4_QUARTER)): number | null {
  let current = queue
  for (let questionsAfter = 1; questionsAfter <= 30; questionsAfter++) {
    if (hasDue(current, item)) return questionsAfter
    current = filler(current)
  }
  return null
}

// The queue as it stands when the item is due, the fillers before it answered right.
function untilDue(queue: ReviewQueue, item: ReviewItem = itemOf(C4_QUARTER)): ReviewQueue {
  const questionsAfter = dueIn(queue, item)
  if (questionsAfter === null) throw new Error('the item never comes due')
  return fillers(queue, questionsAfter - 1)
}

const mistake = (draw: () => number = roll(0), note: Note = C4_QUARTER) =>
  recordQuestion(EMPTY_REVIEW_QUEUE, question(note), WRONG_PITCH, null, draw)

describe('review queue', () => {
  describe('an empty queue', () => {
    it('has nothing due', () => {
      expect(dueItems(EMPTY_REVIEW_QUEUE)).toEqual([])
    })

    it('has nothing due after right answers', () => {
      expect(dueIn(right(EMPTY_REVIEW_QUEUE, question()))).toBeNull()
    })
  })

  describe('what becomes an item (criterion 1)', () => {
    it('takes a note wrong by its pitch', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), WRONG_PITCH, null, roll(0))

      expect(dueIn(queue)).toBe(3)
    })

    it('takes a note wrong by its duration only', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), WRONG_DURATION, null, roll(0))

      expect(dueIn(queue)).toBe(3)
    })

    it('takes a note wrong by both', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), WRONG_BOTH, null, roll(0))

      expect(dueIn(queue)).toBe(3)
    })

    it('takes no note answered right', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), RIGHT, null, NO_DRAW)

      expect(dueIn(queue)).toBeNull()
    })

    it('is the pitch and the duration of the note, nothing else', () => {
      const queue = untilDue(mistake())

      expect(dueItems(queue)).toEqual([{ pitch: pitch('C', 4), duration: QUARTER }])
    })

    it('keeps the pitch as written: its letter, octave and alteration', () => {
      const cSharp: Note = { pitch: pitch('C', 4, 1), duration: HALF, accidental: 'sharp' }

      const queue = untilDue(mistake(roll(0), cSharp), itemOf(cSharp))

      expect(dueItems(queue)).toEqual([{ pitch: pitch('C', 4, 1), duration: HALF }])
    })

    it('keeps a dotted duration dotted', () => {
      const dotted: Note = { pitch: pitch('E', 4), duration: { value: 'quarter', dots: 1 } }

      const queue = untilDue(mistake(roll(0), dotted), itemOf(dotted))

      expect(dueItems(queue)).toEqual([itemOf(dotted)])
    })

    it('takes the duration from the question when the duration is not asked', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), NAME_WRONG, null, roll(0))

      expect(dueItems(untilDue(queue))).toEqual([{ pitch: pitch('C', 4), duration: QUARTER }])
    })

    it('takes no note whose name is right when the duration is not asked', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), NAME_RIGHT, null, NO_DRAW)

      expect(dueIn(queue)).toBeNull()
    })

    it('never takes a rest, only the note of the question', () => {
      const withRest = createQuestionOf(COMMON_TIME, [
        { duration: HALF },
        C4_QUARTER,
        { duration: QUARTER },
      ])

      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, withRest, WRONG_PITCH, null, roll(0))

      expect(dueItems(untilDue(queue))).toEqual([itemOf(C4_QUARTER)])
    })

    it.each<[string, Note]>([
      ['another duration', { pitch: pitch('C', 4), duration: HALF }],
      ['another octave', { pitch: pitch('C', 5), duration: QUARTER }],
      ['the same sound written otherwise', { pitch: pitch('B', 3, 1), duration: QUARTER }],
      ['another alteration', { pitch: pitch('C', 4, 1), duration: QUARTER }],
    ])('tells the item from a note of %s', (_, other) => {
      const queue = untilDue(mistake())

      expect(hasDue(queue, itemOf(other))).toBe(false)
    })
  })

  describe('when the item returns (criteria 4 and 5)', () => {
    it('is not due on the first two questions after the mistake', () => {
      const queue = mistake(roll(0))

      expect(hasDue(queue, itemOf(C4_QUARTER))).toBe(false)
      expect(hasDue(filler(queue), itemOf(C4_QUARTER))).toBe(false)
    })

    it('is due 3 questions after the mistake at the earliest', () => {
      expect(dueIn(mistake(roll(0)))).toBe(3)
    })

    it('is due 10 questions after the mistake at the latest', () => {
      expect(dueIn(mistake(roll(ALMOST_ONE)))).toBe(10)
    })

    it.each([0, 1, 2, 3, 4, 5, 6, 7])(
      'picks each of the eight questions 3 to 10 alike: roll step %i of 8',
      (step) => {
        expect(dueIn(mistake(roll(step / 8)))).toBe(3 + step)
      },
    )

    it('draws the question at the moment of the mistake, once', () => {
      let draws = 0
      const counted = () => {
        draws += 1
        return 0
      }

      const queue = mistake(counted)
      expect(draws).toBe(1)

      dueIn(queue)
      expect(draws).toBe(1)
    })

    describe('wrong in the second attempt too', () => {
      it('is due 3 questions after at the earliest', () => {
        expect(dueIn(wrongTwice(EMPTY_REVIEW_QUEUE, question(), roll(0)))).toBe(3)
      })

      it('is due 5 questions after at the latest', () => {
        expect(dueIn(wrongTwice(EMPTY_REVIEW_QUEUE, question(), roll(ALMOST_ONE)))).toBe(5)
      })

      it.each([0, 1, 2])(
        'picks each of the three questions 3 to 5 alike: roll step %i of 3',
        (step) => {
          expect(dueIn(wrongTwice(EMPTY_REVIEW_QUEUE, question(), roll(step / 3)))).toBe(3 + step)
        },
      )
    })

    it('returns within 3 to 10 when the second attempt is right', () => {
      expect(dueIn(wrongThenRight(EMPTY_REVIEW_QUEUE, question(), roll(ALMOST_ONE)))).toBe(10)
    })

    it('returns within 3 to 10 when there was no second attempt', () => {
      const queue = recordQuestion(
        EMPTY_REVIEW_QUEUE,
        question(),
        WRONG_PITCH,
        null,
        roll(ALMOST_ONE),
      )

      expect(dueIn(queue)).toBe(10)
    })

    it('stays due on the questions after its own until it is asked (criterion 6)', () => {
      const due = untilDue(mistake())

      expect(hasDue(filler(due), itemOf(C4_QUARTER))).toBe(true)
      expect(hasDue(fillers(due, 5), itemOf(C4_QUARTER))).toBe(true)
    })
  })

  describe('the same note again (criterion 3)', () => {
    it('is one item however many times it is wrong', () => {
      const once = mistake(roll(0))
      const twice = recordQuestion(filler(once), question(), WRONG_PITCH, null, roll(0))

      expect(dueItems(untilDue(twice))).toEqual([itemOf(C4_QUARTER)])
    })

    it('takes its return from the latest mistake', () => {
      const once = mistake(roll(0))
      // Met by chance on the next question, before it was due, and wrong again.
      const twice = recordQuestion(once, question(), WRONG_PITCH, null, roll(ALMOST_ONE))

      expect(dueIn(twice)).toBe(10)
    })

    it('keeps a note of another spelling as an item of its own', () => {
      const dFlat: Note = { pitch: pitch('D', 4, -1), duration: QUARTER, accidental: 'flat' }
      const cSharp: Note = { pitch: pitch('C', 4, 1), duration: QUARTER, accidental: 'sharp' }
      const first = mistake(roll(0), cSharp)
      const both = recordQuestion(first, question(dFlat), WRONG_PITCH, null, roll(0))

      const queue = fillers(both, 3)

      expect(dueItems(queue)).toHaveLength(2)
      expect(hasDue(queue, itemOf(cSharp))).toBe(true)
      expect(hasDue(queue, itemOf(dFlat))).toBe(true)
    })
  })

  describe('when the item leaves (criteria 8 to 11)', () => {
    it('stays after one right answer and returns 3 questions later at the earliest', () => {
      const once = right(untilDue(mistake()), question(), roll(0))

      expect(dueIn(once)).toBe(3)
    })

    it('returns 10 questions after one right answer at the latest', () => {
      const once = right(untilDue(mistake()), question(), roll(ALMOST_ONE))

      expect(dueIn(once)).toBe(10)
    })

    it('leaves after the second right answer in a row', () => {
      const once = right(untilDue(mistake()), question())
      const twice = recordQuestion(untilDue(once), question(), RIGHT, null, NO_DRAW)

      expect(dueIn(twice)).toBeNull()
    })

    it('counts a right name as right when the duration is not asked', () => {
      const queue = recordQuestion(EMPTY_REVIEW_QUEUE, question(), NAME_WRONG, null, roll(0))
      const once = recordQuestion(untilDue(queue), question(), NAME_RIGHT, null, roll(0))
      const twice = recordQuestion(untilDue(once), question(), NAME_RIGHT, null, NO_DRAW)

      expect(dueIn(twice)).toBeNull()
    })

    it('starts the count over after a wrong answer', () => {
      const once = right(untilDue(mistake()), question())
      const wrongAgain = recordQuestion(untilDue(once), question(), WRONG_PITCH, null, roll(0))
      const rightAgain = right(untilDue(wrongAgain), question())

      expect(dueIn(rightAgain)).toBe(3)
    })

    it('returns within 3 to 10 after a wrong answer on the returned item', () => {
      const once = right(untilDue(mistake()), question())
      const wrongAgain = recordQuestion(
        untilDue(once),
        question(),
        WRONG_PITCH,
        null,
        roll(ALMOST_ONE),
      )

      expect(dueIn(wrongAgain)).toBe(10)
    })

    it('returns within 3 to 5 when the returned item is wrong in both attempts', () => {
      const wrongAgain = wrongTwice(untilDue(mistake()), question(), roll(ALMOST_ONE))

      expect(dueIn(wrongAgain)).toBe(5)
    })

    describe('only the first attempt counts (criterion 10)', () => {
      it('takes a returned item right only in the second attempt as wrong', () => {
        const once = right(untilDue(mistake()), question())
        const secondTry = wrongThenRight(untilDue(once), question(), roll(ALMOST_ONE))

        expect(dueIn(secondTry)).toBe(10)
      })

      it('needs two right first attempts in a row after it', () => {
        const once = right(untilDue(mistake()), question())
        const secondTry = wrongThenRight(untilDue(once), question())
        const rightAgain = right(untilDue(secondTry), question())

        expect(dueIn(rightAgain)).toBe(3)
      })
    })

    describe('the note met by chance, not by the queue (criterion 11)', () => {
      it('counts a right answer before the item is due', () => {
        // Due 3 questions after the mistake, met right on the next one.
        const met = right(mistake(roll(0)), question(), roll(ALMOST_ONE))

        expect(dueIn(met)).toBe(10)
      })

      it('takes the item off after two right answers met by chance', () => {
        const met = right(mistake(roll(0)), question())
        const metAgain = recordQuestion(met, question(), RIGHT, null, NO_DRAW)

        expect(dueIn(metAgain)).toBeNull()
      })

      it('counts a right answer by chance after a right return', () => {
        const once = right(untilDue(mistake()), question())
        const metAgain = recordQuestion(filler(once), question(), RIGHT, null, NO_DRAW)

        expect(dueIn(metAgain)).toBeNull()
      })
    })
  })

  describe('as a value', () => {
    it('is not changed by recording a question', () => {
      const before = mistake()
      const snapshot = JSON.stringify(before)

      wrongTwice(before, question())
      right(before, question())

      expect(JSON.stringify(before)).toBe(snapshot)
    })

    it('survives a round trip through JSON, as a saved session will need', () => {
      const queue = filler(mistake(roll(3 / 8)))

      const restored: ReviewQueue = JSON.parse(JSON.stringify(queue))

      expect(restored).toEqual(queue)
      expect(dueIn(restored)).toBe(dueIn(queue))
    })
  })

  describe('a grade of another question', () => {
    it('is refused in the first attempt', () => {
      expect(() =>
        recordQuestion(EMPTY_REVIEW_QUEUE, question(), [...RIGHT, ...RIGHT], null, NO_DRAW),
      ).toThrow(/^A grade of another question given to a question of 1 note/)
    })

    it('is refused in the second attempt', () => {
      expect(() =>
        recordQuestion(EMPTY_REVIEW_QUEUE, question(), WRONG_PITCH, [], NO_DRAW),
      ).toThrow(/^A grade of another question given to a question of 1 note/)
    })
  })
})
