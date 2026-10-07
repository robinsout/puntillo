import { describe, expect, it } from 'vitest'
import type { Note } from '@/domain/question'
import { createQuestion } from '@/domain/question'

const middleC: Note = { pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } }

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
})
