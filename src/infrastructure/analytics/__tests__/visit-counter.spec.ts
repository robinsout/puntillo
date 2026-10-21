import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '@/application/ports'
import { createCounterVisitCounter, createLocalCounterOptOut } from '@/infrastructure/analytics'

// Feature visit-counter, slice 1 of 3, criteria 1, 4, 7 and 8; slice 2 of 3, criteria 2 and 3:
// the events of a session carry no language. Slice 3 of 3, criteria 5 and 6: nothing is sent with
// the switch Don't count my visits on or with Global Privacy Control.

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

// The counter as it is built in main.ts: the switch is read from localStorage on every event.
function counterOfThePage() {
  const send = vi.fn<(url: string, body: string) => void>()
  const counter = createCounterVisitCounter({
    endpoint,
    send,
    isPhone: () => false,
    referrer: () => '',
  })
  return { counter, send }
}

function withGlobalPrivacyControl() {
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true })
}

describe('createCounterVisitCounter with the switch Don’t count my visits (criterion 5)', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('sends nothing once the switch is on', () => {
    const { counter, send } = counterOfThePage()

    createLocalCounterOptOut().setOff(true)
    counter.count({ name: 'view', lang: 'en', page: 'settings' })
    counter.count({ name: 'session', exercise: 'read', preset: 'first-steps' })
    counter.count({ name: 'summary', exercise: 'read', score: 3, total: 4 })

    expect(send).not.toHaveBeenCalled()
  })

  it('sends again once the switch is off', () => {
    const { counter, send } = counterOfThePage()
    const optOut = createLocalCounterOptOut()
    optOut.setOff(true)
    counter.count({ name: 'view', lang: 'en', page: 'settings' })

    optOut.setOff(false)
    counter.count({ name: 'view', lang: 'en', page: 'trainer' })

    expect(send).toHaveBeenCalledOnce()
    expect(bodyOf(send)).toMatchObject({ props: { page: 'trainer' } })
  })

  it('sends nothing when another project of the origin turned the switch on', () => {
    localStorage.setItem('robinsout-counter-off', '1')
    const { counter, send } = counterOfThePage()

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })

    expect(send).not.toHaveBeenCalled()
  })
})

describe('createCounterVisitCounter with Global Privacy Control (criterion 6)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'globalPrivacyControl')
    localStorage.clear()
  })

  it('sends events without it', () => {
    const { counter, send } = counterOfThePage()

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })

    expect(send).toHaveBeenCalledOnce()
  })

  it('sends nothing with it', () => {
    withGlobalPrivacyControl()
    const { counter, send } = counterOfThePage()

    counter.count({ name: 'view', lang: 'en', page: 'trainer' })
    counter.count({ name: 'session', exercise: 'write', preset: 'custom' })

    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing with it whatever the switch says', () => {
    withGlobalPrivacyControl()
    const { counter, send } = counterOfThePage()

    createLocalCounterOptOut().setOff(false)
    counter.count({ name: 'view', lang: 'en', page: 'trainer' })

    expect(send).not.toHaveBeenCalled()
  })

  it('leaves the switch working: it is still kept and read', () => {
    withGlobalPrivacyControl()
    const optOut = createLocalCounterOptOut()

    optOut.setOff(true)

    expect(optOut.isOff()).toBe(true)
    expect(optOut.canSave()).toBe(true)
  })
})
