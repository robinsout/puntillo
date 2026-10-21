import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalCounterOptOut } from '@/infrastructure/analytics'

// Feature visit-counter, slice 3 of 3, criterion 5 and edge case 1: the switch "Don't count my
// visits" is the key robinsout-counter-off of localStorage, shared by every project of the origin,
// and cannot be turned on where the browser does not save it.

const OFF_KEY = 'robinsout-counter-off'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

// What localStorage is like with site data blocked or in a private window of some browsers.
const throwing = (): Storage =>
  ({
    length: 0,
    key: () => null,
    clear: () => {},
    getItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    removeItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
  }) satisfies Storage

const full = (): Storage =>
  ({
    length: 0,
    key: () => null,
    clear: () => {},
    getItem: () => null,
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError')
    },
    removeItem: () => {},
  }) satisfies Storage

// Takes the write without an error and forgets it.
const forgetting = (): Storage =>
  ({
    length: 0,
    key: () => null,
    clear: () => {},
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }) satisfies Storage

describe('the switch Don’t count my visits', () => {
  it('is off for a new visitor', () => {
    expect(createLocalCounterOptOut().isOff()).toBe(false)
  })

  it('turned on, writes 1 under the key shared by the projects of the origin', () => {
    const optOut = createLocalCounterOptOut()

    optOut.setOff(true)

    expect(localStorage.getItem(OFF_KEY)).toBe('1')
    expect(optOut.isOff()).toBe(true)
  })

  it('turned off again, removes the key', () => {
    const optOut = createLocalCounterOptOut()
    optOut.setOff(true)

    optOut.setOff(false)

    expect(localStorage.getItem(OFF_KEY)).toBeNull()
    expect(optOut.isOff()).toBe(false)
  })

  it('is on after a reload', () => {
    createLocalCounterOptOut().setOff(true)

    expect(createLocalCounterOptOut().isOff()).toBe(true)
  })

  it('is on when another project of the origin turned it on', () => {
    localStorage.setItem(OFF_KEY, '1')

    expect(createLocalCounterOptOut().isOff()).toBe(true)
  })

  it('writes nothing of its own beside the key', () => {
    const optOut = createLocalCounterOptOut()

    optOut.canSave()
    optOut.setOff(true)

    expect(Object.keys(localStorage)).toEqual([OFF_KEY])
  })
})

describe('whether the switch can be saved (edge case 1)', () => {
  it('can with a working localStorage', () => {
    expect(createLocalCounterOptOut().canSave()).toBe(true)
  })

  it('leaves nothing behind when it checks', () => {
    createLocalCounterOptOut().canSave()

    expect(localStorage.length).toBe(0)
  })

  it('does not change the switch when it checks', () => {
    localStorage.setItem(OFF_KEY, '1')
    const optOut = createLocalCounterOptOut()

    optOut.canSave()

    expect(optOut.isOff()).toBe(true)
  })

  it('cannot when localStorage throws on every access', () => {
    vi.stubGlobal('localStorage', throwing())

    expect(createLocalCounterOptOut().canSave()).toBe(false)
  })

  it('cannot when localStorage is full', () => {
    vi.stubGlobal('localStorage', full())

    expect(createLocalCounterOptOut().canSave()).toBe(false)
  })

  it('cannot when localStorage does not keep what is written', () => {
    vi.stubGlobal('localStorage', forgetting())

    expect(createLocalCounterOptOut().canSave()).toBe(false)
  })

  it('cannot when reading localStorage itself throws', () => {
    vi.stubGlobal('localStorage', undefined)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })

    expect(createLocalCounterOptOut().canSave()).toBe(false)
  })

  it('reads as off and does not throw with a blocked localStorage', () => {
    vi.stubGlobal('localStorage', throwing())
    const optOut = createLocalCounterOptOut()

    expect(optOut.isOff()).toBe(false)
    expect(() => optOut.setOff(true)).not.toThrow()
    expect(() => optOut.setOff(false)).not.toThrow()
  })
})
