import type { QuestionLength } from '@/domain/difficulty'

export const QUESTION_LENGTH_KEYS: Record<QuestionLength, string> = {
  'one-note': 'preset.length.oneNote',
  'two-to-four-notes': 'preset.length.severalNotes',
  'one-bar': 'preset.length.oneBar',
  'two-bars': 'preset.length.twoBars',
}
