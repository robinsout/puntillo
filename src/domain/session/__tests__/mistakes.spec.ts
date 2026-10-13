import { describe, expect, it } from 'vitest'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import {
  mostMistakes,
  NO_MISTAKES,
  recordMistakes,
  type ItemMistakes,
  type Mistake,
  type Mistakes,
} from '@/domain/session'
import type { WikiTopic } from '@/domain/wiki'

// Feature session-summary, slice 2: the mistakes of a session by item, for Most mistakes in the
// results (criteria 6–8).
//
// An item is a pitch as written and a duration, as in the review queue: F4 and F♯4 are two items,
// so are C4 as a quarter and C4 as a half. Each mistake made in a first attempt counts once for
// its item, with the topics of the wiki that explain it; recordMistakes takes the mistakes of one
// checked question, in the order of its notes. mostMistakes gives up to five items with their
// number of mistakes and the topics of all their mistakes together, each once, in the order
// place, signs, key signatures, duration. The items with more mistakes come first; of two with
// as many, the one whose last mistake was later.

const QUARTER: Duration = { value: 'quarter' }
const HALF: Duration = { value: 'half' }
const DOTTED_QUARTER: Duration = { value: 'quarter', dots: 1 }

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const item = (
  letter: Letter,
  octave: number,
  duration: Duration = QUARTER,
  alteration?: Alteration,
): ReviewItem => ({ pitch: pitch(letter, octave, alteration), duration })

const C4 = item('C', 4)
const D4 = item('D', 4)
const E4 = item('E', 4)
const F4 = item('F', 4)
const G4 = item('G', 4)
const A4 = item('A', 4)
const B4 = item('B', 4)
const F_SHARP_4 = item('F', 4, QUARTER, 1)

const STAFF: readonly WikiTopic[] = ['treble-staff']

const mistake = (of: ReviewItem, topics: readonly WikiTopic[] = STAFF): Mistake => ({
  item: of,
  topics,
})

// One checked question for each list of mistakes, in turn.
const recorded = (...questions: readonly Mistake[][]): Mistakes =>
  questions.reduce<Mistakes>((mistakes, made) => recordMistakes(mistakes, made), NO_MISTAKES)

const counts = (mistakes: Mistakes) =>
  mostMistakes(mistakes).map(({ item: { pitch, duration }, count }) => ({
    pitch,
    duration,
    count,
  }))

