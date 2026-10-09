import { describe, expect, it } from 'vitest'
import {
  parseDifficulty,
  PRESETS,
  presetDifficulty,
  serializeDifficulty,
  type Difficulty,
} from '@/domain/difficulty'

// Feature difficulty-presets, slice 3: the values are saved between loads (criterion 14), and
// damaged or incompatible saved values are not used (edge case 1).

const FIRST_STEPS_TEXT = {
  low: 'C4',
  high: 'C5',
  ledgerLines: 0,
  durations: ['half', 'quarter'],
  askDuration: false,
}

const text = (overrides: Record<string, unknown>) =>
  JSON.stringify({ ...FIRST_STEPS_TEXT, ...overrides })

const without = (field: keyof typeof FIRST_STEPS_TEXT) => {
  const copy: Record<string, unknown> = { ...FIRST_STEPS_TEXT }
  delete copy[field]
  return JSON.stringify(copy)
}

describe('the text of a difficulty', () => {
  it.each(PRESETS)('gives %s back as it was', (preset) => {
    expect(parseDifficulty(serializeDifficulty(presetDifficulty(preset)))).toEqual(
      presetDifficulty(preset),
    )
  })

  it('gives custom values back as they were', () => {
    const custom: Difficulty = {
      range: { low: { letter: 'B', octave: 3 }, high: { letter: 'A', octave: 5 } },
      ledgerLines: 1,
      durations: ['sixteenth', 'whole'],
      askDuration: true,
      questionLength: 'one-note',
      timeSignatures: [{ beats: 4, beatValue: 4 }],
      rests: true,
    }

    expect(parseDifficulty(serializeDifficulty(custom))).toEqual(custom)
  })

  it('is JSON with the bounds as letter and octave', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))).toEqual(
      presetDifficulty('first-steps'),
    )
  })

  it('takes the bounds at the ends of the offered range, A3 and C6', () => {
    expect(parseDifficulty(text({ low: 'A3', high: 'C6', ledgerLines: 2 }))?.range).toEqual({
      low: { letter: 'A', octave: 3 },
      high: { letter: 'C', octave: 6 },
    })
  })
})

describe('a damaged text of a difficulty', () => {
  it.each(['', 'garbage', 'null', 'true', '42', '"C4"', '[]', '{}', '{"low":'])(
    'gives nothing: %j',
    (value) => {
      expect(parseDifficulty(value)).toBeNull()
    },
  )

  it.each(['low', 'high', 'ledgerLines', 'durations', 'askDuration'] as const)(
    'gives nothing without %s',
    (field) => {
      expect(parseDifficulty(without(field))).toBeNull()
    },
  )

  it.each([
    ['a lower-case letter', 'c4'],
    ['H', 'H4'],
    ['an accidental', 'C#4'],
    ['no octave', 'C'],
    ['no letter', '4'],
    ['a fractional octave', 'C4.5'],
    ['a note below A3', 'G3'],
    ['a note above C6', 'D6'],
    ['an octave far away', 'C10'],
    ['a number', 4],
    ['an object', { letter: 'C', octave: 4 }],
  ])('gives nothing for a bound with %s', (_, bound) => {
    expect(parseDifficulty(text({ low: bound }))).toBeNull()
    expect(parseDifficulty(text({ high: bound }))).toBeNull()
  })

  it.each([3, -1, 1.5, '1', null])('gives nothing for ledger lines %j', (ledgerLines) => {
    expect(parseDifficulty(text({ ledgerLines }))).toBeNull()
  })

  it.each([[[]], [['thirty-second']], [['half', 'dotted']], ['half'], [null]])(
    'gives nothing for durations %j',
    (durations) => {
      expect(parseDifficulty(text({ durations }))).toBeNull()
    },
  )

  it.each(['true', 1, null])('gives nothing for asking for the duration %j', (askDuration) => {
    expect(parseDifficulty(text({ askDuration }))).toBeNull()
  })
})

