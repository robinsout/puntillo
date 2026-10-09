import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  canChange,
  changeDifficulty,
  fittingTimeSignatures,
  isSameDifficulty,
  parseDifficulty,
  PRESETS,
  presetDifficulty,
  QUESTION_LENGTHS,
  serializeDifficulty,
  type Difficulty,
  type DifficultyChange,
} from '@/domain/difficulty'
import { DURATION_VALUES } from '@/domain/question'

// Feature multi-note-questions, slice 4: the box Rests (criterion 1) and its value in the presets
// of spec 6.2 (criterion 2). Rests stand only where a note could, so they make no set of values
// give no question.

const FIRST_STEPS = presetDifficulty('first-steps')

const FIRST_STEPS_TEXT = {
  low: 'C4',
  high: 'C5',
  ledgerLines: 0,
  durations: ['half', 'quarter'],
  askDuration: false,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
}

const text = (overrides: Record<string, unknown>) =>
  JSON.stringify({ ...FIRST_STEPS_TEXT, ...overrides })

describe('the rests of a difficulty', () => {
  it('are on or off', () => {
    expectTypeOf<Difficulty['rests']>().toEqualTypeOf<boolean>()
  })
})

describe('the rests of the presets', () => {
  it.each([
    ['first-steps', false],
    ['confident-reading', true],
    ['advanced', true],
  ] as const)('are %s: %s', (preset, rests) => {
    expect(presetDifficulty(preset).rests).toBe(rests)
  })
})

describe('changeDifficulty of the rests', () => {
  it('turns them on, keeping the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { rests: true })).toEqual({ ...FIRST_STEPS, rests: true })
  })

  it('turns them off, keeping the rest', () => {
    const advanced = presetDifficulty('advanced')

    expect(changeDifficulty(advanced, { rests: false })).toEqual({ ...advanced, rests: false })
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { rests: true })

    expect(FIRST_STEPS).toEqual(before)
  })
})

describe('canChange of the rests', () => {
  const changes: DifficultyChange[] = [{ rests: true }, { rests: false }]

  it.each(PRESETS)('allows both values in %s and every length of it', (preset) => {
    for (const questionLength of QUESTION_LENGTHS) {
      const values = { ...presetDifficulty(preset), questionLength }
      if (fittingTimeSignatures(values).length === 0) continue
      for (const change of changes) expect(canChange(values, change)).toBe(true)
    }
  })

  // A whole rest would fill the bar and leave no note to answer, so the generator writes a note.
  it('allows them for one bar of 4/4 in whole notes alone', () => {
    const wholeBar: Difficulty = {
      ...FIRST_STEPS,
      durations: ['whole'],
      questionLength: 'one-bar',
    }

    expect(canChange(wholeBar, { rests: true })).toBe(true)
  })

  it.each(DURATION_VALUES)('leave the time signatures that fit %s notes as they were', (value) => {
    const values: Difficulty = { ...FIRST_STEPS, durations: [value], questionLength: 'two-bars' }

    expect(fittingTimeSignatures({ ...values, rests: true })).toEqual(
      fittingTimeSignatures({ ...values, rests: false }),
    )
  })
})

describe('isSameDifficulty with rests', () => {
  it('does not hold when only the rests differ', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, rests: true })).toBe(false)
  })

  it('holds for the same rests', () => {
    const reading = presetDifficulty('confident-reading')

    expect(isSameDifficulty(reading, { ...structuredClone(reading), rests: true })).toBe(true)
  })
})

describe('the rests in the text of a difficulty', () => {
  it('are written as on or off', () => {
    expect(JSON.parse(serializeDifficulty(presetDifficulty('advanced')))).toMatchObject({
      rests: true,
    })
    expect(JSON.parse(serializeDifficulty(FIRST_STEPS))).toMatchObject({ rests: false })
  })

  it.each([true, false])('are given back as they were: %s', (rests) => {
    const custom: Difficulty = { ...presetDifficulty('confident-reading'), rests }

    expect(parseDifficulty(serializeDifficulty(custom))).toEqual(custom)
  })

  it('are off in a text saved before they were offered', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))?.rests).toBe(false)
  })

  it('are read on', () => {
    expect(parseDifficulty(text({ rests: true }))?.rests).toBe(true)
  })

  it.each(['true', 1, 0, null, 'on', []])('give nothing for %j', (rests) => {
    expect(parseDifficulty(text({ rests }))).toBeNull()
  })
})
