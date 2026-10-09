import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, NoteOrRest, Rest, TimeSignature } from '@/domain/question'
import {
  barsOf,
  createQuestion,
  createQuestionIn,
  createQuestionOf,
  isNote,
  isRest,
} from '@/domain/question'

// Feature multi-note-questions, slice 4: a question is a sequence of notes and rests (spec 4.1);
// a rest has a duration only. The notes alone are answered, so `notes` keeps the notes of the
// question in their order, without the rests between them (criterion 6).

const note = (value: Duration['value'], letter: Letter = 'G'): Note => ({
  pitch: { letter, octave: 4 },
  duration: { value },
})
const rest = (value: Duration['value']): Rest => ({ duration: { value } })

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }

describe('a rest', () => {
  it('is a duration without a pitch', () => {
    expectTypeOf<Rest>().toHaveProperty('duration').toEqualTypeOf<Duration>()
    expectTypeOf<Rest>().not.toHaveProperty('pitch')
  })

  it('is told from a note', () => {
    expect(isRest(rest('quarter'))).toBe(true)
    expect(isRest(note('quarter'))).toBe(false)
    expect(isNote(note('quarter'))).toBe(true)
    expect(isNote(rest('quarter'))).toBe(false)
  })

  it('narrows the type of an element of a question', () => {
    expectTypeOf(isNote).guards.toEqualTypeOf<Note>()
    expectTypeOf(isRest).guards.toEqualTypeOf<Rest>()
    expectTypeOf<NoteOrRest>().toEqualTypeOf<Note | Rest>()
  })
})

describe('createQuestionOf', () => {
  it('puts the notes and the rests on a treble staff in the given time signature, in their order', () => {
    const elements = [note('half', 'C'), rest('quarter'), note('quarter', 'D')]

    const question = createQuestionOf(THREE_FOUR, elements)

    expect(question.clef).toBe('treble')
    expect(question.timeSignature).toEqual(THREE_FOUR)
    expect(question.elements).toEqual(elements)
  })

  it('asks about the notes alone, in their order, skipping the rests', () => {
    const question = createQuestionOf(FOUR_FOUR, [
      rest('quarter'),
      note('quarter', 'C'),
      rest('eighth'),
      note('eighth', 'E'),
      note('half', 'G'),
    ])

    expect(question.notes).toEqual([note('quarter', 'C'), note('eighth', 'E'), note('half', 'G')])
  })

  it('takes a question of notes alone as createQuestionIn does', () => {
    const notes = [note('half', 'C'), note('quarter', 'D'), note('quarter', 'E')] as const

    expect(createQuestionOf(FOUR_FOUR, notes)).toEqual(createQuestionIn(FOUR_FOUR, ...notes))
  })

  it.each([
    ['rests alone', [rest('half'), rest('half')]],
    ['nothing', []],
  ])('refuses %s: a question has a note to answer', (_, elements) => {
    expect(() => createQuestionOf(FOUR_FOUR, elements)).toThrow(/note/i)
  })

  it('keeps the given list as it was', () => {
    const elements: NoteOrRest[] = [rest('quarter'), note('half')]

    createQuestionOf(THREE_FOUR, elements)

    expect(elements).toEqual([rest('quarter'), note('half')])
  })
})

describe('a question of notes alone', () => {
  it('has the notes as its elements', () => {
    expect(createQuestion(note('whole', 'C')).elements).toEqual([note('whole', 'C')])
    expect(createQuestionIn(THREE_FOUR, note('half'), note('quarter', 'A')).elements).toEqual([
      note('half'),
      note('quarter', 'A'),
    ])
  })
})

// A rest fills its bar as a note of its duration does (spec 4.2: the sum of the durations).
describe('barsOf with rests', () => {
  const shapes = (bars: readonly (readonly NoteOrRest[])[]) =>
    bars.map((bar) => bar.map((each) => `${isRest(each) ? 'rest' : 'note'} ${each.duration.value}`))

  it('counts the rests into the bars', () => {
    const question = createQuestionOf(THREE_FOUR, [
      note('half'),
      rest('quarter'),
      rest('quarter'),
      note('quarter', 'A'),
      note('quarter'),
    ])

    expect(shapes(barsOf(question))).toEqual([
      ['note half', 'rest quarter'],
      ['rest quarter', 'note quarter', 'note quarter'],
    ])
  })

  it('lets a whole rest fill a bar of 4/4 on its own', () => {
    const question = createQuestionOf(FOUR_FOUR, [rest('whole'), note('half'), note('half', 'A')])

    expect(shapes(barsOf(question))).toEqual([['rest whole'], ['note half', 'note half']])
  })

  it('keeps the elements themselves, in their order', () => {
    const elements = [rest('eighth'), note('eighth'), note('quarter', 'A'), rest('half')]

    expect(barsOf(createQuestionOf(FOUR_FOUR, elements)).flat()).toEqual(elements)
  })
})
