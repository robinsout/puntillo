import { nextTick } from 'vue'
import type { Microphone, MicrophoneStatus } from '@/application/ports'
import type { SoundFrame } from '@/domain/hearing'
import type { Locale } from '@/domain/language'

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
    statusListeners: () => statusListeners.size,
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

// Equal temperament, A4 = 440 Hz: the MIDI number 69; off by the cents given.
export const frequencyOf = (number: number, cents = 0) =>
  440 * 2 ** ((number - 69 + cents / 100) / 12)

// Feature microphone-input, slice 4: the line of the state of the microphone (criterion 14), by
// the state it tells.
export const MICROPHONE_LINES = {
  en: {
    ready: 'Microphone: listening',
    denied: "The browser didn't allow the microphone. Allow it in the site settings.",
    missing: 'No microphone found on this device.',
    unsupported: "This browser can't use the microphone.",
  },
  ru: {
    ready: 'Микрофон слушает',
    denied: 'Браузер не разрешил микрофон. Разрешите его в настройках сайта.',
    missing: 'На этом устройстве нет микрофона.',
    unsupported: 'Этот браузер не работает с микрофоном.',
  },
  es: {
    ready: 'Micrófono: escuchando',
    denied: 'El navegador no permitió el micrófono. Permítelo en la configuración del sitio.',
    missing: 'No se encontró un micrófono en este dispositivo.',
    unsupported: 'Este navegador no puede usar el micrófono.',
  },
} as const satisfies Record<Locale, Record<'ready' | 'denied' | 'missing' | 'unsupported', string>>

const LINES: readonly string[] = Object.values(MICROPHONE_LINES).flatMap(Object.values)

// Whether a text, read as a screen reader reads it, is a line of the state of the microphone.
export const isMicrophoneLine = (text: string) => LINES.includes(text)

// Lets the re-render and a focus move scheduled after it happen.
async function settle() {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
