import type { PianoKey } from '@/domain/keyboard'
import type { PianoSound } from '@/application/ports'
import { nearestSample, SAMPLE_FILES } from './nearest-sample'

const HOLD_SECONDS = 0.8
const SOUND_SECONDS = 1.0

export function createWebAudioPiano(baseUrl: string): PianoSound {
  let context: AudioContext | null = null
  let started = false
  let buffers: ReadonlyMap<string, AudioBuffer> | null = null

  // A refused resume() is not an error worth reporting: the sound just stays silent.
  const resume = () => {
    if (context?.state === 'suspended') context.resume().catch(() => {})
  }

  async function fetchSamples(audio: AudioContext) {
    const decoded = await Promise.all(
      SAMPLE_FILES.map(async (file) => {
        const response = await fetch(`${baseUrl}piano/${file}`)
        if (!response.ok) throw new Error(`${file}: ${response.status}`)
        return [file, await audio.decodeAudioData(await response.arrayBuffer())] as const
      }),
    )
    return new Map(decoded)
  }

  return {
    load() {
      resume()
      if (started) return
      started = true
      try {
        const audio = new AudioContext()
        context = audio
        resume()
        fetchSamples(audio).then(
          (samples) => {
            buffers = samples
          },
          () => {},
        )
      } catch {
        context = null
      }
    },
    play(key: PianoKey) {
      resume()
      if (!context || !buffers) return
      const { file, semitones } = nearestSample(key)
      const buffer = buffers.get(file)
      if (!buffer) return
      const now = context.currentTime
      const source = context.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = 2 ** (semitones / 12)
      const gain = context.createGain()
      gain.gain.setValueAtTime(1, now + HOLD_SECONDS)
      gain.gain.linearRampToValueAtTime(0, now + SOUND_SECONDS)
      source.connect(gain)
      gain.connect(context.destination)
      source.start(now)
      source.stop(now + SOUND_SECONDS)
    },
  }
}
