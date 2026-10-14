import type { PianoKey } from '@/domain/keyboard'
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

// now() is in epoch milliseconds, by the clock of the device: a date to keep, not a duration.
export interface WallClock {
  now(): number
}

// every() returns the function that stops the ticks. A tick only says it is time to look again:
// ticks can be late or held back, as in a hidden tab, so time is read from a Clock.
export interface Timer {
  every(intervalMs: number, tick: () => void): () => void
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

export interface FileSaver {
  save(name: string, text: string): void
}

// load() starts fetching the sound once; play() is silent until it is loaded or if it failed.
export interface PianoSound {
  load(): void
  play(key: PianoKey): void
}
