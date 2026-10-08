import type { Letter } from '@/domain/pitch'
import type { Grade, Question } from '@/domain/question'
import { gradeAnswer } from '@/domain/question'

export type Outcome = 'correct' | 'correct-second-try' | 'incorrect'

export interface TrainerState {
  readonly question: Question
  readonly selected: Letter | null
  // Only the first attempt counts towards the score; the second one is for learning.
  readonly firstGrade: Grade | null
  readonly outcome: Outcome | null
  readonly wrongChoice: Letter | null
  readonly hint: boolean
}

export interface Trainer {
  readonly state: TrainerState
  select(letter: Letter): void
  check(): void
  clearChoice(): void
  next(): void
}

const opened = (question: Question): TrainerState => ({
  question,
  selected: null,
  firstGrade: null,
  outcome: null,
  wrongChoice: null,
  hint: false,
})

const isOver = (state: TrainerState): boolean => state.outcome !== null

export function createTrainer(nextQuestion: () => Question): Trainer {
  let state = opened(nextQuestion())

  const checkFirst = (selected: Letter) => {
    const grade = gradeAnswer(state.question, { letter: selected })
    state = grade.correct
      ? { ...state, firstGrade: grade, outcome: 'correct' }
      : { ...state, firstGrade: grade, wrongChoice: selected, selected: null }
  }

  const checkSecond = (selected: Letter) => {
    const { correct } = gradeAnswer(state.question, { letter: selected })
    state = { ...state, outcome: correct ? 'correct-second-try' : 'incorrect' }
  }

  return {
    get state() {
      return state
    },

    select(letter) {
      if (isOver(state) || letter === state.wrongChoice) return
      state = { ...state, selected: letter, hint: false }
    },

    check() {
      if (isOver(state)) return
      if (state.selected === null) {
        state = { ...state, hint: true }
        return
      }
      if (state.firstGrade === null) checkFirst(state.selected)
      else checkSecond(state.selected)
    },

    clearChoice() {
      if (isOver(state)) return
      state = { ...state, selected: null, hint: false }
    },

    // Allowed once the first attempt is graded: the session decides whether
    // leaving during the second attempt is fine (the quick mode) or not.
    next() {
      if (state.firstGrade === null) return
      state = opened(nextQuestion())
    },
  }
}
