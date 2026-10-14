import type { PianoKey } from '@/domain/keyboard'
import type { MidiInput } from '@/application/ports'

const NOTE_ON = 0x90

function pressedKey(data: Uint8Array | null): PianoKey | null {
  if (data === null || data.length < 3) return null
  const [status = 0, number = 0, velocity = 0] = data
  // A note on with velocity 0 is how many instruments release a key.
  if ((status & 0xf0) !== NOTE_ON || velocity === 0) return null
  return { number }
}

export function createWebMidiInput(): MidiInput {
  const listeners = new Set<(key: PianoKey) => void>()
  let asked = false

  const hear = (event: MIDIMessageEvent) => {
    const key = pressedKey(event.data)
    if (key === null) return
    for (const listener of listeners) listener(key)
  }

  // The handler property rather than addEventListener: assigning it again does not listen twice,
  // and Chrome opens the port only for it.
  const listenToAll = (access: MIDIAccess) => {
    access.inputs.forEach((input) => {
      input.onmidimessage = hear
    })
  }

  async function ask() {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      listenToAll(access)
      access.onstatechange = () => listenToAll(access)
    } catch {
      // A refusal or a browser that cannot: the instrument is simply not heard.
    }
  }

  return {
    connect() {
      if (asked || typeof navigator.requestMIDIAccess !== 'function') return
      asked = true
      void ask()
    },
    onKey(listener) {
      const subscription = (key: PianoKey) => listener(key)
      listeners.add(subscription)
      return () => {
        listeners.delete(subscription)
      }
    },
  }
}
