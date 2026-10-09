import { describe, expect, it } from 'vitest'
import { LETTERS } from '@/domain/pitch'
import {
  isNoteNaming,
  isSeventhNote,
  NOTE_NAMINGS,
  noteName,
  SEVENTH_NOTES,
  type NoteNaming,
} from '@/domain/naming'

// Spec §12.2: three systems; alterations and B for B-flat under H are out of this feature.
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

  // Spec §12.2, feature criterion 7: in letters the seventh note is B or H.
  describe('the seventh note', () => {
    it('is offered as B, then H', () => {
      expect(SEVENTH_NOTES).toEqual(['B', 'H'])
    })

    it('is B in letters unless told otherwise', () => {
      expect(noteName('B', 'letter')).toBe('B')
    })

    it.each(LETTERS.map((letter, index) => [letter, NAMES.letter[index]!] as const))(
      'leaves %s as %s in letters with B',
      (letter, name) => {
        expect(noteName(letter, 'letter', 'B')).toBe(name)
      },
    )

    it('names si H in letters with H and keeps the other six letters', () => {
      expect(LETTERS.map((letter) => noteName(letter, 'letter', 'H'))).toEqual([
        'C',
        'D',
        'E',
        'F',
        'G',
        'A',
        'H',
      ])
    })

    it.each(['latin-syllable', 'cyrillic-syllable'] as const)(
      'does not change the %s system',
      (naming) => {
        expect(LETTERS.map((letter) => noteName(letter, naming, 'H'))).toEqual(NAMES[naming])
      },
    )

    describe('recognising a seventh note', () => {
      it.each(SEVENTH_NOTES)('knows %s', (note) => {
        expect(isSeventhNote(note)).toBe(true)
      })

      it.each(['', 'b', 'h', ' H', 'H ', '"H"', 'Bb', 'si', 'letter', 'undefined'])(
        'rejects %j',
        (value) => {
          expect(isSeventhNote(value)).toBe(false)
        },
      )
    })
  })
})
