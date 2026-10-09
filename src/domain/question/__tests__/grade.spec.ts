import { describe, expect, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import { createQuestion, gradeAnswer } from '@/domain/question'

const questionOn = (letter: Letter, octave: number, value: Duration['value'] = 'whole') =>
  createQuestion({ pitch: { letter, octave }, duration: { value } })

describe('gradeAnswer', () => {
  describe('the pitch', () => {
    it('is correct for the letter class of the question note', () => {
      expect(
        gradeAnswer(questionOn('C', 4), { letter: 'C', duration: { value: 'whole' } }).pitch,
      ).toBe(true)
    })

    it('is incorrect for any other letter class', () => {
      expect(
        gradeAnswer(questionOn('C', 4), { letter: 'D', duration: { value: 'whole' } }).pitch,
      ).toBe(false)
    })

    it('compares against the question note, not a fixed one', () => {
      const question = questionOn('G', 4)

      expect(gradeAnswer(question, { letter: 'G', duration: { value: 'whole' } }).pitch).toBe(true)
      expect(gradeAnswer(question, { letter: 'C', duration: { value: 'whole' } }).pitch).toBe(false)
    })

    it('ignores the octave because the answer names a degree only', () => {
      expect(
        gradeAnswer(questionOn('C', 5), { letter: 'C', duration: { value: 'whole' } }).pitch,
      ).toBe(true)
    })
  })

  describe('the duration', () => {
    it.each(['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const)(
      'is correct for the duration of a %s note',
      (value) => {
        expect(
          gradeAnswer(questionOn('C', 4, value), { letter: 'C', duration: { value } }).duration,
        ).toBe(true)
      },
    )

    it('is incorrect for any other duration', () => {
      const question = questionOn('C', 4, 'half')

      expect(gradeAnswer(question, { letter: 'C', duration: { value: 'quarter' } }).duration).toBe(
        false,
      )
      expect(gradeAnswer(question, { letter: 'C', duration: { value: 'whole' } }).duration).toBe(
        false,
      )
    })

    it('tells the sixteenth from the eighth', () => {
      const sixteenth = questionOn('C', 4, 'sixteenth')

      expect(gradeAnswer(sixteenth, { letter: 'C', duration: { value: 'eighth' } }).duration).toBe(
        false,
      )
    })
  })

  // Each part is worth a point of its own (spec 7.1), so one wrong part leaves the other right.
  it('grades the pitch and the duration separately', () => {
    const question = questionOn('E', 4, 'quarter')

    expect(gradeAnswer(question, { letter: 'E', duration: { value: 'quarter' } })).toEqual({
      pitch: true,
      duration: true,
    })
    expect(gradeAnswer(question, { letter: 'E', duration: { value: 'half' } })).toEqual({
      pitch: true,
      duration: false,
    })
    expect(gradeAnswer(question, { letter: 'F', duration: { value: 'quarter' } })).toEqual({
      pitch: false,
      duration: true,
    })
    expect(gradeAnswer(question, { letter: 'F', duration: { value: 'eighth' } })).toEqual({
      pitch: false,
      duration: false,
    })
  })

  // Feature difficulty-presets, criterion 5: with the duration not asked only the name counts.
  describe('without the duration asked', () => {
    it('grades the pitch alone and leaves the duration ungraded', () => {
      const question = questionOn('E', 4, 'quarter')

      expect(gradeAnswer(question, { letter: 'E', duration: null })).toEqual({
        pitch: true,
        duration: null,
      })
      expect(gradeAnswer(question, { letter: 'F', duration: null })).toEqual({
        pitch: false,
        duration: null,
      })
    })
  })
})
