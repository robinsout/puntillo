import { describe, expect, it } from 'vitest'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import {
  hardestNotes,
  NO_STATISTICS,
  recordAnswers,
  type ItemAnswer,
  type ItemStatistics,
  type ItemStats,
} from '@/domain/progress'

// Feature progress-and-storage, slice 1: the statistics by item over all sessions, for Hardest
// notes on the Progress screen (criteria 5, 6).
//
// An item is a pitch as written and a duration, as in the review queue and Most mistakes.
// recordAnswers takes the answers on the notes of one checked question, in the order of its notes,
// with the time of the answer: each answer is one showing of its item, a wrong one also one
// mistake; the item keeps the time it was last shown and whether its last answer was right.
// hardestNotes gives up to ten items with at least one mistake: the more mistakes first; of two
// with as many, the one shown later; of two shown at the same time, the one recorded later.

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
const F4 = item('F', 4)
const F_SHARP_4 = item('F', 4, QUARTER, 1)

const right = (of: ReviewItem): ItemAnswer => ({ item: of, right: true })
const wrong = (of: ReviewItem): ItemAnswer => ({ item: of, right: false })

// One checked question for each list of answers, each a second after the one before.
const recorded = (...questions: readonly ItemAnswer[][]): ItemStatistics =>
  questions.reduce<ItemStatistics>(
    (statistics, answers, index) => recordAnswers(statistics, answers, (index + 1) * 1000),
    NO_STATISTICS,
  )

const letters = (statistics: ItemStatistics, limit?: number) =>
  hardestNotes(statistics, limit).map(({ item: { pitch } }) => pitch.letter)

const counts = (statistics: ItemStatistics) =>
  hardestNotes(statistics).map(({ item: { pitch, duration }, shown, mistakes }) => ({
    pitch,
    duration,
    shown,
    mistakes,
  }))

describe('statistics by item', () => {
  describe('what counts (criterion 6)', () => {
    it('gives no hardest notes without statistics', () => {
      expect(hardestNotes(NO_STATISTICS)).toEqual([])
    })

    it('gives no hardest notes after answers all right', () => {
      expect(hardestNotes(recorded([right(C4)], [right(F4), right(C4)]))).toEqual([])
    })

    it('counts a wrong answer as one showing and one mistake, with its time and result', () => {
      expect(hardestNotes(recordAnswers(NO_STATISTICS, [wrong(C4)], 5000))).toEqual<ItemStats[]>([
        { item: C4, shown: 1, mistakes: 1, lastShownAt: 5000, lastRight: false },
      ])
    })

    it('counts the right answers on an item as showings without mistakes', () => {
      expect(counts(recorded([right(C4)], [right(C4)], [wrong(C4)]))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, shown: 3, mistakes: 1 },
      ])
    })

    it('keeps the time of the last showing and the result of the last answer', () => {
      expect(hardestNotes(recorded([wrong(C4)], [right(C4)]))).toEqual<ItemStats[]>([
        { item: C4, shown: 2, mistakes: 1, lastShownAt: 2000, lastRight: true },
      ])
    })

    it('counts every mistake on the same item', () => {
      expect(counts(recorded([wrong(C4)], [wrong(C4)], [right(C4)], [wrong(C4)]))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, shown: 4, mistakes: 3 },
      ])
    })

    it('takes an item given anew as the same item', () => {
      expect(counts(recorded([wrong(item('C', 4))], [wrong(item('C', 4))]))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, shown: 2, mistakes: 2 },
      ])
    })

    it('counts an item twice in one question as two showings', () => {
      expect(hardestNotes(recordAnswers(NO_STATISTICS, [wrong(C4), wrong(C4)], 1000))).toEqual<
        ItemStats[]
      >([{ item: C4, shown: 2, mistakes: 2, lastShownAt: 1000, lastRight: false }])
    })

    it('takes the result of the later answer on an item twice in one question', () => {
      expect(hardestNotes(recordAnswers(NO_STATISTICS, [wrong(C4), right(C4)], 1000))).toEqual<
        ItemStats[]
      >([{ item: C4, shown: 2, mistakes: 1, lastShownAt: 1000, lastRight: true }])
    })

    it('tells F4 and F♯4 apart', () => {
      expect(counts(recorded([wrong(F4)], [wrong(F_SHARP_4)], [right(F4)]))).toEqual([
        { pitch: pitch('F', 4), duration: QUARTER, shown: 2, mistakes: 1 },
        { pitch: pitch('F', 4, 1), duration: QUARTER, shown: 1, mistakes: 1 },
      ])
    })

    it('tells C4 as a quarter, a dotted quarter and a half apart', () => {
      const statistics = recorded(
        [wrong(item('C', 4, QUARTER))],
        [wrong(item('C', 4, DOTTED_QUARTER))],
        [wrong(item('C', 4, HALF))],
      )

      expect(hardestNotes(statistics).map(({ item: { duration } }) => duration)).toEqual([
        HALF,
        DOTTED_QUARTER,
        QUARTER,
      ])
    })

    it('leaves the statistics given unchanged', () => {
      const before = recorded([wrong(C4)])

      recordAnswers(before, [wrong(C4), wrong(F4)], 9000)

      expect(counts(before)).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, shown: 1, mistakes: 1 },
      ])
    })
  })

  describe('the order of the hardest notes (criterion 5)', () => {
    it('puts the item with more mistakes first', () => {
      expect(
        letters(recorded([wrong(F4)], [wrong(C4)], [wrong(F4)], [wrong(C4)], [wrong(F4)])),
      ).toEqual(['F', 'C'])
    })

    it('puts the item with more mistakes first though it was shown earlier', () => {
      expect(letters(recorded([wrong(F4)], [wrong(F4)], [wrong(C4)]))).toEqual(['F', 'C'])
    })

    it('puts the item shown later first of two with as many mistakes', () => {
      expect(letters(recorded([wrong(C4)], [wrong(F4)]))).toEqual(['F', 'C'])
    })

    it('counts a right answer as a later showing', () => {
      expect(letters(recorded([wrong(C4)], [wrong(F4)], [right(C4)]))).toEqual(['C', 'F'])
    })

    it('puts the item recorded later first of two shown at the same time', () => {
      expect(letters(recordAnswers(NO_STATISTICS, [wrong(C4), wrong(F4)], 1000))).toEqual([
        'F',
        'C',
      ])
    })

    it('goes by the time given, not by the order of the calls', () => {
      const statistics = recordAnswers(
        recordAnswers(NO_STATISTICS, [wrong(C4)], 5000),
        [wrong(F4)],
        1000,
      )

      expect(letters(statistics)).toEqual(['C', 'F'])
    })

    it('gives up to ten items', () => {
      const many: ReviewItem[] = (['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const).flatMap(
        (letter) => [item(letter, 4), item(letter, 5)],
      )

      const hardest = hardestNotes(recorded(...many.map((each) => [wrong(each)])))

      expect(hardest).toHaveLength(10)
      expect(hardest.map(({ item: { pitch } }) => `${pitch.letter}${pitch.octave}`)).toEqual([
        'B5',
        'B4',
        'A5',
        'A4',
        'G5',
        'G4',
        'F5',
        'F4',
        'E5',
        'E4',
      ])
    })

    it('gives as many items as the limit asks', () => {
      expect(letters(recorded([wrong(C4)], [wrong(F4)], [wrong(F_SHARP_4)]), 2)).toEqual(['F', 'F'])
    })
  })
})
