import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import type { WikiArticle, WikiTopic } from '@/domain/wiki'

// next() returns a number in [0, 1).
export interface Random {
  next(): number
}

// now() is in milliseconds and monotonic: only differences between readings are meaningful.
export interface Clock {
  now(): number
}

// Never throws: an unavailable or full storage reads as empty and drops writes.
// canSave() is false once it is known that written values will not outlive the page.
export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  canSave(): boolean
}

export interface NoteNamingChoice {
  readonly noteNaming: NoteNaming
  readonly seventhNote: SeventhNote
}

// Rejects when the article cannot be loaded or read.
export interface WikiLibrary {
  load(topic: WikiTopic, locale: Locale, naming: NoteNamingChoice): Promise<WikiArticle>
}
