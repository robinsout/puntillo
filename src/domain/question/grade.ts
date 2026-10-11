import type { Alteration, Letter, Pitch } from '../pitch'
import { isRightSign } from './accidentals'
import { isSameDuration, type Accidental, type Duration, type Question } from './question'

// A null duration means the duration is not asked, so it is neither answered nor graded.
export interface NoteAnswer {
  letter: Letter
  alteration?: Alteration
  duration: Duration | null
}

export type Answer = readonly NoteAnswer[]

export interface NoteGrade {
  pitch: boolean
  duration: boolean | null
}

export type Grade = readonly NoteGrade[]

export function gradeAnswer(question: Question, answer: Answer): Grade {
  if (answer.length !== question.notes.length)
    throw new Error(
      `An answer of ${answer.length} parts given to a question of ${question.notes.length} notes`,
    )
  return question.notes.map((note, index) => {
    const part = answer[index] as NoteAnswer
    return {
      pitch: note.pitch.letter === part.letter && note.pitch.alteration === part.alteration,
      duration: part.duration === null ? null : isSameDuration(note.duration, part.duration),
    }
  })
}

// A written note stands on a step, so its octave counts, unlike a name; its pitch is the step, the
// sign written before it apart. A null duration means the duration is not asked, as in an answer.
export interface WrittenNote {
  pitch: Pitch
  duration: Duration | null
  accidental?: Accidental
}

export function gradeWriting(question: Question, written: readonly WrittenNote[]): Grade {
  if (written.length !== question.notes.length)
    throw new Error(
      `${written.length} written notes given to a question of ${question.notes.length} notes`,
    )
  return question.notes.map((note, index) => {
    const { pitch, duration, accidental } = written[index] as WrittenNote
    // Graded by the notation, not the sound: the sign the right notation needs, on its step.
    return {
      pitch:
        note.pitch.letter === pitch.letter &&
        note.pitch.octave === pitch.octave &&
        isRightSign(question, index, accidental),
      duration: duration === null ? null : isSameDuration(note.duration, duration),
    }
  })
}

export const isNoteRight = (grade: NoteGrade): boolean => grade.pitch && grade.duration !== false

export const isRight = (grade: Grade): boolean => grade.every(isNoteRight)
