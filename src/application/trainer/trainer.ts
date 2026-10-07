import type { Letter } from '@/domain/pitch'
import type { Grade, Question } from '@/domain/question'
import { gradeAnswer } from '@/domain/question'

export interface TrainerState {
  readonly question: Question
  readonly selected: Letter | null
  readonly grade: Grade | null
  readonly hint: boolean
}

export interface Trainer {
  readonly state: TrainerState
  select(letter: Letter): void
  check(): void
  next(): void
}

const opened = (question: Question): TrainerState => ({
  question,
  selected: null,
  grade: null,
  hint: false,
})

export function createTrainer(nextQuestion: () => Question): Trainer {
  let state = opened(nextQuestion())

  return {
    get state() {
      return state
    },

    select(letter) {
      if (state.grade) return
      state = { ...state, selected: letter, hint: false }
    },

    check() {
      if (state.grade) return
      if (state.selected === null) {
        state = { ...state, hint: true }
        return
      }
      state = { ...state, grade: gradeAnswer(state.question, { letter: state.selected }) }
    },

    next() {
      if (!state.grade) return
      state = opened(nextQuestion())
    },
  }
}
