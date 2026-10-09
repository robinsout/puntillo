import type { Letter } from '@/domain/pitch'
import type { Answer, Duration, Grade, Question } from '@/domain/question'
import { gradeAnswer } from '@/domain/question'

export type Outcome = 'correct' | 'correct-second-try' | 'incorrect'

export interface TrainerState {
  readonly question: Question
  readonly selected: Letter | null
  readonly selectedDuration: Duration | null
  // Only the first attempt counts towards the score; the second one is for learning.
  readonly firstGrade: Grade | null
  readonly outcome: Outcome | null
  readonly wrongChoice: Letter | null
  readonly wrongDuration: Duration | null
  readonly hint: boolean
}

export interface Trainer {
  readonly state: TrainerState
  select(letter: Letter): void
  selectDuration(duration: Duration): void
  check(): void
  clearChoice(): void
  next(): void
}

const opened = (question: Question): TrainerState => ({
  question,
  selected: null,
  selectedDuration: null,
  firstGrade: null,
  outcome: null,
  wrongChoice: null,
  wrongDuration: null,
  hint: false,
})

export interface TrainerOptions {
  // One attempt shows the right answer at once instead of offering a second one.
  readonly attempts: 1 | 2
}

const isOver = (state: TrainerState): boolean => state.outcome !== null

const isRight = (grade: Grade): boolean => grade.pitch && grade.duration

// A part right on the first attempt is settled: the second attempt asks only for the wrong one.
const pitchSettled = (state: TrainerState): boolean => state.firstGrade?.pitch === true
const durationSettled = (state: TrainerState): boolean => state.firstGrade?.duration === true

export function createTrainer(
  nextQuestion: () => Question,
  { attempts }: TrainerOptions = { attempts: 2 },
): Trainer {
  let state = opened(nextQuestion())

  const checkFirst = (answer: Answer) => {
    const grade = gradeAnswer(state.question, answer)
    if (isRight(grade)) {
      state = { ...state, firstGrade: grade, outcome: 'correct' }
      return
    }
    const wrong = {
      firstGrade: grade,
      wrongChoice: grade.pitch ? null : answer.letter,
      wrongDuration: grade.duration ? null : answer.duration,
    }
    if (attempts === 1) state = { ...state, ...wrong, outcome: 'incorrect' }
    else
      state = {
        ...state,
        ...wrong,
        selected: grade.pitch ? answer.letter : null,
        selectedDuration: grade.duration ? answer.duration : null,
      }
  }

  const checkSecond = (answer: Answer) => {
    const grade = gradeAnswer(state.question, answer)
    state = { ...state, outcome: isRight(grade) ? 'correct-second-try' : 'incorrect' }
  }

  return {
    get state() {
      return state
    },

    select(letter) {
      if (isOver(state) || pitchSettled(state) || letter === state.wrongChoice) return
      state = { ...state, selected: letter, hint: false }
    },

    selectDuration(duration) {
      if (isOver(state) || durationSettled(state)) return
      if (duration.value === state.wrongDuration?.value) return
      state = { ...state, selectedDuration: duration, hint: false }
    },

    check() {
      if (isOver(state)) return
      const { selected, selectedDuration } = state
      if (selected === null || selectedDuration === null) {
        state = { ...state, hint: true }
        return
      }
      const answer = { letter: selected, duration: selectedDuration }
      if (state.firstGrade === null) checkFirst(answer)
      else checkSecond(answer)
    },

    clearChoice() {
      if (isOver(state)) return
      state = {
        ...state,
        selected: pitchSettled(state) ? state.selected : null,
        selectedDuration: durationSettled(state) ? state.selectedDuration : null,
        hint: false,
      }
    },

    // Allowed once the first attempt is graded: the session decides whether
    // leaving during the second attempt is fine (the quick mode) or not.
    next() {
      if (state.firstGrade === null) return
      state = opened(nextQuestion())
    },
  }
}
