import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MicrophoneStatus } from '@/application/ports'
import type { SoundFrame } from '@/domain/hearing'
import { createWebMicrophone } from '@/infrastructure/microphone'

// Feature microphone-input, slice 1: the microphone is getUserMedia with the filters of the
// browser for speech off, echo cancellation, noise suppression and automatic gain (criterion 4),
// heard through a Web Audio analyser. requestAccess() asks for it and lets it go at once; listen()
// asks if needed, opens it and calls back with frames until stop(), which stops the tracks and
// closes the audio context, so the browser shows no recording any more (criterion 5). A frame
// carries the frequency of a clear and loud enough pitch, by pitchy, the real one here; silence,
// a sound too soft and noise are null (edge case 2).
//
// The state: unsupported in a browser without getUserMedia; otherwise idle until asked, asking
// while the browser answers, ready once allowed; a refusal (NotAllowedError, SecurityError) is
// denied, no microphone (NotFoundError, OverconstrainedError) is missing. Nothing is ever thrown or
// left unhandled. The browser and Web Audio are fakes; the analyser gives the sound a test makes.

const SAMPLE_RATE = 44_100

// A sound by the index of its sample in the buffer of the analyser, from -1 to 1.
type Sound = (index: number) => number

const silence: Sound = () => 0
const sine =
  (frequency: number, amplitude = 0.5): Sound =>
  (index) =>
    amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE)

// White noise, the same every time.
function noise(): Sound {
  let seed = 1
  return () => {
    seed = (seed * 16_807) % 2_147_483_647
    return seed / 2_147_483_647 - 0.5
  }
}

let sound: Sound

class FakeTrack {
  stopped = false
  readonly kind = 'audio'
  stop() {
    this.stopped = true
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack()]
  getTracks() {
    return this.tracks
  }
  getAudioTracks() {
    return this.tracks
  }
  get stopped() {
    return this.tracks.every((track) => track.stopped)
  }
}

class FakeNode {
  connect<T>(destination: T): T {
    return destination
  }
  disconnect() {}
}

class FakeAnalyser extends FakeNode {
  fftSize = 2048
  smoothingTimeConstant = 0.8
  minDecibels = -100
  maxDecibels = -30
  get frequencyBinCount() {
    return this.fftSize / 2
  }
  getFloatTimeDomainData(array: Float32Array) {
    for (let index = 0; index < array.length; index += 1) array[index] = sound(index)
  }
  getByteTimeDomainData(array: Uint8Array) {
    for (let index = 0; index < array.length; index += 1)
      array[index] = Math.round(128 + 127 * sound(index))
  }
}

let contexts: FakeContext[]

class FakeContext {
  readonly sampleRate = SAMPLE_RATE
  readonly currentTime = 0
  state: 'running' | 'suspended' | 'closed' = 'running'
  readonly streams: unknown[] = []
  constructor() {
    contexts.push(this)
  }
  createMediaStreamSource(stream: unknown) {
    this.streams.push(stream)
    return new FakeNode()
  }
  createAnalyser() {
    return new FakeAnalyser()
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } })
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

let requests: unknown[]
let streams: FakeStream[]

// How the browser answers each request: with a stream, an error, or later, when a test says so.
type Answer = 'allow' | DOMException | 'later'
let answer: Answer
let pending: (() => void)[]

function browserWithMicrophone() {
  vi.stubGlobal('navigator', {
    mediaDevices: {
      // Not a vi.fn: a mock would handle the promise it returns and hide one left unhandled.
      getUserMedia(constraints: unknown) {
        requests.push(constraints)
        const given = answer
        if (given instanceof DOMException) return Promise.reject(given)
        const stream = new FakeStream()
        streams.push(stream)
        if (given === 'allow') return Promise.resolve(stream)
        return new Promise((resolve) => pending.push(() => resolve(stream)))
      },
    },
  })
}

const unhandled: unknown[] = []
const recordUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}

// The fakes answer at once, so one turn of the event loop lets the request settle.
const settle = () => new Promise((resolve) => setTimeout(resolve))

