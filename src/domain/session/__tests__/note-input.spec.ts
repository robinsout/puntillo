import { describe, expect, it } from 'vitest'
import { isNoteInput } from '@/domain/session'

// Feature piano-keyboard, criterion 1: the pitch in Read notes is put in by the names of the notes
// or on the piano keyboard.
describe('note inputs', () => {
  it.each(['names', 'keyboard'])('tells %j for a note input', (value) => {
    expect(isNoteInput(value)).toBe(true)
  })

  it.each(['', 'Names', 'piano', 'keyboard ', 'midi', 'undefined'])(
    'tells %j for no note input',
    (value) => {
      expect(isNoteInput(value)).toBe(false)
    },
  )
})
