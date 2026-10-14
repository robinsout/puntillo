import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PianoKey } from '@/domain/keyboard'
import type { MidiStatus } from '@/application/ports'
import { createWebMidiInput } from '@/infrastructure/midi'

// Feature midi-input, criteria 2 and 4 and edge cases 1–2: the MIDI input is the Web MIDI API.
// connect() asks the browser for access once, without system exclusive messages; a browser
// without the API, a refusal or an error is silence: nothing is thrown or left unhandled. Every
// input is listened to, and an input connected later too. A key pressed is a note on with a
// velocity above 0 on any channel; the key is the MIDI note number (C4 = 60). Any other message
// is nothing. Keys come in the order they arrive: a chord is several presses one after another.
// The browser is a fake: it answers at once and has no instrument but the ones a test plugs in.
//
// Slice 2, criterion 3 and edge case 3: the input tells its state. Unsupported from the start in a
// browser without the API; otherwise idle until connect(), asking while the browser answers,
// denied on a refusal or an error, ready once allowed, with the names of the inputs connected now,
// in the order of the access: the name, an empty one replaced by the manufacturer, and both empty
// by MIDI. Names alike stay apart. Plugging an input in or out changes ready at once and tells the
// listeners; a listener hears changes only, not the state it subscribed in.

class FakeInput extends EventTarget {
  readonly type = 'input'
  state: 'connected' | 'disconnected' = 'connected'
  onmidimessage: ((event: Event) => void) | null = null

  constructor(
    readonly id: string,
    readonly name: string | null = id,
    readonly manufacturer: string | null = '',
  ) {
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
    input.state = 'connected'
    this.changed(input)
  }

  // Browsers differ: an input unplugged leaves the map, or stays in it disconnected.
  unplug(input: FakeInput, { stays = false } = {}) {
    input.state = 'disconnected'
    if (!stays) this.inputs.delete(input.id)
    this.changed(input)
  }

