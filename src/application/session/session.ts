import type { Letter } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { EMPTY_SCORE, isLastQuestion, recordGrade } from '@/domain/session'
import type { Score, SessionLength } from '@/domain/session'
import { createAutoAdvance } from '@/application/auto-advance'
import type { AutoAdvance } from '@/application/auto-advance'
import type { Clock, Scheduler } from '@/application/ports'
import { createTrainer } from '@/application/trainer'
import type { TrainerState } from '@/application/trainer'

export type SessionState =
  | { readonly phase: 'choosing' }
  | {
      readonly phase: 'question'
      readonly length: SessionLength
      readonly number: number
      readonly score: Score
      readonly isLast: boolean
      readonly trainer: TrainerState
    }
  | { readonly phase: 'results'; readonly score: Score }

export interface Session {
  readonly state: SessionState
  readonly autoAdvance: boolean
  setAutoAdvance(on: boolean): void
  noteDrawn(): void
  start(length: SessionLength): void
  select(letter: Letter): void
  check(): void
  next(): void
  finish(): void
  newSession(): void
}

interface Running {
  readonly length: SessionLength
  readonly questions: AutoAdvance
  number: number
  score: Score
  // Null until the staff has drawn the current note: loading time is not answer time.
  shownAt: number | null
}

type Phase =
  | { readonly kind: 'choosing' }
  | { readonly kind: 'question'; readonly run: Running }
  | { readonly kind: 'results'; readonly score: Score }

// The session gives auto-advance its own "next": the next question, or the results after
// the last one. Neither the trainer nor auto-advance knows about the session.
export function createSession(
  nextQuestion: () => Question,
  scheduler: Scheduler,
  clock: Clock,
  onAdvance: () => void,
): Session {
  let autoAdvance = false
  let phase: Phase = { kind: 'choosing' }

  const current = (): Running | null => (phase.kind === 'question' ? phase.run : null)

  const moveOn = (run: Running, trainerNext: () => void) => {
    if (isLastQuestion(run.length, run.number)) {
      phase = { kind: 'results', score: run.score }
      return
    }
    trainerNext()
    run.number += 1
    run.shownAt = null
  }

  return {
    get state(): SessionState {
      switch (phase.kind) {
        case 'choosing':
          return { phase: 'choosing' }
        case 'results':
          return { phase: 'results', score: phase.score }
        case 'question': {
          const { length, number, score, questions } = phase.run
          return {
            phase: 'question',
            length,
            number,
            score,
            isLast: isLastQuestion(length, number),
            trainer: questions.state,
          }
        }
      }
    },

    get autoAdvance() {
      return autoAdvance
    },

    setAutoAdvance(on) {
      autoAdvance = on
      current()?.questions.setEnabled(on)
    },

    start(length) {
      const trainer = createTrainer(nextQuestion)
      const run: Running = {
        length,
        number: 1,
        score: EMPTY_SCORE,
        shownAt: null,
        questions: createAutoAdvance(trainer, scheduler, {
          next: () => moveOn(run, () => trainer.next()),
          onAdvance,
        }),
      }
      run.questions.setEnabled(autoAdvance)
      phase = { kind: 'question', run }
    },

    noteDrawn() {
      const run = current()
      if (run && run.shownAt === null) run.shownAt = clock.now()
    },

    select(letter) {
      current()?.questions.select(letter)
    },

    check() {
      const run = current()
      if (!run) return
      const hadGrade = run.questions.state.grade !== null
      run.questions.check()
      const { grade } = run.questions.state
      if (!hadGrade && grade) {
        const elapsedMs = run.shownAt === null ? 0 : clock.now() - run.shownAt
        run.score = recordGrade(run.score, grade, elapsedMs)
      }
    },

    next() {
      current()?.questions.next()
    },

    finish() {
      const run = current()
      if (!run) return
      run.questions.cancel()
      phase = run.score.checked > 0 ? { kind: 'results', score: run.score } : { kind: 'choosing' }
    },

    newSession() {
      phase = { kind: 'choosing' }
    },
  }
}
