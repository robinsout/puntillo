import { describe, expect, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, NoteOrRest, TimeSignature } from '@/domain/question'
import {
  barsOf,
  barSixteenths,
  createQuestion,
  createQuestionIn,
  DURATION_VALUES,
  TIME_SIGNATURES,
} from '@/domain/question'

const middleC: Note = { pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } }

describe('DURATION_VALUES', () => {
  // Feature difficulty-presets, criterion 6: the sixteenth joins the four of duration-input.
  it('lists the five base durations from the longest to the shortest', () => {
    expect(DURATION_VALUES).toEqual(['whole', 'half', 'quarter', 'eighth', 'sixteenth'])
  })
})

describe('createQuestion', () => {
  it('puts the note on a treble staff', () => {
    expect(createQuestion(middleC).clef).toBe('treble')
  })

  it('uses 4/4 time', () => {
    expect(createQuestion(middleC).timeSignature).toEqual({ beats: 4, beatValue: 4 })
  })

  it('asks about the given note alone', () => {
    expect(createQuestion(middleC).notes).toEqual([middleC])
  })

  it.each(DURATION_VALUES)(
    'keeps the %s note as given, even though it does not fill 4/4',
    (value) => {
      const note: Note = { pitch: { letter: 'G', octave: 4 }, duration: { value } }

      expect(createQuestion(note).notes).toEqual([note])
    },
  )
})

// Feature multi-note-questions, criterion 4: a question is a sequence of notes (spec 4.1).
describe('createQuestion of several notes', () => {
  const G4_HALF: Note = { pitch: { letter: 'G', octave: 4 }, duration: { value: 'half' } }
  const A4_QUARTER: Note = { pitch: { letter: 'A', octave: 4 }, duration: { value: 'quarter' } }
  const G4_EIGHTH: Note = { pitch: { letter: 'G', octave: 4 }, duration: { value: 'eighth' } }
  const E5_SIXTEENTH: Note = { pitch: { letter: 'E', octave: 5 }, duration: { value: 'sixteenth' } }

  it('asks about the notes in the given order', () => {
    expect(createQuestion(G4_HALF, A4_QUARTER, G4_EIGHTH, E5_SIXTEENTH).notes).toEqual([
      G4_HALF,
      A4_QUARTER,
      G4_EIGHTH,
      E5_SIXTEENTH,
    ])
  })

  it('puts them on one treble staff in 4/4', () => {
    const question = createQuestion(middleC, G4_HALF, A4_QUARTER)

    expect(question.clef).toBe('treble')
    expect(question.timeSignature).toEqual({ beats: 4, beatValue: 4 })
  })

  it('keeps a bar that is not full as given, without rests', () => {
    expect(createQuestion(A4_QUARTER, G4_EIGHTH).notes).toEqual([A4_QUARTER, G4_EIGHTH])
  })

  it('cannot be asked about no note at all', () => {
    // @ts-expect-error a question has at least one note
    const empty = () => createQuestion()
    expect(empty).toBeTypeOf('function')
  })
})

// Feature multi-note-questions, slice 3: questions of one or two bars in the four time signatures
// of spec 6.1 (criteria 1 and 4).
describe('TIME_SIGNATURES', () => {
  it('are 4/4, 3/4, 2/4 and 6/8, in this order', () => {
    expect(TIME_SIGNATURES).toEqual([
      { beats: 4, beatValue: 4 },
      { beats: 3, beatValue: 4 },
      { beats: 2, beatValue: 4 },
      { beats: 6, beatValue: 8 },
    ])
  })

  it.each([
    [4, 4, 16],
    [3, 4, 12],
    [2, 4, 8],
    [6, 8, 12],
  ])('hold %i/%i as %i sixteenths a bar', (beats, beatValue, length) => {
    expect(barSixteenths({ beats, beatValue })).toBe(length)
  })
})

const note = (value: Duration['value'], letter: Letter = 'G'): Note => ({
  pitch: { letter, octave: 4 },
  duration: { value },
})

const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }
const SIX_EIGHT: TimeSignature = { beats: 6, beatValue: 8 }

describe('createQuestionIn', () => {
  it('puts the notes on a treble staff in the given time signature', () => {
    const question = createQuestionIn(THREE_FOUR, note('half'), note('quarter', 'A'))

    expect(question.clef).toBe('treble')
    expect(question.timeSignature).toEqual(THREE_FOUR)
    expect(question.notes).toEqual([note('half'), note('quarter', 'A')])
  })

  it('asks about one note too', () => {
    expect(createQuestionIn(SIX_EIGHT, note('eighth')).notes).toEqual([note('eighth')])
  })

  it('cannot be asked about no note at all', () => {
    // @ts-expect-error a question has at least one note
    const empty = () => createQuestionIn(THREE_FOUR)
    expect(empty).toBeTypeOf('function')
  })
})

// A bar ends once its notes fill the time signature; the last one may stay unfilled.
describe('barsOf', () => {
  const values = (bars: readonly (readonly NoteOrRest[])[]) =>
    bars.map((bar) => bar.map((each) => each.duration.value))

  it('gives one bar for a full bar of 4/4', () => {
    const question = createQuestion(note('half'), note('quarter'), note('quarter', 'A'))

    expect(values(barsOf(question))).toEqual([['half', 'quarter', 'quarter']])
  })

  it('gives two bars of 3/4, each filled', () => {
    const question = createQuestionIn(
      THREE_FOUR,
      note('half'),
      note('quarter', 'A'),
      note('quarter'),
      note('eighth', 'A'),
      note('eighth'),
      note('quarter', 'A'),
    )

    expect(values(barsOf(question))).toEqual([
      ['half', 'quarter'],
      ['quarter', 'eighth', 'eighth', 'quarter'],
    ])
  })

  it('gives two bars of 6/8, twelve sixteenths each', () => {
    const question = createQuestionIn(
      SIX_EIGHT,
      note('quarter'),
      note('eighth', 'A'),
      note('quarter'),
      note('eighth', 'A'),
      note('half'),
      note('quarter', 'A'),
    )

    expect(values(barsOf(question))).toEqual([
      ['quarter', 'eighth', 'quarter', 'eighth'],
      ['half', 'quarter'],
    ])
  })

  it('keeps a bar that is not full as one bar', () => {
    expect(values(barsOf(createQuestion(note('quarter'), note('eighth', 'A'))))).toEqual([
      ['quarter', 'eighth'],
    ])
  })

  it('gives one bar for one note', () => {
    expect(barsOf(createQuestion(middleC))).toEqual([[middleC]])
  })

  it('keeps the notes themselves, in their order', () => {
    const notes = [note('half', 'C'), note('half', 'D'), note('whole', 'E')] as const
    const question = createQuestion(...notes)

    expect(barsOf(question).flat()).toEqual(notes)
  })
})
