import { describe, expect, it } from 'vitest'
import {
  canChange,
  changeDifficulty,
  fittingTimeSignatures,
  isPlayable,
  isSameDifficulty,
  PRESETS,
  presetDifficulty,
  type Difficulty,
  type DifficultyChange,
  type QuestionLength,
} from '@/domain/difficulty'
import type { Duration, TimeSignature } from '@/domain/question'

// Feature multi-note-questions, slice 3: the time signatures and the lengths One bar and Two bars
// (criteria 1, 3, 4 and 5). Every bar of a question of bars is full, and a question holds at most
// sixteen notes, so a set of values that cannot fill a bar within them gives no question.

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }
const TWO_FOUR: TimeSignature = { beats: 2, beatValue: 4 }
const SIX_EIGHT: TimeSignature = { beats: 6, beatValue: 8 }
const ALL = [FOUR_FOUR, THREE_FOUR, TWO_FOUR, SIX_EIGHT]

const FIRST_STEPS = presetDifficulty('first-steps')

const difficulty = (overrides: Partial<Difficulty>): Difficulty => ({
  ...FIRST_STEPS,
  ...overrides,
})

const named = (signatures: readonly TimeSignature[]) =>
  signatures.map(({ beats, beatValue }) => `${beats}/${beatValue}`)

const fitting = (
  questionLength: QuestionLength,
  durations: Duration['value'][],
  timeSignatures: readonly TimeSignature[] = ALL,
) => named(fittingTimeSignatures(difficulty({ questionLength, durations, timeSignatures })))

