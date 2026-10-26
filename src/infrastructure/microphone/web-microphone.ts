import type { SoundFrame } from '@/domain/hearing'
import type { Microphone, MicrophoneStatus } from '@/application/ports'

// The filters of the browser are made for speech: they take a held note for noise and fade it.
const CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
}

// 2048 samples hold several periods of E2, the lowest note heard, at any usual sample rate.
const WINDOW = 2048
const FRAME_MS = 20
// Root mean square of the samples: a note played softly a metre away is louder, a quiet room is not.
const MIN_VOLUME = 0.01
const MIN_CLARITY = 0.9

const MISSING = ['NotFoundError', 'OverconstrainedError']

const failureOf = (error: unknown): MicrophoneStatus =>
  error instanceof DOMException && MISSING.includes(error.name)
    ? { kind: 'missing' }
    : { kind: 'denied' }

const release = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop())

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

type Pitchy = typeof import('pitchy')

const rootMeanSquare = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)

function analyse(
  stream: MediaStream,
  pitchy: Promise<Pitchy>,
  onFrame: (frame: SoundFrame) => void,
): () => void {
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = WINDOW
  context.createMediaStreamSource(stream).connect(analyser)
  // Created without a gesture of its own, the context may start suspended.
  void context.resume().catch(() => {})

  let timer: ReturnType<typeof setInterval> | undefined
  let closed = false
  pitchy.then(
    ({ PitchDetector }) => {
      if (closed) return
      const detector = PitchDetector.forFloat32Array(WINDOW)
      detector.minVolumeAbsolute = MIN_VOLUME
      const samples = new Float32Array(WINDOW)
      // With fewer than two periods in the window the autocorrelation is too short to trust:
      // noise passes there for a clear pitch.
      const lowest = (2 * context.sampleRate) / WINDOW
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        const [frequency, clarity] = detector.findPitch(samples, context.sampleRate)
        onFrame({
          atMs: performance.now(),
          frequency: clarity >= MIN_CLARITY && frequency >= lowest ? frequency : null,
          volume: rootMeanSquare(samples),
        })
      }, FRAME_MS)
    },
    () => {},
  )

  return () => {
    closed = true
    clearInterval(timer)
    release(stream)
    void context.close().catch(() => {})
  }
}

export function createWebMicrophone(): Microphone {
  const statusListeners = createListeners<MicrophoneStatus>()
  const supported = typeof navigator.mediaDevices?.getUserMedia === 'function'
  let status: MicrophoneStatus = { kind: supported ? 'idle' : 'unsupported' }
  // Each listen() is a turn; stop() ends it, so that an answer coming after is let go.
  let turn = 0
  let close: (() => void) | null = null

  const become = (next: MicrophoneStatus) => {
    if (next.kind === status.kind) return
    status = next
    statusListeners.tell(next)
  }

  async function open(): Promise<MediaStream | null> {
    if (status.kind !== 'ready') become({ kind: 'asking' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      become({ kind: 'ready' })
      return stream
    } catch (error) {
      become(failureOf(error))
      return null
    }
  }

  async function listenIn(own: number, onFrame: (frame: SoundFrame) => void) {
    // Imported here, not on top, so that pitchy loads only once the microphone is used; while
    // the browser asks, not after.
    const pitchy = import('pitchy')
    // Left unused when the browser refuses; a module that failed to load then gives no frames.
    pitchy.catch(() => {})
    const stream = await open()
    if (stream === null) return
    if (own !== turn) {
      release(stream)
      return
    }
    try {
      close = analyse(stream, pitchy, onFrame)
    } catch {
      release(stream)
    }
  }

  const stop = () => {
    turn += 1
    close?.()
    close = null
  }

  return {
    requestAccess() {
      if (!supported) return
      void open().then((stream) => stream && release(stream))
    },
    listen(onFrame) {
      if (!supported) return
      stop()
      void listenIn(turn, onFrame)
    },
    stop,
    status: () => status,
    onStatus: statusListeners.add,
  }
}
