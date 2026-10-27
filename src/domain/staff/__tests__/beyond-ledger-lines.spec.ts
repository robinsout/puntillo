import { describe, expect, it } from 'vitest'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import { beyondLedgerLines } from '@/domain/staff'

// Feature heard-note-on-staff, slice 1, criterion 1 and edge case 3: the note heard is drawn as a
// head with up to three ledger lines; a note that needs a fourth one or more lies beyond them,
// above or below the staff, and is shown by an arrow instead. The step decides, not the sign.

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

describe('beyondLedgerLines on the treble clef', () => {
  it.each<[Letter, number]>([
    ['E', 4],
    ['B', 4],
    ['F', 5],
    ['D', 4],
    ['G', 5],
  ])('is null for %s%i, on or next to the staff', (letter, octave) => {
    expect(beyondLedgerLines(pitch(letter, octave), 'treble')).toBeNull()
  })

  it.each<[Letter, number]>([
    ['C', 4],
    ['A', 3],
    ['F', 3],
    ['E', 3],
  ])('is null for %s%i, with up to three ledger lines below', (letter, octave) => {
    expect(beyondLedgerLines(pitch(letter, octave), 'treble')).toBeNull()
  })

  it.each<[Letter, number]>([
    ['A', 5],
    ['C', 6],
    ['E', 6],
    ['F', 6],
  ])('is null for %s%i, with up to three ledger lines above', (letter, octave) => {
    expect(beyondLedgerLines(pitch(letter, octave), 'treble')).toBeNull()
  })

  it.each<[Letter, number]>([
    ['D', 3],
    ['C', 3],
    ['E', 2],
  ])('is down for %s%i, on or below the fourth ledger line below', (letter, octave) => {
    expect(beyondLedgerLines(pitch(letter, octave), 'treble')).toBe('down')
  })

  it.each<[Letter, number]>([
    ['G', 6],
    ['A', 6],
    ['C', 7],
  ])('is up for %s%i, on or above the fourth ledger line above', (letter, octave) => {
    expect(beyondLedgerLines(pitch(letter, octave), 'treble')).toBe('up')
  })

  it('goes by the step of the letter, whatever the sign', () => {
    expect(beyondLedgerLines(pitch('F', 6, 1), 'treble')).toBeNull()
    expect(beyondLedgerLines(pitch('E', 3, 1), 'treble')).toBeNull()
    expect(beyondLedgerLines(pitch('G', 6, -1), 'treble')).toBe('up')
    expect(beyondLedgerLines(pitch('D', 3, 1), 'treble')).toBe('down')
  })
})
