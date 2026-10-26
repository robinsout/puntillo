import { describe, expect, it } from 'vitest'
import { isNoteInput } from '@/domain/session'

// Feature piano-keyboard, criterion 1: the pitch in Read notes is put in by the names of the notes
// or on the piano keyboard.
// Feature microphone-input, criterion 1: or played on an instrument and heard by the microphone.
describe('note inputs', () => {
  it.each(['names', 'keyboard', 'microphone'])('tells %j for a note input', (value) => {
    expect(isNoteInput(value)).toBe(true)
  })

  it.each(['', 'Names', 'piano', 'keyboard ', 'midi', 'Microphone', 'mic', 'undefined'])(
    'tells %j for no note input',
    (value) => {
      expect(isNoteInput(value)).toBe(false)
    },
  )
})