function recordingStatus(microphone: ReturnType<typeof createWebMicrophone>) {
  const statuses: MicrophoneStatus['kind'][] = []
  const unsubscribe = microphone.onStatus((status) => statuses.push(status.kind))
  return { statuses, unsubscribe }
}

function listening(microphone = createWebMicrophone()) {
  const frames: SoundFrame[] = []
  microphone.listen((frame) => frames.push(frame))
  return { microphone, frames }
}

// Frames come as the page analyses the sound, a few each second at least.
const framesArrive = (frames: readonly SoundFrame[], count = 3) =>
  vi.waitFor(() => expect(frames.length).toBeGreaterThanOrEqual(count), { timeout: 2000 })

beforeEach(() => {
  sound = silence
  contexts = []
  requests = []
  streams = []
  answer = 'allow'
  pending = []
  unhandled.length = 0
  process.on('unhandledRejection', recordUnhandled)
  vi.stubGlobal('AudioContext', FakeContext)
  browserWithMicrophone()
})

afterEach(() => {
  process.off('unhandledRejection', recordUnhandled)
  vi.unstubAllGlobals()
})

describe('a browser without the microphone API', () => {
  it('is unsupported', () => {
    vi.stubGlobal('navigator', {})

    expect(createWebMicrophone().status()).toEqual({ kind: 'unsupported' })
  })

  it('is unsupported with mediaDevices but no getUserMedia', () => {
    vi.stubGlobal('navigator', { mediaDevices: {} })

    expect(createWebMicrophone().status()).toEqual({ kind: 'unsupported' })
  })

  it('throws nothing and hears nothing', async () => {
    vi.stubGlobal('navigator', {})
    const microphone = createWebMicrophone()
    const frames: SoundFrame[] = []

    expect(() => microphone.requestAccess()).not.toThrow()
    expect(() => microphone.listen((frame) => frames.push(frame))).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(() => microphone.stop()).not.toThrow()

    expect(frames).toEqual([])
    expect(microphone.status()).toEqual({ kind: 'unsupported' })
    expect(unhandled).toEqual([])
  })
})

describe('requestAccess (criterion 4)', () => {
  it('asks nothing before it is called', () => {
    const microphone = createWebMicrophone()

    expect(requests).toEqual([])
    expect(microphone.status()).toEqual({ kind: 'idle' })
  })

  it('asks for the microphone without the filters for speech', () => {
    createWebMicrophone().requestAccess()

    expect(requests).toEqual([
      { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
    ])
  })

  it('is asking while the browser answers', () => {
    answer = 'later'
    const microphone = createWebMicrophone()

    microphone.requestAccess()

    expect(microphone.status()).toEqual({ kind: 'asking' })
  })

  it('is ready once allowed', async () => {
    const microphone = createWebMicrophone()

    microphone.requestAccess()
    await settle()

    expect(microphone.status()).toEqual({ kind: 'ready' })
  })

  it('lets the microphone go at once (criterion 5)', async () => {
    createWebMicrophone().requestAccess()
    await settle()

    expect(streams).toHaveLength(1)
    expect(streams[0]?.stopped).toBe(true)
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'missing'],
    ['OverconstrainedError', 'missing'],
  ] as const)('tells %s as %s, throwing nothing', async (name, kind) => {
    answer = new DOMException('no', name)
    const microphone = createWebMicrophone()

    expect(() => microphone.requestAccess()).not.toThrow()
    await settle()

    expect(microphone.status()).toEqual({ kind })
    expect(unhandled).toEqual([])
  })

  it('throws nothing when getUserMedia throws', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia() {
          throw new TypeError('not a secure context')
        },
      },
    })
    const microphone = createWebMicrophone()

    expect(() => microphone.requestAccess()).not.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })
})

describe('the state', () => {
  it('tells each change to the listeners', async () => {
    const microphone = createWebMicrophone()
    const { statuses } = recordingStatus(microphone)

    microphone.requestAccess()
    await settle()

    expect(statuses).toEqual(['asking', 'ready'])
  })

  it('tells a refusal', async () => {
    answer = new DOMException('no', 'NotAllowedError')
    const microphone = createWebMicrophone()
    const { statuses } = recordingStatus(microphone)

    microphone.requestAccess()
    await settle()

    expect(statuses).toEqual(['asking', 'denied'])
  })

  it('tells nothing to a listener gone', async () => {
    const microphone = createWebMicrophone()
    const { statuses, unsubscribe } = recordingStatus(microphone)

    unsubscribe()
    microphone.requestAccess()
    await settle()

    expect(statuses).toEqual([])
  })
})

