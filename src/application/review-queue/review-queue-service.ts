import type { Grade, Question } from '@/domain/question'
import {
  dueItems,
  recordQuestion,
  reviewQueueOf,
  type ReviewItem,
  type ReviewQueue,
} from '@/domain/review-queue'
import type { Random } from '@/application/ports'

// A service of its own, so that spaced repetition across sessions can replace it (spec 7.3).
export interface ReviewQueueService {
  // The items the next question has to ask about.
  readonly due: readonly ReviewItem[]
  record(question: Question, firstGrade: Grade, secondGrade: Grade | null): void
}

export function createReviewQueueService(
  random: Random,
  items: readonly ReviewItem[] = [],
): ReviewQueueService {
  let queue: ReviewQueue = reviewQueueOf(items)
  return {
    get due() {
      return dueItems(queue)
    },

    record(question, firstGrade, secondGrade) {
      queue = recordQuestion(queue, question, firstGrade, secondGrade, () => random.next())
    },
  }
}
