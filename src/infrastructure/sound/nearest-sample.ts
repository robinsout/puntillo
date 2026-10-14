import type { PianoKey } from '@/domain/keyboard'

// A minor third apart, from F#3 to D#6.
const SAMPLES: readonly { readonly file: string; readonly number: number }[] = [
  ['Fs3', 54],
  ['A3', 57],
  ['C4', 60],
  ['Ds4', 63],
  ['Fs4', 66],
  ['A4', 69],
  ['C5', 72],
  ['Ds5', 75],
  ['Fs5', 78],
  ['A5', 81],
  ['C6', 84],
  ['Ds6', 87],
].map(([name, number]) => ({ file: `${name}.mp3`, number: Number(number) }))

export const SAMPLE_FILES = SAMPLES.map(({ file }) => file)

export function nearestSample({ number }: PianoKey): { file: string; semitones: number } {
  // On a tie the lower sample wins, as the list is ascending and only a strictly nearer one replaces.
  const nearest = SAMPLES.reduce((best, sample) =>
    Math.abs(sample.number - number) < Math.abs(best.number - number) ? sample : best,
  )
  return { file: nearest.file, semitones: number - nearest.number }
}
