import type { Grade, Question } from '@/domain/question'
import {
  dueItems,
  EMPTY_REVIEW_QUEUE,
  recordQuestion,
  type ReviewItem,
  type ReviewQueue,
} from '@/domain/review-queue'
import type { Random } from '@/application/ports'

// A service of its own, so that spaced repetition across sessions can replace it (spec 7.3).
export interface ReviewQueueService {
  // The items the next question has to ask about.
  readonly due: readonly ReviewItem[]
  // A plain value, so that a session not finished can keep it.
  readonly queue: ReviewQueue
  record(question: Question, firstGrade: Grade, secondGrade: Grade | null): void
}

export function createReviewQueueService(
  random: Random,
  given: ReviewQueue = EMPTY_REVIEW_QUEUE,
): ReviewQueueService {
  let queue = given
  return {
    get due() {
      return dueItems(queue)
    },

    get queue() {
      return queue
    },

    record(question, firstGrade, secondGrade) {
      queue = recordQuestion(queue, question, firstGrade, secondGrade, () => random.next())
    },
  }
}
