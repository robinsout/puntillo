import { describe, expect, it } from 'vitest'
import { createHeldNoteDetector, type HeldNoteDetector, type SoundFrame } from '@/domain/hearing'

// Feature microphone-input, slice 1: a note is heard when its sound holds steady (criterion 6):
// the frames give the same key for at least 150 ms, from the first frame of the run to the
// current one (assumption 1). It is heard once, on the frame that completes the 150 ms, and not
// again while it goes on (criterion 11). An unsteady sound, an attack, a slide to the note or a
// trill between two notes, is nothing until one key holds (edge case 1): a new key starts the run
// over. Silence, noise or a sound too unclear to name, a null frame, and a sound beyond the range,
// break the run (edge cases 2, 4); after a break the same key can be heard again.
//
// Slice 2, criterion 11, as the lead decided: each frame has the volume of its window, the root mean
// square of the samples. A note fading, a frame of the run at half its loudest or softer, ends the
// run; the same key starts a run again only with a new attack, its volume risen to twice the
// softest since the fall or more, and is heard again 150 ms after that frame. The frames between the
// fall and the attack start no run, so a note fading away without a new rise is heard once. A new
// key, silence and a sound beyond the range start over at once, as before, with no attack needed.

const hz = (number: number, cents = 0) => 440 * 2 ** ((number - 69 + cents / 100) / 12)

const A4 = 69
const B4 = 71
const C4 = 60
const D4 = 62

const LOUD = 0.5

// Frames of a key every step ms, from fromMs to toMs, both included.
function held(
  number: number,
  fromMs: number,
  toMs: number,
  stepMs = 10,
  volume = LOUD,
): SoundFrame[] {
  const frames: SoundFrame[] = []
  for (let atMs = fromMs; atMs <= toMs; atMs += stepMs)
    frames.push({ atMs, frequency: hz(number), volume })
  return frames
}

// Frames of a key every 10 ms, one for each volume given, from fromMs.
const sounding = (number: number, fromMs: number, volumes: readonly number[]): SoundFrame[] =>
  volumes.map((volume, index) => ({ atMs: fromMs + index * 10, frequency: hz(number), volume }))

