import { describe, expect, it } from 'vitest'
import { LETTERS } from '@/domain/pitch'

describe('LETTERS', () => {
  it('lists the seven letter classes in scale order from C to B', () => {
    expect(LETTERS).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  })
})
