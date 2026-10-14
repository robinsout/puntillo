import { parseDifficulty, serializeDifficulty, type Difficulty } from '../difficulty'
import type { KeySignature } from '../key-signature'
import {
  createQuestionOf,
  isNote,
  TIME_SIGNATURES,
  type Accidental,
  type Grade,
  type NoteGrade,
  type NoteOrRest,
  type Question,
} from '../question'
import type { ReviewQueue } from '../review-queue'
import {
  isExercise,
  type Exercise,
  type Mistakes,
  type Score,
  type SessionLength,
} from '../session'
import { isWikiTopic, type WikiTopic } from '../wiki'
import { fieldsOf, isCount, listOf, parseJson } from './json-fields'
import { parseDuration, parseItem, parseLength, parsePitch } from './parse-values'

// A session not finished, as it stood when saved: enough to go on with it on another page.
export interface SavedSession {
  readonly exercise: Exercise
  readonly length: SessionLength
  readonly difficulty: Difficulty
  readonly attempts: 1 | 2
  // Of the question on the screen.
  readonly number: number
  readonly elapsedMs: number
  readonly score: Score
  readonly mistakes: Mistakes
  readonly reviewQueue: ReviewQueue
  readonly question: Question
  // Null while the question is not checked; second is null until the second attempt is checked.
  readonly grades: { readonly first: Grade; readonly second: Grade | null } | null
}

const VERSION = 1

const KEY_SIGNATURE_COUNTS = [1, 2, 3, 4, 5, 6, 7] as const
const KEY_SIGNATURE_SIGNS = ['sharp', 'flat'] as const
const ACCIDENTALS: readonly Accidental[] = ['sharp', 'flat', 'natural']

// The notes are left out: they are made from the elements.
export function serializeSavedSession({ difficulty, question, ...saved }: SavedSession): string {
  const { clef, keySignature, timeSignature, elements } = question
  const difficultyFields: unknown = JSON.parse(serializeDifficulty(difficulty))
  return JSON.stringify({
    version: VERSION,
    ...saved,
    difficulty: difficultyFields,
    question: { clef, keySignature, timeSignature, elements },
  })
}

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isPositiveCount = (value: unknown): value is number => isCount(value) && value > 0

function parseScore(value: unknown): Score | null {
  const fields = fieldsOf(value)
  if (!fields) return null
  const { checked, points, maxPoints, streak, bestStreak, totalTimeMs } = fields
  if (!isCount(checked) || !isCount(points) || !isCount(maxPoints) || points > maxPoints)
    return null
  if (!isCount(streak) || !isCount(bestStreak) || streak > bestStreak) return null
  if (!isTime(totalTimeMs)) return null
  return { checked, points, maxPoints, streak, bestStreak, totalTimeMs }
}

const parseTopic = (value: unknown): WikiTopic | null =>
  typeof value === 'string' && isWikiTopic(value) ? value : null

function parseMistake(value: unknown): Mistakes['entries'][number] | null {
  const fields = fieldsOf(value)
  const item = parseItem(fields?.item)
  const topics = listOf(fields?.topics, parseTopic)
  if (!fields || !item || !topics) return null
  const { count, last } = fields
  return isPositiveCount(count) && isPositiveCount(last) ? { item, count, topics, last } : null
}

function parseMistakes(value: unknown): Mistakes | null {
  const fields = fieldsOf(value)
  const entries = listOf(fields?.entries, parseMistake)
  return fields && entries && isCount(fields.made) ? { made: fields.made, entries } : null
}

function parseQueueEntry(value: unknown): ReviewQueue['entries'][number] | null {
  const fields = fieldsOf(value)
  const item = parseItem(fields?.item)
  if (!fields || !item) return null
  const { dueOn, rightInRow, wrongTwice } = fields
  if (!isCount(dueOn) || !isCount(rightInRow) || typeof wrongTwice !== 'boolean') return null
  return { item, dueOn, rightInRow, wrongTwice }
}

