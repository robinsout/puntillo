import {
  createHeldNoteDetector,
  writtenKeyOf,
  type SoundFrame,
  type Tuning,
} from '@/domain/hearing'
import type { PianoKey } from '@/domain/keyboard'

export function hearNotes(
  onNote: (key: PianoKey) => void,
  tuning: Tuning,
): (frame: SoundFrame) => void {
  const detector = createHeldNoteDetector()
  return (frame) => {
    const key = detector.hear(frame)
    if (key !== null) onNote(writtenKeyOf(key, tuning))
  }
}
