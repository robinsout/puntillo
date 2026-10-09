import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { diatonicPitchesBetween, diatonicStep, type Pitch } from '@/domain/pitch'
import { createQuestion, DURATION_VALUES, type Duration, type Question } from '@/domain/question'
import { ledgerLines } from '@/domain/staff'

const RANGE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

// Not a preset: eight notes and all four durations keep the arithmetic of the tests simple.
const C4_TO_C5: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
  ledgerLines: 1,
  durations: DURATION_VALUES,
  askDuration: true,
}

const FIRST_STEPS = presetDifficulty('first-steps')
const CONFIDENT_READING = presetDifficulty('confident-reading')

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`

const ALMOST_ONE = 1 - Number.EPSILON

// Each question spends two values: the first picks the pitch, the second the duration.
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

function uniformValues(buckets: number, perBucket: number): number[] {
  const total = buckets * perBucket
  return Array.from({ length: total }, (_, i) => i / total)
}

function countBy(names: string[]): Record<string, number> {
  return names.reduce<Record<string, number>>((counts, n) => {
    counts[n] = (counts[n] ?? 0) + 1
    return counts
  }, {})
}

const WHOLE = 0

function firstPitch(value: number): string {
  return name(createQuestionGenerator(scripted(value, WHOLE), C4_TO_C5)().note.pitch)
}

function secondPitch(first: number, second: number): string {
  const nextQuestion = createQuestionGenerator(scripted(first, WHOLE, second, WHOLE), C4_TO_C5)
  nextQuestion()
  return name(nextQuestion().note.pitch)
}

function firstDuration(value: number): string {
  return createQuestionGenerator(scripted(0, value), C4_TO_C5)().note.duration.value
}

describe('createQuestionGenerator', () => {
  describe('first question', () => {
    it('asks about the lowest note of the range when the source gives 0', () => {
      expect(firstPitch(0)).toBe('C4')
    })

    it('asks about the highest note of the range when the source gives almost 1', () => {
      expect(firstPitch(ALMOST_ONE)).toBe('C5')
    })

    it('lets the random source choose the note', () => {
      expect(firstPitch(0)).not.toBe(firstPitch(0.5))
    })

    it('picks each of the eight notes equally often over evenly spread values', () => {
      const names = uniformValues(8, 5).map(firstPitch)

      expect(countBy(names)).toEqual(Object.fromEntries(RANGE.map((n) => [n, 5])))
    })
  })

  describe('question shape', () => {
    it('puts the note on a treble staff in 4/4', () => {
      const question = createQuestionGenerator(scripted(0.3, 0.3), C4_TO_C5)()

      expect(question.clef).toBe('treble')
      expect(question.timeSignature).toEqual({ beats: 4, beatValue: 4 })
    })

    it('builds the question through the domain', () => {
      const question = createQuestionGenerator(scripted(0, 0.5), C4_TO_C5)()

      expect(question).toEqual(
        createQuestion({ pitch: { letter: 'C', octave: 4 }, duration: { value: 'quarter' } }),
      )
    })
  })

  describe('duration', () => {
    it.each([
      [0, 'whole'],
      [0.25, 'half'],
      [0.5, 'quarter'],
      [0.75, 'eighth'],
      [ALMOST_ONE, 'eighth'],
    ])('picks the duration by the second value: %f gives %s', (value, duration) => {
      expect(firstDuration(value)).toBe(duration)
    })

    // A constant source keeps the whole notes and the pitch sequence of earlier releases.
    it('asks about a whole note on C4, then on D4, when the source always gives 0', () => {
      const nextQuestion = createQuestionGenerator({ next: () => 0 }, C4_TO_C5)

      expect([nextQuestion(), nextQuestion()].map((q) => q.note)).toEqual([
        { pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } },
        { pitch: { letter: 'D', octave: 4 }, duration: { value: 'whole' } },
      ])
    })

    it('picks each of the four durations equally often over evenly spread values', () => {
      const durations = uniformValues(4, 5).map(firstDuration)

      expect(countBy(durations)).toEqual({ whole: 5, half: 5, quarter: 5, eighth: 5 })
    })

    it('does not let the duration value change the pitch', () => {
      const pitchWith = (duration: number) =>
        name(createQuestionGenerator(scripted(0.5, duration), C4_TO_C5)().note.pitch)

      expect(pitchWith(0)).toBe('G4')
      expect(pitchWith(ALMOST_ONE)).toBe('G4')
    })

    it('may repeat the duration of the previous question', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0.5, 0, 0.5), C4_TO_C5)

      const durations = [nextQuestion(), nextQuestion()].map((q) => q.note.duration.value)

      expect(durations).toEqual(['quarter', 'quarter'])
    })

    it('picks the duration of the next question by its own second value', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0.75), C4_TO_C5)

      const durations = [nextQuestion(), nextQuestion()].map((q) => q.note.duration.value)

      expect(durations).toEqual(['whole', 'eighth'])
    })
  })

  describe('next question', () => {
    it('never repeats the pitch of the previous question, even for the same random value', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0, 0, 0), C4_TO_C5)

      const pitches = [nextQuestion(), nextQuestion(), nextQuestion()].map((q) =>
        name(q.note.pitch),
      )

      expect(pitches[1]).not.toBe(pitches[0])
      expect(pitches[2]).not.toBe(pitches[1])
    })

    it('picks each of the seven other notes equally often after C4', () => {
      const names = uniformValues(7, 4).map((value) => secondPitch(0, value))

      expect(countBy(names)).toEqual(
        Object.fromEntries(RANGE.filter((n) => n !== 'C4').map((n) => [n, 4])),
      )
    })

    it('picks each of the seven other notes equally often after C5', () => {
      const names = uniformValues(7, 4).map((value) => secondPitch(ALMOST_ONE, value))

      expect(countBy(names)).toEqual(
        Object.fromEntries(RANGE.filter((n) => n !== 'C5').map((n) => [n, 4])),
      )
    })

    it('may ask about C4 right after C5', () => {
      expect(secondPitch(ALMOST_ONE, 0)).toBe('C4')
    })

    it('may ask about C5 right after C4', () => {
      expect(secondPitch(0, ALMOST_ONE)).toBe('C5')
    })
  })

  describe('properties over a seeded random source', () => {
    it.each([1, 42, 2026])(
      'seed %i: 1000 questions stay in range, never repeat, cover all eight',
      (seed) => {
        const nextQuestion = createQuestionGenerator(seeded(seed), C4_TO_C5)
        const names = Array.from({ length: 1000 }, () => name(nextQuestion().note.pitch))

        for (const n of names) expect(RANGE).toContain(n)
        names.slice(1).forEach((n, i) => expect(n).not.toBe(names[i]))
        expect(new Set(names)).toEqual(new Set(RANGE))
      },
    )

    it.each([1, 42, 2026])(
      'seed %i: 1000 questions use only the four durations, all of them, without dots',
      (seed) => {
        const nextQuestion = createQuestionGenerator(seeded(seed), C4_TO_C5)
        const durations = Array.from({ length: 1000 }, () => nextQuestion().note.duration)

        for (const duration of durations) expect(Object.keys(duration)).toEqual(['value'])
        expect(new Set(durations.map((d) => d.value))).toEqual(new Set(DURATION_VALUES))
      },
    )
  })

  // Feature difficulty-presets, criteria 3 and 4; spec 13: the generator takes the difficulty.
  describe('with the difficulty of a preset', () => {
    const firstPitchIn = (difficulty: Difficulty, value: number) =>
      name(createQuestionGenerator(scripted(value, 0), difficulty)().note.pitch)
    const firstDurationIn = (difficulty: Difficulty, value: number) =>
      createQuestionGenerator(scripted(0, value), difficulty)().note.duration.value

    it('starts First steps on D4 and ends it on C5: C4 needs a ledger line', () => {
      expect(firstPitchIn(FIRST_STEPS, 0)).toBe('D4')
      expect(firstPitchIn(FIRST_STEPS, ALMOST_ONE)).toBe('C5')
    })

    it('picks each of the seven First steps notes equally often', () => {
      const names = uniformValues(7, 3).map((value) => firstPitchIn(FIRST_STEPS, value))

      expect(countBy(names)).toEqual(
        Object.fromEntries(['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].map((n) => [n, 3])),
      )
    })

    it('draws First steps notes as half notes below 1/2 and quarter notes from 1/2', () => {
      expect(firstDurationIn(FIRST_STEPS, 0)).toBe('half')
      expect(firstDurationIn(FIRST_STEPS, 0.49)).toBe('half')
      expect(firstDurationIn(FIRST_STEPS, 0.5)).toBe('quarter')
      expect(firstDurationIn(FIRST_STEPS, ALMOST_ONE)).toBe('quarter')
    })

    it('picks each of the twelve Confident reading notes equally often, C4 to G5', () => {
      const names = uniformValues(12, 2).map((value) => firstPitchIn(CONFIDENT_READING, value))

      expect(countBy(names)).toEqual(
        Object.fromEntries(
          ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'].map((n) => [
            n,
            2,
          ]),
        ),
      )
    })

    it('picks each of the four Confident reading durations equally often', () => {
      const durations = uniformValues(4, 3).map((value) =>
        firstDurationIn(CONFIDENT_READING, value),
      )

      expect(countBy(durations)).toEqual({ whole: 3, half: 3, quarter: 3, eighth: 3 })
    })

    it('never repeats the previous note in First steps either', () => {
      const nextQuestion = createQuestionGenerator({ next: () => 0 }, FIRST_STEPS)

      const names = [nextQuestion(), nextQuestion(), nextQuestion()].map((q) => name(q.note.pitch))

      expect(names).toEqual(['D4', 'E4', 'D4'])
    })
  })

  // Spec 16: on random settings a generated question always keeps to the limits of spec 6.1.
  describe('properties over random settings', () => {
    // The ranges of this slice lie within C4–G5 and allow at most one ledger line.
    const SPAN = diatonicPitchesBetween({ letter: 'C', octave: 4 }, { letter: 'G', octave: 5 })

    function element<T>(items: readonly T[], random: Random): T {
      const item = items[Math.floor(random.next() * items.length)]
      if (item === undefined) throw new Error('no item to pick')
      return item
    }

    function randomDurations(random: Random): Duration['value'][] {
      const chosen = DURATION_VALUES.filter(() => random.next() < 0.5)
      return chosen.length > 0 ? chosen : [element(DURATION_VALUES, random)]
    }

    const allowedCount = (difficulty: Difficulty) =>
      diatonicPitchesBetween(difficulty.range.low, difficulty.range.high).filter(
        (pitch) => ledgerLines(pitch, 'treble') <= difficulty.ledgerLines,
      ).length

    // The settings panel will not offer fewer than two notes: one note could not change.
    function randomDifficulty(random: Random): Difficulty {
      for (;;) {
        const [low, high] = [element(SPAN, random), element(SPAN, random)].sort(
          (a, b) => diatonicStep(a) - diatonicStep(b),
        )
        if (!low || !high) throw new Error('no range')
        const difficulty: Difficulty = {
          range: { low, high },
          ledgerLines: element([0, 1] as const, random),
          durations: randomDurations(random),
          askDuration: random.next() < 0.5,
        }
        if (allowedCount(difficulty) >= 2) return difficulty
      }
    }

    const describeSettings = (difficulty: Difficulty) =>
      `${name(difficulty.range.low)}–${name(difficulty.range.high)}, ` +
      `${difficulty.ledgerLines} ledger lines, ${difficulty.durations.join(' ')}`

    // What breaks the limits, so that a failure names the settings and the question.
    function breaches(difficulty: Difficulty, questions: readonly Question[]): string[] {
      const low = diatonicStep(difficulty.range.low)
      const high = diatonicStep(difficulty.range.high)
      return questions.flatMap(({ note }, index) => {
        const step = diatonicStep(note.pitch)
        const where = `${describeSettings(difficulty)}: question ${index + 1}, ${name(note.pitch)}`
        return [
          step < low || step > high ? `${where} is out of the range` : [],
          ledgerLines(note.pitch, 'treble') > difficulty.ledgerLines
            ? `${where} needs too many ledger lines`
            : [],
          difficulty.durations.includes(note.duration.value)
            ? []
            : `${where} is a ${note.duration.value} note`,
          index > 0 && name(note.pitch) === name(questions[index - 1]!.note.pitch)
            ? `${where} repeats the previous note`
            : [],
        ].flat()
      })
    }

    it.each([7, 99, 2026])(
      'seed %i: 200 settings, 200 questions each, keep to the range, the ledger lines and the durations, never repeating a note',
      (seed) => {
        const settings = seeded(seed)
        for (let run = 0; run < 200; run++) {
          const difficulty = randomDifficulty(settings)
          const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)

          expect(breaches(difficulty, Array.from({ length: 200 }, nextQuestion))).toEqual([])
        }
      },
    )

    it.each([7, 99, 2026])(
      'seed %i: 50 settings, 1000 questions each, use every allowed note and duration',
      (seed) => {
        const settings = seeded(seed)
        for (let run = 0; run < 50; run++) {
          const difficulty = randomDifficulty(settings)
          const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)
          const questions = Array.from({ length: 1000 }, nextQuestion)

          expect({
            settings: describeSettings(difficulty),
            notes: new Set(questions.map((q) => name(q.note.pitch))).size,
            durations: new Set(questions.map((q) => q.note.duration.value)),
          }).toEqual({
            settings: describeSettings(difficulty),
            notes: allowedCount(difficulty),
            durations: new Set(difficulty.durations),
          })
        }
      },
    )
  })
})