describe('mostMistakes', () => {
  it('gives nothing without mistakes', () => {
    expect(mostMistakes(NO_MISTAKES)).toEqual([])
  })

  it('gives nothing after questions answered right', () => {
    expect(mostMistakes(recorded([], []))).toEqual([])
  })

  it('gives the item of a mistake with one mistake and its topics', () => {
    expect(mostMistakes(recorded([mistake(C4)]))).toEqual<ItemMistakes[]>([
      { item: C4, count: 1, topics: ['treble-staff'] },
    ])
  })

  it('counts every mistake on the same item', () => {
    expect(counts(recorded([mistake(C4)], [], [mistake(C4)], [mistake(C4)]))).toEqual([
      { ...C4, count: 3 },
    ])
  })

  it('counts two wrong notes of the same item in one question as two mistakes', () => {
    expect(counts(recorded([mistake(C4), mistake(C4)]))).toEqual([{ ...C4, count: 2 }])
  })

  it('tells a pitch with a sign from the same pitch without it', () => {
    const result = mostMistakes(recorded([mistake(F4)], [mistake(F_SHARP_4)], [mistake(F4)]))

    expect(result.map(({ item: each, count }) => ({ item: each, count }))).toEqual([
      { item: F4, count: 2 },
      { item: F_SHARP_4, count: 1 },
    ])
  })

  it('tells the same pitch in two durations apart, a dotted one too', () => {
    const half = item('C', 4, HALF)
    const dotted = item('C', 4, DOTTED_QUARTER)

    const result = mostMistakes(recorded([mistake(C4)], [mistake(half)], [mistake(dotted)]))

    expect(result.map(({ item: each }) => each)).toEqual([dotted, half, C4])
  })

  it('takes the same pitch an octave higher as another item', () => {
    const c5 = item('C', 5)

    expect(mostMistakes(recorded([mistake(C4)], [mistake(c5)]))).toHaveLength(2)
  })

  describe('the order (criterion 7)', () => {
    it('puts the item with more mistakes first, even when its last mistake was earlier', () => {
      const mistakes = recorded([mistake(C4)], [mistake(C4)], [mistake(D4)])

      expect(counts(mistakes)).toEqual([
        { ...C4, count: 2 },
        { ...D4, count: 1 },
      ])
    })

    it('puts the later mistake first among items with as many', () => {
      const mistakes = recorded([mistake(C4)], [mistake(D4)], [mistake(E4)])

      expect(counts(mistakes).map(({ pitch: { letter } }) => letter)).toEqual(['E', 'D', 'C'])
    })

    it('goes by the last mistake of each item, not the first', () => {
      const mistakes = recorded([mistake(C4)], [mistake(D4)], [mistake(D4)], [mistake(C4)])

      expect(counts(mistakes).map(({ pitch: { letter } }) => letter)).toEqual(['C', 'D'])
    })

    it('takes a later note of the same question as a later mistake', () => {
      const mistakes = recorded([mistake(C4), mistake(D4)])

      expect(counts(mistakes).map(({ pitch: { letter } }) => letter)).toEqual(['D', 'C'])
    })

    it('orders by the number first, the time second', () => {
      // C4: 2, last on question 5; D4: 3, last on question 4; E4: 2, last on question 6.
      const mistakes = recorded(
        [mistake(C4)],
        [mistake(D4)],
        [mistake(D4)],
        [mistake(D4)],
        [mistake(C4)],
        [mistake(E4)],
        [mistake(E4)],
      )

      expect(counts(mistakes)).toEqual([
        { ...D4, count: 3 },
        { ...E4, count: 2 },
        { ...C4, count: 2 },
      ])
    })
  })

  describe('up to five items (criterion 6)', () => {
    it('gives five items of five', () => {
      const mistakes = recorded([C4, D4, E4, F4, G4].map((each) => mistake(each)))

      expect(mostMistakes(mistakes)).toHaveLength(5)
    })

    it('gives the five first of seven, the rest left out', () => {
      // A4 and B4 have two mistakes; of the others, with one each, the three latest stay.
      const mistakes = recorded(
        [mistake(A4)],
        [mistake(B4)],
        [mistake(C4)],
        [mistake(D4)],
        [mistake(E4)],
        [mistake(F4)],
        [mistake(G4)],
        [mistake(A4), mistake(B4)],
      )

      expect(counts(mistakes)).toEqual([
        { ...B4, count: 2 },
        { ...A4, count: 2 },
        { ...G4, count: 1 },
        { ...F4, count: 1 },
        { ...E4, count: 1 },
      ])
    })
  })

  describe('the topics (criterion 8)', () => {
    const topicsOf = (mistakes: Mistakes) => mostMistakes(mistakes).map(({ topics }) => topics)

    it('gives the topics of the one mistake', () => {
      expect(topicsOf(recorded([mistake(F_SHARP_4, ['treble-staff', 'accidentals'])]))).toEqual([
        ['treble-staff', 'accidentals'],
      ])
    })

    it('gives the topics of all the mistakes on the item, each once', () => {
      const mistakes = recorded(
        [mistake(C4, ['treble-staff'])],
        [mistake(C4, ['durations'])],
        [mistake(C4, ['treble-staff', 'durations'])],
      )

      expect(topicsOf(mistakes)).toEqual([['treble-staff', 'durations']])
    })

    it('orders the topics place, signs, key signatures, duration, whatever the order made', () => {
      const mistakes = recorded(
        [mistake(F_SHARP_4, ['durations'])],
        [mistake(F_SHARP_4, ['accidentals', 'key-signatures'])],
        [mistake(F_SHARP_4, ['treble-staff'])],
      )

      expect(topicsOf(mistakes)).toEqual([
        ['treble-staff', 'accidentals', 'key-signatures', 'durations'],
      ])
    })

    it('keeps the topics of each item apart', () => {
      const mistakes = recorded([mistake(C4, ['durations'])], [mistake(D4, ['treble-staff'])])

      expect(topicsOf(mistakes)).toEqual([['treble-staff'], ['durations']])
    })
  })

  it('leaves the value it was given as it was', () => {
    const before = recorded([mistake(C4)])

    recordMistakes(before, [mistake(D4)])

    expect(counts(before)).toEqual([{ ...C4, count: 1 }])
  })
})
