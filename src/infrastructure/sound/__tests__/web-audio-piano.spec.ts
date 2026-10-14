import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoKey } from '@/domain/keyboard'
import { createWebAudioPiano } from '@/infrastructure/sound'

// Feature piano-keyboard, criteria 13–14 and edge cases 1–2: the piano is the Web Audio API over
// the twelve samples in public/piano. load() fetches and decodes them once; until they are all
// decoded, or if any of them fails, play() is silent and nothing is thrown or left unhandled.
// A key sounds about a second: it holds, fades from 0.8 s to nothing at 1.0 s and stops there,
// and a new key does not cut the one before. Web Audio and fetch are fakes: no sound is played.

const FILES = ['Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6'].map(
  (name) => `${name}.mp3`,
)

const C4: PianoKey = { number: 60 }
const C_SHARP_4: PianoKey = { number: 61 }
const D4: PianoKey = { number: 62 }

const NOW = 12.5

// Decoded audio, named by the URL it was fetched from.
interface FakeBuffer {
  readonly url: string
}

function fakeParam(value: number) {
  return {
    value,
    setValueAtTime: vi.fn<(value: number, at: number) => void>(),
    linearRampToValueAtTime: vi.fn<(value: number, at: number) => void>(),
  }
}

function fakeSource() {
  return {
    buffer: null as FakeBuffer | null,
    playbackRate: fakeParam(1),
    connect: vi.fn<(to: unknown) => void>(),
    start: vi.fn<(at?: number) => void>(),
    stop: vi.fn<(at?: number) => void>(),
  }
}

function fakeGain() {
  return { gain: fakeParam(1), connect: vi.fn<(to: unknown) => void>() }
}

type Source = ReturnType<typeof fakeSource>
type Gain = ReturnType<typeof fakeGain>

interface WebAudio {
  readonly contexts: FakeContext[]
  readonly fetched: string[]
}

let audio: WebAudio
let failing: { url?: string; how?: 'fetch' | 'status' | 'decode' } = {}
let resumeFails = false
let contextFails = false

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  currentTime = NOW
  readonly destination = { name: 'destination' }
  readonly sources: Source[] = []
  readonly gains: Gain[] = []
  resumes = 0
  // Not a vi.fn: a mock would handle the promise it returns and hide one left unhandled.
  resume() {
    this.resumes += 1
    if (resumeFails) return Promise.reject(new Error('not allowed'))
    this.state = 'running'
    return Promise.resolve()
  }
  readonly decodeAudioData = vi.fn<(data: ArrayBuffer) => Promise<FakeBuffer>>((data) => {
    const url = urls.get(data) ?? ''
    if (failing.how === 'decode' && failing.url === url) {
      return Promise.reject(new DOMException('cannot decode', 'EncodingError'))
    }
    return Promise.resolve({ url } satisfies FakeBuffer)
  })

  constructor() {
    if (contextFails) throw new Error('no audio')
    audio.contexts.push(this)
  }

  createBufferSource() {
    const source = fakeSource()
    this.sources.push(source)
    return source
  }

  createGain() {
    const gain = fakeGain()
    this.gains.push(gain)
    return gain
  }
}

const urls = new WeakMap<ArrayBuffer, string>()

function fakeFetch(input: string | URL) {
  const url = String(input)
  audio.fetched.push(url)
  if (failing.how === 'fetch' && failing.url === url) {
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  const data = new ArrayBuffer(8)
  urls.set(data, url)
  const ok = !(failing.how === 'status' && failing.url === url)
  return Promise.resolve({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: () => Promise.resolve(data),
  })
}

// The fakes answer at once, so one turn of the event loop lets every promise of load() settle.
const settle = () => new Promise((resolve) => setTimeout(resolve))

function onlyContext(): FakeContext {
  expect(audio.contexts).toHaveLength(1)
  const [context] = audio.contexts
  if (!context) throw new Error('no audio context')
  return context
}

function onlySource(context: FakeContext): Source {
  expect(context.sources).toHaveLength(1)
  const [source] = context.sources
  if (!source) throw new Error('no source')
  return source
}

async function loaded(baseUrl = '/puntillo/') {
  const piano = createWebAudioPiano(baseUrl)
  piano.load()
  await settle()
  return piano
}

const unhandled: unknown[] = []
const recordUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}

