import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMathRandom } from '@/infrastructure/random'

describe('createMathRandom', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns numbers in [0, 1)', () => {
    const random = createMathRandom()

    for (let i = 0; i < 1000; i++) {
      const value = random.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('does not return a constant value over a series of calls', () => {
    const random = createMathRandom()

    const values = new Set(Array.from({ length: 100 }, () => random.next()))

    expect(values.size).toBeGreaterThan(1)
  })

  it('returns the value produced by Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75)
    const random = createMathRandom()

    expect(random.next()).toBe(0.25)
    expect(random.next()).toBe(0.75)
  })
})
