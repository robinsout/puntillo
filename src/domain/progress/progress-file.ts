import {
  isPreset,
  parseDifficulty,
  serializeDifficulty,
  type Difficulty,
  type Preset,
} from '../difficulty'
import { isLocale, type Locale } from '../language'
import { isNoteNaming, isSeventhNote, type NoteNaming, type SeventhNote } from '../naming'
import {
  isExercise,
  isNoteInput,
  type Exercise,
  type NoteInput,
  type SessionLength,
} from '../session'
import { parseHistory, serializeHistory } from './history-text'
import type { ItemStatistics } from './item-statistics'
import { fieldsOf, parseJson } from './json-fields'
import { parseLength } from './parse-values'
import { parseSavedSession, serializeSavedSession, type SavedSession } from './saved-session'
import type { SessionHistory } from './session-history'
import { parseStatistics, serializeStatistics } from './statistics-text'

const APP = 'puntillo'
const VERSION = 1

// A preference left out was not saved and reads as its default.
export interface SavedPreferences {
  readonly language?: Locale
  readonly noteNaming?: NoteNaming
  readonly seventhNote?: SeventhNote
  readonly autoAdvance?: boolean
  readonly showAnswerAtOnce?: boolean
  readonly preset?: Preset
  readonly difficulty?: Difficulty
  readonly exercise?: Exercise
  readonly showNoteNames?: boolean
  readonly noteInput?: NoteInput
  readonly playKeys?: boolean
  readonly shortcutsHintClosed?: boolean
  readonly useMidi?: boolean
  readonly midiSound?: boolean
  readonly sessionLength?: SessionLength
}

export interface ProgressFile {
  readonly preferences: SavedPreferences
  readonly statistics: ItemStatistics
  readonly history: SessionHistory
  readonly session: SavedSession | null
}

type Parse<T> = (value: unknown) => T | null

const textOf =
  <T extends string>(is: (value: string) => value is T): Parse<T> =>
  (value) =>
    typeof value === 'string' && is(value) ? value : null

const flag: Parse<boolean> = (value) => (typeof value === 'boolean' ? value : null)

// The sections are written as JSON within the file, so they are read back by their own parsers.
const sectionOf =
  <T>(parse: (text: string) => T | null): Parse<T> =>
  (value) =>
    fieldsOf(value) ? parse(JSON.stringify(value)) : null

const PREFERENCES: { readonly [K in keyof SavedPreferences]-?: Parse<SavedPreferences[K]> } = {
  language: textOf(isLocale),
  noteNaming: textOf(isNoteNaming),
  seventhNote: textOf(isSeventhNote),
  autoAdvance: flag,
  showAnswerAtOnce: flag,
  preset: textOf(isPreset),
  difficulty: sectionOf(parseDifficulty),
  exercise: textOf(isExercise),
  showNoteNames: flag,
  noteInput: textOf(isNoteInput),
  playKeys: flag,
  shortcutsHintClosed: flag,
  useMidi: flag,
  midiSound: flag,
  sessionLength: parseLength,
}

function parsePreferences(value: unknown): SavedPreferences | null {
  const fields = fieldsOf(value)
  if (!fields) return null
  const preferences: Record<string, unknown> = {}
  for (const [name, parse] of Object.entries(PREFERENCES)) {
    if (fields[name] === undefined) continue
    const parsed = parse(fields[name])
    if (parsed === null) return null
    preferences[name] = parsed
  }
  return preferences
}

const sectionText = (text: string): unknown => JSON.parse(text)

export function serializeProgressFile({
  preferences,
  statistics,
  history,
  session,
}: ProgressFile): string {
  const { difficulty } = preferences
  return JSON.stringify(
    {
      app: APP,
      version: VERSION,
      preferences: {
        ...preferences,
        difficulty: difficulty && sectionText(serializeDifficulty(difficulty)),
      },
      statistics: sectionText(serializeStatistics(statistics)),
      history: sectionText(serializeHistory(history)),
      session: session && sectionText(serializeSavedSession(session)),
    },
    null,
    2,
  )
}

// Null unless every section is whole: a file is taken or turned down as a whole.
export function parseProgressFile(text: string): ProgressFile | null {
  const fields = fieldsOf(parseJson(text))
  if (!fields || fields.app !== APP || fields.version !== VERSION) return null
  const preferences = parsePreferences(fields.preferences)
  const statistics = sectionOf(parseStatistics)(fields.statistics)
  const history = sectionOf(parseHistory)(fields.history)
  const session = fields.session === null ? null : sectionOf(parseSavedSession)(fields.session)
  if (!preferences || !statistics || !history) return null
  if (session === null && fields.session !== null) return null
  return { preferences, statistics, history, session }
}
