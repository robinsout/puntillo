import { nextTick } from 'vue'
import type { MidiInput } from '@/application/ports'
import type { PianoKey } from '@/domain/keyboard'

// Stands in for the MIDI instrument and the browser behind the port: it counts the requests for
// access and plays keys to whoever listens at the moment.
export function fakeMidiInput() {
  const listeners = new Set<(key: PianoKey) => void>()
  let connects = 0
  const midiInput: MidiInput = {
    connect() {
      connects += 1
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
