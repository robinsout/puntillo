import { describe, expect, it } from 'vitest'
import { isEnharmonic, type Alteration, type Letter } from '@/domain/pitch'

// Feature accidentals, slice 2, criterion 13: an answer that sounds the same as the note but is
// written on another place, as re♭ for do♯. An answer has no octave, so the sound is compared
// within the octave: si♯ sounds as do, do♭ as si.

type Spelling = { letter: Letter; alteration?: Alteration }

const spelling = (text: string): Spelling => {
  const match = /^([A-G])(b|#|)$/.exec(text)
  if (!match) throw new Error(`not a spelling: ${text}`)
  const letter = match[1] as Letter
  if (match[2] === '#') return { letter, alteration: 1 }
  if (match[2] === 'b') return { letter, alteration: -1 }
  return { letter }
}

const enharmonic = (a: string, b: string) => isEnharmonic(spelling(a), spelling(b))

describe('isEnharmonic', () => {
  it.each([
    ['Db', 'C#'],
    ['C#', 'Db'],
    ['Gb', 'F#'],
    ['A#', 'Bb'],
    ['F', 'E#'],
    ['E#', 'F'],
    ['Fb', 'E'],
    ['C', 'B#'],
    ['B#', 'C'],
    ['Cb', 'B'],
  ])('holds for %s and %s: the same sound on another place', (a, b) => {
    expect(enharmonic(a, b)).toBe(true)
  })

  it.each([
    ['F#', 'F#'],
    ['F', 'F'],
  ])('does not hold for %s and %s: the same writing', (a, b) => {
    expect(enharmonic(a, b)).toBe(false)
  })

  it.each([
    ['F#', 'F'],
    ['F', 'Fb'],
    ['E', 'F'],
    ['C#', 'D'],
    ['Db', 'C'],
    ['B', 'C'],
  ])('does not hold for %s and %s: another sound', (a, b) => {
    expect(enharmonic(a, b)).toBe(false)
  })
})
