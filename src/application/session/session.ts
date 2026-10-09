import type { Difficulty } from '@/domain/difficulty'
import type { Letter } from '@/domain/pitch'
import { DURATION_VALUES } from '@/domain/question'
import type { Duration, Question } from '@/domain/question'
import { EMPTY_SCORE, isLastQuestion, recordGrade } from '@/domain/session'
import type { Score, SessionLength } from '@/domain/session'
import type { Clock } from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import { createTrainer } from '@/application/trainer'
import type { Outcome, Trainer, TrainerState } from '@/application/trainer'

export type SessionState =
  | { readonly phase: 'choosing' }
  | {
      readonly phase: 'question'
      readonly length: SessionLength
      readonly number: number
      readonly score: Score
      readonly isLast: boolean
      readonly trainer: TrainerState
      readonly durations: readonly Duration['value'][]
      // In the quick mode the result of an answer is shown on the question after it.
      readonly previousOutcome: Outcome | null
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
  selectDuration(duration: Duration): void
  check(): void
  answer(letter: Letter): void
  answerDuration(duration: Duration): void
  previousNote(): void
  nextNote(): void
  goToNote(index: number): void
  next(): void
  finish(): void
  newSession(): void
}

interface Running {
  readonly length: SessionLength
  readonly trainer: Trainer
  readonly durations: readonly Duration['value'][]
  number: number
  score: Score
  previousOutcome: Outcome | null
  // Null until the staff has drawn the current note: loading time is not answer time.
  shownAt: number | null
}

type Phase =
  | { readonly kind: 'choosing' }
  | { readonly kind: 'question'; readonly run: Running }
  | { readonly kind: 'results'; readonly score: Score }

export type SessionModes = Pick<
  Preferences,
  'autoAdvance' | 'showAnswerAtOnce' | 'chooseAutoAdvance' | 'chooseShowAnswerAtOnce' | 'difficulty'
>

// The quick mode lives here, not in the trainer: the trainer only grades one question.
export function createSession(
  questionsFor: (difficulty: Difficulty) => () => Question,
  clock: Clock,
  modes: SessionModes,
): Session {
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

  // A press only chooses; the one that completes the answer answers.
  const answerWith = (choose: (trainer: Trainer) => void) => {
    const run = current()
    if (!run || !modes.autoAdvance) return
    choose(run.trainer)
    const { selected, selectedDuration, askDuration, outcome } = run.trainer.state
    if (selected === null || (askDuration && selectedDuration === null) || outcome) return
    check(run)
    // A wrong answer stays on the question for the second attempt or the review.
    const result = run.trainer.state.outcome
    if (result === 'correct' || result === 'correct-second-try') moveOn(run, result)
  }

  const moveOn = (run: Running, previousOutcome: Outcome | null) => {
    if (isLastQuestion(run.length, run.number)) {
      phase = { kind: 'results', score: run.score }
      return
    }
    run.trainer.next()
    run.number += 1
    run.shownAt = null
    run.previousOutcome = previousOutcome
  }

  return {
    get state(): SessionState {
      switch (phase.kind) {
        case 'choosing':
          return { phase: 'choosing' }
        case 'results':
          return { phase: 'results', score: phase.score }
        case 'question': {
          const { length, number, score, trainer, durations, previousOutcome } = phase.run
          return {
            phase: 'question',
            length,
            number,
            score,
            isLast: isLastQuestion(length, number),
            // A hint shown before the quick mode was turned on no longer applies.
            trainer: modes.autoAdvance ? { ...trainer.state, hint: false } : trainer.state,
            durations,
            previousOutcome,
          }
        }
      }
    },

    get autoAdvance() {
      return modes.autoAdvance
    },

    setAutoAdvance(on) {
      const wasOn = modes.autoAdvance
      modes.chooseAutoAdvance(on)
      const run = current()
      if (!run) return
      const { outcome } = run.trainer.state
      // During the second attempt the question stays: it is not over yet.
      if (on && outcome) moveOn(run, outcome)
      // A choice made for Check is not half of a quick answer.
      if (!wasOn && on && !outcome) run.trainer.clearChoice()
      // Back in the normal mode the choice starts over: a result or a hint left from the
      // quick mode would read as belonging to this question.
      if (wasOn && !on) {
        run.trainer.clearChoice()
        run.previousOutcome = null
      }
    },

    get showAnswerAtOnce() {
      return modes.showAnswerAtOnce
    },

    // Read on start only: the box is on the length choice, so a session never sees it change.
    setShowAnswerAtOnce(on) {
      modes.chooseShowAnswerAtOnce(on)
    },

    start(length) {
      const { difficulty } = modes
      phase = {
        kind: 'question',
        run: {
          length,
          trainer: createTrainer(questionsFor(difficulty), {
            attempts: modes.showAnswerAtOnce ? 1 : 2,
            askDuration: difficulty.askDuration,
          }),
          durations: DURATION_VALUES.filter((value) => difficulty.durations.includes(value)),
          number: 1,
          score: EMPTY_SCORE,
          previousOutcome: null,
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

    selectDuration(duration) {
      current()?.trainer.selectDuration(duration)
    },

    check() {
      const run = current()
      if (run && !modes.autoAdvance) check(run)
    },

    answer(letter) {
      answerWith((trainer) => trainer.select(letter))
    },

    answerDuration(duration) {
      answerWith((trainer) => trainer.selectDuration(duration))
    },

    previousNote() {
      current()?.trainer.previousNote()
    },

    nextNote() {
      current()?.trainer.nextNote()
    },

    goToNote(index) {
      current()?.trainer.goToNote(index)
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
