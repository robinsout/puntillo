import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWallClock } from '@/infrastructure/clock'

// Feature progress-and-storage, slice 1: the progress keeps the date an item was last shown, by
// the clock of the device.
describe('createWallClock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the date of the device in milliseconds on every call', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 13, 12) })
    const clock = createWallClock()

    expect(clock.now()).toBe(Date.UTC(2026, 9, 13, 12))

    vi.setSystemTime(Date.UTC(2026, 9, 14, 8))

    expect(clock.now()).toBe(Date.UTC(2026, 9, 14, 8))
  })
})