const silence = (atMs: number): SoundFrame => ({ atMs, frequency: null, volume: 0 })

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
      volume: LOUD,
    }))

    expect(hear(frames)).toEqual([{ atMs: 150, number: A4 }])
  })

  describe('an unsteady sound (edge case 1)', () => {
    it('hears nothing of a trill between two notes', () => {
      const frames = Array.from({ length: 50 }, (_, index) => ({
        atMs: index * 20,
        frequency: hz(index % 2 === 0 ? A4 : B4),
        volume: LOUD,
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
      const beyond: SoundFrame = { atMs: 110, frequency: hz(30), volume: LOUD }

      expect(hear([...held(A4, 0, 100), beyond, ...held(A4, 120, 260)])).toEqual([])
    })

    it('hears nothing of a sound beyond the range held long', () => {
      expect(hear([...held(30, 0, 1000), ...held(100, 1010, 2000)])).toEqual([])
    })

    it('hears the same note again after a sound beyond the range', () => {
      const beyond: SoundFrame = { atMs: 210, frequency: hz(100), volume: LOUD }

      expect(hear([...held(A4, 0, 200), beyond, ...held(A4, 220, 400)])).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: A4 },
      ])
    })
  })

  describe('a fall of the sound and a new attack (slice 2, criterion 11)', () => {
    it('hears the same note again after a tongued attack, with no silence between', () => {
      expect(
        hear([...held(A4, 0, 200), ...sounding(A4, 210, [0.1]), ...held(A4, 220, 400)]),
      ).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: A4 },
      ])
    })

    it('hears the note three times for three tongued attacks', () => {
      const tongued = [0, 1, 2].flatMap((index) => [
        ...held(A4, index * 300, index * 300 + 280),
        ...sounding(A4, index * 300 + 290, [0.1]),
      ])

      expect(hear(tongued).map(({ atMs }) => atMs)).toEqual([150, 450, 750])
    })

    it('ends the run at a frame of half the loudest volume of the run', () => {
      const frames = [...held(A4, 0, 100), ...sounding(A4, 110, [LOUD / 2]), ...held(A4, 120, 400)]

      expect(hear(frames)).toEqual([{ atMs: 270, number: A4 }])
    })

    it('keeps the run through a frame a little louder than half the loudest', () => {
      const frames = [...held(A4, 0, 100), ...sounding(A4, 110, [0.26]), ...held(A4, 120, 400)]

      expect(hear(frames)).toEqual([{ atMs: 150, number: A4 }])
    })

    it('measures the fall from the loudest frame of the run, not the first', () => {
      const crescendo = sounding(A4, 0, [0.1, 0.2, 0.4, 0.8, 0.8, 0.8])
      const frames = [...crescendo, ...sounding(A4, 60, [0.35]), ...held(A4, 70, 300, 10, 0.8)]

      expect(hear(frames)).toEqual([{ atMs: 220, number: A4 }])
    })

    it('hears a crescendo once', () => {
      const volumes = Array.from({ length: 100 }, (_, index) => 0.05 + index * 0.009)

      expect(hear(sounding(A4, 0, volumes))).toEqual([{ atMs: 150, number: A4 }])
    })

    it('hears a note fading away once (a diminuendo)', () => {
      const volumes = Array.from({ length: 200 }, (_, index) => LOUD * 0.985 ** index)

      expect(hear(sounding(A4, 0, volumes))).toEqual([{ atMs: 150, number: A4 }])
    })

    it('starts no run with the frames between the fall and the attack', () => {
      const frames = [...held(A4, 0, 200), ...held(A4, 210, 1000, 10, 0.1)]

      expect(hear(frames)).toEqual([{ atMs: 150, number: A4 }])
    })

    it('starts no run with a rise to less than twice the softest volume since the fall', () => {
      const frames = [
        ...held(A4, 0, 200),
        ...sounding(A4, 210, [0.2]),
        ...held(A4, 220, 600, 10, 0.39),
      ]

      expect(hear(frames)).toEqual([{ atMs: 150, number: A4 }])
    })

    it('starts the run with a rise to twice the softest volume since the fall', () => {
      const frames = [
        ...held(A4, 0, 200),
        ...sounding(A4, 210, [0.2]),
        ...held(A4, 220, 400, 10, 0.4),
      ]

      expect(hear(frames)).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: A4 },
      ])
    })

    it('measures the attack from the softest frame since the fall', () => {
      const fading = sounding(A4, 210, [0.2, 0.1, 0.05, 0.08])
      const frames = [...held(A4, 0, 200), ...fading, ...held(A4, 250, 450, 10, 0.1)]

      expect(hear(frames)).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 400, number: A4 },
      ])
    })

    it('counts the 150 ms of the new run from the frame of the attack', () => {
      const frames = [...held(A4, 0, 200), ...sounding(A4, 210, [0.1]), ...held(A4, 220, 360)]

      expect(hear(frames)).toEqual([{ atMs: 150, number: A4 }])
    })

    it('starts the run over with the attack when the note falls before it is heard', () => {
      const frames = [...held(A4, 0, 100), ...sounding(A4, 110, [0.1]), ...held(A4, 120, 270)]

      expect(hear(frames)).toEqual([{ atMs: 270, number: A4 }])
    })

    it('hears a new key after the fall with no attack', () => {
      const frames = [
        ...held(A4, 0, 200),
        ...sounding(A4, 210, [0.1]),
        ...held(B4, 220, 370, 10, 0.1),
      ]

      expect(hear(frames)).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: B4 },
      ])
    })

    it('hears the same key after the fall and silence with no attack', () => {
      const frames = [
        ...held(A4, 0, 200),
        ...sounding(A4, 210, [0.1]),
        silence(220),
        ...held(A4, 230, 380, 10, 0.1),
      ]

      expect(hear(frames)).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 380, number: A4 },
      ])
    })

    it('hears the same key after the fall and another key with no attack', () => {
      const frames = [
        ...held(A4, 0, 200),
        ...sounding(A4, 210, [0.1]),
        ...held(B4, 220, 250, 10, 0.1),
        ...held(A4, 260, 410, 10, 0.1),
      ]

      expect(hear(frames)).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 410, number: A4 },
      ])
    })

    it('measures a new run by its own loudest volume', () => {
      const frames = [
        ...held(A4, 0, 200, 10, 0.8),
        silence(210),
        ...held(A4, 220, 400, 10, 0.2),
        ...sounding(A4, 410, [0.1]),
        ...held(A4, 420, 600, 10, 0.2),
      ]

      expect(hear(frames)).toEqual([
        { atMs: 150, number: A4 },
        { atMs: 370, number: A4 },
        { atMs: 570, number: A4 },
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
