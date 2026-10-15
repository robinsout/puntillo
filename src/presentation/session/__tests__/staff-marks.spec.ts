import { describe, expect, it } from 'vitest'
import type { KeySignature } from '@/domain/key-signature'
import { keyOf } from '@/domain/keyboard'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  createQuestion,
  createQuestionOf,
  type Accidental,
  type Answer,
  type Duration,
  type Note,
  type WrittenNote,
} from '@/domain/question'
import {
  readingMarks,
  writingMarks,
  type ReadingNames,
  type WritingNames,
} from '@/presentation/session/staff-marks'

// Feature design-system, slice 3, criterion 13: what the staff shows of the result once a question
// is checked. One mark for each note of the question, the rests left out: "correct" or "wrong"; the
// ghost, the pitch drawn in outline in the column of the note; the caption under a note answered
// wrong, { correct, yours }: the right name and what was answered wrong; null under a note answered
// right.
//
// In Read notes the notes of the question are the right answers, so each is marked "correct",
// whatever was answered. The ghost is the answer, on the step of the key played or, for a name, of its
// letter nearest to the note; none when it stands on the step of the note. The name is said as in
// the review: with its alteration, and with its octave when played on the piano keyboard, a black
// key by both of its names. A wrong duration alone is said by its fraction.
//
// In Write notes the notes written are marked by the result; the ghost is the right note, where the one written is on another step; the names
// are those of the review of Write notes: with the octave, the right one with the sign it sounds
// with, the written one with the sign written before it.

const SIGN: Record<Accidental, string> = { sharp: '♯', flat: '♭', natural: '♮' }
const ALTERATION: Partial<Record<Alteration, string>> = { 1: '♯', [-1]: '♭' }

// Letters stand for any naming; the app's own names and texts are covered with the screens.
const READING: ReadingNames = {
  name: (letter: Letter, alteration?: Alteration) =>
    `${letter}${alteration === undefined ? '' : (ALTERATION[alteration] ?? '')}`,
  yours: (answer: string) => `${answer} — yours`,
}
const WRITING: WritingNames = {
  spell: (letter: Letter, sign?: Accidental) => `${letter}${sign ? SIGN[sign] : ''}`,
  yours: (answer: string) => `${answer} — yours`,
}

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const note = (at: Pitch, value: Duration['value'] = 'whole', accidental?: Accidental): Note => ({
  pitch: at,
  duration: { value },
  ...(accidental && { accidental }),
})

const C4 = pitch('C', 4)
const D4 = pitch('D', 4)
const E4 = pitch('E', 4)
const F4 = pitch('F', 4)
const G4 = pitch('G', 4)
const F_SHARP_4 = pitch('F', 4, 1)

const named = (
  letter: Letter,
  { alteration, duration = null }: { alteration?: Alteration; duration?: Duration | null } = {},
): Answer[number] => ({ letter, ...(alteration !== undefined && { alteration }), duration })

const played = (at: Pitch, duration: Duration | null = null): Answer[number] => ({
  key: keyOf(at),
  duration,
})

// A note answered right is marked right and has no caption.
const RIGHT = { mark: 'correct', ghost: null, caption: null }

