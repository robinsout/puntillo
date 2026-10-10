import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, NoteOrRest, Rest, TimeSignature } from '@/domain/question'
import {
  barsOf,
  canBeDotted,
  createQuestion,
  createQuestionOf,
  DURATION_VALUES,
  gradeAnswer,
  isRest,
  isSameDuration,
  sixteenthsOf,
} from '@/domain/question'

// Feature multi-note-questions, slice 5: a duration is a base value and a number of dots, 0 or 1
// (spec 4.1). A dot makes a duration half as long again. A duration without a dot carries no
// `dots` at all, so a plain duration is written as before: { value: 'quarter' }.
//
// A sixteenth note takes no dot: a dotted sixteenth is a sixteenth and a half, which no bar of
// whole sixteenths can hold. A dotted whole note is longer than any bar offered, so it never
// stands in a question either, but the dot itself is allowed: the answer may claim one.

const dotted = (value: Duration['value']): Duration => ({ value, dots: 1 })
const plain = (value: Duration['value']): Duration => ({ value })

const note = (duration: Duration, letter: Letter = 'G'): Note => ({
  pitch: { letter, octave: 4 },
  duration,
})
const rest = (duration: Duration): Rest => ({ duration })

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }
const SIX_EIGHT: TimeSignature = { beats: 6, beatValue: 8 }

describe('the dots of a duration', () => {
  it('are one or none: a plain duration has no dots', () => {
    expectTypeOf<Duration['dots']>().toEqualTypeOf<1 | undefined>()
    expectTypeOf<{ value: 'quarter' }>().toExtend<Duration>()
  })
})

describe('sixteenthsOf', () => {
  it.each([
    ['whole', 16],
    ['half', 8],
    ['quarter', 4],
    ['eighth', 2],
    ['sixteenth', 1],
  ] as const)('gives a plain %s note %i sixteenths', (value, length) => {
    expect(sixteenthsOf(plain(value))).toBe(length)
  })

  it.each([
    ['whole', 24],
    ['half', 12],
    ['quarter', 6],
    ['eighth', 3],
  ] as const)('gives a dotted %s note half as much again: %i sixteenths', (value, length) => {
    expect(sixteenthsOf(dotted(value))).toBe(length)
  })
})

describe('canBeDotted', () => {
  it.each(['whole', 'half', 'quarter', 'eighth'] as const)('allows a dot after a %s', (value) => {
    expect(canBeDotted(value)).toBe(true)
  })

  it('allows no dot after a sixteenth: it would be a sixteenth and a half long', () => {
    expect(canBeDotted('sixteenth')).toBe(false)
  })

  it('leaves the sixteenth alone out', () => {
    expect(DURATION_VALUES.filter(canBeDotted)).toEqual(['whole', 'half', 'quarter', 'eighth'])
  })
})

describe('isSameDuration', () => {
  it('holds for the same value, both plain', () => {
    expect(isSameDuration(plain('quarter'), plain('quarter'))).toBe(true)
  })

  it('holds for the same value, both dotted', () => {
    expect(isSameDuration(dotted('half'), dotted('half'))).toBe(true)
  })

  it('does not hold when only one of them is dotted, either way round', () => {
    expect(isSameDuration(dotted('quarter'), plain('quarter'))).toBe(false)
    expect(isSameDuration(plain('quarter'), dotted('quarter'))).toBe(false)
  })

  it('does not hold for another value, dotted or not', () => {
    expect(isSameDuration(plain('quarter'), plain('half'))).toBe(false)
    expect(isSameDuration(dotted('quarter'), dotted('eighth'))).toBe(false)
  })

  // A dotted quarter is as long as a quarter and an eighth, yet it is another duration.
  it('compares the writing, not the length', () => {
    expect(sixteenthsOf(dotted('eighth'))).toBe(3)
    expect(isSameDuration(dotted('half'), plain('half'))).toBe(false)
  })

  it('takes a dots field left undefined as no dot', () => {
    expect(isSameDuration({ value: 'quarter', dots: undefined }, plain('quarter'))).toBe(true)
  })
})

// Spec 4.2: a bar is full when the sum of its durations is the time signature.
describe('barsOf with dots', () => {
  const shapes = (bars: readonly (readonly NoteOrRest[])[]) =>
    bars.map((bar) =>
      bar.map(
        (each) =>
          `${isRest(each) ? 'rest' : 'note'} ${each.duration.value}${each.duration.dots ? '.' : ''}`,
      ),
    )

  it('counts a dotted note half as long again', () => {
    const question = createQuestionOf(FOUR_FOUR, [
      note(dotted('half')),
      note(plain('quarter'), 'A'),
      note(dotted('quarter')),
      note(plain('eighth'), 'A'),
      note(plain('half')),
    ])

    expect(shapes(barsOf(question))).toEqual([
      ['note half.', 'note quarter'],
      ['note quarter.', 'note eighth', 'note half'],
    ])
  })

  it('fills 3/4 with one dotted half note, and 6/8 with two dotted quarters', () => {
    const threeFour = createQuestionOf(THREE_FOUR, [
      note(dotted('half')),
      note(dotted('half'), 'A'),
    ])
    const sixEight = createQuestionOf(SIX_EIGHT, [
      note(dotted('quarter')),
      rest(dotted('quarter')),
      note(dotted('quarter'), 'A'),
      note(dotted('quarter')),
    ])

    expect(shapes(barsOf(threeFour))).toEqual([['note half.'], ['note half.']])
    expect(shapes(barsOf(sixEight))).toEqual([
      ['note quarter.', 'rest quarter.'],
      ['note quarter.', 'note quarter.'],
    ])
  })

  it('closes a bar on three sixteenths of dotted eighths', () => {
    const question = createQuestionOf(FOUR_FOUR, [
      note(dotted('eighth')),
      note(plain('sixteenth'), 'A'),
      note(plain('half')),
      note(plain('quarter'), 'A'),
      note(dotted('eighth')),
      note(dotted('eighth'), 'A'),
      note(plain('quarter')),
      note(plain('quarter'), 'A'),
      note(plain('eighth')),
    ])

    expect(barsOf(question).map((bar) => bar.length)).toEqual([4, 5])
  })
})

// Criterion 18: a dotted duration is right only with its dot, a plain one only without.
describe('gradeAnswer with dots', () => {
  const durationGrade = (expected: Duration, answered: Duration) =>
    gradeAnswer(createQuestion(note(expected)), [{ letter: 'G', duration: answered }])[0]?.duration

  it('takes a dotted duration answered with its dot', () => {
    expect(durationGrade(dotted('quarter'), dotted('quarter'))).toBe(true)
  })

  it('refuses a dotted duration answered without its dot', () => {
    expect(durationGrade(dotted('quarter'), plain('quarter'))).toBe(false)
  })

  it('refuses a plain duration answered with a dot', () => {
    expect(durationGrade(plain('quarter'), dotted('quarter'))).toBe(false)
  })

  it('refuses a dotted duration of another value', () => {
    expect(durationGrade(dotted('half'), dotted('quarter'))).toBe(false)
  })

  it('refuses a dotted sixteenth, which no question holds', () => {
    expect(durationGrade(plain('sixteenth'), dotted('sixteenth'))).toBe(false)
  })

  it('grades the name apart from the dot', () => {
    const [grade] = gradeAnswer(createQuestion(note(dotted('half'))), [
      { letter: 'G', duration: plain('half') },
    ])

    expect(grade).toEqual({ pitch: true, duration: false })
  })
})
