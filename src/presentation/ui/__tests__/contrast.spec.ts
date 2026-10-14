import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/presentation/ui/contrast'

// Feature design-system, slice 1, criterion 7: the contrast ratio of WCAG 2.x.

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('is 1 for a colour on itself', () => {
    expect(contrastRatio('#8c2f39', '#8c2f39')).toBeCloseTo(1, 5)
  })

  it('does not depend on which colour is the text', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#f7f2e7', '#22201c')).toBeCloseTo(contrastRatio('#22201c', '#f7f2e7'), 10)
  })

  it('reads hex digits in either case', () => {
    expect(contrastRatio('#8C2F39', '#FFFDF8')).toBeCloseTo(contrastRatio('#8c2f39', '#fffdf8'), 10)
  })

  it('puts #777777 on white just under AA', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
})