describe('the marks of Read notes', () => {
  it('mark a note named right, with no caption and no ghost', () => {
    expect(readingMarks(createQuestion(note(C4)), [named('C')], READING)).toEqual([RIGHT])
  })

  it('mark a note named wrong right all the same, the answer a ghost on its step, both captioned', () => {
    expect(readingMarks(createQuestion(note(C4)), [named('E')], READING)).toEqual([
      { mark: 'correct', ghost: E4, caption: { correct: 'C', yours: 'E — yours' } },
    ])
  })

  it('put a name answered without an octave on the step of its letter nearest to the note', () => {
    const [mark] = readingMarks(createQuestion(note(C4)), [named('A')], READING)

    expect(mark?.ghost).toEqual(pitch('A', 3))
  })

  it('put the nearest step below the note when it is nearer than the one above', () => {
    const [mark] = readingMarks(createQuestion(note(pitch('C', 5))), [named('B')], READING)

    expect(mark?.ghost).toEqual(pitch('B', 4))
  })

  it('leave a note without a caption when its name and its duration are right', () => {
    const question = createQuestion(note(C4, 'whole'))

    expect(readingMarks(question, [named('C', { duration: { value: 'whole' } })], READING)).toEqual(
      [RIGHT],
    )
  })

  it('caption a wrong duration alone without a ghost, the answer said by its fraction', () => {
    const question = createQuestion(note(C4, 'whole'))

    expect(readingMarks(question, [named('C', { duration: { value: 'half' } })], READING)).toEqual([
      { mark: 'correct', ghost: null, caption: { correct: 'C', yours: '1/2 — yours' } },
    ])
  })

  it('say a dotted duration with its dot', () => {
    const question = createQuestion(note(C4, 'whole'))
    const answer = [named('C', { duration: { value: 'quarter', dots: 1 } })]

    expect(readingMarks(question, answer, READING)[0]?.caption?.yours).toBe('1/4. — yours')
  })

  it('say both the name and the duration when both are wrong', () => {
    const question = createQuestion(note(C4, 'whole'))

    expect(readingMarks(question, [named('E', { duration: { value: 'half' } })], READING)).toEqual([
      { mark: 'correct', ghost: E4, caption: { correct: 'C', yours: 'E 1/2 — yours' } },
    ])
  })

  it('caption a name wrong only in its sign without a ghost, both names with their signs', () => {
    const question = createQuestion(note(F_SHARP_4, 'whole', 'sharp'))

    expect(readingMarks(question, [named('F')], READING)).toEqual([
      { mark: 'correct', ghost: null, caption: { correct: 'F♯', yours: 'F — yours' } },
    ])
  })

  it('put the ghost of a name with its alteration, a note of the same sound wrong all the same', () => {
    const question = createQuestion(note(F_SHARP_4, 'whole', 'sharp'))

    expect(readingMarks(question, [named('G', { alteration: -1 })], READING)).toEqual([
      {
        mark: 'correct',
        ghost: pitch('G', 4, -1),
        caption: { correct: 'F♯', yours: 'G♭ — yours' },
      },
    ])
  })

  it('mark every note of a question of several notes right, the wrong ones captioned', () => {
    const question = createQuestion(note(C4, 'half'), note(E4, 'quarter'), note(G4, 'quarter'))
    const answer = [
      named('C', { duration: { value: 'half' } }),
      named('F', { duration: { value: 'quarter' } }),
      named('G', { duration: { value: 'half' } }),
    ]

    expect(readingMarks(question, answer, READING)).toEqual([
      RIGHT,
      { mark: 'correct', ghost: F4, caption: { correct: 'E', yours: 'F — yours' } },
      { mark: 'correct', ghost: null, caption: { correct: 'G', yours: '1/2 — yours' } },
    ])
  })

  it('leave the rests out', () => {
    const question = createQuestionOf(COMMON_TIME, [
      note(C4, 'quarter'),
      { duration: { value: 'quarter' } },
      note(E4, 'quarter'),
    ])

    expect(readingMarks(question, [named('C'), named('D')], READING)).toEqual([
      RIGHT,
      { mark: 'correct', ghost: D4, caption: { correct: 'E', yours: 'D — yours' } },
    ])
  })

  describe('on the piano keyboard', () => {
    it('leave the note played right without a caption', () => {
      expect(readingMarks(createQuestion(note(C4)), [played(C4)], READING)).toEqual([RIGHT])
    })

    it('put the key played wrong on its own step, both names with their octaves', () => {
      expect(readingMarks(createQuestion(note(C4)), [played(E4)], READING)).toEqual([
        { mark: 'correct', ghost: E4, caption: { correct: 'C4', yours: 'E4 — yours' } },
      ])
    })

    it('put a key an octave off in its own octave', () => {
      const [mark] = readingMarks(createQuestion(note(C4)), [played(pitch('C', 5))], READING)

      expect(mark).toEqual({
        mark: 'correct',
        ghost: pitch('C', 5),
        caption: { correct: 'C4', yours: 'C5 — yours' },
      })
    })

    it('put a black key on the step of its sharp, said by both of its names', () => {
      const [mark] = readingMarks(createQuestion(note(D4)), [played(pitch('C', 4, 1))], READING)

      expect(mark).toEqual({
        mark: 'correct',
        ghost: pitch('C', 4, 1),
        caption: { correct: 'D4', yours: 'C♯4/D♭4 — yours' },
      })
    })

    it('put no ghost for a black key whose sharp is on the step of the note', () => {
      const [mark] = readingMarks(createQuestion(note(C4)), [played(pitch('C', 4, 1))], READING)

      expect(mark?.mark).toBe('correct')
      expect(mark?.ghost).toBeNull()
    })

    it('say a wrong duration alone by its fraction', () => {
      const [mark] = readingMarks(
        createQuestion(note(C4, 'whole')),
        [played(C4, { value: 'eighth' })],
        READING,
      )

      expect(mark).toEqual({
        mark: 'correct',
        ghost: null,
        caption: { correct: 'C4', yours: '1/8 — yours' },
      })
    })
  })
})