beforeEach(() => {
  audio = { contexts: [], fetched: [] }
  failing = {}
  resumeFails = false
  contextFails = false
  unhandled.length = 0
  process.on('unhandledRejection', recordUnhandled)
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
})

afterEach(() => {
  process.off('unhandledRejection', recordUnhandled)
  vi.unstubAllGlobals()
})

describe('the piano before load', () => {
  it('fetches nothing and makes no audio context', () => {
    createWebAudioPiano('/puntillo/')

    expect(audio.fetched).toEqual([])
    expect(audio.contexts).toEqual([])
  })

  it('is silent and does not throw when a key is played', async () => {
    const piano = createWebAudioPiano('/puntillo/')

    expect(() => piano.play(C4)).not.toThrow()
    await settle()

    expect(audio.fetched).toEqual([])
    expect(audio.contexts.flatMap((context) => context.sources)).toEqual([])
  })
})

describe('load', () => {
  it('fetches the twelve samples under the base URL of the site', async () => {
    await loaded('/puntillo/')

    expect([...audio.fetched].sort()).toEqual(FILES.map((file) => `/puntillo/piano/${file}`).sort())
  })

  it('fetches them from the root when the site is there', async () => {
    await loaded('/')

    expect(audio.fetched).toContain('/piano/C4.mp3')
    expect(audio.fetched).toHaveLength(12)
  })

  it('decodes every sample', async () => {
    await loaded()

    expect(onlyContext().decodeAudioData).toHaveBeenCalledTimes(12)
  })

  it('resumes a suspended audio context, as it is called from a gesture of the user', async () => {
    await loaded()

    expect(onlyContext().resumes).toBeGreaterThan(0)
  })

  it('fetches nothing again when called again, after or while loading', async () => {
    const piano = createWebAudioPiano('/puntillo/')

    piano.load()
    piano.load()
    await settle()
    piano.load()
    await settle()

    expect(audio.fetched).toHaveLength(12)
    onlyContext()
  })

  it('resumes the context again on a later call when it is suspended', async () => {
    const piano = await loaded()
    const context = onlyContext()
    context.state = 'suspended'
    context.resumes = 0

    piano.load()

    expect(context.resumes).toBeGreaterThan(0)
  })
})

