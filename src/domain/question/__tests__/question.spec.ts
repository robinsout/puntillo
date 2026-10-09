import { describe, expect, it } from 'vitest'
import type { Note } from '@/domain/question'
import { createQuestion, DURATION_VALUES } from '@/domain/question'

const middleC: Note = { pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } }

describe('DURATION_VALUES', () => {
  // Feature difficulty-presets, criterion 6: the sixteenth joins the four of duration-input.
  it('lists the five base durations from the longest to the shortest', () => {
    expect(DURATION_VALUES).toEqual(['whole', 'half', 'quarter', 'eighth', 'sixteenth'])
  })
})

describe('createQuestion', () => {
  it('puts the note on a treble staff', () => {
    expect(createQuestion(middleC).clef).toBe('treble')
  })

  it('uses 4/4 time', () => {
    expect(createQuestion(middleC).timeSignature).toEqual({ beats: 4, beatValue: 4 })
  })

  it('asks about the given note', () => {
    expect(createQuestion(middleC).note).toEqual(middleC)
  })

  it.each(DURATION_VALUES)(
    'keeps the %s note as given, even though it does not fill 4/4',
    (value) => {
      const note: Note = { pitch: { letter: 'G', octave: 4 }, duration: { value } }

      expect(createQuestion(note).note).toEqual(note)
    },
  )
})
