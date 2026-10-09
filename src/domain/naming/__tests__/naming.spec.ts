import { describe, expect, it } from 'vitest'
import { LETTERS } from '@/domain/pitch'
import { isNoteNaming, NOTE_NAMINGS, noteName, type NoteNaming } from '@/domain/naming'

// Spec §12.2: three systems; alterations and B/H are out of this slice.
const NAMES: Record<NoteNaming, readonly string[]> = {
  'latin-syllable': ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'],
  'cyrillic-syllable': ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си'],
  letter: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
}

describe('note naming', () => {
  it('lists the systems in the order they are offered: do re mi, до ре ми, C D E', () => {
    expect(NOTE_NAMINGS).toEqual(['latin-syllable', 'cyrillic-syllable', 'letter'])
  })

  describe.each(Object.entries(NAMES) as [NoteNaming, readonly string[]][])(
    'in the %s system',
    (naming, names) => {
      it.each(LETTERS.map((letter, index) => [letter, names[index]!] as const))(
        'names letter class %s as %s',
        (letter, name) => {
          expect(noteName(letter, naming)).toBe(name)
        },
      )

      it('gives seven different names in scale order', () => {
        const scale = LETTERS.map((letter) => noteName(letter, naming))

        expect(scale).toEqual(names)
        expect(new Set(scale).size).toBe(7)
      })
    },
  )

  describe('recognising a system', () => {
    it.each(NOTE_NAMINGS)('knows %s', (naming) => {
      expect(isNoteNaming(naming)).toBe(true)
    })

    it.each([
      '',
      'Letter',
      'letters',
      'latin',
      ' letter',
      '"letter"',
      'do, re, mi',
      'C, D, E',
      'ru',
      'undefined',
    ])('rejects %j', (value) => {
      expect(isNoteNaming(value)).toBe(false)
    })
  })
})