describe('a key played after load', () => {
  it('sounds the nearest sample at its own pitch', async () => {
    const piano = await loaded()

    piano.play(C4)

    const source = onlySource(onlyContext())
    expect(source.buffer).toEqual({ url: '/puntillo/piano/C4.mp3' })
    expect(source.playbackRate.value).toBeCloseTo(1)
    expect(source.start).toHaveBeenCalledTimes(1)
  })

  it.each([
    [C_SHARP_4, '/puntillo/piano/C4.mp3', 1],
    [D4, '/puntillo/piano/Ds4.mp3', -1],
  ])('sounds a key between samples by the rate of the semitones', async (key, url, semitones) => {
    const piano = await loaded()

    piano.play(key)

    const source = onlySource(onlyContext())
    expect(source.buffer).toEqual({ url })
    expect(source.playbackRate.value).toBeCloseTo(2 ** (semitones / 12), 10)
  })

  it('goes through a gain to the output', async () => {
    const piano = await loaded()

    piano.play(C4)

    const context = onlyContext()
    const source = onlySource(context)
    expect(context.gains).toHaveLength(1)
    const [gain] = context.gains
    expect(source.connect).toHaveBeenCalledWith(gain)
    expect(gain?.connect).toHaveBeenCalledWith(context.destination)
  })

  it('holds the volume to 0.8 s, fades to nothing at 1.0 s and stops there', async () => {
    const piano = await loaded()
    const context = onlyContext()

    piano.play(C4)

    const [gain] = context.gains
    if (!gain) throw new Error('no gain')
    const holds = gain.gain.setValueAtTime.mock.calls
    const ramps = gain.gain.linearRampToValueAtTime.mock.calls
    const holdAtFade = holds.find(([, at]) => Math.abs(at - (NOW + 0.8)) < 1e-9)
    expect(holdAtFade?.[0]).toBeGreaterThan(0)
    expect(ramps).toHaveLength(1)
    expect(ramps[0]?.[0]).toBe(0)
    expect(ramps[0]?.[1]).toBeCloseTo(NOW + 1.0, 9)
    const source = onlySource(context)
    expect(source.stop).toHaveBeenCalledTimes(1)
    expect(source.stop.mock.calls[0]?.[0]).toBeCloseTo(NOW + 1.0, 9)
  })

  it('counts the second from the time of the press', async () => {
    const piano = await loaded()
    const context = onlyContext()
    context.currentTime = 40

    piano.play(C4)

    expect(onlySource(context).stop.mock.calls[0]?.[0]).toBeCloseTo(41, 9)
  })

  it('does not cut the key before when another is played', async () => {
    const piano = await loaded()
    const context = onlyContext()

    piano.play(C4)
    context.currentTime = NOW + 0.3
    piano.play(D4)

    expect(context.sources).toHaveLength(2)
    const [first, second] = context.sources
    expect(first?.stop).toHaveBeenCalledTimes(1)
    expect(first?.stop.mock.calls[0]?.[0]).toBeCloseTo(NOW + 1.0, 9)
    expect(second?.start).toHaveBeenCalledTimes(1)
    expect(second?.stop.mock.calls[0]?.[0]).toBeCloseTo(NOW + 1.3, 9)
  })

  it('resumes the context when it is suspended', async () => {
    const piano = await loaded()
    const context = onlyContext()
    context.state = 'suspended'
    context.resumes = 0

    piano.play(C4)

    expect(context.resumes).toBeGreaterThan(0)
  })

  it('does not resume a running context', async () => {
    const piano = await loaded()
    const context = onlyContext()
    context.state = 'running'
    context.resumes = 0

    piano.play(C4)

    expect(context.resumes).toBe(0)
  })
})

describe('a key played while loading (edge case 1)', () => {
  it('is silent, and the next one after load sounds', async () => {
    const piano = createWebAudioPiano('/puntillo/')
    piano.load()

    piano.play(C4)
    const context = onlyContext()
    expect(context.sources).toEqual([])

    await settle()
    piano.play(C4)
    expect(context.sources).toHaveLength(1)
  })
})

describe('when the sound cannot be had (edge case 2)', () => {
  it.each([
    ['a sample cannot be fetched', { url: '/puntillo/piano/A4.mp3', how: 'fetch' }],
    ['a sample is not found', { url: '/puntillo/piano/A4.mp3', how: 'status' }],
    ['a sample cannot be decoded', { url: '/puntillo/piano/A4.mp3', how: 'decode' }],
  ] as const)('stays silent for every key when %s', async (_what, failure) => {
    failing = failure
    const piano = createWebAudioPiano('/puntillo/')

    expect(() => piano.load()).not.toThrow()
    await settle()
    await settle()
    expect(() => piano.play(C4)).not.toThrow()

    expect(onlyContext().sources).toEqual([])
    expect(unhandled).toEqual([])
  })

  it('does not fetch again after a failure', async () => {
    failing = { url: '/puntillo/piano/C4.mp3', how: 'fetch' }
    const piano = await loaded()

    piano.load()
    await settle()

    expect(audio.fetched).toHaveLength(12)
  })

  it('throws nothing and leaves nothing unhandled when the browser does not let the sound start', async () => {
    resumeFails = true
    const piano = createWebAudioPiano('/puntillo/')

    expect(() => piano.load()).not.toThrow()
    await settle()
    expect(() => piano.play(C4)).not.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })

  it('throws nothing when there is no audio in the browser', async () => {
    contextFails = true
    const piano = createWebAudioPiano('/puntillo/')

    expect(() => piano.load()).not.toThrow()
    await settle()
    expect(() => piano.play(C4)).not.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })
})
