import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntervalTimer } from '@/infrastructure/clock'

// Feature session-summary, slice 1: the time of a session on time is shown anew every second.
// The timer only asks for a new look at the clock; the time itself is always read from the clock.
describe('createIntervalTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks once every interval', () => {
    const tick = vi.fn<() => void>()
    createIntervalTimer().every(1000, tick)

    vi.advanceTimersByTime(999)
    expect(tick).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(tick).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(3000)
    expect(tick).toHaveBeenCalledTimes(4)
  })

  it('stops ticking once stopped', () => {
    const tick = vi.fn<() => void>()
    const stop = createIntervalTimer().every(1000, tick)
    vi.advanceTimersByTime(2000)

    stop()
    vi.advanceTimersByTime(5000)

    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('keeps each subscription apart', () => {
    const timer = createIntervalTimer()
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const stopFirst = timer.every(1000, first)
    timer.every(500, second)

    stopFirst()
    vi.advanceTimersByTime(1000)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(2)
  })
})
