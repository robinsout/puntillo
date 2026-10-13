import { isExercise, SESSION_LENGTHS, type SessionLength } from '../session'
import type { SessionHistory, SessionRecord } from './session-history'
import { fieldsOf, isCount, parseJson } from './json-fields'

const VERSION = 1

export const serializeHistory = ({ sessions }: SessionHistory): string =>
  JSON.stringify({ version: VERSION, sessions })

function parseLength(value: unknown): SessionLength | null {
  const minutes = fieldsOf(value)?.minutes
  return (
    SESSION_LENGTHS.find((candidate) =>
      typeof candidate === 'object' ? candidate.minutes === minutes : candidate === value,
    ) ?? null
  )
}

function parseRecord(value: unknown): SessionRecord | null {
  const fields = fieldsOf(value)
  if (!fields) return null
  const { finishedAt, exercise, questions, accuracy } = fields
  const length = parseLength(fields.length)
  if (!isCount(finishedAt) || typeof exercise !== 'string' || !isExercise(exercise)) return null
  if (length === null || !isCount(questions) || questions === 0) return null
  if (!isCount(accuracy) || accuracy > 100) return null
  return { finishedAt, exercise, length, questions, accuracy }
}

export function parseHistory(text: string): SessionHistory | null {
  const fields = fieldsOf(parseJson(text))
  if (!fields || fields.version !== VERSION || !Array.isArray(fields.sessions)) return null
  const sessions = fields.sessions.map(parseRecord)
  return sessions.every((each): each is SessionRecord => each !== null) ? { sessions } : null
}
