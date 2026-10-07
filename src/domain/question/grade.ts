import type { Letter } from '../pitch'
import type { Question } from './question'

export interface Answer {
  letter: Letter
}

export interface Grade {
  correct: boolean
}

export function gradeAnswer(question: Question, answer: Answer): Grade {
  return { correct: question.note.pitch.letter === answer.letter }
}
