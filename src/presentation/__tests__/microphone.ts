import { nextTick } from 'vue'
import type { Microphone, MicrophoneStatus } from '@/application/ports'
import type { SoundFrame } from '@/domain/hearing'

// Stands in for the microphone and the browser behind the port: it counts the requests for access,
// knows whether the page listens, and sends frames to the listener of the moment, as a player
// would by playing. Its state is what a test makes it, by default not asked yet; asking does not
// change it by itself.
export function fakeMicrophone(initial: MicrophoneStatus = { kind: 'idle' }) {
  const statusListeners = new Set<(status: MicrophoneStatus) => void>()
  let listener: ((frame: SoundFrame) => void) | null = null
  let requests = 0
  let listens = 0
  let stops = 0
  let current = initial
  // The time of the next frame: frames go on from where the last ones ended.
  let atMs = 0
  const microphone: Microphone = {
    requestAccess() {
      requests += 1
    },
    listen(onFrame) {
      listens += 1
      listener = onFrame
    },
    stop() {
      stops += 1
      listener = null
    },
    status: () => current,
    onStatus(subscriber) {
      const subscription = (status: MicrophoneStatus) => subscriber(status)
      statusListeners.add(subscription)
      return () => {
        statusListeners.delete(subscription)
      }
    },
  }
  const send = (frequency: number | null, volume = frequency === null ? 0 : LOUD) => {
    listener?.({ atMs, frequency, volume })
    atMs += FRAME_MS
  }
  const sound = (number: number, heldMs: number) => {
    for (let at = 0; at <= heldMs; at += FRAME_MS) send(frequencyOf(number))
  }
  return {
    microphone,
    requests: () => requests,
    listens: () => listens,
    stops: () => stops,
    isListening: () => listener !== null,
    async becomes(status: MicrophoneStatus) {
      current = status
      for (const subscriber of statusListeners) subscriber(status)
      await settle()
    },
    // Frames of these frequencies in turn, one each FRAME_MS; null is silence or noise.
    async hear(...frequencies: (number | null)[]) {
      for (const frequency of frequencies) send(frequency)
      await settle()
    },
    // A note held for the time given, then let go: a frame of silence after it.
    async play(number: number, heldMs = 300) {
      sound(number, heldMs)
      send(null)
      await settle()
    },
    // A note played several times without a breath, each time tongued again: between two of them
    // the sound only falls for a frame, it does not stop. Let go after the last one.
    async tongue(number: number, times: number, heldMs = 300) {
      for (let time = 1; time <= times; time += 1) {
        sound(number, heldMs)
        if (time < times) send(frequencyOf(number), SOFT)
      }
      send(null)
      await settle()
    },
  }
}

export type FakeMicrophone = ReturnType<typeof fakeMicrophone>

export const FRAME_MS = 20

// The volume of a note played, and of the fall of its sound when the note is tongued again.
const LOUD = 0.3
const SOFT = 0.05

// Equal temperament, A4 = 440 Hz: the MIDI number 69.
export const frequencyOf = (number: number) => 440 * 2 ** ((number - 69) / 12)

// Lets the re-render and a focus move scheduled after it happen.
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
