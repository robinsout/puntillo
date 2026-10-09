import type { Duration, Note } from '@/domain/question'

const DURATIONS: Record<Duration['value'], string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
}

export function toVexNote({ pitch, duration }: Note) {
  return {
    keys: [`${pitch.letter.toLowerCase()}/${pitch.octave}`],
    duration: DURATIONS[duration.value],
    autoStem: true,
  }
}
