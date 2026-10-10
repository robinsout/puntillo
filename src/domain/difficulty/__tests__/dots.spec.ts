import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  canChange,
  changeDifficulty,
  fittingTimeSignatures,
  isPlayable,
  isSameDifficulty,
  parseDifficulty,
  PRESETS,
  presetDifficulty,
  QUESTION_LENGTHS,
  serializeDifficulty,
  type Difficulty,
  type DifficultyChange,
  type QuestionLength,
} from '@/domain/difficulty'
import type { Duration, TimeSignature } from '@/domain/question'

// Feature multi-note-questions, slice 5: the box Dots (criterion 1) and its value in the presets
// of spec 6.2 (criterion 2). Dots are never required, so turning them on takes no question away;
// a dotted duration fills a bar a plain one cannot, so it may bring a time signature in, and
// turning them off may then leave no question.

const FIRST_STEPS = presetDifficulty('first-steps')

const FIRST_STEPS_TEXT = {
  low: 'C4',
  high: 'C5',
  ledgerLines: 0,
  durations: ['half', 'quarter'],
  askDuration: false,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
  rests: false,
}

const text = (overrides: Record<string, unknown>) =>
  JSON.stringify({ ...FIRST_STEPS_TEXT, ...overrides })

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }
const TWO_FOUR: TimeSignature = { beats: 2, beatValue: 4 }
const SIX_EIGHT: TimeSignature = { beats: 6, beatValue: 8 }
const ALL = [FOUR_FOUR, THREE_FOUR, TWO_FOUR, SIX_EIGHT]

const named = (signatures: readonly TimeSignature[]) =>
  signatures.map(({ beats, beatValue }) => `${beats}/${beatValue}`)

const fitting = (
  questionLength: QuestionLength,
  durations: Duration['value'][],
  dots: boolean,
  timeSignatures: readonly TimeSignature[] = ALL,
) =>
  named(fittingTimeSignatures({ ...FIRST_STEPS, questionLength, durations, timeSignatures, dots }))

describe('the dots of a difficulty', () => {
  it('are on or off', () => {
    expectTypeOf<Difficulty['dots']>().toEqualTypeOf<boolean>()
  })
})

describe('the dots of the presets', () => {
  it.each([
    ['first-steps', false],
    ['confident-reading', false],
    ['advanced', true],
  ] as const)('are %s: %s', (preset, dots) => {
    expect(presetDifficulty(preset).dots).toBe(dots)
  })
})

describe('changeDifficulty of the dots', () => {
  it('turns them on, keeping the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { dots: true })).toEqual({ ...FIRST_STEPS, dots: true })
  })

  it('turns them off, keeping the rest', () => {
    const advanced = presetDifficulty('advanced')

    expect(changeDifficulty(advanced, { dots: false })).toEqual({ ...advanced, dots: false })
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { dots: true })

    expect(FIRST_STEPS).toEqual(before)
  })
})

describe('fittingTimeSignatures with dots', () => {
  // A dotted half note is twelve sixteenths: a bar of 3/4 or of 6/8.
  it('lets half notes alone fill a bar of 3/4 and of 6/8 once dotted', () => {
    expect(fitting('one-bar', ['half'], false)).toEqual(['4/4', '2/4'])
    expect(fitting('one-bar', ['half'], true)).toEqual(['4/4', '3/4', '2/4', '6/8'])
  })

  it('lets whole notes alone fill no other bar: a dotted whole note is longer than any', () => {
    expect(fitting('one-bar', ['whole'], true)).toEqual(['4/4'])
    expect(fitting('one-note', ['whole'], true)).toEqual(['4/4'])
  })

  // Two dotted quarters make a bar of 6/8 in two notes, but plain quarters in three fit already.
  it('takes no time signature away from any set of durations', () => {
    const sets: Duration['value'][][] = [
      ['whole'],
      ['half'],
      ['quarter'],
      ['eighth'],
      ['sixteenth'],
      ['whole', 'half', 'quarter', 'eighth', 'sixteenth'],
      ['half', 'eighth'],
      ['quarter', 'sixteenth'],
    ]
    for (const durations of sets)
      for (const questionLength of QUESTION_LENGTHS) {
        const without = fitting(questionLength, durations, false)
        const withDots = fitting(questionLength, durations, true)
        expect({
          durations,
          questionLength,
          missing: without.filter((each) => !withDots.includes(each)),
        }).toEqual({ durations, questionLength, missing: [] })
      }
  })

  // A sixteenth takes no dot.
  it('changes nothing for sixteenths alone', () => {
    expect(fitting('two-bars', ['sixteenth'], true)).toEqual(['2/4'])
    expect(fitting('one-bar', ['sixteenth'], true)).toEqual(
      fitting('one-bar', ['sixteenth'], false),
    )
  })

  it('leaves one note and 2–4 notes to the plain durations', () => {
    expect(fitting('one-note', ['half'], true)).toEqual(fitting('one-note', ['half'], false))
    expect(fitting('two-to-four-notes', ['half'], true)).toEqual(
      fitting('two-to-four-notes', ['half'], false),
    )
  })
})

