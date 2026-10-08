import { describe, expect, it } from 'vitest'
import type { Letter } from '@/domain/pitch'
import { staffPosition } from '@/domain/staff'
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
  ])('puts %s%i at %o, counting from the bottom line', (letter, octave, position) => {
    expect(staffPosition({ letter, octave }, 'treble')).toEqual(position)
  })
})
