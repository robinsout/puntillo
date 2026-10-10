import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import {
  allowedPitches,
  KEY_SIGNATURE_LIMITS,
  presetDifficulty,
  type Difficulty,
} from '@/domain/difficulty'
import { keySignatureLetters, type KeySignature } from '@/domain/key-signature'
import { isSamePitch, type Pitch } from '@/domain/pitch'
import type { Question } from '@/domain/question'

// Feature accidentals, slice 1, criterion 3: the key signature of a question is picked at random,
// from no signs up to the most the difficulty allows, of sharps or of flats. The notes stand on
// the places of the staff the difficulty allows, as before; each note sounds as the key signature
// makes it: in a key of one sharp a note on the 5th line is F♯5 (criterion 8).
//
// The key signature spends its values after the elements of the question: first the number of
// signs, floor(next × (most + 1)); then, for one sign or more, their kind: below 1/2 sharps, from
// 1/2 on flats. With no signs allowed it spends nothing, so the values go as before.

const SHARP_OR_FLAT = { sharp: '#', flat: 'b' }
const name = ({ letter, octave, alteration }: Pitch): string =>
  `${letter}${alteration === 1 ? SHARP_OR_FLAT.sharp : alteration === -1 ? SHARP_OR_FLAT.flat : ''}${octave}`
const notesOf = (question: Question) => question.notes.map((note) => name(note.pitch))

const ALMOST_ONE = 1 - Number.EPSILON

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

// First steps: one note of the seven D4…C5, by floor(next × 7), then half or quarter, by
// floor(next × 2). F4 is the third of them.
const FIRST_STEPS = presetDifficulty('first-steps')
const F4 = 2.5 / 7

const values = (overrides: Partial<Difficulty>): Difficulty => ({ ...FIRST_STEPS, ...overrides })
const generate = (random: Random, overrides: Partial<Difficulty> = {}) =>
  createQuestionGenerator(random, values(overrides))()

describe('a question without key signatures', () => {
  it('has no signs and spends no value on them', () => {
    const question = generate(scripted(F4, 0), { keySignatures: 0 })

    expect(question.keySignature).toEqual({ count: 0 })
    expect(notesOf(question)).toEqual(['F4'])
  })
})

describe('the key signature of a question', () => {
  it.each([
    [0, { count: 0 }],
    [0.33, { count: 0 }],
    [0.34, { count: 1, accidental: 'sharp' }],
    [0.67, { count: 2, accidental: 'sharp' }],
    [ALMOST_ONE, { count: 2, accidental: 'sharp' }],
  ] as const)('has, up to 2, from %f: %j', (value, keySignature) => {
    const random = keySignature.count === 0 ? scripted(F4, 0, value) : scripted(F4, 0, value, 0)

    expect(generate(random, { keySignatures: 2 }).keySignature).toEqual(keySignature)
  })

  it.each([
    [4, 0.99, 4],
    [4, 0.6, 3],
    [4, 0.2, 1],
    [7, ALMOST_ONE, 7],
    [7, 0.5, 4],
    [7, 0.124, 0],
  ] as const)('has, up to %i, from %f: %i signs', (most, value, count) => {
    const random = count === 0 ? scripted(F4, 0, value) : scripted(F4, 0, value, 0)

    expect(generate(random, { keySignatures: most }).keySignature.count).toBe(count)
  })

  it.each([
    [0, 'sharp'],
    [0.49, 'sharp'],
    [0.5, 'flat'],
    [ALMOST_ONE, 'flat'],
  ] as const)('is of sharps or flats by the next value, %f: %s', (value, accidental) => {
    expect(generate(scripted(F4, 0, ALMOST_ONE, value), { keySignatures: 7 }).keySignature).toEqual(
      { count: 7, accidental },
    )
  })

  it('is picked anew for each question', () => {
    const nextQuestion = createQuestionGenerator(
      scripted(F4, 0, 0.5, 0, 0, 0, ALMOST_ONE, 0.9),
      values({ keySignatures: 2 }),
    )

    expect(nextQuestion().keySignature).toEqual({ count: 1, accidental: 'sharp' })
    expect(nextQuestion().keySignature).toEqual({ count: 2, accidental: 'flat' })
  })
})

