import type { Preset } from '@/domain/difficulty'
import { COMMON_TIME, createQuestionOf, type Question } from '@/domain/question'

// Fixed rather than generated, so that a card always shows the same note.
export const PRESET_EXAMPLES: Readonly<Record<Preset, Question>> = {
  'first-steps': createQuestionOf(COMMON_TIME, [
    { pitch: { letter: 'G', octave: 4 }, duration: { value: 'half' } },
  ]),
  'confident-reading': createQuestionOf(
    COMMON_TIME,
    [{ pitch: { letter: 'D', octave: 5 }, duration: { value: 'quarter' } }],
    { count: 1, accidental: 'sharp' },
  ),
  advanced: createQuestionOf(
    COMMON_TIME,
    [{ pitch: { letter: 'A', octave: 5 }, duration: { value: 'quarter', dots: 1 } }],
    { count: 2, accidental: 'flat' },
  ),
}
