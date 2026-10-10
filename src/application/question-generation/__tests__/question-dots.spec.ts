import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import {
  fittingTimeSignatures,
  isPlayable,
  presetDifficulty,
  QUESTION_LENGTHS,
  type Difficulty,
} from '@/domain/difficulty'
import { diatonicPitchesBetween, diatonicStep, type Pitch } from '@/domain/pitch'
import {
  barsOf,
  DURATION_VALUES,
  isNote,
  isRest,
  type Duration,
  type NoteOrRest,
  type Question,
  type TimeSignature,
} from '@/domain/question'

// Feature multi-note-questions, slice 5, criterion 7: with the dots on, questions hold dotted
// notes and dotted rests, in every length of question. A dotted duration is half as long again;
// every bar of One bar and Two bars is still full, the sixteen elements still hold, and a
// sixteenth is never dotted.
//
// With the dots on, an element's duration is the k-th of the durations that may stand there,
// plain or dotted, by floor(next × their number); right after it the element spends one value
// on its dot. It is dotted when the value is 3/4 or above and the dotted duration may stand
// there, or when only the dotted one may. The value is spent even when no dot may stand there,
// so that one choice never shifts the values the next ones get. With the dots off, no value goes
// to the dots, so the values go as before.

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`
const durationText = ({ value, dots }: Duration) => `${value}${dots ? '.' : ''}`
const shown = (element: NoteOrRest) =>
  isNote(element)
    ? `${name(element.pitch)} ${durationText(element.duration)}`
    : `rest ${durationText(element.duration)}`
const elementsOf = (question: Question) => question.elements.map(shown)
const signature = ({ beats, beatValue }: TimeSignature) => `${beats}/${beatValue}`

const ALMOST_ONE = 1 - Number.EPSILON

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }
const TWO_FOUR: TimeSignature = { beats: 2, beatValue: 4 }
const SIX_EIGHT: TimeSignature = { beats: 6, beatValue: 8 }
const ALL = [FOUR_FOUR, THREE_FOUR, TWO_FOUR, SIX_EIGHT]

const LENGTH: Record<Duration['value'], number> = {
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  sixteenth: 1,
}
const lengthOf = ({ value, dots }: Duration) => LENGTH[value] * (dots ? 1.5 : 1)
const BAR: Record<string, number> = { '4/4': 16, '3/4': 12, '2/4': 8, '6/8': 12 }

const sum = (elements: readonly NoteOrRest[]) =>
  elements.reduce((total, element) => total + lengthOf(element.duration), 0)

// An extra call fails the test.
function scripted(...values: number[]): Random {
  const queue = [...values]
  return {
    next() {
      const value = queue.shift()
      if (value === undefined) throw new Error('scripted random is exhausted')
      return value
    },
  }
}

// mulberry32: a deterministic seeded generator.
function seeded(seed: number): Random {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

// C4–C5 with one ledger line: the eight notes C4…C5. A source that gives 0 alternates C4 and D4.
const ONE_BAR_WITH_DOTS: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
  ledgerLines: 1,
  durations: ['half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-bar',
  timeSignatures: [FOUR_FOUR],
  rests: false,
  dots: true,
}

const values = (overrides: Partial<Difficulty>): Difficulty => ({
  ...ONE_BAR_WITH_DOTS,
  ...overrides,
})

const generated = (random: Random, overrides: Partial<Difficulty> = {}) =>
  elementsOf(createQuestionGenerator(random, values(overrides))())

describe('a question of one bar with the dots on', () => {
  it('dots a note where the value of its dot is 3/4 or above', () => {
    // C4, half of half, quarter and eighth, dotted at 0.75; D4, quarter of the quarter and the
    // eighth that fit the four sixteenths left, not dotted: a dotted quarter is too long.
    expect(generated(scripted(0, 0, 0.75, 0, 0, 0.9))).toEqual(['C4 half.', 'D4 quarter'])
  })

  it('leaves the note plain below 3/4', () => {
    expect(generated(scripted(0, 0, 0.74, 0, 0, 0.9))).toEqual(['C4 half', 'D4 half'])
  })

  // Half notes alone fill a bar of 3/4 only when dotted.
  it('dots a note when only the dotted duration may stand there, whatever the value', () => {
    expect(
      generated(scripted(0, 0, 0), { durations: ['half'], timeSignatures: [THREE_FOUR] }),
    ).toEqual(['C4 half.'])
  })

  // A dotted eighth leaves five sixteenths of 2/4: a dotted eighth and an eighth close the bar.
  it('closes a bar left an odd number of sixteenths', () => {
    const question = generated(scripted(0, 0.5, 0.9, 0, 0, 0.9, 0, 0, 0.9), {
      durations: ['quarter', 'eighth'],
      timeSignatures: [TWO_FOUR],
    })

    expect(question).toEqual(['C4 eighth.', 'D4 eighth.', 'C4 eighth'])
  })

  it('dots a rest as it dots a note', () => {
    // A rest at 0.9, half of half and quarter, dotted at 0.9; then no rest after a rest, C4,
    // quarter, not dotted: a dotted quarter is too long for what is left.
    const question = generated(scripted(0.9, 0, 0.9, 0.9, 0, 0, 0.9), {
      durations: ['half', 'quarter'],
      rests: true,
    })

    expect(question).toEqual(['rest half.', 'C4 quarter'])
  })
})

describe('a question of one note with the dots on', () => {
  it('may be a dotted note', () => {
    expect(
      generated(scripted(0, 0, 0.9), { questionLength: 'one-note', durations: ['half'] }),
    ).toEqual(['C4 half.'])
  })

  it('is never a dotted sixteenth, though the value of its dot is spent', () => {
    expect(
      generated(scripted(ALMOST_ONE, 0, ALMOST_ONE), {
        questionLength: 'one-note',
        durations: ['sixteenth'],
      }),
    ).toEqual(['C5 sixteenth'])
  })

  it('is never a dotted whole note: it is longer than the bar', () => {
    expect(
      generated(scripted(0, 0, ALMOST_ONE), { questionLength: 'one-note', durations: ['whole'] }),
    ).toEqual(['C4 whole'])
  })
})

describe('a question of 2–4 notes with the dots on', () => {
  it('may hold dotted notes, each leaving room for the notes after it', () => {
    // Two notes; C4 quarter, dotted; D4 quarter, dotted.
    const question = generated(scripted(0, 0, 0, 0.9, 0, 0, 0.9), {
      questionLength: 'two-to-four-notes',
      durations: ['quarter'],
    })

    expect(question).toEqual(['C4 quarter.', 'D4 quarter.'])
  })
})

describe('the dots off', () => {
  it('spend no value on the dots', () => {
    expect(generated(scripted(0, 0, 0, 0), { durations: ['half'], dots: false })).toEqual([
      'C4 half',
      'D4 half',
    ])
  })

  it('give no dot, whatever the values', () => {
    const question = createQuestionGenerator(
      { next: () => ALMOST_ONE },
      values({ questionLength: 'two-bars', rests: true, dots: false }),
    )()

    expect(question.elements.some((element) => element.duration.dots)).toBe(false)
  })

  it('write a plain duration without a dots field', () => {
    const question = createQuestionGenerator(
      scripted(0, 0, 0, 0),
      values({ durations: ['half'], dots: false }),
    )()

    expect(question.notes.map((note) => note.duration)).toEqual([
      { value: 'half' },
      { value: 'half' },
    ])
  })
})

describe('the dots of the presets', () => {
  const dotsIn = (difficulty: Difficulty, count: number) => {
    const nextQuestion = createQuestionGenerator(seeded(2026), difficulty)
    const elements = Array.from({ length: count }, nextQuestion).flatMap(
      (question) => question.elements,
    )
    const dottedOf = (kind: (element: NoteOrRest) => boolean) =>
      new Set(
        elements
          .filter((element) => kind(element) && element.duration.dots)
          .map((element) => element.duration.value),
      )
    return {
      notes: dottedOf(isNote),
      rests: dottedOf(isRest),
      plain: elements.filter((element) => !element.duration.dots).length,
    }
  }

  // A dotted whole note is longer than any bar; a sixteenth takes no dot.
  it('are dotted half, quarter and eighth notes and rests in Advanced, among plain ones', () => {
    const { notes, rests, plain } = dotsIn(presetDifficulty('advanced'), 2000)

    expect(notes).toEqual(new Set(['half', 'quarter', 'eighth']))
    expect(rests).toEqual(new Set(['half', 'quarter', 'eighth']))
    expect(plain).toBeGreaterThan(0)
  })

  it('are dotted notes in Advanced with one note', () => {
    const { notes } = dotsIn({ ...presetDifficulty('advanced'), questionLength: 'one-note' }, 500)

    expect(notes).toEqual(new Set(['half', 'quarter', 'eighth']))
  })

  it.each(['first-steps', 'confident-reading'] as const)('are none in %s', (preset) => {
    const { notes, rests } = dotsIn(presetDifficulty(preset), 500)

    expect([...notes, ...rests]).toEqual([])
  })
})

// Spec 16: on random settings a generated question always keeps to the limits of spec 6.1.
describe('questions with dots over random settings', () => {
  const SPAN = diatonicPitchesBetween({ letter: 'A', octave: 3 }, { letter: 'C', octave: 6 })

  function element<T>(items: readonly T[], random: Random): T {
    const item = items[Math.floor(random.next() * items.length)]
    if (item === undefined) throw new Error('no item to pick')
    return item
  }

  // Only what the panel lets one choose: a playable difficulty.
  function randomDifficulty(random: Random): Difficulty {
    for (;;) {
      const [low, high] = [element(SPAN, random), element(SPAN, random)].sort(
        (a, b) => diatonicStep(a) - diatonicStep(b),
      )
      if (!low || !high) throw new Error('no range')
      const difficulty: Difficulty = {
        range: { low, high },
        ledgerLines: element([0, 1, 2] as const, random),
        durations: DURATION_VALUES.filter(() => random.next() < 0.5),
        askDuration: random.next() < 0.5,
        questionLength: element(QUESTION_LENGTHS, random),
        timeSignatures: ALL.filter(() => random.next() < 0.5),
        rests: random.next() < 0.5,
        dots: random.next() < 0.7,
      }
      if (isPlayable(difficulty)) return difficulty
    }
  }

  const describeSettings = (difficulty: Difficulty) =>
    `${name(difficulty.range.low)}–${name(difficulty.range.high)}, ` +
    `${difficulty.durations.join(' ')}, ${difficulty.questionLength} in ` +
    `${difficulty.timeSignatures.map(signature).join(' ')}, rests ${difficulty.rests ? 'on' : 'off'}, ` +
    `dots ${difficulty.dots ? 'on' : 'off'}`

  // What breaks the limits, so that a failure names the settings and the question.
  function breaches(difficulty: Difficulty, questions: readonly Question[]): string[] {
    const fitting = fittingTimeSignatures(difficulty).map(signature)
    const { questionLength } = difficulty
    const ofBars = questionLength === 'one-bar' || questionLength === 'two-bars'
    return questions.flatMap((question, index) => {
      const time = signature(question.timeSignature)
      const bar = BAR[time] ?? 0
      const where = `${describeSettings(difficulty)}: question ${index + 1} in ${time}, ${elementsOf(question).join(', ')}`
      const found: string[] = []
      const { elements, notes } = question
      if (!fitting.includes(time)) found.push(`${where}: the time signature does not fit`)
      if (elements.length > 16) found.push(`${where}: ${elements.length} notes and rests`)
      if (notes.length === 0) found.push(`${where}: no note`)
      for (const { duration } of elements) {
        if (!difficulty.durations.includes(duration.value))
          found.push(`${where}: a ${duration.value}`)
        if (duration.dots !== undefined && duration.dots !== 1)
          found.push(`${where}: ${String(duration.dots)} dots`)
        if (duration.dots && !difficulty.dots) found.push(`${where}: a dot with the dots off`)
        if (duration.dots && duration.value === 'sixteenth')
          found.push(`${where}: a dotted sixteenth`)
      }
      if (ofBars) {
        const bars = barsOf(question)
        const count = questionLength === 'two-bars' ? 2 : 1
        if (bars.length !== count || bars.some((each) => sum(each) !== bar))
          found.push(`${where}: not ${count} full bars`)
      } else if (sum(elements) > bar) found.push(`${where}: longer than a bar`)
      if (questionLength === 'one-note' && elements.length !== 1)
        found.push(`${where}: not one note`)
      if (questionLength === 'two-to-four-notes' && (elements.length < 2 || elements.length > 4))
        found.push(`${where}: not 2–4 notes`)
      return found
    })
  }

  it.each([11, 89, 2026])(
    'seed %i: 300 settings, 100 questions each, keep to the bars, sixteen elements and the allowed dots',
    (seed) => {
      const settings = seeded(seed)
      for (let run = 0; run < 300; run++) {
        const difficulty = randomDifficulty(settings)
        const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)

        expect(breaches(difficulty, Array.from({ length: 100 }, nextQuestion))).toEqual([])
      }
    },
  )

  it('give dotted elements in some of the settings with the dots on', () => {
    const settings = seeded(5)
    let dotted = 0
    for (let run = 0; run < 100; run++) {
      const difficulty = { ...randomDifficulty(settings), dots: true }
      if (!isPlayable(difficulty)) continue
      const nextQuestion = createQuestionGenerator(seeded(run), difficulty)
      dotted += Array.from({ length: 20 }, nextQuestion)
        .flatMap((question) => question.elements)
        .filter((each) => each.duration.dots).length
    }

    expect(dotted).toBeGreaterThan(0)
  })
})
