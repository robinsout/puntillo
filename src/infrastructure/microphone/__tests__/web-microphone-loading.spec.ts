import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SoundFrame } from '@/domain/hearing'
import { createWebMicrophone } from '@/infrastructure/microphone'

// Feature microphone-input, decisions: pitchy is loaded only once the microphone is used, asked
// for or listened to, so that it adds nothing to the time until the page responds. A file of its
// own: the module, once loaded, stays loaded for the file.

const pitchy = vi.hoisted(() => ({ loads: 0 }))

vi.mock('pitchy', async (importOriginal) => {
  pitchy.loads += 1
  return importOriginal()
})

class FakeNode {
  connect<T>(destination: T): T {
    return destination
  }
  disconnect() {}
}

class FakeContext {
  readonly sampleRate = 44_100
  readonly currentTime = 0
  state = 'running'
  createMediaStreamSource() {
    return new FakeNode()
  }
  createAnalyser() {
    return Object.assign(new FakeNode(), {
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0.8,
      getFloatTimeDomainData: (array: Float32Array) => array.fill(0),
      getByteTimeDomainData: (array: Uint8Array) => array.fill(128),
    })
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('loads the pitch detector once the microphone is used, not before', async () => {
  const microphone = createWebMicrophone()
  await new Promise((resolve) => setTimeout(resolve))
  expect(pitchy.loads).toBe(0)

  const frames: SoundFrame[] = []
  microphone.listen((frame) => frames.push(frame))
  await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 2000 })
  microphone.stop()

  expect(pitchy.loads).toBe(1)
})
