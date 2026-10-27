import { describe, expect, it } from 'vitest'
import { readPitch, type PitchReading } from '@/application/hearing'
import type { SoundFrame, Tuning } from '@/domain/hearing'

// Feature microphone-input, slice 4: the frames of the microphone become the readings of the
// indicator over the staff (criterion 13), as the lead decided. A reading is given at most once in
// 100 ms of the time of the frames, with no timer: at the first frame 100 ms or more after the
// first frame heard, then at the first frame 100 ms or more after the last reading. It reads the
// frames since the last reading, its window: the median of their frequencies, if at least half of
// them have one, is the key heard, as the instrument writes it (criterion 9), and its distance from
// that key in whole cents; otherwise, and for a sound beyond the range, it is null: silence, noise
// or nothing clear (edge case 2). Every window gives its reading, the same as the one before or
// not. Each reader has windows of its own.

const hz = (number: number, cents = 0) => 440 * 2 ** ((number - 69 + cents / 100) / 12)

const A4 = 69
const B_FLAT_3 = 58
const C4 = 60
const LOUD = 0.5

// Frames of a key every step ms, from fromMs to toMs, both included.
function held(number: number, fromMs: number, toMs: number, cents = 0, stepMs = 20): SoundFrame[] {
  const frames: SoundFrame[] = []
  for (let atMs = fromMs; atMs <= toMs; atMs += stepMs)
    frames.push({ atMs, frequency: hz(number, cents), volume: LOUD })
  return frames
}

// Frames every step ms from fromMs, one for each frequency given; null is silence or noise.
const frames = (
  fromMs: number,
  frequencies: readonly (number | null)[],
  stepMs = 25,
): SoundFrame[] =>
  frequencies.map((frequency, index) => ({
    atMs: fromMs + index * stepMs,
    frequency,
    volume: frequency === null ? 0 : LOUD,
  }))

const silence = (fromMs: number, toMs: number): SoundFrame[] =>
  held(A4, fromMs, toMs).map((frame) => ({ ...frame, frequency: null, volume: 0 }))

// The readings in turn, each with the time of the frame that gave it.
function reader(tuning: Tuning = 'c') {
  const readings: { atMs: number; reading: PitchReading | null }[] = []
  let atMs = 0
  const read = readPitch((reading) => readings.push({ atMs, reading }), tuning)
  return {
    readings,
    hear: (heard: readonly SoundFrame[]) =>
      heard.forEach((frame) => {
        atMs = frame.atMs
        read(frame)
      }),
    last: () => readings.at(-1)?.reading,
  }
}

describe('reading the pitch', () => {
  it('reads the key heard and its cents', () => {
    const { hear, last } = reader()

    hear(held(A4, 0, 100, 12))

    expect(last()).toEqual({ key: { number: A4 }, cents: 12 })
  })

  it('reads a sound below the key in negative cents', () => {
    const { hear, last } = reader()

    hear(held(A4, 0, 100, -8))

    expect(last()).toEqual({ key: { number: A4 }, cents: -8 })
  })

  it('reads a sound in tune as 0 cents', () => {
    const { hear, last } = reader()

    hear(held(C4, 0, 100))

    expect(last()).toEqual({ key: { number: C4 }, cents: 0 })
  })

  it.each([
    [12.4, 12],
    [12.6, 13],
    [-7.6, -8],
    [-0.3, 0],
  ])('rounds %d cents to %i', (cents, rounded) => {
    const { hear, last } = reader()

    hear(held(A4, 0, 100, cents))

    expect(last()?.cents).toBe(rounded)
  })

  it('reads 60 cents above A4 as B♭4, 40 cents below it', () => {
    const { hear, last } = reader()

    hear(held(A4, 0, 100, 60))

    expect(last()).toEqual({ key: { number: 70 }, cents: -40 })
  })
})

