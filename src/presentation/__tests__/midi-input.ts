import { nextTick } from 'vue'
import type { MidiInput, MidiStatus } from '@/application/ports'
import type { PianoKey } from '@/domain/keyboard'

// Stands in for the MIDI instrument and the browser behind the port: it counts the requests for
// access and plays keys to whoever listens at the moment. Its state is what a test makes it, by
// default not asked yet; asking does not change it by itself.
export function fakeMidiInput(initial: MidiStatus = { kind: 'idle' }) {
  const listeners = new Set<(key: PianoKey) => void>()
  const statusListeners = new Set<(status: MidiStatus) => void>()
  let connects = 0
  let current = initial
  const midiInput: MidiInput = {
    connect() {
      connects += 1
    },
    status: () => current,
    onStatus(listener) {
      const subscription = (status: MidiStatus) => listener(status)
      statusListeners.add(subscription)
      return () => {
        statusListeners.delete(subscription)
      }
    },
    onKey(listener) {
      // A function of its own per call, so the same listener subscribed twice hears twice.
      const subscription = (key: PianoKey) => listener(key)
      listeners.add(subscription)
      return () => {
        listeners.delete(subscription)
      }
    },
  }
  const send = (numbers: readonly number[]) => {
    for (const number of numbers) for (const listener of listeners) listener({ number })
  }
  return {
    midiInput,
    connects: () => connects,
    statusListeners: () => statusListeners.size,
    // The browser answering, an instrument plugged in or out.
    async becomes(status: MidiStatus) {
      current = status
      for (const listener of statusListeners) listener(status)
      await settle()
    },
    // Keys pressed together, as the instrument sends a chord: one after another, nothing between.
    async press(...numbers: number[]) {
      send(numbers)
      await settle()
    },
  }
}

export type FakeMidiInput = ReturnType<typeof fakeMidiInput>

// Lets the re-render and a focus move scheduled after it happen.
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

export const MIDI_READY = (...instruments: string[]): MidiStatus => ({
  kind: 'ready',
  instruments,
})
