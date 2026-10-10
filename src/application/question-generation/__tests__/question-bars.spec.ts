import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import {
  allowedPitches,
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
  type Duration,
  type NoteOrRest,
  type Question,
  type TimeSignature,
} from '@/domain/question'
import { ledgerLines } from '@/domain/staff'

// Feature multi-note-questions, slice 3, criteria 4 and 5: the time signature of a question is
// picked among the checked ones; every bar of One bar and Two bars is full; a question holds at
// most sixteen notes, the durations growing longer when the values would allow more.
//
// The random values are spent in this order: the time signature first, but only when two or more
// of the checked ones fit; for 2–4 notes the number of notes; then the pitch and the duration of
// each note in turn. A time signature, a number and a duration are each the k-th of their
// candidates by floor(next × their number), the candidates in the order of the difficulty.

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`
const notesOf = (question: Question) =>
  question.notes.map((note) => `${name(note.pitch)} ${note.duration.value}`)
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
const BAR: Record<string, number> = { '4/4': 16, '3/4': 12, '2/4': 8, '6/8': 12 }

const sum = (elements: readonly NoteOrRest[]) =>
  elements.reduce(
    (total, { duration }) => total + LENGTH[duration.value] * (duration.dots ? 1.5 : 1),
    0,
  )

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

const always = (value: number): Random => ({ next: () => value })

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
const C4_TO_C5: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-note',
  timeSignatures: [FOUR_FOUR],
  rests: false,
  dots: false,
}

const values = (overrides: Partial<Difficulty>): Difficulty => ({ ...C4_TO_C5, ...overrides })

describe('the time signature of a question', () => {
  it.each([
    [0, '4/4'],
    [0.24, '4/4'],
    [0.25, '3/4'],
    [0.5, '2/4'],
    [0.74, '2/4'],
    [0.75, '6/8'],
    [ALMOST_ONE, '6/8'],
  ])('is picked by the first value among all four: %f gives %s', (value, expected) => {
    const difficulty = values({ durations: ['quarter'], timeSignatures: ALL })

    const question = createQuestionGenerator(scripted(value, 0, 0), difficulty)()

    expect(signature(question.timeSignature)).toBe(expected)
    expect(notesOf(question)).toEqual(['C4 quarter'])
  })

  it('spends no value when only one time signature is checked', () => {
    const difficulty = values({ durations: ['quarter'], timeSignatures: [SIX_EIGHT] })

    const question = createQuestionGenerator(scripted(0, 0), difficulty)()

    expect(signature(question.timeSignature)).toBe('6/8')
  })

  it('spends no value when only one of the checked ones fits: a whole note needs 4/4', () => {
    const difficulty = values({ durations: ['whole'], timeSignatures: [FOUR_FOUR, THREE_FOUR] })

    const question = createQuestionGenerator(scripted(0, 0), difficulty)()

    expect(signature(question.timeSignature)).toBe('4/4')
    expect(notesOf(question)).toEqual(['C4 whole'])
  })

  // Half notes fill 4/4 and 2/4 but not 3/4 or 6/8.
  it('is picked among the checked ones that fit, in their order', () => {
    const difficulty = values({
      questionLength: 'one-bar',
      durations: ['half'],
      timeSignatures: ALL,
    })

    const first = createQuestionGenerator(scripted(0.49, 0, 0, 0, 0), difficulty)()
    const second = createQuestionGenerator(scripted(0.5, 0, 0), difficulty)()

    expect(signature(first.timeSignature)).toBe('4/4')
    expect(notesOf(first)).toEqual(['C4 half', 'D4 half'])
    expect(signature(second.timeSignature)).toBe('2/4')
    expect(notesOf(second)).toEqual(['C4 half'])
  })

  it('is picked anew for each question', () => {
    const difficulty = values({ durations: ['quarter'], timeSignatures: [FOUR_FOUR, THREE_FOUR] })
    const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0.5, 0, 0), difficulty)

    expect([nextQuestion(), nextQuestion()].map((q) => signature(q.timeSignature))).toEqual([
      '4/4',
      '3/4',
    ])
  })
})

describe('a question of one note', () => {
  it('takes only the durations that fit the bar: no whole note in 3/4', () => {
    const difficulty = values({ timeSignatures: [THREE_FOUR] })
    const durationFor = (value: number) =>
      createQuestionGenerator(scripted(0, value), difficulty)().notes[0]?.duration.value

    expect(durationFor(0)).toBe('half')
    expect(durationFor(0.34)).toBe('quarter')
    expect(durationFor(ALMOST_ONE)).toBe('eighth')
  })

  it('takes the whole note in 4/4 as before', () => {
    expect(notesOf(createQuestionGenerator(scripted(0, 0), C4_TO_C5)())).toEqual(['C4 whole'])
  })
})

describe('a question of two to four notes', () => {
  it('fits its notes into one bar of the time signature picked', () => {
    // 0.5 picks 2/4 out of two. Two quarter notes fill 2/4, so the number of notes is picked
    // among those that fit, two alone.
    const difficulty = values({
      questionLength: 'two-to-four-notes',
      durations: ['quarter'],
      timeSignatures: [FOUR_FOUR, TWO_FOUR],
    })

    const question = createQuestionGenerator(scripted(0.5, 0.5, 0, 0, 0, 0), difficulty)()

    expect(signature(question.timeSignature)).toBe('2/4')
    expect(notesOf(question)).toEqual(['C4 quarter', 'D4 quarter'])
  })
})

describe('a question of one bar', () => {
  it('is a whole C4 in 4/4 for a source that gives 0, in Confident reading', () => {
    const question = createQuestionGenerator(always(0), presetDifficulty('confident-reading'))()

    expect(signature(question.timeSignature)).toBe('4/4')
    expect(notesOf(question)).toEqual(['C4 whole'])
  })

  // Each duration is picked among the allowed ones that still fit what is left of the bar.
  it('fills 3/4 exactly, each duration among those that fit what is left', () => {
    // A half note leaves a quarter: the half no longer fits, the quarter is the first left.
    const difficulty = values({
      questionLength: 'one-bar',
      durations: ['half', 'quarter', 'eighth'],
      timeSignatures: [THREE_FOUR],
    })

    const question = createQuestionGenerator(scripted(0, 0, 0, 0), difficulty)()

    expect(notesOf(question)).toEqual(['C4 half', 'D4 quarter'])
  })

  it('fills 6/8 with six eighths for a source that prefers the shortest', () => {
    const difficulty = values({
      questionLength: 'one-bar',
      durations: ['quarter', 'eighth'],
      timeSignatures: [SIX_EIGHT],
    })

    const question = createQuestionGenerator(always(ALMOST_ONE), difficulty)()

    expect(question.notes.map((note) => note.duration.value)).toEqual(Array(6).fill('eighth'))
    expect(signature(question.timeSignature)).toBe('6/8')
  })

  it('fills 4/4 with sixteen sixteenths: one bar is never too many notes', () => {
    const difficulty = values({ questionLength: 'one-bar', durations: ['sixteenth'] })

    expect(createQuestionGenerator(always(0), difficulty)().notes).toHaveLength(16)
  })

  it('never repeats the note just before', () => {
    const difficulty = values({ questionLength: 'one-bar', durations: ['quarter'] })

    const question = createQuestionGenerator(always(0.5), difficulty)()

    expect(question.notes.map((note) => name(note.pitch))).toEqual(['G4', 'F4', 'G4', 'F4'])
  })
})

describe('a question of two bars', () => {
  it('fills both bars of 2/4 with half notes', () => {
    const difficulty = values({
      questionLength: 'two-bars',
      durations: ['half'],
      timeSignatures: [TWO_FOUR],
    })

    const question = createQuestionGenerator(always(0), difficulty)()

    expect(notesOf(question)).toEqual(['C4 half', 'D4 half'])
    expect(barsOf(question).map(sum)).toEqual([8, 8])
  })

  it('fills two bars of 4/4 with two whole notes for a source that gives 0', () => {
    expect(
      notesOf(createQuestionGenerator(always(0), values({ questionLength: 'two-bars' }))()),
    ).toEqual(['C4 whole', 'D4 whole'])
  })

  // Criterion 5: sixteenths alone would be 32 notes, eighths alone are 16.
  it('takes eighths rather than sixteenths in two bars of 4/4, sixteen notes', () => {
    const difficulty = values({ questionLength: 'two-bars', durations: ['eighth', 'sixteenth'] })

    const question = createQuestionGenerator(always(ALMOST_ONE), difficulty)()

    expect(question.notes.map((note) => note.duration.value)).toEqual(Array(16).fill('eighth'))
    expect(barsOf(question).map(sum)).toEqual([16, 16])
  })

  it('makes room with longer notes in two bars of 3/4 with quarters and sixteenths', () => {
    const difficulty = values({
      questionLength: 'two-bars',
      durations: ['quarter', 'sixteenth'],
      timeSignatures: [THREE_FOUR],
    })

    const question = createQuestionGenerator(always(ALMOST_ONE), difficulty)()

    expect(question.notes.length).toBeLessThanOrEqual(16)
    expect(barsOf(question).map(sum)).toEqual([12, 12])
    expect(question.notes.some((note) => note.duration.value === 'sixteenth')).toBe(true)
  })

  it('does not start with the last note of the previous question', () => {
    const difficulty = values({ questionLength: 'two-bars' })
    const nextQuestion = createQuestionGenerator(always(0), difficulty)

    const pitches = [nextQuestion(), nextQuestion()].map((q) => q.notes.map((n) => name(n.pitch)))

    expect(pitches).toEqual([
      ['C4', 'D4'],
      ['C4', 'D4'],
    ])
  })

  it.each(['first-steps', 'confident-reading', 'advanced'] as const)(
    'gives two full bars with the values of %s and the length changed',
    (preset) => {
      const difficulty: Difficulty = { ...presetDifficulty(preset), questionLength: 'two-bars' }
      const question = createQuestionGenerator(seeded(11), difficulty)()

      const bars = barsOf(question)
      expect(bars).toHaveLength(2)
      for (const bar of bars) expect(sum(bar)).toBe(BAR[signature(question.timeSignature)])
    },
  )
})

// Spec 16: on random settings a generated question always keeps to the limits of spec 6.1.
describe('questions of every length over random settings', () => {
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
        // question-rests.spec.ts covers the rests.
        rests: false,
        dots: false,
      }
      if (isPlayable(difficulty)) return difficulty
    }
  }

  const describeSettings = (difficulty: Difficulty) =>
    `${name(difficulty.range.low)}–${name(difficulty.range.high)}, ` +
    `${difficulty.ledgerLines} ledger lines, ${difficulty.durations.join(' ')}, ` +
    `${difficulty.questionLength} in ${difficulty.timeSignatures.map(signature).join(' ')}`

  // What breaks the limits, so that a failure names the settings and the question.
  function breaches(difficulty: Difficulty, questions: readonly Question[]): string[] {
    const allowed = allowedPitches(difficulty).map(name)
    const fitting = fittingTimeSignatures(difficulty).map(signature)
    let previous: string | undefined
    return questions.flatMap((question, index) => {
      const time = signature(question.timeSignature)
      const bar = BAR[time] ?? 0
      const where = `${describeSettings(difficulty)}: question ${index + 1} in ${time}, ${notesOf(question).join(', ')}`
      const found: string[] = []
      const bars = barsOf(question)
      const count = question.notes.length
      if (!fitting.includes(time)) found.push(`${where}: the time signature does not fit`)
      if (count > 16) found.push(`${where}: ${count} notes`)
      switch (difficulty.questionLength) {
        case 'one-note':
          if (count !== 1 || sum(question.notes) > bar) found.push(`${where}: not one note`)
          break
        case 'two-to-four-notes':
          if (count < 2 || count > 4 || sum(question.notes) > bar)
            found.push(`${where}: not 2–4 notes in a bar`)
          break
        case 'one-bar':
          if (bars.length !== 1 || bars.some((each) => sum(each) !== bar))
            found.push(`${where}: not one full bar`)
          break
        case 'two-bars':
          if (bars.length !== 2 || bars.some((each) => sum(each) !== bar))
            found.push(`${where}: not two full bars`)
          break
      }
      for (const note of question.notes) {
        const pitch = name(note.pitch)
        if (!allowed.includes(pitch)) found.push(`${where}: ${pitch} is not allowed`)
        if (ledgerLines(note.pitch, 'treble') > difficulty.ledgerLines)
          found.push(`${where}: ${pitch} needs too many ledger lines`)
        if (!difficulty.durations.includes(note.duration.value))
          found.push(`${where}: a ${note.duration.value} note`)
        if (pitch === previous) found.push(`${where}: ${pitch} repeats the note before it`)
        previous = pitch
      }
      return found
    })
  }

  it.each([5, 47, 2026])(
    'seed %i: 300 settings, 100 questions each, keep to the time signature, the bars, sixteen notes, the range and the durations',
    (seed) => {
      const settings = seeded(seed)
      for (let run = 0; run < 300; run++) {
        const difficulty = randomDifficulty(settings)
        const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)

        expect(breaches(difficulty, Array.from({ length: 100 }, nextQuestion))).toEqual([])
      }
    },
  )

  it.each([5, 47, 2026])(
    'seed %i: 50 settings, 500 questions each, use every time signature that fits',
    (seed) => {
      const settings = seeded(seed)
      for (let run = 0; run < 50; run++) {
        const difficulty = randomDifficulty(settings)
        const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)
        const used = new Set(
          Array.from({ length: 500 }, () => signature(nextQuestion().timeSignature)),
        )

        expect({ settings: describeSettings(difficulty), used }).toEqual({
          settings: describeSettings(difficulty),
          used: new Set(fittingTimeSignatures(difficulty).map(signature)),
        })
      }
    },
  )
})
