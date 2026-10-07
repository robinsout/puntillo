import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTimeoutScheduler } from '@/infrastructure/scheduler'

describe('createTimeoutScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the task exactly after the given delay', () => {
    const scheduler = createTimeoutScheduler()
    const task = vi.fn<() => void>()

    scheduler.schedule(1000, task)

    vi.advanceTimersByTime(999)
    expect(task).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(task).toHaveBeenCalledOnce()
  })

  it('does not run the task when cancelled before it fires', () => {
    const scheduler = createTimeoutScheduler()
    const task = vi.fn<() => void>()

    const cancel = scheduler.schedule(1000, task)
    cancel()
    vi.advanceTimersByTime(1000)

    expect(task).not.toHaveBeenCalled()
  })

  it('allows cancelling after the task has fired', () => {
    const scheduler = createTimeoutScheduler()
    const task = vi.fn<() => void>()

    const cancel = scheduler.schedule(1000, task)
    vi.advanceTimersByTime(1000)

    expect(() => cancel()).not.toThrow()
    expect(task).toHaveBeenCalledOnce()
  })

  it('keeps scheduled tasks independent of each other', () => {
    const scheduler = createTimeoutScheduler()
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()

    const cancelFirst = scheduler.schedule(500, first)
    scheduler.schedule(1000, second)
    cancelFirst()
    vi.advanceTimersByTime(1000)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
