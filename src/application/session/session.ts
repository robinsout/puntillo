import type { Letter } from '@/domain/pitch'
import type { Grade, Question } from '@/domain/question'
import { EMPTY_SCORE, isLastQuestion, recordGrade } from '@/domain/session'
import type { Score, SessionLength } from '@/domain/session'
import type { Clock } from '@/application/ports'
import { createTrainer } from '@/application/trainer'
import type { Trainer, TrainerState } from '@/application/trainer'

export type SessionState =
  | { readonly phase: 'choosing' }
  | {
      readonly phase: 'question'
      readonly length: SessionLength
      readonly number: number
      readonly score: Score
      readonly isLast: boolean
      readonly trainer: TrainerState
      // In the quick mode the result of an answer is shown on the question after it.
      readonly previousGrade: Grade | null
    }
  | { readonly phase: 'results'; readonly score: Score }

export interface Session {
  readonly state: SessionState
  readonly autoAdvance: boolean
  setAutoAdvance(on: boolean): void
  readonly showAnswerAtOnce: boolean
  setShowAnswerAtOnce(on: boolean): void
  noteDrawn(): void
  start(length: SessionLength): void
  select(letter: Letter): void
  check(): void
  answer(letter: Letter): void
  next(): void
  finish(): void
  newSession(): void
}

interface Running {
  readonly length: SessionLength
  readonly trainer: Trainer
  number: number
  score: Score
  previousGrade: Grade | null
  // Null until the staff has drawn the current note: loading time is not answer time.
  shownAt: number | null
}

type Phase =
  | { readonly kind: 'choosing' }
  | { readonly kind: 'question'; readonly run: Running }
  | { readonly kind: 'results'; readonly score: Score }

// The quick mode lives here, not in the trainer: the trainer only grades one question.
export function createSession(nextQuestion: () => Question, clock: Clock): Session {
  let autoAdvance = false
  let showAnswerAtOnce = false
  let phase: Phase = { kind: 'choosing' }

  const current = (): Running | null => (phase.kind === 'question' ? phase.run : null)

  const check = (run: Running) => {
    const wasGraded = run.trainer.state.firstGrade !== null
    run.trainer.check()
    const { firstGrade } = run.trainer.state
    if (!wasGraded && firstGrade) {
      const elapsedMs = run.shownAt === null ? 0 : clock.now() - run.shownAt
      run.score = recordGrade(run.score, firstGrade, elapsedMs)
    }
  }

  const moveOn = (run: Running, previousGrade: Grade | null) => {
    if (isLastQuestion(run.length, run.number)) {
      phase = { kind: 'results', score: run.score }
      return
    }
    run.trainer.next()
    run.number += 1
    run.shownAt = null
    run.previousGrade = previousGrade
  }

  return {
    get state(): SessionState {
      switch (phase.kind) {
        case 'choosing':
          return { phase: 'choosing' }
        case 'results':
          return { phase: 'results', score: phase.score }
        case 'question': {
          const { length, number, score, trainer, previousGrade } = phase.run
          return {
            phase: 'question',
            length,
            number,
            score,
            isLast: isLastQuestion(length, number),
            // A hint shown before the quick mode was turned on no longer applies.
            trainer: autoAdvance ? { ...trainer.state, hint: false } : trainer.state,
            previousGrade,
          }
        }
      }
    },

    get autoAdvance() {
      return autoAdvance
    },

    setAutoAdvance(on) {
      const wasOn = autoAdvance
      autoAdvance = on
      const run = current()
      if (!run) return
      const { firstGrade } = run.trainer.state
      if (on && firstGrade) moveOn(run, firstGrade)
      // Back in the normal mode the question starts over: a result or a hint left from
      // the quick mode would read as belonging to it.
      if (wasOn && !on) {
        run.trainer.clearChoice()
        run.previousGrade = null
      }
    },

    get showAnswerAtOnce() {
      return showAnswerAtOnce
    },

    // Read on start only: the box is on the length choice, so a session never sees it change.
    setShowAnswerAtOnce(on) {
      showAnswerAtOnce = on
    },

    start(length) {
      phase = {
        kind: 'question',
        run: {
          length,
          trainer: createTrainer(nextQuestion, { attempts: showAnswerAtOnce ? 1 : 2 }),
          number: 1,
          score: EMPTY_SCORE,
          previousGrade: null,
          shownAt: null,
        },
      }
    },

    noteDrawn() {
      const run = current()
      if (run && run.shownAt === null) run.shownAt = clock.now()
    },

    select(letter) {
      current()?.trainer.select(letter)
    },

    check() {
      const run = current()
      if (run && !autoAdvance) check(run)
    },

    answer(letter) {
      const run = current()
      if (!run || !autoAdvance) return
      run.trainer.select(letter)
      check(run)
      // The second attempt is not offered in the quick mode yet: a wrong answer moves on.
      const { firstGrade } = run.trainer.state
      if (firstGrade) moveOn(run, firstGrade)
    },

    next() {
      const run = current()
      if (run?.trainer.state.outcome) moveOn(run, null)
    },

    finish() {
      const run = current()
      if (!run) return
      phase = run.score.checked > 0 ? { kind: 'results', score: run.score } : { kind: 'choosing' }
    },

    newSession() {
      phase = { kind: 'choosing' }
    },
  }
}
