import { describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '@/application/ports'
import { createCounterVisitCounter } from '@/infrastructure/analytics'

// Feature visit-counter, slice 1 of 3, criteria 1, 4, 7 and 8; slice 2 of 3, criteria 2 and 3:
// the events of a session carry no language.

const endpoint = 'https://counter.test/c/hit'

function counterWith(options: { endpoint?: string; send?: (url: string, body: string) => void }) {
  const send = vi.fn<(url: string, body: string) => void>()
  const counter = createCounterVisitCounter({
    endpoint,
    send,
    isOff: () => false,
    isPhone: () => false,
    referrer: () => '',
    ...options,
  })
  return { counter, send }
}

const bodyOf = (send: ReturnType<typeof vi.fn>, call = 0): unknown =>
  JSON.parse(send.mock.calls[call]?.[1] as string)

describe('createCounterVisitCounter', () => {
  it('sends a screen view of puntillo to the endpoint', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'view', lang: 'ru', page: 'progress' })

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0]).toBe(endpoint)
    expect(bodyOf(send)).toEqual({
      p: 'puntillo',
      e: 'view',
      d: 'desktop',
      props: { page: 'progress', lang: 'ru' },
    })
  })

  it('sends the topic of a wiki article', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'view', lang: 'es', page: 'wiki-article', topic: 'durations' })

    expect(bodyOf(send)).toEqual(
      expect.objectContaining({ props: { page: 'wiki-article', lang: 'es', topic: 'durations' } }),
    )
  })

  it('sends an unknown article as unknown', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'view', lang: 'en', page: 'wiki-article', topic: 'unknown' })

    expect(bodyOf(send)).toEqual(
      expect.objectContaining({ props: { page: 'wiki-article', lang: 'en', topic: 'unknown' } }),
    )
  })

  it('sends no fields but the screen and the language', () => {
    const { counter, send } = counterWith({})
    const event = { name: 'view', lang: 'en', page: 'settings', path: '/settings?x=1' }

    counter.count(event as CounterEvent)

    expect(bodyOf(send)).toEqual(
      expect.objectContaining({ props: { page: 'settings', lang: 'en' } }),
    )
  })

  it('sends the start of a session with its exercise and preset only', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'session', exercise: 'read', preset: 'confident-reading' })

    expect(bodyOf(send)).toEqual({
      p: 'puntillo',
      e: 'session',
      d: 'desktop',
      props: { exercise: 'read', preset: 'confident-reading' },
    })
  })

  it('sends a session of a difficulty of its own as custom', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'session', exercise: 'write', preset: 'custom' })

    expect(bodyOf(send)).toMatchObject({ props: { exercise: 'write', preset: 'custom' } })
  })

  it('sends the summary of a session with its exercise, points and points possible only', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'summary', exercise: 'write', score: 7, total: 10 })

    expect(bodyOf(send)).toEqual({
      p: 'puntillo',
      e: 'summary',
      d: 'desktop',
      props: { exercise: 'write', score: 7, total: 10 },
    })
  })

  it('sends no fields of a session event but its own', () => {
    const { counter, send } = counterWith({})
    const event = { name: 'summary', exercise: 'read', score: 3, total: 4, lang: 'en' }

    counter.count(event as CounterEvent)

    expect(bodyOf(send)).toEqual(
      expect.objectContaining({ props: { exercise: 'read', score: 3, total: 4 } }),
    )
  })

  it('tells a phone from a desktop', () => {
    const send = vi.fn<(url: string, body: string) => void>()
    const counter = createCounterVisitCounter({
      endpoint,
      send,
      isOff: () => false,
      isPhone: () => true,
      referrer: () => '',
    })

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })

    expect(bodyOf(send)).toMatchObject({ d: 'phone' })
  })

  it('sends one request per event', () => {
    const { counter, send } = counterWith({})

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })
    counter.count({ name: 'view', lang: 'en', page: 'wiki' })

    expect(send).toHaveBeenCalledTimes(2)
    expect(bodyOf(send, 1)).toMatchObject({ props: { page: 'wiki', lang: 'en' } })
  })

  it('sends nothing when no endpoint is set, as in development, tests and Lighthouse', () => {
    const { counter, send } = counterWith({ endpoint: '' })

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })

    expect(send).not.toHaveBeenCalled()
  })

  it('does not throw when sending fails', () => {
    const { counter } = counterWith({
      send: () => {
        throw new Error('the counter is down')
      },
    })

    expect(() => counter.count({ name: 'view', lang: 'en', page: 'trainer' })).not.toThrow()
  })

  it('keeps counting after a failed send', () => {
    const send = vi.fn<(url: string, body: string) => void>().mockImplementationOnce(() => {
      throw new Error('the counter is down')
    })
    const { counter } = counterWith({ send })

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })
    counter.count({ name: 'view', lang: 'en', page: 'progress' })

    expect(send).toHaveBeenCalledTimes(2)
    expect(bodyOf(send, 1)).toMatchObject({ props: { page: 'progress' } })
  })
})