describe('the time of the readings', () => {
  it('gives no reading before 100 ms of frames', () => {
    const { readings, hear } = reader()

    hear(held(A4, 0, 80))

    expect(readings).toEqual([])
  })

  it('gives the first reading at the frame 100 ms after the first one', () => {
    const { readings, hear } = reader()

    hear(held(A4, 1000, 1100))

    expect(readings.map(({ atMs }) => atMs)).toEqual([1100])
  })

  it('gives a reading each 100 ms of frames, the same one each time', () => {
    const { readings, hear } = reader()

    hear(held(A4, 0, 390))

    expect(readings.map(({ atMs }) => atMs)).toEqual([100, 200, 300])
    for (const { reading } of readings) expect(reading).toEqual({ key: { number: A4 }, cents: 0 })
  })

  it('gives a reading at the first frame 100 ms or more after the last one', () => {
    const { readings, hear } = reader()

    hear(held(A4, 0, 400, 0, 30))

    expect(readings.map(({ atMs }) => atMs)).toEqual([120, 240, 360])
  })

  it('reads only the frames since the last reading', () => {
    const { readings, hear } = reader()

    hear([...held(A4, 0, 100), ...held(C4, 120, 200)])

    expect(readings.map(({ reading }) => reading?.key.number)).toEqual([A4, C4])
  })
})

describe('the median of a window', () => {
  it('passes over a frame far off the note', () => {
    const { hear, last } = reader()

    hear(frames(0, [hz(A4, 10), hz(A4, 10), hz(80), hz(A4, 10), hz(A4, -45)]))

    expect(last()).toEqual({ key: { number: A4 }, cents: 10 })
  })

  it('is taken of the frequencies, not of the order of the frames', () => {
    const { hear, last } = reader()

    hear(frames(0, [hz(A4, 30), hz(A4, -20), hz(A4, 5), hz(A4, 40), hz(A4, -10)]))

    expect(last()).toEqual({ key: { number: A4 }, cents: 5 })
  })

  it('reads a window with half of its frames heard, six frames of 20 ms', () => {
    const { hear, last } = reader()

    hear(frames(0, [hz(A4, 7), null, hz(A4, 7), null, hz(A4, 7), null], 20))

    expect(last()).toEqual({ key: { number: A4 }, cents: 7 })
  })

  it('reads no pitch in a window with fewer than half of its frames heard', () => {
    const { hear, last } = reader()

    hear(frames(0, [hz(A4), null, null, hz(A4), null]))

    expect(last()).toBeNull()
  })
})

describe('no pitch (edge cases 2, 4)', () => {
  it('reads no pitch in silence', () => {
    const { readings, hear } = reader()

    hear(silence(0, 100))

    expect(readings).toEqual([{ atMs: 100, reading: null }])
  })

  it('reads no pitch once the note has stopped', () => {
    const { readings, hear } = reader()

    hear([...held(A4, 0, 100), ...silence(120, 200)])

    expect(readings.map(({ reading }) => reading)).toEqual([
      { key: { number: A4 }, cents: 0 },
      null,
    ])
  })

  it.each([
    ['below E2', 30],
    ['above C7', 100],
  ])('reads no pitch for a sound %s', (_, number) => {
    const { hear, last } = reader()

    hear(held(number, 0, 100))

    expect(last()).toBeNull()
  })
})

describe('an instrument in B♭ (criterion 9)', () => {
  it('reads B♭3 heard as the written C4, its cents as heard', () => {
    const { hear, last } = reader('b-flat')

    hear(held(B_FLAT_3, 0, 100, -15))

    expect(last()).toEqual({ key: { number: C4 }, cents: -15 })
  })

  it('reads a sound in C as heard', () => {
    const { hear, last } = reader('c')

    hear(held(B_FLAT_3, 0, 100))

    expect(last()).toEqual({ key: { number: B_FLAT_3 }, cents: 0 })
  })

  it('reads no pitch for a sound below E2, though written above it', () => {
    const { hear, last } = reader('b-flat')

    hear(held(38, 0, 100))

    expect(last()).toBeNull()
  })
})

it('keeps windows of its own: another reader reads from its first frame', () => {
  const first = reader()
  const second = reader()
  first.hear(held(A4, 0, 60))

  second.hear(held(A4, 80, 140))
  first.hear(held(A4, 80, 140))

  expect(second.readings).toEqual([])
  expect(first.readings.map(({ atMs }) => atMs)).toEqual([100])
})