function parseReviewQueue(value: unknown): ReviewQueue | null {
  const fields = fieldsOf(value)
  const entries = listOf(fields?.entries, parseQueueEntry)
  return fields && entries && isCount(fields.asked) ? { asked: fields.asked, entries } : null
}

function parseKeySignature(value: unknown): KeySignature | null {
  const fields = fieldsOf(value)
  if (fields?.count === 0) return { count: 0 }
  const count = KEY_SIGNATURE_COUNTS.find((candidate) => candidate === fields?.count)
  const accidental = KEY_SIGNATURE_SIGNS.find((candidate) => candidate === fields?.accidental)
  return count && accidental ? { count, accidental } : null
}

function parseElement(value: unknown): NoteOrRest | null {
  const fields = fieldsOf(value)
  const duration = parseDuration(fields?.duration)
  if (!fields || !duration) return null
  if (fields.pitch === undefined) return { duration }
  const pitch = parsePitch(fields.pitch)
  if (!pitch) return null
  if (fields.accidental === undefined) return { pitch, duration }
  const accidental = ACCIDENTALS.find((candidate) => candidate === fields.accidental)
  return accidental ? { pitch, duration, accidental } : null
}

function parseQuestion(value: unknown): Question | null {
  const fields = fieldsOf(value)
  const keySignature = parseKeySignature(fields?.keySignature)
  const time = fieldsOf(fields?.timeSignature)
  const timeSignature = TIME_SIGNATURES.find(
    ({ beats, beatValue }) => beats === time?.beats && beatValue === time?.beatValue,
  )
  const elements = listOf(fields?.elements, parseElement)
  if (fields?.clef !== 'treble' || !keySignature || !timeSignature) return null
  if (!elements?.some(isNote)) return null
  return createQuestionOf(timeSignature, elements, keySignature)
}

function parseNoteGrade(value: unknown): NoteGrade | null {
  const fields = fieldsOf(value)
  const pitch = fields?.pitch
  const duration = fields?.duration
  if (typeof pitch !== 'boolean') return null
  return typeof duration === 'boolean' || duration === null ? { pitch, duration } : null
}

// A grade of each note of the question.
function parseGrade(value: unknown, question: Question): Grade | null {
  const grade = listOf(value, parseNoteGrade)
  return grade?.length === question.notes.length ? grade : null
}

function parseGrades(value: unknown, question: Question): SavedSession['grades'] | undefined {
  if (value === null) return null
  const fields = fieldsOf(value)
  const first = parseGrade(fields?.first, question)
  const second = fields?.second === null ? null : parseGrade(fields?.second, question)
  if (!first || (fields?.second !== null && !second)) return undefined
  return { first, second }
}

const parseAttempts = (value: unknown): 1 | 2 | null => (value === 1 || value === 2 ? value : null)

const fitsLength = (number: number, length: SessionLength): boolean =>
  number > 0 && (typeof length !== 'number' || number <= length)

// Null when damaged or of another version.
export function parseSavedSession(text: string): SavedSession | null {
  const fields = fieldsOf(parseJson(text))
  if (!fields || fields.version !== VERSION) return null
  const { exercise, number, elapsedMs } = fields
  const length = parseLength(fields.length)
  const difficulty =
    fieldsOf(fields.difficulty) && parseDifficulty(JSON.stringify(fields.difficulty))
  const attempts = parseAttempts(fields.attempts)
  const score = parseScore(fields.score)
  const mistakes = parseMistakes(fields.mistakes)
  const reviewQueue = parseReviewQueue(fields.reviewQueue)
  const question = parseQuestion(fields.question)
  if (typeof exercise !== 'string' || !isExercise(exercise) || length === null) return null
  if (!difficulty || !attempts || !isCount(number) || !fitsLength(number, length)) return null
  if (!isTime(elapsedMs) || !score || !mistakes || !reviewQueue || !question) return null
  const grades = parseGrades(fields.grades, question)
  if (grades === undefined) return null
  return {
    exercise,
    length,
    difficulty,
    attempts,
    number,
    elapsedMs,
    score,
    mistakes,
    reviewQueue,
    question,
    grades,
  }
}