describe('fittingTimeSignatures', () => {
  describe('for one note', () => {
    it('leaves the whole note to 4/4 alone: it is longer than the other bars', () => {
      expect(fitting('one-note', ['whole'])).toEqual(['4/4'])
    })

    it('takes every time signature for a half note: 2/4 holds it exactly', () => {
      expect(fitting('one-note', ['half'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })

    it('takes every time signature for a whole note with a shorter one', () => {
      expect(fitting('one-note', ['whole', 'eighth'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })
  })

  // Two notes at least, in one bar that need not be full.
  describe('for two to four notes', () => {
    it('leaves two half notes to 4/4 alone', () => {
      expect(fitting('two-to-four-notes', ['half'])).toEqual(['4/4'])
    })

    it('takes every time signature for quarter notes: two of them fill 2/4', () => {
      expect(fitting('two-to-four-notes', ['quarter'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })

    it('takes none for the whole note alone', () => {
      expect(fitting('two-to-four-notes', ['whole'])).toEqual([])
    })
  })

  // A bar is filled exactly.
  describe('for one bar', () => {
    it('leaves the whole note to 4/4 alone', () => {
      expect(fitting('one-bar', ['whole'])).toEqual(['4/4'])
    })

    it('takes 4/4 and 2/4 for half notes: they cannot add up to 3/4 or 6/8', () => {
      expect(fitting('one-bar', ['half'])).toEqual(['4/4', '2/4'])
    })

    it('takes every time signature for half and quarter notes', () => {
      expect(fitting('one-bar', ['half', 'quarter'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })

    it('takes every time signature for sixteenths alone: a bar of 4/4 is sixteen of them', () => {
      expect(fitting('one-bar', ['sixteenth'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })
  })

  // Criterion 5: at most sixteen notes in the two bars together.
  describe('for two bars', () => {
    it('takes only 2/4 for sixteenths alone: the other bars would need more than sixteen', () => {
      expect(fitting('two-bars', ['sixteenth'])).toEqual(['2/4'])
    })

    it('takes every time signature for eighths alone: two bars of 4/4 are sixteen of them', () => {
      expect(fitting('two-bars', ['eighth'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })

    it('takes every time signature once a longer duration joins the sixteenths', () => {
      expect(fitting('two-bars', ['quarter', 'sixteenth'])).toEqual(['4/4', '3/4', '2/4', '6/8'])
    })

    it('leaves the whole note to 4/4 alone', () => {
      expect(fitting('two-bars', ['whole'])).toEqual(['4/4'])
    })
  })

  it('takes only the checked time signatures', () => {
    expect(fitting('one-bar', ['half', 'quarter'], [THREE_FOUR, SIX_EIGHT])).toEqual(['3/4', '6/8'])
    expect(fitting('one-bar', ['whole'], [THREE_FOUR, TWO_FOUR])).toEqual([])
  })

  it('takes none without a time signature or without a duration', () => {
    expect(fitting('one-note', ['quarter'], [])).toEqual([])
    expect(fitting('one-bar', [])).toEqual([])
  })

  it.each(PRESETS)('takes every time signature of %s', (preset) => {
    const values = presetDifficulty(preset)

    expect(fittingTimeSignatures(values)).toEqual(values.timeSignatures)
  })
})

// Criterion 3 and spec 6.1: a set of values that gives no question is not allowed.
describe('isPlayable with bars', () => {
  it('fails without a time signature', () => {
    expect(isPlayable(difficulty({ timeSignatures: [] }))).toBe(false)
  })

  it('fails for one bar of 3/4 with the whole note alone', () => {
    expect(
      isPlayable(
        difficulty({
          questionLength: 'one-bar',
          durations: ['whole'],
          timeSignatures: [THREE_FOUR],
        }),
      ),
    ).toBe(false)
  })

  it('holds when one of the checked time signatures fits', () => {
    expect(
      isPlayable(
        difficulty({
          questionLength: 'one-bar',
          durations: ['whole'],
          timeSignatures: [FOUR_FOUR, THREE_FOUR],
        }),
      ),
    ).toBe(true)
  })

  it('fails for two bars of 4/4 with sixteenths alone, and holds once 2/4 is checked', () => {
    const sixteenths = difficulty({ questionLength: 'two-bars', durations: ['sixteenth'] })

    expect(isPlayable(sixteenths)).toBe(false)
    expect(isPlayable({ ...sixteenths, timeSignatures: [FOUR_FOUR, TWO_FOUR] })).toBe(true)
  })

  it('still needs two notes in the range', () => {
    const oneNote = difficulty({
      range: { low: { letter: 'E', octave: 4 }, high: { letter: 'E', octave: 4 } },
      questionLength: 'one-bar',
    })

    expect(isPlayable(oneNote)).toBe(false)
  })
})

describe('changeDifficulty of the time signatures', () => {
  it('checks a time signature, keeping the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { timeSignature: THREE_FOUR, on: true })).toEqual({
      ...FIRST_STEPS,
      timeSignatures: [FOUR_FOUR, THREE_FOUR],
    })
  })

  // The generator picks a time signature by its place in the list, so the order must not depend
  // on the order of the presses.
  it('keeps the order 4/4, 3/4, 2/4, 6/8 whatever the order of the presses', () => {
    const changes = [
      { timeSignature: SIX_EIGHT, on: true },
      { timeSignature: TWO_FOUR, on: true },
      { timeSignature: THREE_FOUR, on: true },
    ] as const satisfies readonly DifficultyChange[]

    expect(changes.reduce(changeDifficulty, FIRST_STEPS).timeSignatures).toEqual(ALL)
  })

  it('unchecks a time signature, keeping the rest', () => {
    const both = difficulty({ timeSignatures: [FOUR_FOUR, THREE_FOUR] })

    expect(changeDifficulty(both, { timeSignature: FOUR_FOUR, on: false })).toEqual({
      ...both,
      timeSignatures: [THREE_FOUR],
    })
  })

  it('knows a time signature by its beats and beat value, not by the object', () => {
    const changed = changeDifficulty(FIRST_STEPS, {
      timeSignature: { beats: 4, beatValue: 4 },
      on: true,
    })

    expect(changed.timeSignatures).toEqual([FOUR_FOUR])
    expect(
      changeDifficulty(changed, { timeSignature: { beats: 4, beatValue: 4 }, on: false })
        .timeSignatures,
    ).toEqual([])
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { timeSignature: SIX_EIGHT, on: true })
    changeDifficulty(FIRST_STEPS, { timeSignature: FOUR_FOUR, on: false })
    changeDifficulty(FIRST_STEPS, { questionLength: 'two-bars' })

    expect(FIRST_STEPS).toEqual(before)
  })

  it.each(['one-bar', 'two-bars'] as const)('sets the length %s, keeping the rest', (length) => {
    expect(changeDifficulty(FIRST_STEPS, { questionLength: length })).toEqual({
      ...FIRST_STEPS,
      questionLength: length,
    })
  })
})

describe('canChange of the time signatures and the lengths', () => {
  it('does not allow unchecking the last time signature', () => {
    expect(canChange(FIRST_STEPS, { timeSignature: FOUR_FOUR, on: false })).toBe(false)
  })

  it.each(ALL)('allows checking %o', (timeSignature) => {
    expect(canChange(FIRST_STEPS, { timeSignature, on: true })).toBe(true)
  })

  it('does not allow unchecking the only time signature that fits', () => {
    const wholeBars = difficulty({
      questionLength: 'one-bar',
      durations: ['whole'],
      timeSignatures: [FOUR_FOUR, THREE_FOUR],
    })

    expect(canChange(wholeBars, { timeSignature: FOUR_FOUR, on: false })).toBe(false)
    expect(canChange(wholeBars, { timeSignature: THREE_FOUR, on: false })).toBe(true)
  })

  // Reachable from First steps: 3/4 alone allows a half note, so the whole one may join it.
  describe('in 3/4 alone with whole and half notes', () => {
    const wholeAndHalf = difficulty({
      durations: ['whole', 'half'],
      timeSignatures: [THREE_FOUR],
    })

    it.each(['two-to-four-notes', 'one-bar', 'two-bars'] as const)(
      'does not allow the length %s',
      (length) => {
        expect(canChange(wholeAndHalf, { questionLength: length })).toBe(false)
      },
    )

    it('keeps one note', () => {
      expect(isPlayable(wholeAndHalf)).toBe(true)
      expect(canChange(wholeAndHalf, { questionLength: 'one-note' })).toBe(true)
    })

    it('does not allow unchecking the half note: the whole one does not fit 3/4', () => {
      expect(canChange(wholeAndHalf, { duration: 'half', on: false })).toBe(false)
      expect(canChange(wholeAndHalf, { duration: 'whole', on: false })).toBe(true)
    })

    it('allows one bar once the quarter note joins', () => {
      const withQuarter = changeDifficulty(wholeAndHalf, { duration: 'quarter', on: true })

      expect(canChange(withQuarter, { questionLength: 'one-bar' })).toBe(true)
    })
  })

  it('does not allow unchecking the eighth note in two bars of 3/4 with sixteenths', () => {
    const short = difficulty({
      questionLength: 'two-bars',
      durations: ['eighth', 'sixteenth'],
      timeSignatures: [THREE_FOUR],
    })

    expect(canChange(short, { duration: 'eighth', on: false })).toBe(false)
    expect(canChange(short, { duration: 'sixteenth', on: false })).toBe(true)
  })

  it.each(['one-note', 'two-to-four-notes', 'one-bar', 'two-bars'] as const)(
    'allows the length %s in every preset',
    (length) => {
      for (const preset of PRESETS)
        expect(canChange(presetDifficulty(preset), { questionLength: length })).toBe(true)
    },
  )
})

describe('isSameDifficulty with time signatures', () => {
  it('does not hold for other time signatures', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, timeSignatures: [THREE_FOUR] })).toBe(
      false,
    )
    expect(
      isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, timeSignatures: [FOUR_FOUR, SIX_EIGHT] }),
    ).toBe(false)
  })

  it('holds for the same time signatures in another order', () => {
    const both = difficulty({ timeSignatures: [FOUR_FOUR, THREE_FOUR] })

    expect(isSameDifficulty(both, { ...both, timeSignatures: [THREE_FOUR, FOUR_FOUR] })).toBe(true)
  })

  it('does not hold for another length of bars', () => {
    expect(
      isSameDifficulty(
        difficulty({ questionLength: 'one-bar' }),
        difficulty({ questionLength: 'two-bars' }),
      ),
    ).toBe(false)
  })
})
