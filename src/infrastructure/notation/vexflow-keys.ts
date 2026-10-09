import { isNote, type Duration, type NoteOrRest } from '@/domain/question'

const DURATIONS: Record<Duration['value'], string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
}

// 'r/4' lets VexFlow place each rest at its usual height: the whole rest hangs from the 4th line,
// the others sit on the middle one.
export function toVexNote(element: NoteOrRest) {
  if (!isNote(element)) return { keys: ['r/4'], duration: `${DURATIONS[element.duration.value]}r` }
  const { pitch, duration } = element
  return {
    keys: [`${pitch.letter.toLowerCase()}/${pitch.octave}`],
    duration: DURATIONS[duration.value],
    autoStem: true,
  }
}
