import { describe, expect, it } from 'vitest'
import { LETTERS } from '@/domain/pitch'
import { noteName, noteNameParts, type NoteNaming } from '@/domain/naming'

// Feature accidentals, slice 1, criteria 9–11 and spec 12.2: an altered note is named by the rules
// of its system. The letter system writes the alteration as a suffix: C♯, D♭. With H, si is H and
// si-flat is B, the German usage the switch stands for; si-sharp is then H♯, the suffix after H.
//
// noteName writes the alteration as a symbol in every system: «fa♯» is the answer under a note
// (criterion 9). The syllable systems say the alteration in words of the interface language
// (criterion 10: «fa sharp», «фа-диез», «fa sostenido»), which are no part of the domain:
// noteNameParts gives the name and the word still to add, and the letter system needs none.

const SHARP = '♯'
const FLAT = '♭'

const SYLLABLES: Record<Exclude<NoteNaming, 'letter'>, readonly string[]> = {
  'latin-syllable': ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'],
  'cyrillic-syllable': ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си'],
}

describe('noteName with an alteration', () => {
  it('writes the sharp and the flat after the letter: C♯, D♭', () => {
    expect(noteName('C', 'letter', 'B', 1)).toBe(`C${SHARP}`)
    expect(noteName('D', 'letter', 'B', -1)).toBe(`D${FLAT}`)
  })

  it.each(LETTERS)('writes %s sharp and flat with the symbols in letters', (letter) => {
    expect(noteName(letter, 'letter', 'B', 1)).toBe(`${letter}${SHARP}`)
    expect(noteName(letter, 'letter', 'B', -1)).toBe(`${letter}${FLAT}`)
  })

  // Criterion 11.
  it('names si-flat B and si H in letters with H', () => {
    expect(noteName('B', 'letter', 'H', -1)).toBe('B')
    expect(noteName('B', 'letter', 'H')).toBe('H')
  })

  it('names si-sharp H♯ in letters with H', () => {
    expect(noteName('B', 'letter', 'H', 1)).toBe(`H${SHARP}`)
  })

  it('leaves the other letters alone with H', () => {
    expect(noteName('E', 'letter', 'H', -1)).toBe(`E${FLAT}`)
    expect(noteName('F', 'letter', 'H', 1)).toBe(`F${SHARP}`)
  })

  it.each(Object.entries(SYLLABLES))(
    'writes the symbol after the syllable in the %s system: fa♯, si♭',
    (naming, names) => {
      LETTERS.forEach((letter, index) => {
        const syllable = names[index]
        expect(noteName(letter, naming as NoteNaming, 'B', 1)).toBe(`${syllable}${SHARP}`)
        expect(noteName(letter, naming as NoteNaming, 'H', -1)).toBe(`${syllable}${FLAT}`)
      })
    },
  )

  it('names a natural note as before', () => {
    expect(noteName('F', 'latin-syllable', 'B', undefined)).toBe('fa')
    expect(noteName('F', 'letter')).toBe('F')
  })
})

describe('noteNameParts', () => {
  it.each(Object.entries(SYLLABLES))(
    'leaves the word of the alteration to add in the %s system',
    (naming, names) => {
      LETTERS.forEach((letter, index) => {
        const name = names[index]
        expect(noteNameParts(letter, naming as NoteNaming, 'B', 1)).toEqual({ name, word: 'sharp' })
        expect(noteNameParts(letter, naming as NoteNaming, 'B', -1)).toEqual({ name, word: 'flat' })
      })
    },
  )

  it('gives a syllable of a natural note with no word', () => {
    expect(noteNameParts('F', 'latin-syllable', 'B')).toEqual({ name: 'fa' })
    expect(noteNameParts('B', 'cyrillic-syllable', 'H')).toEqual({ name: 'си' })
  })

  it('gives the whole name in letters, the symbol written, no word to add', () => {
    expect(noteNameParts('F', 'letter', 'B', 1)).toEqual({ name: `F${SHARP}` })
    expect(noteNameParts('B', 'letter', 'B', -1)).toEqual({ name: `B${FLAT}` })
    expect(noteNameParts('C', 'letter', 'B')).toEqual({ name: 'C' })
  })

  it('names si-flat B and si-sharp H♯ in letters with H', () => {
    expect(noteNameParts('B', 'letter', 'H', -1)).toEqual({ name: 'B' })
    expect(noteNameParts('B', 'letter', 'H', 1)).toEqual({ name: `H${SHARP}` })
    expect(noteNameParts('B', 'letter', 'H')).toEqual({ name: 'H' })
  })

  it('does not change the syllables with H', () => {
    expect(noteNameParts('B', 'latin-syllable', 'H', -1)).toEqual({ name: 'si', word: 'flat' })
  })
})
