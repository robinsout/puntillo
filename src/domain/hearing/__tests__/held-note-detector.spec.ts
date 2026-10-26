import { describe, expect, it } from 'vitest'
import { createHeldNoteDetector, type HeldNoteDetector, type SoundFrame } from '@/domain/hearing'

// Feature microphone-input, slice 1: a note is heard when its sound holds steady (criterion 6):
// the frames give the same key for at least 150 ms, from the first frame of the run to the
// current one (assumption 1). It is heard once, on the frame that completes the 150 ms, and not
// again while it goes on (criterion 11). An unsteady sound, an attack, a slide to the note or a
// trill between two notes, is nothing until one key holds (edge case 1): a new key starts the run
// over. Silence, noise or a sound too unclear to name, a null frame, and a sound beyond the range,
// break the run (edge cases 2, 4); after a break the same key can be heard again.

const hz = (number: number, cents = 0) => 440 * 2 ** ((number - 69 + cents / 100) / 12)

const A4 = 69
const B4 = 71
const C4 = 60
const D4 = 62

// Frames of a key every step ms, from fromMs to toMs, both included.
function held(number: number, fromMs: number, toMs: number, stepMs = 10): SoundFrame[] {
  const frames: SoundFrame[] = []
  for (let atMs = fromMs; atMs <= toMs; atMs += stepMs) frames.push({ atMs, frequency: hz(number) })
  return frames
}

const silence = (atMs: number): SoundFrame => ({ atMs, frequency: null })

// The frames heard in turn: the key numbers heard, with the time of the frame that heard each.
function hear(
  frames: readonly SoundFrame[],
  detector: HeldNoteDetector = createHeldNoteDetector(),
) {
  return frames.flatMap((frame) => {
    const key = detector.hear(frame)
    return key === null ? [] : [{ atMs: frame.atMs, number: key.number }]
  })
}

describe('a held note detector', () => {
  it('hears a note held for 150 ms, on the frame that completes them', () => {
    expect(hear(held(A4, 0, 150))).toEqual([{ atMs: 150, number: A4 }])
  })

  it('hears nothing of a note held for 140 ms', () => {
    expect(hear(held(A4, 0, 140))).toEqual([])
  })

  it('counts the 150 ms from the first frame of the run, whatever the step of the frames', () => {
    expect(hear(held(A4, 1000, 1200, 50))).toEqual([{ atMs: 1150, number: A4 }])
  })

  it('hears a note held on once (criterion 11)', () => {
    expect(hear(held(A4, 0, 2000))).toEqual([{ atMs: 150, number: A4 }])
  })

  it('gives the key of the note', () => {
    const detector = createHeldNoteDetector()
    const heard = held(D4, 0, 150).map((frame) => detector.hear(frame))

    expect(heard.at(-1)).toEqual({ number: D4 })
    expect(heard.slice(0, -1).every((key) => key === null)).toBe(true)
  })

  it('keeps the run through a pitch wavering within the semitone', () => {
    const frames: SoundFrame[] = [0, 30, 60, 90, 120, 150].map((atMs, index) => ({
      atMs,
      frequency: hz(A4, index % 2 === 0 ? -30 : 30),
    }))

    expect(hear(frames)).toEqual([{ atMs: 150, number: A4 }])
  })

  describe('an unsteady sound (edge case 1)', () => {
    it('hears nothing of a trill between two notes', () => {
      const frames = Array.from({ length: 50 }, (_, index) => ({
        atMs: index * 20,
        frequency: hz(index % 2 === 0 ? A4 : B4),
      }))

      expect(hear(frames)).toEqual([])
    })

    it('starts the run over with a new key', () => {
      expect(hear([...held(C4, 0, 100), ...held(D4, 110, 250)])).toEqual([])
    })

    it('hears the note reached after a slide, counted from where it holds', () => {
      expect(hear([...held(C4, 0, 100), ...held(D4, 110, 260)])).toEqual([
        { atMs: 260, number: D4 },
      ])
    })

    it('hears the next note once it holds in its turn', () => {
      expect(hear([...held(C4, 0, 300), ...held(D4, 310, 460)])).toEqual([
        { atMs: 150, number: C4 },
        { atMs: 460, number: D4 },
      ])
    })
  })

  describe('a break (criterion 11, edge cases 2 and 4)', () => {
    it('hears nothing of silence', () => {
      expect(hear(Array.from({ length: 50 }, (_, index) => silence(index * 20)))).toEqual([])
    })

    it('breaks the run with silence', () => {
      expect(hear([...held(A4, 0, 100), silence(110), ...held(A4, 120, 270)])).toEqual([
        { atMs: 270, number: A4 },
      ])
    })

    it('hears the same note again after silence', () => {
      expect(hear([...held(A4, 0, 200), silence(210), ...held(A4, 220, 400)])).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: A4 },
      ])
    })

    it('breaks the run with a sound beyond the range', () => {
      const beyond: SoundFrame = { atMs: 110, frequency: hz(30) }

      expect(hear([...held(A4, 0, 100), beyond, ...held(A4, 120, 260)])).toEqual([])
    })

    it('hears nothing of a sound beyond the range held long', () => {
      expect(hear([...held(30, 0, 1000), ...held(100, 1010, 2000)])).toEqual([])
    })

    it('hears the same note again after a sound beyond the range', () => {
      const beyond: SoundFrame = { atMs: 210, frequency: hz(100) }

      expect(hear([...held(A4, 0, 200), beyond, ...held(A4, 220, 400)])).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: A4 },
      ])
    })
  })

  it('keeps a run of its own: another detector hears from its first frame', () => {
    const first = createHeldNoteDetector()
    const second = createHeldNoteDetector()
    hear(held(A4, 0, 100), first)

    expect(hear(held(A4, 110, 200), second)).toEqual([])
    expect(hear(held(A4, 110, 200), first)).toEqual([{ atMs: 150, number: A4 }])
  })
})
