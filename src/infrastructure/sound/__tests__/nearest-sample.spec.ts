import { describe, expect, it } from 'vitest'
import { nearestSample } from '@/infrastructure/sound'

// Feature piano-keyboard, criterion 14: twelve samples, a minor third apart, from F♯3 to D♯6
// (keys 54…87); every other key is the nearest sample played faster or slower by the semitones
// between them.

const SAMPLES = [
  ['Fs3.mp3', 54],
  ['A3.mp3', 57],
  ['C4.mp3', 60],
  ['Ds4.mp3', 63],
  ['Fs4.mp3', 66],
  ['A4.mp3', 69],
  ['C5.mp3', 72],
  ['Ds5.mp3', 75],
  ['Fs5.mp3', 78],
  ['A5.mp3', 81],
  ['C6.mp3', 84],
  ['Ds6.mp3', 87],
] as const

describe('the nearest sample', () => {
  it.each(SAMPLES)('of the key of %s is that sample as it is', (file, number) => {
    expect(nearestSample({ number })).toEqual({ file, semitones: 0 })
  })

  it.each([
    [61, 'C4.mp3', 1],
    [62, 'Ds4.mp3', -1],
    [55, 'Fs3.mp3', 1],
    [56, 'A3.mp3', -1],
    [85, 'C6.mp3', 1],
    [86, 'Ds6.mp3', -1],
  ])('of the key %i between two samples is the nearer one: %s by %i', (number, file, semitones) => {
    expect(nearestSample({ number })).toEqual({ file, semitones })
  })

  it.each([
    [53, 'Fs3.mp3', -1],
    [48, 'Fs3.mp3', -6],
    [88, 'Ds6.mp3', 1],
    [96, 'Ds6.mp3', 9],
  ])(
    'of the key %i beyond the samples is the outermost one: %s by %i',
    (number, file, semitones) => {
      expect(nearestSample({ number })).toEqual({ file, semitones })
    },
  )
})
