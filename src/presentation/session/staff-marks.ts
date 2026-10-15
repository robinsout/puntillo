import { keySpellings, type PianoKey } from '@/domain/keyboard'
import { nearestPitchOfLetter, type Alteration, type Letter, type Pitch } from '@/domain/pitch'
import {
  gradeAnswer,
  gradeWriting,
  isKeyAnswer,
  isNoteRight,
  type Accidental,
  type Answer,
  type Duration,
  type Note,
  type NoteAnswer,
  type NoteGrade,
  type Question,
  type WrittenNote,
} from '@/domain/question'
import type { NoteMark } from '@/infrastructure/notation'
import { DURATION_FRACTIONS } from './duration-fractions'
import { soundingSign } from './note-review'

// What the staff shows of one note once its question is checked. In Read notes every note of the
// question is the right answer, so it is marked right whatever was answered; in Write notes the
// note marked is the one written.
export interface StaffMark {
  readonly mark: NoteMark
  // Drawn in outline in the column of the note: the answer in Read notes, the right note in Write
  // notes; none when it would stand on the step of the note.
  readonly ghost: Pitch | null
  // Only a note answered wrong is captioned.
  readonly caption: { readonly correct: string; readonly yours: string } | null
}

export interface ReadingNames {
  name(letter: Letter, alteration?: Alteration): string
  yours(answer: string): string
}

export interface WritingNames {
  spell(letter: Letter, sign?: Accidental): string
  yours(answer: string): string
}

const isSameStep = (a: Pitch, b: Pitch): boolean => a.letter === b.letter && a.octave === b.octave

const fraction = ({ value, dots }: Duration): string =>
  `${DURATION_FRACTIONS[value]}${'.'.repeat(dots ?? 0)}`

function markOf(
  grade: NoteGrade,
  correct: string,
  ghost: Pitch | null,
  yours: { pitch: string; duration: Duration | null },
  say: (answer: string) => string,
  wrongMark: NoteMark,
): StaffMark {
  if (isNoteRight(grade)) return { mark: 'correct', ghost: null, caption: null }
  const parts = [
    grade.pitch ? null : yours.pitch,
    grade.duration === false && yours.duration ? fraction(yours.duration) : null,
  ].filter((part) => part !== null)
  return { mark: wrongMark, ghost, caption: { correct, yours: say(parts.join(' ')) } }
}

// A black key stands on the step of its sharp, as the review writes it.
const keyPitch = (key: PianoKey): Pitch => keySpellings(key)[0] as Pitch

export function readingMarks(question: Question, answer: Answer, names: ReadingNames): StaffMark[] {
  const grades = gradeAnswer(question, answer)
  const written = ({ letter, alteration, octave }: Pitch) =>
    `${names.name(letter, alteration)}${octave}`

  return question.notes.map(({ pitch }: Note, index) => {
    const part = answer[index] as NoteAnswer
    const grade = grades[index] as NoteGrade
    const played = isKeyAnswer(part)
    const answered = played
      ? keyPitch(part.key)
      : nearestPitchOfLetter(part.letter, part.alteration, pitch)
    const yours = played
      ? keySpellings(part.key).map(written).join('/')
      : names.name(part.letter, part.alteration)
    return markOf(
      grade,
      played ? written(pitch) : names.name(pitch.letter, pitch.alteration),
      isSameStep(answered, pitch) || grade.pitch ? null : answered,
      { pitch: yours, duration: part.duration },
      names.yours,
      'correct',
    )
  })
}

export function writingMarks(
  question: Question,
  written: readonly WrittenNote[],
  names: WritingNames,
): StaffMark[] {
  const grades = gradeWriting(question, written)
  const named = ({ letter, octave }: Pitch, sign?: Accidental) =>
    `${names.spell(letter, sign)}${octave}`

  return question.notes.map(({ pitch }: Note, index) => {
    const note = written[index] as WrittenNote
    return markOf(
      grades[index] as NoteGrade,
      named(pitch, soundingSign(pitch.alteration)),
      isSameStep(note.pitch, pitch) ? null : pitch,
      { pitch: named(note.pitch, note.accidental), duration: note.duration },
      names.yours,
      'wrong',
    )
  })
}
