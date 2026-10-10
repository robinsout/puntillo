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

// Feature multi-note-questions, slice 4, criterion 6: with the rests on, questions of One bar and
// Two bars hold rests of the allowed durations. A rest fills its bar as a note of its duration
// does, counts towards the sixteen elements of a question, never follows another rest, and never
// leaves a question without a note to answer. One note and 2–4 notes stay notes alone: a question
// of 2–4 notes is two to four notes by its name.
//
// With the rests on, each element of a question of bars spends one value of its own before
// anything else: at 3/4 or above it is a rest, if one may stand there; otherwise it is a note.
// A rest then spends one value on its duration, the k-th of the durations it may take by
// floor(next × their number), as a note does; it spends none on a pitch. With the rests off, or in
// the other lengths, no value goes to the rests, so the values go as before.

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`
const shown = (element: NoteOrRest) =>
  isNote(element)
    ? `${name(element.pitch)} ${element.duration.value}`
    : `rest ${element.duration.value}`
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

// C4–C5 with one ledger line: the eight notes C4…C5. A source that gives 0 alternates C4 and D4,
// one just below 1 alternates C5 and B4.
const ONE_BAR_WITH_RESTS: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'one-bar',
  timeSignatures: [FOUR_FOUR],
  rests: true,
  dots: false,
}

const values = (overrides: Partial<Difficulty>): Difficulty => ({
  ...ONE_BAR_WITH_RESTS,
  ...overrides,
})

describe('a question of one bar with the rests on', () => {
  it('puts a rest where the value of an element is 3/4 or above', () => {
    // C4: a note, C4, half; a rest, quarter, the 2nd of half, quarter and eighth that fit what is
    // left; a note, D4, quarter.
    const question = createQuestionGenerator(
      scripted(0, 0, 0.3, 0.9, 0.4, 0, 0, 0),
      ONE_BAR_WITH_RESTS,
    )()

    expect(elementsOf(question)).toEqual(['C4 half', 'rest quarter', 'D4 quarter'])
  })

  it('asks about the notes alone', () => {
    const question = createQuestionGenerator(
      scripted(0, 0, 0.3, 0.9, 0.4, 0, 0, 0),
      ONE_BAR_WITH_RESTS,
    )()

    expect(question.notes.map(shown)).toEqual(['C4 half', 'D4 quarter'])
  })

  it.each([
    [0.74, ['C4 half', 'D4 half'], [0, 0, 0, 0.74, 0, 0]],
    [0.75, ['C4 half', 'rest half'], [0, 0, 0, 0.75, 0]],
  ])('takes %f as %j', (_, expected, script) => {
    const question = createQuestionGenerator(scripted(...script), values({ durations: ['half'] }))()

    expect(elementsOf(question)).toEqual(expected)
  })

  it('never puts two rests in a row: a note comes between them', () => {
    const question = createQuestionGenerator(always(ALMOST_ONE), ONE_BAR_WITH_RESTS)()

    expect(elementsOf(question)).toEqual([
      'rest eighth',
      'C5 eighth',
      'rest eighth',
      'B4 eighth',
      'rest eighth',
      'C5 eighth',
      'rest eighth',
      'B4 eighth',
    ])
  })

  it('writes a note where a rest would leave no note: a whole bar of 4/4', () => {
    const question = createQuestionGenerator(always(ALMOST_ONE), values({ durations: ['whole'] }))()

    expect(elementsOf(question)).toEqual(['C5 whole'])
  })

  // A half rest would fill 2/4 and leave no room for a note.
  it('starts with a rest only short enough to leave room for a note', () => {
    const question = createQuestionGenerator(
      always(ALMOST_ONE),
      values({ durations: ['half', 'quarter'], timeSignatures: [TWO_FOUR] }),
    )()

    expect(elementsOf(question)).toEqual(['rest quarter', 'C5 quarter'])
  })

  it('fills 3/4 exactly with the rests', () => {
    const question = createQuestionGenerator(
      always(ALMOST_ONE),
      values({ timeSignatures: [THREE_FOUR] }),
    )()

    expect(barsOf(question).map(sum)).toEqual([12])
    expect(question.elements.some(isRest)).toBe(true)
  })
})

describe('a question of two bars with the rests on', () => {
  it('may fill the first bar with a whole rest, the note in the second one', () => {
    const question = createQuestionGenerator(
      always(ALMOST_ONE),
      values({ questionLength: 'two-bars', durations: ['whole'] }),
    )()

    expect(elementsOf(question)).toEqual(['rest whole', 'C5 whole'])
  })

  // Criterion 5: sixteenths would make more than sixteen notes and rests.
  it('counts the rests towards sixteen elements', () => {
    const question = createQuestionGenerator(
      always(ALMOST_ONE),
      values({ questionLength: 'two-bars', durations: ['eighth', 'sixteenth'] }),
    )()

    expect(question.elements).toHaveLength(16)
    expect(question.elements.map((element) => element.duration.value)).toEqual(
      Array(16).fill('eighth'),
    )
    expect(question.elements.map((element) => isRest(element))).toEqual(
      Array.from({ length: 16 }, (_, index) => index % 2 === 0),
    )
    expect(barsOf(question).map(sum)).toEqual([16, 16])
  })
})

describe('the rests off or a question of notes alone', () => {
  it('spend no value on the rests when they are off', () => {
    const question = createQuestionGenerator(
      scripted(0, 0, 0, 0),
      values({ durations: ['half'], rests: false }),
    )()

    expect(elementsOf(question)).toEqual(['C4 half', 'D4 half'])
  })

  it('give no rest when they are off, whatever the values', () => {
    const question = createQuestionGenerator(
      always(ALMOST_ONE),
      values({ questionLength: 'two-bars', rests: false }),
    )()

    expect(question.elements.some(isRest)).toBe(false)
    expect(question.elements).toEqual(question.notes)
  })

  it('leave one note alone, spending no value on the rests', () => {
    const question = createQuestionGenerator(
      scripted(ALMOST_ONE, ALMOST_ONE),
      values({ questionLength: 'one-note' }),
    )()

    expect(elementsOf(question)).toEqual(['C5 eighth'])
  })

  it('leave 2–4 notes alone, spending no value on the rests', () => {
    // Two quarter notes: C5, then B4.
    const question = createQuestionGenerator(
      scripted(0, ALMOST_ONE, ALMOST_ONE, ALMOST_ONE, ALMOST_ONE),
      values({ questionLength: 'two-to-four-notes', durations: ['quarter'] }),
    )()

    expect(elementsOf(question)).toEqual(['C5 quarter', 'B4 quarter'])
  })
})

describe('the rests of the presets', () => {
  const restsIn = (difficulty: Difficulty, count: number) => {
    const nextQuestion = createQuestionGenerator(seeded(2026), difficulty)
    const questions = Array.from({ length: count }, nextQuestion)
    return {
      durations: new Set(
        questions.flatMap((question) =>
          question.elements.filter(isRest).map((rest) => rest.duration.value),
        ),
      ),
      withoutRests: questions.filter((question) => !question.elements.some(isRest)).length,
    }
  }

  // A whole rest would fill a bar of 4/4 and leave no note; it does not fit 3/4.
  it('are half, quarter and eighth rests in Confident reading, and some questions have none', () => {
    const { durations, withoutRests } = restsIn(presetDifficulty('confident-reading'), 500)

    expect(durations).toEqual(new Set(['half', 'quarter', 'eighth']))
    expect(withoutRests).toBeGreaterThan(0)
  })

  it('are of all five durations in Advanced', () => {
    expect(restsIn(presetDifficulty('advanced'), 2000).durations).toEqual(new Set(DURATION_VALUES))
  })

  it('are none in First steps', () => {
    expect(restsIn(presetDifficulty('first-steps'), 200).durations).toEqual(new Set())
  })
})

// Spec 16: on random settings a generated question always keeps to the limits of spec 6.1.
describe('questions with rests over random settings', () => {
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
        rests: random.next() < 0.7,
        dots: false,
      }
      if (isPlayable(difficulty)) return difficulty
    }
  }

  const describeSettings = (difficulty: Difficulty) =>
    `${name(difficulty.range.low)}–${name(difficulty.range.high)}, ` +
    `${difficulty.durations.join(' ')}, ${difficulty.questionLength} in ` +
    `${difficulty.timeSignatures.map(signature).join(' ')}, rests ${difficulty.rests ? 'on' : 'off'}`

  // What breaks the limits, so that a failure names the settings and the question.
  function breaches(difficulty: Difficulty, questions: readonly Question[]): string[] {
    const fitting = fittingTimeSignatures(difficulty).map(signature)
    const ofBars =
      difficulty.questionLength === 'one-bar' || difficulty.questionLength === 'two-bars'
    let previous: string | undefined
    return questions.flatMap((question, index) => {
      const time = signature(question.timeSignature)
      const bar = BAR[time] ?? 0
      const where = `${describeSettings(difficulty)}: question ${index + 1} in ${time}, ${elementsOf(question).join(', ')}`
      const found: string[] = []
      const { elements, notes } = question
      const rests = elements.filter(isRest)
      if (!fitting.includes(time)) found.push(`${where}: the time signature does not fit`)
      if (elements.length > 16) found.push(`${where}: ${elements.length} notes and rests`)
      if (notes.length === 0) found.push(`${where}: no note`)
      if (elements.filter(isNote).map(shown).join() !== notes.map(shown).join())
        found.push(`${where}: the notes are not the elements without the rests`)
      if (rests.length > 0 && !(difficulty.rests && ofBars))
        found.push(`${where}: a rest in ${difficulty.questionLength}, rests ${difficulty.rests}`)
      for (const rest of rests)
        if (!difficulty.durations.includes(rest.duration.value))
          found.push(`${where}: a ${rest.duration.value} rest`)
      elements.slice(1).forEach((each, at) => {
        const before = elements[at]
        if (before && isRest(before) && isRest(each)) found.push(`${where}: two rests in a row`)
      })
      if (ofBars) {
        const bars = barsOf(question)
        const count = difficulty.questionLength === 'two-bars' ? 2 : 1
        if (bars.length !== count || bars.some((each) => sum(each) !== bar))
          found.push(`${where}: not ${count} full bars`)
      }
      for (const note of notes) {
        const pitch = name(note.pitch)
        if (pitch === previous) found.push(`${where}: ${pitch} repeats the note before it`)
        previous = pitch
      }
      return found
    })
  }

  it.each([7, 61, 2026])(
    'seed %i: 300 settings, 100 questions each, keep to the bars, sixteen elements, a note at least, no two rests in a row',
    (seed) => {
      const settings = seeded(seed)
      for (let run = 0; run < 300; run++) {
        const difficulty = randomDifficulty(settings)
        const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)

        expect(breaches(difficulty, Array.from({ length: 100 }, nextQuestion))).toEqual([])
      }
    },
  )
})