const written = (
  at: Pitch,
  { duration = null, accidental }: { duration?: Duration | null; accidental?: Accidental } = {},
): WrittenNote => ({ pitch: at, duration, ...(accidental && { accidental }) })

const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }

describe('the marks of Write notes', () => {
  it('mark a note written right, with no caption', () => {
    expect(writingMarks(createQuestion(note(G4)), [written(G4)], WRITING)).toEqual([RIGHT])
  })

  it('mark a note written on a wrong step, the right note a ghost on its own step', () => {
    expect(writingMarks(createQuestion(note(G4)), [written(F4)], WRITING)).toEqual([
      { mark: 'wrong', ghost: G4, caption: { correct: 'G4', yours: 'F4 — yours' } },
    ])
  })

  it('mark a note wrong only in its sign without a ghost, each name with its sign', () => {
    const question = createQuestion(note(F_SHARP_4, 'whole', 'sharp'))

    expect(writingMarks(question, [written(F4)], WRITING)).toEqual([
      { mark: 'wrong', ghost: null, caption: { correct: 'F♯4', yours: 'F4 — yours' } },
    ])
  })

  it('say the sign written before a note that needs none', () => {
    const [mark] = writingMarks(
      createQuestion(note(F4)),
      [written(F4, { accidental: 'sharp' })],
      WRITING,
    )

    expect(mark?.caption).toEqual({ correct: 'F4', yours: 'F♯4 — yours' })
  })

  it('take a note sharp from the key signature written without a sign as right', () => {
    const question = createQuestionOf(COMMON_TIME, [note(F_SHARP_4)], ONE_SHARP)

    expect(writingMarks(question, [written(F4)], WRITING)).toEqual([RIGHT])
  })

  it('name a note sharp from the key signature with the sign it sounds with', () => {
    const question = createQuestionOf(COMMON_TIME, [note(F_SHARP_4)], ONE_SHARP)

    expect(writingMarks(question, [written(E4)], WRITING)).toEqual([
      { mark: 'wrong', ghost: F_SHARP_4, caption: { correct: 'F♯4', yours: 'E4 — yours' } },
    ])
  })

  it('mark a wrong duration alone without a ghost, said by its fraction', () => {
    const question = createQuestion(note(G4, 'quarter'))

    expect(writingMarks(question, [written(G4, { duration: { value: 'half' } })], WRITING)).toEqual(
      [{ mark: 'wrong', ghost: null, caption: { correct: 'G4', yours: '1/2 — yours' } }],
    )
  })

  it('mark each note of a question of several notes, the rests left out', () => {
    const question = createQuestionOf(COMMON_TIME, [
      note(C4, 'quarter'),
      { duration: { value: 'quarter' } },
      note(E4, 'quarter'),
    ])

    expect(writingMarks(question, [written(C4), written(D4)], WRITING)).toEqual([
      RIGHT,
      { mark: 'wrong', ghost: E4, caption: { correct: 'E4', yours: 'D4 — yours' } },
    ])
  })
})
