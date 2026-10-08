import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPerformanceClock } from '@/infrastructure/clock'

describe('createPerformanceClock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the reading of performance.now', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1200.5).mockReturnValueOnce(3600.25)
    const clock = createPerformanceClock()

    expect(clock.now()).toBe(1200.5)
    expect(clock.now()).toBe(3600.25)
  })

  it('reads the time on every call, not once on creation', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(10)
    const clock = createPerformanceClock()
    now.mockReturnValue(2410)

    expect(clock.now()).toBe(2410)
  })

  it('does not go back in time', () => {
    const clock = createPerformanceClock()

    const first = clock.now()
    const second = clock.now()

    expect(second).toBeGreaterThanOrEqual(first)
  })
})
