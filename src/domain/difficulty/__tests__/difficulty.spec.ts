import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  allowedPitches,
  isPreset,
  PRESETS,
  presetDifficulty,
  type Difficulty,
  type Preset,
} from '@/domain/difficulty'
import type { Pitch } from '@/domain/pitch'

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`
const pitch = (letter: Pitch['letter'], octave: number): Pitch => ({ letter, octave })

const C4_TO_C5 = { low: pitch('C', 4), high: pitch('C', 5) }

const difficulty = (overrides: Partial<Difficulty>): Difficulty => ({
  range: C4_TO_C5,
  ledgerLines: 0,
  durations: ['quarter'],
  askDuration: true,
  ...overrides,
})

// Feature difficulty-presets, criterion 3.
describe('presets', () => {
  it('are First steps, Confident reading, then Advanced', () => {
    expect(PRESETS).toEqual(['first-steps', 'confident-reading', 'advanced'])
  })

  it('are exactly the offered names', () => {
    expectTypeOf<Preset>().toEqualTypeOf<'first-steps' | 'confident-reading' | 'advanced'>()
  })

  describe('First steps', () => {
    it('is C4–C5 without ledger lines, quarter and half notes, the duration not asked', () => {
      expect(presetDifficulty('first-steps')).toEqual({
        range: { low: pitch('C', 4), high: pitch('C', 5) },
        ledgerLines: 0,
        durations: ['half', 'quarter'],
        askDuration: false,
      })
    })
  })

  describe('Confident reading', () => {
    it('is C4–G5 with up to one ledger line, four durations, the duration asked', () => {
      expect(presetDifficulty('confident-reading')).toEqual({
        range: { low: pitch('C', 4), high: pitch('G', 5) },
        ledgerLines: 1,
        durations: ['whole', 'half', 'quarter', 'eighth'],
        askDuration: true,
      })
    })
  })

  describe('Advanced', () => {
    it('is A3–C6 with up to two ledger lines, all five durations, the duration asked', () => {
      expect(presetDifficulty('advanced')).toEqual({
        range: { low: pitch('A', 3), high: pitch('C', 6) },
        ledgerLines: 2,
        durations: ['whole', 'half', 'quarter', 'eighth', 'sixteenth'],
        askDuration: true,
      })
    })
  })

  describe('recognising a preset', () => {
    it.each(PRESETS)('knows %s', (preset) => {
      expect(isPreset(preset)).toBe(true)
    })

    it.each([
      '',
      'First steps',
      'first steps',
      'firstSteps',
      'FIRST-STEPS',
      ' first-steps',
      '"first-steps"',
      'Advanced',
      ' advanced',
      'custom',
      'undefined',
    ])('rejects %j', (value) => {
      expect(isPreset(value)).toBe(false)
    })
  })
})

// Criterion 4: every note lies in the range and needs no more ledger lines than allowed.
describe('allowedPitches', () => {
  it('leaves out C4 in First steps: it needs a ledger line', () => {
    expect(allowedPitches(presetDifficulty('first-steps')).map(name)).toEqual([
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
    ])
  })

  it('gives the twelve notes C4–G5 in Confident reading', () => {
    expect(allowedPitches(presetDifficulty('confident-reading')).map(name)).toEqual([
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
      'D5',
      'E5',
      'F5',
      'G5',
    ])
  })

  it('gives the seventeen notes A3–C6 in Advanced, two ledger lines each side at most', () => {
    expect(allowedPitches(presetDifficulty('advanced')).map(name)).toEqual([
      'A3',
      'B3',
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
      'D5',
      'E5',
      'F5',
      'G5',
      'A5',
      'B5',
      'C6',
    ])
  })

  it('leaves out A3 and C6 when one ledger line is allowed, B3 and B5 kept', () => {
    const range = { low: pitch('A', 3), high: pitch('C', 6) }

    const names = allowedPitches(difficulty({ range, ledgerLines: 1 })).map(name)

    expect(names.slice(0, 2)).toEqual(['B3', 'C4'])
    expect(names.slice(-2)).toEqual(['A5', 'B5'])
  })

  it('keeps C4 when one ledger line is allowed', () => {
    expect(allowedPitches(difficulty({ ledgerLines: 1 })).map(name)).toContain('C4')
  })

  it('keeps to the range, both bounds included', () => {
    const range = { low: pitch('E', 4), high: pitch('G', 4) }

    expect(allowedPitches(difficulty({ range, ledgerLines: 2 })).map(name)).toEqual([
      'E4',
      'F4',
      'G4',
    ])
  })

  it('does not depend on the durations or on asking for them', () => {
    const asked = allowedPitches(difficulty({ durations: ['whole'], askDuration: true }))
    const notAsked = allowedPitches(difficulty({ durations: ['eighth'], askDuration: false }))

    expect(notAsked).toEqual(asked)
  })
})