describe('an incompatible text of a difficulty', () => {
  it('gives nothing when From is above To', () => {
    expect(parseDifficulty(text({ low: 'G4', high: 'E4' }))).toBeNull()
  })

  it('gives nothing for one note', () => {
    expect(parseDifficulty(text({ low: 'E4', high: 'E4' }))).toBeNull()
  })

  it('gives nothing when the ledger lines leave one note', () => {
    expect(parseDifficulty(text({ low: 'C4', high: 'D4', ledgerLines: 0 }))).toBeNull()
  })
})

// Feature multi-note-questions, slice 1: the question length is kept between loads as well.
describe('the question length in the text of a difficulty', () => {
  const several: Difficulty = {
    ...presetDifficulty('first-steps'),
    questionLength: 'two-to-four-notes',
  }

  it('is given back as it was', () => {
    expect(parseDifficulty(serializeDifficulty(several))).toEqual(several)
  })

  it('is one note in a text saved before the length was offered', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))?.questionLength).toBe('one-note')
  })

  it('reads two to four notes', () => {
    expect(parseDifficulty(text({ questionLength: 'two-to-four-notes' }))?.questionLength).toBe(
      'two-to-four-notes',
    )
  })

  it.each(['several', 'One note', '', 2, null, true])(
    'gives nothing for the length %j',
    (questionLength) => {
      expect(parseDifficulty(text({ questionLength }))).toBeNull()
    },
  )

  it('gives nothing for several notes with the whole note alone: they would not fit the bar', () => {
    expect(
      parseDifficulty(text({ durations: ['whole'], questionLength: 'two-to-four-notes' })),
    ).toBeNull()
  })
})

// Feature multi-note-questions, slice 3: the time signatures and the lengths of bars are kept
// between loads; a text saved before them asks in 4/4.
describe('the time signatures in the text of a difficulty', () => {
  const FOUR_FOUR = { beats: 4, beatValue: 4 }
  const SIX_EIGHT = { beats: 6, beatValue: 8 }

  it('are written as their names', () => {
    expect(JSON.parse(serializeDifficulty(presetDifficulty('confident-reading')))).toMatchObject({
      questionLength: 'one-bar',
      timeSignatures: ['4/4', '3/4'],
    })
  })

  it('are given back as they were, with the length of two bars', () => {
    const custom: Difficulty = {
      ...presetDifficulty('advanced'),
      questionLength: 'two-bars',
      timeSignatures: [FOUR_FOUR, SIX_EIGHT],
    }

    expect(parseDifficulty(serializeDifficulty(custom))).toEqual(custom)
  })

  it('are 4/4 alone in a text saved before they were offered', () => {
    expect(parseDifficulty(JSON.stringify(FIRST_STEPS_TEXT))?.timeSignatures).toEqual([FOUR_FOUR])
    expect(parseDifficulty(text({ questionLength: 'two-to-four-notes' }))?.timeSignatures).toEqual([
      FOUR_FOUR,
    ])
  })

  it('read every offered name', () => {
    expect(
      parseDifficulty(text({ timeSignatures: ['4/4', '3/4', '2/4', '6/8'] }))?.timeSignatures,
    ).toEqual([FOUR_FOUR, { beats: 3, beatValue: 4 }, { beats: 2, beatValue: 4 }, SIX_EIGHT])
  })

  it.each(['one-bar', 'two-bars'])('read the length %s', (questionLength) => {
    expect(parseDifficulty(text({ questionLength }))?.questionLength).toBe(questionLength)
  })

  it.each([
    [[]],
    [['5/4']],
    [['4/4', '12/8']],
    [['4-4']],
    ['4/4'],
    [[4]],
    [[{ beats: 4, beatValue: 4 }]],
    [null],
  ])('give nothing for %j', (timeSignatures) => {
    expect(parseDifficulty(text({ timeSignatures }))).toBeNull()
  })

  it('give nothing when no checked time signature fits: one bar of 3/4 with the whole note alone', () => {
    expect(
      parseDifficulty(
        text({ durations: ['whole'], questionLength: 'one-bar', timeSignatures: ['3/4'] }),
      ),
    ).toBeNull()
  })
})
