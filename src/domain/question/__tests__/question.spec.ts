import { describe, expect, it } from 'vitest'
import type { Note } from '@/domain/question'
import { createQuestion, DURATION_VALUES } from '@/domain/question'

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
