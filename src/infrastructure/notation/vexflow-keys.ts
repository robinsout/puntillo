import type { Duration, Note } from '@/domain/question'

const DURATIONS: Record<Duration['value'], string> = {
  whole: 'w',
}

// Нота в виде, который понимает StaveNote: ключ «c/4» и код длительности «w».
export function toVexNote({ pitch, duration }: Note) {
  return {
    keys: [`${pitch.letter.toLowerCase()}/${pitch.octave}`],
    duration: DURATIONS[duration.value],
  }
}
