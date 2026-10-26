import { createHeldNoteDetector, type SoundFrame } from '@/domain/hearing'
import type { PianoKey } from '@/domain/keyboard'

export function hearNotes(onNote: (key: PianoKey) => void): (frame: SoundFrame) => void {
  const detector = createHeldNoteDetector()
  return (frame) => {
    const key = detector.hear(frame)
    if (key !== null) onNote(key)
  }
}