  private changed(input: FakeInput) {
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

const READY = (...instruments: string[]): MidiStatus => ({ kind: 'ready', instruments })

function recordingStatus(midi: ReturnType<typeof createWebMidiInput>) {
  const heard: MidiStatus[] = []
  const unsubscribe = midi.onStatus((status) => heard.push(status))
  return { heard, unsubscribe }
}

async function readyWith(...inputs: FakeInput[]) {
  for (const input of inputs) access.inputs.set(input.id, input)
  browserWithMidi()
  const midi = createWebMidiInput()
  midi.connect()
  await settle()
  return midi
}

describe('the state (slice 2, criterion 3)', () => {
  it('is unsupported in a browser without MIDI, from the start', () => {
    vi.stubGlobal('navigator', {})

    expect(createWebMidiInput().status()).toEqual({ kind: 'unsupported' })
  })

  it('stays unsupported after connect, telling nothing', async () => {
    vi.stubGlobal('navigator', {})
    const midi = createWebMidiInput()
    const { heard } = recordingStatus(midi)

    midi.connect()
    await settle()

    expect(midi.status()).toEqual({ kind: 'unsupported' })
    expect(heard).toEqual([])
  })

  it('is idle before connect', () => {
    browserWithMidi()

    expect(createWebMidiInput().status()).toEqual({ kind: 'idle' })
  })

  it('is asking while the browser has not answered', () => {
    browserWithMidi(() => new Promise<FakeAccess>(() => {}))
    const midi = createWebMidiInput()

    midi.connect()

    expect(midi.status()).toEqual({ kind: 'asking' })
  })

  it('is denied when the browser refuses', async () => {
    browserWithMidi(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const midi = createWebMidiInput()

    midi.connect()
    await settle()

    expect(midi.status()).toEqual({ kind: 'denied' })
  })

  it('is denied when asking throws at once', async () => {
    browserWithMidi(() => {
      throw new DOMException('insecure', 'SecurityError')
    })
    const midi = createWebMidiInput()

    midi.connect()
    await settle()

    expect(midi.status()).toEqual({ kind: 'denied' })
    expect(unhandled).toEqual([])
  })

  it('is ready with no instrument when none is connected', async () => {
    const midi = await readyWith()

    expect(midi.status()).toEqual(READY())
  })

  it('is ready with the name of the instrument connected', async () => {
    const midi = await readyWith(new FakeInput('1', 'Yamaha P-45', 'Yamaha'))

    expect(midi.status()).toEqual(READY('Yamaha P-45'))
  })

  it('names the instruments in the order of the access, names alike apart', async () => {
    const midi = await readyWith(
      new FakeInput('1', 'Digital Piano'),
      new FakeInput('2', 'Pads'),
      new FakeInput('3', 'Digital Piano'),
    )

    expect(midi.status()).toEqual(READY('Digital Piano', 'Pads', 'Digital Piano'))
  })

  it.each([
    ['empty', ''],
    ['missing', null],
  ])('names an instrument by its manufacturer when its name is %s', async (_, name) => {
    const midi = await readyWith(new FakeInput('1', name, 'Roland'))

    expect(midi.status()).toEqual(READY('Roland'))
  })

  it.each([
    ['empty', ''],
    ['missing', null],
  ])('names an instrument MIDI when its manufacturer is %s too', async (_, manufacturer) => {
    const midi = await readyWith(new FakeInput('1', '', manufacturer))

    expect(midi.status()).toEqual(READY('MIDI'))
  })

  it('leaves out an input that is not connected', async () => {
    const gone = new FakeInput('2', 'Gone')
    gone.state = 'disconnected'

    const midi = await readyWith(new FakeInput('1', 'Piano'), gone)

    expect(midi.status()).toEqual(READY('Piano'))
  })

  it('stays ready when connect is called again', async () => {
    const midi = await readyWith(new FakeInput('1', 'Piano'))

    midi.connect()
    await settle()

    expect(midi.status()).toEqual(READY('Piano'))
  })
})

describe('the listeners of the state (slice 2, criterion 3, edge case 3)', () => {
  it('hear asking, then ready', async () => {
    access.inputs.set('1', new FakeInput('1', 'Piano'))
    browserWithMidi()
    const midi = createWebMidiInput()
    const { heard } = recordingStatus(midi)

    midi.connect()
    await settle()

    expect(heard).toEqual([{ kind: 'asking' }, READY('Piano')])
  })

  it('hear asking, then denied', async () => {
    browserWithMidi(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const midi = createWebMidiInput()
    const { heard } = recordingStatus(midi)

    midi.connect()
    await settle()

    expect(heard).toEqual([{ kind: 'asking' }, { kind: 'denied' }])
  })

  it('hear an instrument plugged in', async () => {
    const midi = await readyWith(new FakeInput('1', 'Piano'))
    const { heard } = recordingStatus(midi)

    access.plug(new FakeInput('2', 'Pads'))

    expect(heard.at(-1)).toEqual(READY('Piano', 'Pads'))
    expect(midi.status()).toEqual(READY('Piano', 'Pads'))
  })

  it('hear the first instrument plugged in after none', async () => {
    const midi = await readyWith()
    const { heard } = recordingStatus(midi)

    access.plug(new FakeInput('1', 'Piano'))

    expect(heard.at(-1)).toEqual(READY('Piano'))
  })

  it('hear an instrument unplugged', async () => {
    const pads = new FakeInput('2', 'Pads')
    const midi = await readyWith(new FakeInput('1', 'Piano'), pads)
    const { heard } = recordingStatus(midi)

    access.unplug(pads)

    expect(heard.at(-1)).toEqual(READY('Piano'))
    expect(midi.status()).toEqual(READY('Piano'))
  })

  it('hear the last instrument unplugged, though it stays in the access disconnected', async () => {
    const piano = new FakeInput('1', 'Piano')
    const midi = await readyWith(piano)
    const { heard } = recordingStatus(midi)

    access.unplug(piano, { stays: true })

    expect(heard.at(-1)).toEqual(READY())
    expect(midi.status()).toEqual(READY())
  })

  it('hear the instrument plugged in again', async () => {
    const piano = new FakeInput('1', 'Piano')
    const midi = await readyWith(piano)
    const { heard } = recordingStatus(midi)

    access.unplug(piano)
    access.plug(piano)

    expect(heard.at(-1)).toEqual(READY('Piano'))
  })

  it('are all told', async () => {
    const midi = await readyWith()
    const first = recordingStatus(midi)
    const second = recordingStatus(midi)

    access.plug(new FakeInput('1', 'Piano'))

    expect(first.heard.at(-1)).toEqual(READY('Piano'))
    expect(second.heard.at(-1)).toEqual(READY('Piano'))
  })

  it('are not told the state they subscribed in', async () => {
    const midi = await readyWith(new FakeInput('1', 'Piano'))

    const { heard } = recordingStatus(midi)
    await settle()

    expect(heard).toEqual([])
  })

  it('are no longer told once unsubscribed', async () => {
    const midi = await readyWith()
    const gone = recordingStatus(midi)
    const staying = recordingStatus(midi)

    gone.unsubscribe()
    access.plug(new FakeInput('1', 'Piano'))

    expect(gone.heard).toEqual([])
    expect(staying.heard.at(-1)).toEqual(READY('Piano'))
  })
})