describe('canChange of the dots', () => {
  it.each(PRESETS)('allows turning them on in %s and every length of it', (preset) => {
    for (const questionLength of QUESTION_LENGTHS) {
      const values = { ...presetDifficulty(preset), questionLength, dots: false }
      if (fittingTimeSignatures(values).length === 0) continue
      expect(canChange(values, { dots: true })).toBe(true)
    }
  })

  it.each(PRESETS)('allows turning them off in %s and every length of it', (preset) => {
    for (const questionLength of QUESTION_LENGTHS) {
      const values = { ...presetDifficulty(preset), questionLength, dots: true }
      if (fittingTimeSignatures(values).length === 0) continue
      expect(canChange(values, { dots: false })).toBe(true)
    }
  })

  // Half notes alone fill a bar of 3/4 only when dotted.
  it('refuses turning them off when a dot alone fills the only bar left', () => {
    const halvesInThreeFour: Difficulty = {
      ...FIRST_STEPS,
      durations: ['half'],
      questionLength: 'one-bar',
      timeSignatures: [THREE_FOUR],
      dots: true,
    }

    expect(isPlayable(halvesInThreeFour)).toBe(true)
    expect(canChange(halvesInThreeFour, { dots: false })).toBe(false)
  })

  it('lets 3/4 be checked for half notes alone once the dots are on', () => {
    const halves: Difficulty = {
      ...FIRST_STEPS,
      durations: ['half'],
      questionLength: 'one-bar',
    }
    const change: DifficultyChange = { timeSignature: THREE_FOUR, on: true }

    expect(canChange({ ...halves, timeSignatures: [], dots: false }, change)).toBe(false)
    expect(canChange({ ...halves, timeSignatures: [], dots: true }, change)).toBe(true)
  })
})

describe('isSameDifficulty with dots', () => {
  it('does not hold when only the dots differ', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, dots: true })).toBe(false)
  })

  it('holds for the same dots', () => {
    const advanced = presetDifficulty('advanced')

    expect(isSameDifficulty(advanced, { ...structuredClone(advanced), dots: true })).toBe(true)
  })
})

describe('the dots in the text of a difficulty', () => {
  it('are written as on or off', () => {
    expect(JSON.parse(serializeDifficulty(presetDifficulty('advanced')))).toMatchObject({
      dots: true,
    })
    expect(JSON.parse(serializeDifficulty(FIRST_STEPS))).toMatchObject({ dots: false })
  })

  it.each([true, false])('are given back as they were: %s', (dots) => {
    const custom: Difficulty = { ...presetDifficulty('confident-reading'), dots }

    expect(parseDifficulty(serializeDifficulty(custom))).toEqual(custom)
  })

  it('are off in a text saved before they were offered', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))?.dots).toBe(false)
  })

  it('are read on', () => {
    expect(parseDifficulty(text({ dots: true }))?.dots).toBe(true)
  })

  it.each(['true', 1, 0, null, 'on', []])('give nothing for %j', (dots) => {
    expect(parseDifficulty(text({ dots }))).toBeNull()
  })

  // A bar of 3/4 in half notes alone needs its dot, so the text without it gives no question.
  it('give nothing for a text whose question needs the dots they turn off', () => {
    const halvesInThreeFour = {
      durations: ['half'],
      questionLength: 'one-bar',
      timeSignatures: ['3/4'],
    }

    expect(parseDifficulty(text({ ...halvesInThreeFour, dots: true }))).not.toBeNull()
    expect(parseDifficulty(text({ ...halvesInThreeFour, dots: false }))).toBeNull()
  })
})
