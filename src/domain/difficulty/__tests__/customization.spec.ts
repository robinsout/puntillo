import { describe, expect, it } from 'vitest'
import {
  canChange,
  changeDifficulty,
  isPlayable,
  isSameDifficulty,
  LEDGER_LINE_LIMITS,
  PRESETS,
  presetDifficulty,
  RANGE_PITCHES,
  type Difficulty,
  type DifficultyChange,
} from '@/domain/difficulty'
import type { Pitch } from '@/domain/pitch'

// Feature difficulty-presets, slice 3: the values of the panel Customize, criteria 10, 12 and 13.

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`
const pitch = (letter: Pitch['letter'], octave: number): Pitch => ({ letter, octave })
const at = (text: string): Pitch => pitch(text[0] as Pitch['letter'], Number(text.slice(1)))

const FIRST_STEPS = presetDifficulty('first-steps')
const ADVANCED = presetDifficulty('advanced')

const difficulty = (overrides: Partial<Difficulty>): Difficulty => ({
  ...FIRST_STEPS,
  ...overrides,
})

const range = (low: Pitch, high: Pitch) => ({ low, high })

describe('the values offered for the range', () => {
  it('are the seventeen notes without accidentals from A3 to C6, low to high', () => {
    expect(RANGE_PITCHES.map(name)).toEqual([
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
})

describe('the values offered for the ledger lines', () => {
  it('are none, up to one and up to two', () => {
    expect(LEDGER_LINE_LIMITS).toEqual([0, 1, 2])
  })
})

describe('changeDifficulty', () => {
  it('sets From, keeping To and the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { low: pitch('G', 4) })).toEqual({
      ...FIRST_STEPS,
      range: range(pitch('G', 4), pitch('C', 5)),
    })
  })

  it('sets To, keeping From and the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { high: pitch('A', 4) })).toEqual({
      ...FIRST_STEPS,
      range: range(pitch('C', 4), pitch('A', 4)),
    })
  })

  it('sets the ledger lines, keeping the range and the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { ledgerLines: 2 })).toEqual({
      ...FIRST_STEPS,
      ledgerLines: 2,
    })
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { low: pitch('G', 4) })
    changeDifficulty(FIRST_STEPS, { high: pitch('A', 4) })
    changeDifficulty(FIRST_STEPS, { ledgerLines: 2 })

    expect(FIRST_STEPS).toEqual(before)
  })
})

// Criterion 13 and spec 6.1: a set of values that gives no questions is not allowed. The generator
// does not repeat a note twice in a row, so a question needs two notes to choose from.
describe('isPlayable', () => {
  it.each(PRESETS)('holds for %s', (preset) => {
    expect(isPlayable(presetDifficulty(preset))).toBe(true)
  })

  it('holds for two notes', () => {
    expect(isPlayable(difficulty({ range: range(pitch('E', 4), pitch('F', 4)) }))).toBe(true)
  })

  it('fails for one note', () => {
    expect(isPlayable(difficulty({ range: range(pitch('E', 4), pitch('E', 4)) }))).toBe(false)
  })

  it('fails when From is above To', () => {
    expect(isPlayable(difficulty({ range: range(pitch('G', 4), pitch('E', 4)) }))).toBe(false)
  })

  it('counts only the notes the ledger lines allow', () => {
    // C4 needs a ledger line, so without them C4–D4 is the one note D4.
    const twoNotes = difficulty({ range: range(pitch('C', 4), pitch('D', 4)) })

    expect(isPlayable({ ...twoNotes, ledgerLines: 0 })).toBe(false)
    expect(isPlayable({ ...twoNotes, ledgerLines: 1 })).toBe(true)
  })

  it('fails for A3–C4 without ledger lines: none of the three notes is on the staff', () => {
    expect(
      isPlayable(difficulty({ range: range(pitch('A', 3), pitch('C', 4)), ledgerLines: 0 })),
    ).toBe(false)
  })

  it('fails without a duration', () => {
    expect(isPlayable(difficulty({ durations: [] }))).toBe(false)
  })

  it('holds with one duration', () => {
    expect(isPlayable(difficulty({ durations: ['eighth'] }))).toBe(true)
  })
})

describe('canChange', () => {
  // First steps is C4–C5 without ledger lines: the notes D4–C5.
  describe('From in First steps', () => {
    it.each(['A3', 'B3', 'C4', 'D4', 'G4', 'B4'])('allows %s', (low) => {
      expect(canChange(FIRST_STEPS, { low: at(low) })).toBe(true)
    })

    it.each(['C5', 'D5', 'G5', 'C6'])('does not allow %s: fewer than two notes', (low) => {
      expect(canChange(FIRST_STEPS, { low: at(low) })).toBe(false)
    })
  })

  describe('To in First steps', () => {
    it.each(['A3', 'B3', 'C4', 'D4'])('does not allow %s: fewer than two notes', (high) => {
      expect(canChange(FIRST_STEPS, { high: at(high) })).toBe(false)
    })

    // Criterion 13 asks only for two notes: a To beyond the ledger lines is allowed, its notes
    // are just never drawn.
    it.each(['E4', 'B4', 'C5', 'G5', 'A5', 'C6'])('allows %s', (high) => {
      expect(canChange(FIRST_STEPS, { high: at(high) })).toBe(true)
    })
  })

  describe('the ledger lines', () => {
    it.each(LEDGER_LINE_LIMITS)('allows %i in First steps', (ledgerLines) => {
      expect(canChange(FIRST_STEPS, { ledgerLines })).toBe(true)
    })

    it('do not allow none for A3–C4, but one or two', () => {
      const lowNotes = { ...ADVANCED, range: range(pitch('A', 3), pitch('C', 4)) }

      expect(canChange(lowNotes, { ledgerLines: 0 })).toBe(false)
      expect(canChange(lowNotes, { ledgerLines: 1 })).toBe(true)
      expect(canChange(lowNotes, { ledgerLines: 2 })).toBe(true)
    })

    it('do not allow none for B5–C6, but one or two', () => {
      const highNotes = { ...ADVANCED, range: range(pitch('B', 5), pitch('C', 6)) }

      expect(canChange(highNotes, { ledgerLines: 0 })).toBe(false)
      expect(canChange(highNotes, { ledgerLines: 1 })).toBe(false)
      expect(canChange(highNotes, { ledgerLines: 2 })).toBe(true)
    })
  })

  it('allows the current values', () => {
    const changes: DifficultyChange[] = [
      { low: FIRST_STEPS.range.low },
      { high: FIRST_STEPS.range.high },
      { ledgerLines: FIRST_STEPS.ledgerLines },
    ]

    for (const change of changes) expect(canChange(FIRST_STEPS, change)).toBe(true)
  })

  it('takes the ledger lines into account for From and To', () => {
    // Advanced allows two ledger lines, so B5–C6 is two notes.
    expect(canChange(ADVANCED, { low: pitch('B', 5) })).toBe(true)
    expect(canChange(ADVANCED, { low: pitch('C', 6) })).toBe(false)
    expect(canChange(ADVANCED, { high: pitch('B', 3) })).toBe(true)
    expect(canChange(ADVANCED, { high: pitch('A', 3) })).toBe(false)
  })
})

// Criterion 12: the mark Modified shows when the values differ from the chosen preset.
describe('isSameDifficulty', () => {
  it.each(PRESETS)('holds for %s and a copy of it', (preset) => {
    expect(
      isSameDifficulty(presetDifficulty(preset), structuredClone(presetDifficulty(preset))),
    ).toBe(true)
  })

  it('does not hold for two different presets', () => {
    expect(isSameDifficulty(FIRST_STEPS, presetDifficulty('confident-reading'))).toBe(false)
  })

  it('does not hold for another From', () => {
    expect(
      isSameDifficulty(FIRST_STEPS, changeDifficulty(FIRST_STEPS, { low: pitch('D', 4) })),
    ).toBe(false)
  })

  it('does not hold for another To', () => {
    expect(
      isSameDifficulty(FIRST_STEPS, changeDifficulty(FIRST_STEPS, { high: pitch('C', 6) })),
    ).toBe(false)
  })

  it('does not hold for other ledger lines, even with the same notes', () => {
    // E4–G4 needs no ledger lines either way.
    const narrow = difficulty({ range: range(pitch('E', 4), pitch('G', 4)) })

    expect(isSameDifficulty(narrow, { ...narrow, ledgerLines: 1 })).toBe(false)
  })

  it('does not hold for other durations', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, durations: ['half'] })).toBe(false)
    expect(
      isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, durations: ['half', 'quarter', 'whole'] }),
    ).toBe(false)
  })

  it('does not hold when only asking for the duration differs', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, askDuration: true })).toBe(false)
  })

  it('holds for the same durations in another order', () => {
    expect(isSameDifficulty(FIRST_STEPS, { ...FIRST_STEPS, durations: ['quarter', 'half'] })).toBe(
      true,
    )
  })
})

// Feature difficulty-presets, slice 4: the values of the section Rhythm, criteria 10 and 13.
describe('changeDifficulty in the section Rhythm', () => {
  // First steps asks for half and quarter notes, without the duration.
  it('adds a duration, keeping the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { duration: 'eighth', on: true })).toEqual({
      ...FIRST_STEPS,
      durations: ['half', 'quarter', 'eighth'],
    })
  })

  // The generator picks a duration by its place in the list, so the order must not depend on
  // the order of the presses.
  it('keeps the durations from the longest to the shortest whatever the order of the presses', () => {
    const changed = [
      { duration: 'sixteenth', on: true },
      { duration: 'whole', on: true },
      { duration: 'eighth', on: true },
    ] as const satisfies readonly DifficultyChange[]

    expect(changed.reduce(changeDifficulty, FIRST_STEPS).durations).toEqual([
      'whole',
      'half',
      'quarter',
      'eighth',
      'sixteenth',
    ])
  })

  it('takes a duration away, keeping the rest', () => {
    expect(changeDifficulty(FIRST_STEPS, { duration: 'half', on: false })).toEqual({
      ...FIRST_STEPS,
      durations: ['quarter'],
    })
  })

  it('does not add a duration twice', () => {
    expect(changeDifficulty(FIRST_STEPS, { duration: 'half', on: true }).durations).toEqual([
      'half',
      'quarter',
    ])
  })

  it('leaves the durations as they were when taking away one that is not there', () => {
    expect(changeDifficulty(FIRST_STEPS, { duration: 'whole', on: false }).durations).toEqual([
      'half',
      'quarter',
    ])
  })

  it('switches asking for the duration on and off, keeping the rest', () => {
    const asking = changeDifficulty(FIRST_STEPS, { askDuration: true })

    expect(asking).toEqual({ ...FIRST_STEPS, askDuration: true })
    expect(changeDifficulty(asking, { askDuration: false })).toEqual(FIRST_STEPS)
  })

  it('leaves the given difficulty as it was', () => {
    const before = structuredClone(FIRST_STEPS)

    changeDifficulty(FIRST_STEPS, { duration: 'whole', on: true })
    changeDifficulty(FIRST_STEPS, { duration: 'half', on: false })
    changeDifficulty(FIRST_STEPS, { askDuration: true })

    expect(FIRST_STEPS).toEqual(before)
  })
})

describe('canChange in the section Rhythm', () => {
  const onlyQuarter = difficulty({ durations: ['quarter'] })

  it('does not allow taking away the last duration', () => {
    expect(canChange(onlyQuarter, { duration: 'quarter', on: false })).toBe(false)
  })

  it('allows taking away one of two durations', () => {
    expect(canChange(FIRST_STEPS, { duration: 'half', on: false })).toBe(true)
    expect(canChange(FIRST_STEPS, { duration: 'quarter', on: false })).toBe(true)
  })

  it.each(['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const)(
    'allows adding %s to the last duration',
    (duration) => {
      expect(canChange(onlyQuarter, { duration, on: true })).toBe(true)
    },
  )

  it.each([true, false])('allows asking for the duration: %s', (askDuration) => {
    expect(canChange(FIRST_STEPS, { askDuration })).toBe(true)
    expect(canChange(onlyQuarter, { askDuration })).toBe(true)
  })

  it('allows the current values', () => {
    const changes: DifficultyChange[] = [
      { duration: 'half', on: true },
      { duration: 'whole', on: false },
      { askDuration: FIRST_STEPS.askDuration },
    ]

    for (const change of changes) expect(canChange(FIRST_STEPS, change)).toBe(true)
  })
})
