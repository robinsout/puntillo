import type { Letter } from '../pitch'
import type { Duration, Question } from './question'

// A null duration means the duration is not asked, so it is neither answered nor graded.
export interface Answer {
  letter: Letter
  duration: Duration | null
}

export interface Grade {
  pitch: boolean
  duration: boolean | null
}

export function gradeAnswer(question: Question, answer: Answer): Grade {
  return {
    pitch: question.note.pitch.letter === answer.letter,
    duration:
      answer.duration === null ? null : question.note.duration.value === answer.duration.value,
  }
}
