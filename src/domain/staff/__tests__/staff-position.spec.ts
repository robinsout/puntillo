import { describe, expect, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import { ledgerLines, staffPosition } from '@/domain/staff'
import type { StaffPosition } from '@/domain/staff'

describe('staffPosition on the treble clef', () => {
  it.each<[Letter, number, StaffPosition]>([
    ['C', 4, { kind: 'ledger-line-below', number: 1 }],
    ['D', 4, { kind: 'below-staff' }],
    ['E', 4, { kind: 'line', number: 1 }],
    ['F', 4, { kind: 'space', number: 1 }],
    ['G', 4, { kind: 'line', number: 2 }],
    ['A', 4, { kind: 'space', number: 2 }],
    ['B', 4, { kind: 'line', number: 3 }],
    ['C', 5, { kind: 'space', number: 3 }],
    ['D', 5, { kind: 'line', number: 4 }],
    ['E', 5, { kind: 'space', number: 4 }],
    ['F', 5, { kind: 'line', number: 5 }],
    ['G', 5, { kind: 'above-staff' }],
  ])('puts %s%i at %o, counting from the bottom line', (letter, octave, position) => {
    expect(staffPosition({ letter, octave }, 'treble')).toEqual(position)
  })
})

describe('ledgerLines on the treble clef', () => {
  it('is one for C4, on the first ledger line below the staff', () => {
    expect(ledgerLines({ letter: 'C', octave: 4 }, 'treble')).toBe(1)
  })

  it.each<[Letter, number]>([
    ['D', 4],
    ['E', 4],
    ['F', 4],
    ['G', 4],
    ['A', 4],
    ['B', 4],
    ['C', 5],
    ['D', 5],
    ['E', 5],
    ['F', 5],
    ['G', 5],
  ])('is none for %s%i, just below, on, or just above the staff', (letter, octave) => {
    expect(ledgerLines({ letter, octave }, 'treble')).toBe(0)
  })
})