describe('listen (criteria 4, 5)', () => {
  it('asks for the microphone without the filters for speech', () => {
    listening()

    expect(requests).toEqual([
      { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
    ])
  })

  it('is ready once allowed', async () => {
    const { microphone } = listening()
    await settle()

    expect(microphone.status()).toEqual({ kind: 'ready' })
  })

  it('analyses the stream of the microphone', async () => {
    listening()
    await settle()

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.streams).toEqual([streams[0]])
  })

  it('keeps the microphone open while it listens', async () => {
    const { frames } = listening()

    await framesArrive(frames)

    expect(streams[0]?.stopped).toBe(false)
  })

  it('gives the frequency of a clear note', async () => {
    sound = sine(523.25)
    const { frames } = listening()

    await framesArrive(frames)

    for (const { frequency } of frames) {
      expect(frequency).not.toBeNull()
      expect(frequency).toBeGreaterThan(520)
      expect(frequency).toBeLessThan(527)
    }
  })

  it('gives the frequency of a note played softly', async () => {
    sound = sine(293.66, 0.05)
    const { frames } = listening()

    await framesArrive(frames)

    expect(frames.at(-1)?.frequency).toBeGreaterThan(291)
    expect(frames.at(-1)?.frequency).toBeLessThan(296)
  })

  it('gives the time of each frame, never going back', async () => {
    sound = sine(440)
    const { frames } = listening()

    await framesArrive(frames, 4)

    const times = frames.map(({ atMs }) => atMs)
    expect(times.every((atMs) => Number.isFinite(atMs))).toBe(true)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(times.at(-1)).toBeGreaterThan(times[0] as number)
  })

  it.each([
    ['silence', () => silence],
    ['a note too soft to tell from the room', () => sine(440, 0.001)],
    ['noise', noise],
  ])('gives no frequency for %s (edge case 2)', async (_, make) => {
    sound = make()
    const { frames } = listening()

    await framesArrive(frames)

    expect(frames.map(({ frequency }) => frequency)).toEqual(frames.map(() => null))
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'missing'],
  ] as const)('tells %s as %s and gives no frames', async (name, kind) => {
    answer = new DOMException('no', name)
    sound = sine(440)
    const { microphone, frames } = listening()

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(microphone.status()).toEqual({ kind })
    expect(frames).toEqual([])
    expect(unhandled).toEqual([])
  })
})

describe('stop (criterion 5)', () => {
  it('stops the tracks and closes the audio context', async () => {
    const { microphone, frames } = listening()
    await framesArrive(frames)

    microphone.stop()
    await settle()

    expect(streams[0]?.stopped).toBe(true)
    expect(contexts[0]?.state).toBe('closed')
  })

  it('gives no frames after it', async () => {
    sound = sine(440)
    const { microphone, frames } = listening()
    await framesArrive(frames)

    microphone.stop()
    const count = frames.length
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(frames).toHaveLength(count)
  })

  it('lets go of a microphone allowed only after it, giving no frames', async () => {
    answer = 'later'
    sound = sine(440)
    const { microphone, frames } = listening()

    microphone.stop()
    pending.forEach((resolve) => resolve())
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(streams[0]?.stopped).toBe(true)
    expect(contexts.every((context) => context.state === 'closed')).toBe(true)
    expect(frames).toEqual([])
  })

  it('throws nothing before listen', () => {
    expect(() => createWebMicrophone().stop()).not.toThrow()
  })

  it('leaves the microphone to listen again', async () => {
    sound = sine(440)
    const microphone = createWebMicrophone()
    listening(microphone)
    await settle()
    microphone.stop()

    const { frames } = listening(microphone)
    await framesArrive(frames)

    expect(frames.at(-1)?.frequency).toBeCloseTo(440, -1)
    expect(streams).toHaveLength(2)
    expect(streams[1]?.stopped).toBe(false)
  })
})
