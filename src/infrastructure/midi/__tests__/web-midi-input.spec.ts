import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoKey } from '@/domain/keyboard'
import { createWebMidiInput } from '@/infrastructure/midi'

// Feature midi-input, criteria 2 and 4 and edge cases 1–2: the MIDI input is the Web MIDI API.
// connect() asks the browser for access once, without system exclusive messages; a browser
// without the API, a refusal or an error is silence: nothing is thrown or left unhandled. Every
// input is listened to, and an input connected later too. A key pressed is a note on with a
// velocity above 0 on any channel; the key is the MIDI note number (C4 = 60). Any other message
// is nothing. Keys come in the order they arrive: a chord is several presses one after another.
// The browser is a fake: it answers at once and has no instrument but the ones a test plugs in.

class FakeInput extends EventTarget {
  readonly type = 'input'
  state: 'connected' | 'disconnected' = 'connected'
  onmidimessage: ((event: Event) => void) | null = null

  constructor(readonly id: string) {
    super()
  }

  // Either way of listening a browser offers hears the message.
  send(...bytes: number[]) {
    const event = Object.assign(new Event('midimessage'), { data: new Uint8Array(bytes) })
    this.dispatchEvent(event)
    this.onmidimessage?.(event)
  }

  open() {
    return Promise.resolve(this)
  }
}

class FakeAccess extends EventTarget {
  readonly inputs = new Map<string, FakeInput>()
  readonly outputs = new Map<string, never>()
  readonly sysexEnabled = false
  onstatechange: ((event: Event) => void) | null = null

  plug(input: FakeInput) {
    this.inputs.set(input.id, input)
    const event = Object.assign(new Event('statechange'), { port: input })
    this.dispatchEvent(event)
    this.onstatechange?.(event)
  }
}

let access: FakeAccess
let requests: unknown[]

const unhandled: unknown[] = []
const recordUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}

// The fakes answer at once, so one turn of the event loop lets the request settle.
const settle = () => new Promise((resolve) => setTimeout(resolve))

function browserWithMidi(
  answer: (options: unknown) => Promise<FakeAccess> = () => Promise.resolve(access),
) {
  vi.stubGlobal('navigator', {
    // Not a vi.fn: a mock would handle the promise it returns and hide one left unhandled.
    requestMIDIAccess(options: unknown) {
      requests.push(options)
      return answer(options)
    },
  })
}

function recordingListener() {
  const keys: PianoKey[] = []
  return { keys, listener: (key: PianoKey) => keys.push(key) }
}

async function connected(...inputs: FakeInput[]) {
  for (const input of inputs) access.inputs.set(input.id, input)
  browserWithMidi()
  const midi = createWebMidiInput()
  const { keys, listener } = recordingListener()
  midi.onKey(listener)
  midi.connect()
  await settle()
  return { midi, keys }
}

beforeEach(() => {
  access = new FakeAccess()
  requests = []
  unhandled.length = 0
  process.on('unhandledRejection', recordUnhandled)
})

afterEach(() => {
  process.off('unhandledRejection', recordUnhandled)
  vi.unstubAllGlobals()
})

describe('a browser without MIDI', () => {
  it('connects to nothing and throws nothing', async () => {
    vi.stubGlobal('navigator', {})
    const midi = createWebMidiInput()
    const { keys, listener } = recordingListener()

    expect(() => midi.onKey(listener)).not.toThrow()
    expect(() => midi.connect()).not.toThrow()
    await settle()

    expect(keys).toEqual([])
    expect(unhandled).toEqual([])
  })
})

