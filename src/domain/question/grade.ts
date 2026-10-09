import type { Letter } from '../pitch'
import type { Duration, Question } from './question'

export interface Answer {
  letter: Letter
  duration: Duration
}

export interface Grade {
  pitch: boolean
  duration: boolean
}

export function gradeAnswer(question: Question, answer: Answer): Grade {
  return {
    pitch: question.note.pitch.letter === answer.letter,
    duration: question.note.duration.value === answer.duration.value,
  }
}