// Criterion 8.
describe('the notes in a key signature', () => {
  it('sound as the key signature makes them: F4 is F♯4 with one sharp', () => {
    expect(notesOf(generate(scripted(F4, 0, 0.5, 0), { keySignatures: 2 }))).toEqual(['F#4'])
  })

  it('leave a letter without a sign natural', () => {
    // E4, the second of the seven, with two sharps: F and C.
    expect(notesOf(generate(scripted(1.5 / 7, 0, ALMOST_ONE, 0), { keySignatures: 2 }))).toEqual([
      'E4',
    ])
  })

  it('take the flats: B4 is B♭4 with two flats', () => {
    // B4, the sixth of the seven.
    expect(notesOf(generate(scripted(5.5 / 7, 0, ALMOST_ONE, 0.5), { keySignatures: 2 }))).toEqual([
      'Bb4',
    ])
  })

  it('stand on the same place as without the key signature', () => {
    const without = generate(scripted(F4, 0), { keySignatures: 0 }).notes[0].pitch
    const within = generate(scripted(F4, 0, ALMOST_ONE, 0.5), { keySignatures: 7 }).notes[0].pitch

    expect({ letter: within.letter, octave: within.octave }).toEqual(without)
    expect(within.alteration).toBe(-1)
  })

  // Two bars of Advanced: all seven sharps reach every note of the question.
  it('are all altered in every bar with seven signs', () => {
    const difficulty: Difficulty = { ...presetDifficulty('advanced'), keySignatures: 7 }
    for (let seed = 0; seed < 50; seed++) {
      const question = createQuestionGenerator(seeded(seed), difficulty)()
      if (question.keySignature.count !== 7) continue
      const alteration = question.keySignature.accidental === 'sharp' ? 1 : -1
      expect(question.notes.map((note) => note.pitch.alteration)).toEqual(
        question.notes.map(() => alteration),
      )
    }
  })
})

// Spec 16: on random settings a generated question always keeps to the limits of spec 6.1.
describe('questions with key signatures over many sources', () => {
  const alterationOf = (keySignature: KeySignature, letter: Pitch['letter']) => {
    if (keySignature.count === 0 || !keySignatureLetters(keySignature).includes(letter))
      return undefined
    return keySignature.accidental === 'sharp' ? 1 : -1
  }

  it.each(['first-steps', 'confident-reading', 'advanced'] as const)(
    'keep each note on an allowed place, altered by the key signature alone, in %s with every limit',
    (preset) => {
      for (const keySignatures of KEY_SIGNATURE_LIMITS) {
        const difficulty: Difficulty = { ...presetDifficulty(preset), keySignatures }
        const places = allowedPitches(difficulty)
        for (let seed = 0; seed < 100; seed++) {
          const question = createQuestionGenerator(seeded(seed), difficulty)()
          expect(question.keySignature.count).toBeLessThanOrEqual(keySignatures)
          for (const { pitch } of question.notes) {
            const place = { letter: pitch.letter, octave: pitch.octave }
            expect(places.some((allowed) => isSamePitch(allowed, place))).toBe(true)
            expect(pitch.alteration).toBe(alterationOf(question.keySignature, pitch.letter))
          }
        }
      }
    },
  )

  it.each([2, 4, 7] as const)(
    'give every number of signs up to %i, sharps and flats alike',
    (keySignatures) => {
      const difficulty: Difficulty = { ...FIRST_STEPS, keySignatures }
      const nextQuestion = createQuestionGenerator(seeded(1), difficulty)
      const seen = new Set<string>()
      for (let count = 0; count < 1000; count++) {
        const { keySignature } = nextQuestion()
        seen.add(
          keySignature.count === 0 ? '0' : `${keySignature.count} ${keySignature.accidental}`,
        )
      }

      const expected = ['0']
      for (let count = 1; count <= keySignatures; count++)
        expected.push(`${count} sharp`, `${count} flat`)
      expect([...seen].sort()).toEqual(expected.sort())
    },
  )
})
