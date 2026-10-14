import type { PianoKey } from '@/domain/keyboard'
import type { MidiInput, MidiStatus } from '@/application/ports'

const NOTE_ON = 0x90

function pressedKey(data: Uint8Array | null): PianoKey | null {
  if (data === null || data.length < 3) return null
  const [status = 0, number = 0, velocity = 0] = data
  // A note on with velocity 0 is how many instruments release a key.
  if ((status & 0xf0) !== NOTE_ON || velocity === 0) return null
  return { number }
}

function instrumentsOf(access: MIDIAccess): string[] {
  const names: string[] = []
  access.inputs.forEach((input) => {
    if (input.state === 'connected') names.push(input.name || input.manufacturer || 'MIDI')
  })
  return names
}

// A function of its own per subscription, so the same listener subscribed twice hears twice.
function createListeners<T>() {
  const listeners = new Set<(value: T) => void>()
  return {
    tell(value: T) {
      for (const listener of listeners) listener(value)
    },
    add(listener: (value: T) => void) {
      const subscription = (value: T) => listener(value)
      listeners.add(subscription)
      return () => {
        listeners.delete(subscription)
      }
    },
  }
}

export function createWebMidiInput(): MidiInput {
  const keyListeners = createListeners<PianoKey>()
  const statusListeners = createListeners<MidiStatus>()
  const supported = typeof navigator.requestMIDIAccess === 'function'
  let status: MidiStatus = { kind: supported ? 'idle' : 'unsupported' }

  const become = (next: MidiStatus) => {
    status = next
    statusListeners.tell(next)
  }

  const hear = (event: MIDIMessageEvent) => {
    const key = pressedKey(event.data)
    if (key !== null) keyListeners.tell(key)
  }

  // The handler property rather than addEventListener: assigning it again does not listen twice,
  // and Chrome opens the port only for it.
  const listenToAll = (access: MIDIAccess) => {
    access.inputs.forEach((input) => {
      input.onmidimessage = hear
    })
    become({ kind: 'ready', instruments: instrumentsOf(access) })
  }

  async function ask() {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      listenToAll(access)
      access.onstatechange = () => listenToAll(access)
    } catch {
      become({ kind: 'denied' })
    }
  }

  return {
    connect() {
      if (status.kind !== 'idle') return
      become({ kind: 'asking' })
      void ask()
    },
    status: () => status,
    onStatus: statusListeners.add,
    onKey: keyListeners.add,
  }
}
