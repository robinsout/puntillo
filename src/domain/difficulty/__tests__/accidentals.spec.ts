import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ACCIDENTAL_SETS,
  canChange,
  changeDifficulty,
  isSameDifficulty,
  parseDifficulty,
  PRESETS,
  presetDifficulty,
  QUESTION_LENGTHS,
  serializeDifficulty,
  type AccidentalSet,
  type Difficulty,
} from '@/domain/difficulty'

// Feature accidentals, slice 2: the value Accidentals (criterion 1) and its value in the presets
// of spec 6.2 (criterion 2). This slice offers None and Sharp and flat; Sharp, flat and natural
// comes with slice 3, and Advanced asks for sharps and flats until then. An accidental changes no
// place on the staff, so no value of it ever leaves the questions empty.

const FIRST_STEPS = presetDifficulty('first-steps')

const FIRST_STEPS_TEXT = {
  low: 'C4',
  high: 'C5',
  ledgerLines: 0,
  keySignatures: 0,
  durations: ['half', 'quarter'],
  askDuration: false,
  questionLength: 'one-note',
  timeSignatures: ['4/4'],
  rests: false,
  dots: false,
}

const text = (overrides: Record<string, unknown>) =>
  JSON.stringify({ ...FIRST_STEPS_TEXT, ...overrides })

describe('the accidentals of a difficulty', () => {
  it('are none, or sharps and flats', () => {
    expectTypeOf<Difficulty['accidentals']>().toEqualTypeOf<AccidentalSet>()
    expectTypeOf<AccidentalSet>().toEqualTypeOf<'none' | 'sharp-and-flat'>()
  })

  it('are offered in that order', () => {
    expect(ACCIDENTAL_SETS).toEqual(['none', 'sharp-and-flat'])
  })
})

describe('the accidentals of the presets', () => {
  it.each([
    ['first-steps', 'none'],
    ['confident-reading', 'sharp-and-flat'],
    ['advanced', 'sharp-and-flat'],
  ] as const)('are %s: %s', (preset, accidentals) => {
    expect(presetDifficulty(preset).accidentals).toBe(accidentals)
  })
})

describe('changeDifficulty of the accidentals', () => {
  it.each(ACCIDENTAL_SETS)('sets them to %s, keeping the rest', (accidentals) => {
    expect(changeDifficulty(FIRST_STEPS, { accidentals })).toEqual({ ...FIRST_STEPS, accidentals })
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { accidentals: 'sharp-and-flat' })

    expect(FIRST_STEPS).toEqual(before)
  })
})

describe('canChange of the accidentals', () => {
  it.each(PRESETS)('allows every value in %s and every length of it', (preset) => {
    for (const questionLength of QUESTION_LENGTHS) {
      if (!canChange(presetDifficulty(preset), { questionLength })) continue
      const values = { ...presetDifficulty(preset), questionLength }
      for (const accidentals of ACCIDENTAL_SETS)
        expect(canChange(values, { accidentals })).toBe(true)
    }
  })
})

describe('isSameDifficulty with accidentals', () => {
  it('does not hold when only the accidentals differ', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, accidentals: 'sharp-and-flat' })).toBe(
      false,
    )
  })

  it('holds for the same accidentals', () => {
    const reading = presetDifficulty('confident-reading')

    expect(isSameDifficulty(reading, structuredClone(reading))).toBe(true)
  })
})

describe('the accidentals in the text of a difficulty', () => {
  it('are written by their name', () => {
    expect(JSON.parse(serializeDifficulty(presetDifficulty('advanced')))).toMatchObject({
      accidentals: 'sharp-and-flat',
    })
    expect(JSON.parse(serializeDifficulty(FIRST_STEPS))).toMatchObject({ accidentals: 'none' })
  })

  it.each(ACCIDENTAL_SETS)('are given back as they were: %s', (accidentals) => {
    const custom: Difficulty = { ...presetDifficulty('confident-reading'), accidentals }

    expect(parseDifficulty(serializeDifficulty(custom))).toEqual(custom)
  })

  it('are none in a text saved before they were offered', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))?.accidentals).toBe('none')
  })

  it.each(ACCIDENTAL_SETS)('are read: %s', (accidentals) => {
    expect(parseDifficulty(text({ accidentals }))?.accidentals).toBe(accidentals)
  })

  it.each(['sharp', 'flat', 'all', '', 0, 1, null, true, ['none']])(
    'give nothing for %j',
    (accidentals) => {
      expect(parseDifficulty(text({ accidentals }))).toBeNull()
    },
  )
})