describe('connect', () => {
  it('asks nothing before it is called', () => {
    browserWithMidi()

    createWebMidiInput()

    expect(requests).toEqual([])
  })

  it('asks the browser for MIDI without system exclusive messages', () => {
    browserWithMidi()

    createWebMidiInput().connect()

    expect(requests).toEqual([{ sysex: false }])
  })

  it('asks once, however many times it is called', async () => {
    browserWithMidi()
    const midi = createWebMidiInput()

    midi.connect()
    midi.connect()
    await settle()
    midi.connect()

    expect(requests).toHaveLength(1)
  })

  it('throws nothing and leaves nothing unhandled when the browser refuses', async () => {
    browserWithMidi(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const midi = createWebMidiInput()
    const { keys, listener } = recordingListener()
    midi.onKey(listener)

    expect(() => midi.connect()).not.toThrow()
    await settle()

    expect(keys).toEqual([])
    expect(unhandled).toEqual([])
  })

  it('throws nothing when asking throws at once', async () => {
    browserWithMidi(() => {
      throw new DOMException('insecure', 'SecurityError')
    })
    const midi = createWebMidiInput()

    expect(() => midi.connect()).not.toThrow()
    await settle()

    expect(unhandled).toEqual([])
  })
})

describe('a key pressed', () => {
  it('calls the listener with the key of the note', async () => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)

    piano.send(0x90, 60, 100)

    expect(keys).toEqual([{ number: 60 }])
  })

  it.each([0x90, 0x93, 0x99, 0x9f])('counts on any channel: status %#x', async (status) => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)

    piano.send(status, 61, 1)

    expect(keys).toEqual([{ number: 61 }])
  })

  it('counts the lowest and the highest notes of MIDI', async () => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)

    piano.send(0x90, 0, 64)
    piano.send(0x90, 127, 127)

    expect(keys).toEqual([{ number: 0 }, { number: 127 }])
  })

  it('comes from every input connected', async () => {
    const piano = new FakeInput('piano')
    const pads = new FakeInput('pads')
    const { keys } = await connected(piano, pads)

    pads.send(0x90, 48, 90)
    piano.send(0x90, 72, 90)

    expect(keys).toEqual([{ number: 48 }, { number: 72 }])
  })

  it('comes from an input connected later', async () => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)
    const later = new FakeInput('later')

    access.plug(later)
    later.send(0x90, 64, 80)

    expect(keys).toEqual([{ number: 64 }])
  })

  it('comes once from an input connected before another one is', async () => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)

    access.plug(new FakeInput('later'))
    piano.send(0x90, 60, 80)

    expect(keys).toEqual([{ number: 60 }])
  })

  it('comes as one press each for a chord, in the order they arrive (edge case 1)', async () => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)

    piano.send(0x90, 60, 90)
    piano.send(0x90, 64, 90)
    piano.send(0x90, 67, 90)

    expect(keys).toEqual([{ number: 60 }, { number: 64 }, { number: 67 }])
  })

  it('reaches a listener added after the access was given', async () => {
    const piano = new FakeInput('piano')
    const { midi } = await connected(piano)
    const { keys, listener } = recordingListener()

    midi.onKey(listener)
    piano.send(0x90, 60, 90)

    expect(keys).toEqual([{ number: 60 }])
  })

  it('reaches every listener', async () => {
    const piano = new FakeInput('piano')
    const { midi, keys } = await connected(piano)
    const other = recordingListener()
    midi.onKey(other.listener)

    piano.send(0x90, 60, 90)

    expect(keys).toEqual([{ number: 60 }])
    expect(other.keys).toEqual([{ number: 60 }])
  })

  it('no longer reaches a listener that unsubscribed', async () => {
    const piano = new FakeInput('piano')
    access.inputs.set(piano.id, piano)
    browserWithMidi()
    const midi = createWebMidiInput()
    const gone = recordingListener()
    const staying = recordingListener()
    const unsubscribe = midi.onKey(gone.listener)
    midi.onKey(staying.listener)
    midi.connect()
    await settle()

    piano.send(0x90, 60, 90)
    unsubscribe()
    piano.send(0x90, 62, 90)

    expect(gone.keys).toEqual([{ number: 60 }])
    expect(staying.keys).toEqual([{ number: 60 }, { number: 62 }])
  })
})

describe('other messages of the instrument are nothing (edge case 2)', () => {
  it.each([
    ['a note on with velocity 0, a key released', [0x90, 60, 0]],
    ['a note off', [0x80, 60, 64]],
    ['a note off on another channel', [0x8f, 60, 0]],
    ['the sustain pedal', [0xb0, 64, 127]],
    ['the pitch bend wheel', [0xe0, 0, 64]],
    ['the modulation wheel', [0xb0, 1, 90]],
    ['a program change', [0xc0, 5]],
    ['the aftertouch', [0xd0, 80]],
    ['the polyphonic aftertouch', [0xa0, 60, 80]],
    ['a clock tick', [0xf8]],
    ['active sensing', [0xfe]],
    ['a note on without its velocity', [0x90, 60]],
  ])('%s', async (_, bytes) => {
    const piano = new FakeInput('piano')
    const { keys } = await connected(piano)

    piano.send(...bytes)

    expect(keys).toEqual([])
  })
})
