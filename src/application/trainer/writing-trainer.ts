import { isSamePitch, type Pitch } from '@/domain/pitch'
import { gradeWriting, isRight, type Grade, type Question } from '@/domain/question'
import { canStepDown, canStepUp, nearestStep, stepDown, stepUp } from '@/domain/staff'
import type { Outcome } from './trainer'

// 'move-note': the note is still on the step rejected on the first attempt.
export type WritingHint = 'place-note' | 'move-note'

export interface WritingTrainerState {
  readonly question: Question
  readonly placed: Pitch | null
  // The note rejected on the first attempt, marked while the second one goes on.
  readonly wrongPitch: Pitch | null
  // Only the first attempt counts towards the score; the second one is for learning.
  readonly firstGrade: Grade | null
  readonly outcome: Outcome | null
  readonly hint: WritingHint | null
  readonly canStepUp: boolean
  readonly canStepDown: boolean
}

export interface WritingTrainer {
  readonly state: WritingTrainerState
  place(pitch: Pitch): void
  stepUp(): void
  stepDown(): void
  check(): void
  next(): void
}

export interface WritingTrainerOptions {
  // One attempt shows the right answer at once instead of offering a second one.
  readonly attempts: 1 | 2
}

type Progress = Omit<WritingTrainerState, 'canStepUp' | 'canStepDown'>

const opened = (question: Question): Progress => ({
  question,
  placed: null,
  wrongPitch: null,
  firstGrade: null,
  outcome: null,
  hint: null,
})

// The steps are the pitches a note may be written on, in ascending order.
export function createWritingTrainer(
  nextQuestion: () => Question,
  steps: readonly Pitch[],
  options: Partial<WritingTrainerOptions> = {},
): WritingTrainer {
  const { attempts }: WritingTrainerOptions = { attempts: 2, ...options }

  let progress = opened(nextQuestion())
  const isOver = (): boolean => progress.outcome !== null
  const update = (change: Partial<Progress>) => {
    progress = { ...progress, ...change }
  }

  const write = (pitch: Pitch) => {
    if (!isOver()) update({ placed: pitch, hint: null })
  }

  const grade = (placed: Pitch) => {
    const result = gradeWriting(progress.question, [placed])
    if (progress.firstGrade !== null) {
      update({ outcome: isRight(result) ? 'correct-second-try' : 'incorrect' })
    } else if (isRight(result)) {
      update({ firstGrade: result, outcome: 'correct' })
    } else {
      update({
        firstGrade: result,
        wrongPitch: placed,
        outcome: attempts === 1 ? 'incorrect' : null,
      })
    }
  }

  return {
    get state() {
      const { placed } = progress
      return {
        ...progress,
        canStepUp: !isOver() && canStepUp(placed, steps),
        canStepDown: !isOver() && canStepDown(placed, steps),
      }
    },

    place(pitch) {
      write(nearestStep(pitch, steps))
    },

    stepUp() {
      write(stepUp(progress.placed, steps))
    },

    stepDown() {
      write(stepDown(progress.placed, steps))
    },

    check() {
      if (isOver()) return
      const { placed, wrongPitch } = progress
      if (placed === null) update({ hint: 'place-note' })
      // As a rejected name in M1 cannot be chosen again: a second Check by mistake must not spend
      // the second attempt.
      else if (wrongPitch !== null && isSamePitch(placed, wrongPitch)) update({ hint: 'move-note' })
      else grade(placed)
    },

    next() {
      if (progress.firstGrade !== null) progress = opened(nextQuestion())
    },
  }
}
