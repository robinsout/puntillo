import { isSamePitch, type Pitch } from '../pitch'
import {
  isNoteRight,
  isSameDuration,
  type Duration,
  type Grade,
  type NoteGrade,
  type Question,
} from '../question'

// A note as written, without its key signature: it comes back with its own sign before it.
export interface ReviewItem {
  readonly pitch: Pitch
  readonly duration: Duration
}

interface Entry {
  readonly item: ReviewItem
  // The number of the question the item has to come back on.
  readonly dueOn: number
  readonly rightInRow: number
  // Whether the last mistake on the item was made in both attempts.
  readonly wrongTwice: boolean
}

// A plain value, so that a saved session can keep it as JSON.
export interface ReviewQueue {
  readonly asked: number
  readonly entries: readonly Entry[]
}

export const EMPTY_REVIEW_QUEUE: ReviewQueue = { asked: 0, entries: [] }

// Every item is due on the first question; the order of the items is the order they come due in.
export const reviewQueueOf = (items: readonly ReviewItem[]): ReviewQueue => ({
  asked: 0,
  entries: items.map((item) => ({ item, dueOn: 1, rightInRow: 0, wrongTwice: false })),
})

const FIRST_RETURN = 3
const RETURN_WINDOW = 8
const RETURN_WINDOW_WRONG_TWICE = 3
const RIGHT_IN_ROW_TO_LEAVE = 2

export const isSameItem = (one: ReviewItem, other: ReviewItem): boolean =>
  isSamePitch(one.pitch, other.pitch) && isSameDuration(one.duration, other.duration)

const byPriority = (one: Entry, other: Entry): number =>
  one.dueOn - other.dueOn || Number(other.wrongTwice) - Number(one.wrongTwice)

export const dueItems = (queue: ReviewQueue): ReviewItem[] =>
  queue.entries
    .filter((entry) => entry.dueOn <= queue.asked + 1)
    .sort(byPriority)
    .map((entry) => entry.item)

// roll() gives a number in [0, 1); it is drawn once for every return set.
export function recordQuestion(
  queue: ReviewQueue,
  question: Question,
  firstGrade: Grade,
  secondGrade: Grade | null,
  roll: () => number,
): ReviewQueue {
  const { notes } = question
  if (firstGrade.length !== notes.length || (secondGrade && secondGrade.length !== notes.length))
    throw new Error(`A grade of another question given to a question of ${notes.length} note(s)`)

  const asked = queue.asked + 1
  const returnWithin = (window: number) => asked + FIRST_RETURN + Math.floor(roll() * window)

  const entries = notes.reduce<readonly Entry[]>((current, { pitch, duration }, index) => {
    const item: ReviewItem = { pitch, duration }
    const queued = current.find((entry) => isSameItem(entry.item, item))
    const others = current.filter((entry) => entry !== queued)
    const first = firstGrade[index] as NoteGrade
    if (!isNoteRight(first)) {
      const second = secondGrade?.[index]
      const wrongTwice = second !== undefined && !isNoteRight(second)
      const window = wrongTwice ? RETURN_WINDOW_WRONG_TWICE : RETURN_WINDOW
      return [...others, { item, dueOn: returnWithin(window), rightInRow: 0, wrongTwice }]
    }
    if (!queued) return current
    const rightInRow = queued.rightInRow + 1
    if (rightInRow >= RIGHT_IN_ROW_TO_LEAVE) return others
    return [
      ...others,
      { item: queued.item, dueOn: returnWithin(RETURN_WINDOW), rightInRow, wrongTwice: false },
    ]
  }, queue.entries)

  return { asked, entries }
}
