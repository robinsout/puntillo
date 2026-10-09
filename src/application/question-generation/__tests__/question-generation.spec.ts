import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import type { Pitch } from '@/domain/pitch'
import { createQuestion, DURATION_VALUES } from '@/domain/question'

const RANGE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

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
  return name(createQuestionGenerator(scripted(value, WHOLE))().note.pitch)
}

function secondPitch(first: number, second: number): string {
  const nextQuestion = createQuestionGenerator(scripted(first, WHOLE, second, WHOLE))
  nextQuestion()
  return name(nextQuestion().note.pitch)
}

function firstDuration(value: number): string {
  return createQuestionGenerator(scripted(0, value))().note.duration.value
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
      const question = createQuestionGenerator(scripted(0.3, 0.3))()

      expect(question.clef).toBe('treble')
      expect(question.timeSignature).toEqual({ beats: 4, beatValue: 4 })
    })

    it('builds the question through the domain', () => {
      const question = createQuestionGenerator(scripted(0, 0.5))()

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
      const nextQuestion = createQuestionGenerator({ next: () => 0 })

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
        name(createQuestionGenerator(scripted(0.5, duration))().note.pitch)

      expect(pitchWith(0)).toBe('G4')
      expect(pitchWith(ALMOST_ONE)).toBe('G4')
    })

    it('may repeat the duration of the previous question', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0.5, 0, 0.5))

      const durations = [nextQuestion(), nextQuestion()].map((q) => q.note.duration.value)

      expect(durations).toEqual(['quarter', 'quarter'])
    })

    it('picks the duration of the next question by its own second value', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0.75))

      const durations = [nextQuestion(), nextQuestion()].map((q) => q.note.duration.value)

      expect(durations).toEqual(['whole', 'eighth'])
    })
  })

  describe('next question', () => {
    it('never repeats the pitch of the previous question, even for the same random value', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0, 0, 0))

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
        const nextQuestion = createQuestionGenerator(seeded(seed))
        const names = Array.from({ length: 1000 }, () => name(nextQuestion().note.pitch))

        for (const n of names) expect(RANGE).toContain(n)
        names.slice(1).forEach((n, i) => expect(n).not.toBe(names[i]))
        expect(new Set(names)).toEqual(new Set(RANGE))
      },
    )

    it.each([1, 42, 2026])(
      'seed %i: 1000 questions use only the four durations, all of them, without dots',
      (seed) => {
        const nextQuestion = createQuestionGenerator(seeded(seed))
        const durations = Array.from({ length: 1000 }, () => nextQuestion().note.duration)

        for (const duration of durations) expect(Object.keys(duration)).toEqual(['value'])
        expect(new Set(durations.map((d) => d.value))).toEqual(new Set(DURATION_VALUES))
      },
    )
  })
})
