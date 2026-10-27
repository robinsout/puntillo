import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScreenWakeLock } from '@/infrastructure/screen'

// Feature microphone-input, slice 4, criterion 15 on the screen: the screen of the device stays on
// by the Screen Wake Lock API, navigator.wakeLock.request('screen'). keepOn() takes the lock;
// release() lets it go and stops watching the page. The browser lets the lock go by itself when
// the tab is hidden, so while keepOn() holds, the lock is taken again when the tab is visible once
// more. Where the browser has no Wake Lock, or refuses it (low battery, a page not visible), nothing
// happens: nothing is thrown or left unhandled. The browser is a fake.

class FakeSentinel extends EventTarget {
  released = false
  readonly type = 'screen'
  release() {
    this.released = true
    this.dispatchEvent(new Event('release'))
    return Promise.resolve()
  }
}

let sentinels: FakeSentinel[]
let requests: unknown[]

// How the browser answers each request: with a lock, an error, or later, when a test says so.
type Answer = 'allow' | DOMException | 'later'
let answer: Answer
let pending: (() => void)[]

function browserWithWakeLock() {
  vi.stubGlobal('navigator', {
    wakeLock: {
      // Not a vi.fn: a mock would handle the promise it returns and hide one left unhandled.
      request(type: unknown) {
        requests.push(type)
        const given = answer
        if (given instanceof DOMException) return Promise.reject(given)
        const sentinel = new FakeSentinel()
        sentinels.push(sentinel)
        if (given === 'allow') return Promise.resolve(sentinel)
        return new Promise((resolve) => pending.push(() => resolve(sentinel)))
      },
    },
  })
}

let visibility: DocumentVisibilityState

// The browser hides the tab: it lets the lock go by itself.
function hideTab() {
  visibility = 'hidden'
  for (const sentinel of sentinels) if (!sentinel.released) void sentinel.release()
  document.dispatchEvent(new Event('visibilitychange'))
}

function showTab() {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

const unhandled: unknown[] = []
const recordUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}

// The fakes answer at once, so one turn of the event loop lets the request settle.
const settle = () => new Promise((resolve) => setTimeout(resolve))

const held = () => sentinels.filter((sentinel) => !sentinel.released)

beforeEach(() => {
  sentinels = []
  requests = []
  answer = 'allow'
  pending = []
  unhandled.length = 0
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  process.on('unhandledRejection', recordUnhandled)
  browserWithWakeLock()
})

afterEach(() => {
  process.off('unhandledRejection', recordUnhandled)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a browser with Wake Lock', () => {
  it('asks for nothing before keepOn', () => {
    createScreenWakeLock()

    expect(requests).toEqual([])
  })

  it('keeps the screen on with keepOn', async () => {
    createScreenWakeLock().keepOn()
    await settle()

    expect(requests).toEqual(['screen'])
    expect(held()).toHaveLength(1)
  })

  it('lets the screen go with release', async () => {
    const wakeLock = createScreenWakeLock()
    wakeLock.keepOn()
    await settle()

    wakeLock.release()
    await settle()

    expect(held()).toEqual([])
  })

  it('lets go a lock that comes only after release', async () => {
    answer = 'later'
    const wakeLock = createScreenWakeLock()
    wakeLock.keepOn()

    wakeLock.release()
    pending.forEach((resolve) => resolve())
    await settle()

    expect(sentinels).toHaveLength(1)
    expect(held()).toEqual([])
  })

  it('takes the lock again when the tab is shown again', async () => {
    const wakeLock = createScreenWakeLock()
    wakeLock.keepOn()
    await settle()

    hideTab()
    await settle()
    showTab()
    await settle()

    expect(requests).toEqual(['screen', 'screen'])
    expect(held()).toHaveLength(1)
  })

  it('takes nothing when the tab is shown after release', async () => {
    const wakeLock = createScreenWakeLock()
    wakeLock.keepOn()
    await settle()
    wakeLock.release()
    await settle()

    hideTab()
    showTab()
    await settle()

    expect(requests).toEqual(['screen'])
    expect(held()).toEqual([])
  })

  it('takes nothing when the tab is shown before keepOn', async () => {
    createScreenWakeLock()

    hideTab()
    showTab()
    await settle()

    expect(requests).toEqual([])
  })

  it('keeps the screen on again after release and a new keepOn', async () => {
    const wakeLock = createScreenWakeLock()
    wakeLock.keepOn()
    await settle()
    wakeLock.release()
    await settle()

    wakeLock.keepOn()
    await settle()

    expect(held()).toHaveLength(1)
  })

  it.each(['NotAllowedError', 'AbortError'])(
    'throws nothing when the browser refuses with %s',
    async (name) => {
      answer = new DOMException('no', name)
      const wakeLock = createScreenWakeLock()

      expect(() => wakeLock.keepOn()).not.toThrow()
      await settle()
      expect(() => wakeLock.release()).not.toThrow()
      await settle()

      expect(unhandled).toEqual([])
    },
  )

  it('throws nothing when the request throws', async () => {
    vi.stubGlobal('navigator', {
      wakeLock: {
        request() {
          throw new TypeError('not a secure context')
        },
      },
    })
    const wakeLock = createScreenWakeLock()

    expect(() => wakeLock.keepOn()).not.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })

  it('throws nothing on release before keepOn', () => {
    expect(() => createScreenWakeLock().release()).not.toThrow()
  })
})

describe('a browser without Wake Lock', () => {
  it('does nothing and throws nothing', async () => {
    vi.stubGlobal('navigator', {})
    const wakeLock = createScreenWakeLock()

    expect(() => wakeLock.keepOn()).not.toThrow()
    hideTab()
    showTab()
    expect(() => wakeLock.release()).not.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })
})
