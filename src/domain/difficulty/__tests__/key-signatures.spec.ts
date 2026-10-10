import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  canChange,
  changeDifficulty,
  isSameDifficulty,
  KEY_SIGNATURE_LIMITS,
  parseDifficulty,
  PRESETS,
  presetDifficulty,
  QUESTION_LENGTHS,
  serializeDifficulty,
  type Difficulty,
  type KeySignatureLimit,
} from '@/domain/difficulty'

// Feature accidentals, slice 1: the value Key signatures (criterion 1) and its value in the
// presets of spec 6.2 (criterion 2). The value is the most signs a question's key signature may
// have: none, up to 2, up to 4 or all 7. A key signature changes no place on the staff, so no
// value of it ever leaves the questions empty.

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
  dots: false,
}

const text = (overrides: Record<string, unknown>) =>
  JSON.stringify({ ...FIRST_STEPS_TEXT, ...overrides })

describe('the key signatures of a difficulty', () => {
  it('are none, up to 2, up to 4 or all 7', () => {
    expectTypeOf<Difficulty['keySignatures']>().toEqualTypeOf<KeySignatureLimit>()
    expectTypeOf<KeySignatureLimit>().toEqualTypeOf<0 | 2 | 4 | 7>()
  })

  it('are offered in that order', () => {
    expect(KEY_SIGNATURE_LIMITS).toEqual([0, 2, 4, 7])
  })
})

describe('the key signatures of the presets', () => {
  it.each([
    ['first-steps', 0],
    ['confident-reading', 2],
    ['advanced', 7],
  ] as const)('are %s: %i', (preset, keySignatures) => {
    expect(presetDifficulty(preset).keySignatures).toBe(keySignatures)
  })
})

describe('changeDifficulty of the key signatures', () => {
  it.each(KEY_SIGNATURE_LIMITS)('sets them to %i, keeping the rest', (keySignatures) => {
    expect(changeDifficulty(FIRST_STEPS, { keySignatures })).toEqual({
      ...FIRST_STEPS,
      keySignatures,
    })
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { keySignatures: 7 })

    expect(FIRST_STEPS).toEqual(before)
  })
})

describe('canChange of the key signatures', () => {
  it.each(PRESETS)('allows every value in %s and every length of it', (preset) => {
    for (const questionLength of QUESTION_LENGTHS) {
      const values = { ...presetDifficulty(preset), questionLength }
      if (!canChange(presetDifficulty(preset), { questionLength })) continue
      for (const keySignatures of KEY_SIGNATURE_LIMITS)
        expect(canChange(values, { keySignatures })).toBe(true)
    }
  })
})

describe('isSameDifficulty with key signatures', () => {
  it('does not hold when only the key signatures differ', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, keySignatures: 2 })).toBe(false)
  })

  it('holds for the same key signatures', () => {
    const advanced = presetDifficulty('advanced')

    expect(isSameDifficulty(advanced, { ...structuredClone(advanced), keySignatures: 7 })).toBe(
      true,
    )
  })
})

describe('the key signatures in the text of a difficulty', () => {
  it('are written as the number of signs', () => {
    expect(JSON.parse(serializeDifficulty(presetDifficulty('advanced')))).toMatchObject({
      keySignatures: 7,
    })
    expect(JSON.parse(serializeDifficulty(FIRST_STEPS))).toMatchObject({ keySignatures: 0 })
  })

  it.each(KEY_SIGNATURE_LIMITS)('are given back as they were: %i', (keySignatures) => {
    const custom: Difficulty = { ...presetDifficulty('confident-reading'), keySignatures }

    expect(parseDifficulty(serializeDifficulty(custom))).toEqual(custom)
  })

  it('are none in a text saved before they were offered', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))?.keySignatures).toBe(0)
  })

  it.each(KEY_SIGNATURE_LIMITS)('are read: %i', (keySignatures) => {
    expect(parseDifficulty(text({ keySignatures }))?.keySignatures).toBe(keySignatures)
  })

  it.each([1, 3, 5, 6, 8, -1, 2.5, '2', null, true, []])('give nothing for %j', (keySignatures) => {
    expect(parseDifficulty(text({ keySignatures }))).toBeNull()
  })
})
