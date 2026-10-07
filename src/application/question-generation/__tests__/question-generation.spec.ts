import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import type { Pitch } from '@/domain/pitch'
import { createQuestion } from '@/domain/question'

// Срез 2: нота вопроса — одна из восьми высот C4–C5, выбор равновероятный,
// новая высота никогда не повторяет предыдущую.
const RANGE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`

const ALMOST_ONE = 1 - Number.EPSILON

// Источник случайности по сценарию: каждое обращение берёт следующее значение.
// Генератор тратит одно значение на вопрос, лишнее обращение — ошибка теста.
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

// Детерминированный псевдослучайный источник с сидом (mulberry32).
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

// Значения, равномерно покрывающие [0, 1): по `perBucket` на каждую из `buckets` долей.
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

// Высота второго вопроса, если первый получен значением `first`, а второй — `second`.
function secondPitch(first: number, second: number): string {
  const nextQuestion = createQuestionGenerator(scripted(first, second))
  nextQuestion()
  return name(nextQuestion().note.pitch)
}

describe('createQuestionGenerator', () => {
  describe('first question', () => {
    it('asks about the lowest note of the range when the source gives 0', () => {
      const nextQuestion = createQuestionGenerator(scripted(0))

      expect(name(nextQuestion().note.pitch)).toBe('C4')
    })

    it('asks about the highest note of the range when the source gives almost 1', () => {
      const nextQuestion = createQuestionGenerator(scripted(ALMOST_ONE))

      expect(name(nextQuestion().note.pitch)).toBe('C5')
    })

    it('lets the random source choose the note', () => {
      const first = (value: number) => name(createQuestionGenerator(scripted(value))().note.pitch)

      expect(first(0)).not.toBe(first(0.5))
    })

    it('picks each of the eight notes equally often over evenly spread values', () => {
      const names = uniformValues(8, 5).map((value) =>
        name(createQuestionGenerator(scripted(value))().note.pitch),
      )

      expect(countBy(names)).toEqual(Object.fromEntries(RANGE.map((n) => [n, 5])))
    })
  })

  describe('question shape', () => {
    it('puts a whole note on a treble staff in 4/4', () => {
      const question = createQuestionGenerator(scripted(0.3))()

      expect(question.note.duration).toEqual({ value: 'whole' })
      expect(question.clef).toBe('treble')
      expect(question.timeSignature).toEqual({ beats: 4, beatValue: 4 })
    })

    it('builds the question through the domain', () => {
      const question = createQuestionGenerator(scripted(0))()

      expect(question).toEqual(
        createQuestion({ pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } }),
      )
    })
  })

  describe('next question', () => {
    it('never repeats the pitch of the previous question, even for the same random value', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0, 0))

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
  })
})
