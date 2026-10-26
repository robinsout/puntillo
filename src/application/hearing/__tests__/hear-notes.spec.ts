import { describe, expect, it } from 'vitest'
import { hearNotes } from '@/application/hearing'
import type { PianoKey } from '@/domain/keyboard'
import type { SoundFrame } from '@/domain/hearing'

// Feature microphone-input, slice 1: the frames of the microphone become notes played (criterion
// 6): a note held steady is played once (criterion 11), an unsteady sound, silence or a sound
// beyond the range is nothing (edge cases 1, 2, 4). Each listener hears with a run of its own.
// Slice 2: a note played again after a tongued attack, its sound falling and rising with no
// silence between, is played twice (criterion 11).

const hz = (number: number) => 440 * 2 ** ((number - 69) / 12)

function held(number: number, fromMs: number, toMs: number, volume = 0.5): SoundFrame[] {
  const frames: SoundFrame[] = []
  for (let atMs = fromMs; atMs <= toMs; atMs += 20)
    frames.push({ atMs, frequency: hz(number), volume })
  return frames
}

const silence = (atMs: number): SoundFrame => ({ atMs, frequency: null, volume: 0 })

function listener() {
  const played: number[] = []
  const hear = hearNotes((key: PianoKey) => played.push(key.number))
  return { played, hear: (frames: readonly SoundFrame[]) => frames.forEach(hear) }
}

describe('hearing notes', () => {
  it('plays a note held steady once', () => {
    const { played, hear } = listener()

    hear(held(62, 0, 1000))

    expect(played).toEqual([62])
  })

  it('plays nothing of a note too short', () => {
    const { played, hear } = listener()

    hear(held(62, 0, 100))

    expect(played).toEqual([])
  })

  it('plays nothing of silence', () => {
    const { played, hear } = listener()

    hear([0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map(silence))

    expect(played).toEqual([])
  })

  it('plays nothing of a sound beyond the range', () => {
    const { played, hear } = listener()

    hear(held(30, 0, 1000))

    expect(played).toEqual([])
  })

  it('plays notes one after another', () => {
    const { played, hear } = listener()

    hear([...held(60, 0, 300), ...held(64, 320, 600), silence(620)])
    hear(held(64, 640, 900))

    expect(played).toEqual([60, 64, 64])
  })

  it('plays a note twice when it is tongued again, with no silence between', () => {
    const { played, hear } = listener()

    hear([...held(62, 0, 300), ...held(62, 320, 320, 0.1), ...held(62, 340, 600)])

    expect(played).toEqual([62, 62])
  })

  it('hears with a run of its own for each listener', () => {
    const first = listener()
    const second = listener()
    first.hear(held(62, 0, 100))

    second.hear(held(62, 120, 200))
    first.hear(held(62, 120, 200))

    expect(second.played).toEqual([])
    expect(first.played).toEqual([62])
  })
})
