import { ref, watch, type WatchSource } from 'vue'
import { keyIn, shiftOctave, startOctave, type PianoKey } from '@/domain/keyboard'
import type { Letter } from '@/domain/pitch'

// The octave the letters of the computer keyboard play, back to the start on each question.
export function useWorkingOctave(keys: () => readonly PianoKey[], question: WatchSource<unknown>) {
  const octave = ref(startOctave(keys()))
  watch(question, () => {
    octave.value = startOctave(keys())
  })

  return {
    shift(step: 1 | -1) {
      octave.value = shiftOctave(keys(), octave.value, step)
    },
    // Null where the octave runs past the keyboard.
    keyOf(letter: Letter, black: boolean): PianoKey | null {
      const { number } = keyIn(octave.value, letter, black)
      return keys().find((key) => key.number === number) ?? null
    },
  }
}
