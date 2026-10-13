import type { Exercise } from '@/domain/session'

export const EXERCISE_NAME_KEYS: Record<Exercise, string> = {
  read: 'session.readNotes',
  write: 'session.writeNotes',
}
