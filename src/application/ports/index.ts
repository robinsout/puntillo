import type { PianoKey } from '@/domain/keyboard'
import type { SoundFrame } from '@/domain/hearing'
import type { Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import type { Exercise } from '@/domain/session'
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

// 'unsupported': the browser has no MIDI; 'idle': not asked yet; 'asking': waiting for the
// browser; 'denied': refused or failed; 'ready': allowed, with the names of the instruments
// connected now (none is a state of its own for the screen).
export type MidiStatus =
  | { readonly kind: 'unsupported' | 'idle' | 'asking' | 'denied' }
  | { readonly kind: 'ready'; readonly instruments: readonly string[] }

// connect() asks the browser for MIDI once; later calls do nothing. Never throws.
// onKey() calls back for each key pressed on any connected instrument and returns the unsubscribe.
// onStatus() calls back on each change of status() only, and returns the unsubscribe.
export interface MidiInput {
  connect(): void
  status(): MidiStatus
  onStatus(listener: (status: MidiStatus) => void): () => void
  onKey(listener: (key: PianoKey) => void): () => void
}

// 'unsupported': the browser has no microphone API; 'idle': not asked yet; 'asking': waiting for
// the browser; 'denied': refused or failed; 'missing': no microphone on the device; 'ready':
// allowed.
export interface MicrophoneStatus {
  readonly kind: 'unsupported' | 'idle' | 'asking' | 'denied' | 'missing' | 'ready'
}

// requestAccess() asks the browser for the microphone and lets it go at once. Never throws.
// listen() opens the microphone and calls back with a frame of the sound, many times a second,
// until stop(); a new listen() replaces the one before. stop() releases the microphone, so the
// browser shows no recording. Neither throws.
// onStatus() calls back on each change of status() only, and returns the unsubscribe.
export interface Microphone {
  requestAccess(): void
  listen(onFrame: (frame: SoundFrame) => void): void
  stop(): void
  status(): MicrophoneStatus
  onStatus(listener: (status: MicrophoneStatus) => void): () => void
}

export type ScreenView =
  | { readonly page: 'trainer' | 'progress' | 'settings' | 'wiki' }
  | { readonly page: 'wiki-article'; readonly topic: WikiTopic | 'unknown' }

export type CounterEvent =
  | ({ readonly name: 'view'; readonly lang: Locale } & ScreenView)
  | { readonly name: 'session'; readonly exercise: Exercise; readonly preset: Preset | 'custom' }
  | {
      readonly name: 'summary'
      readonly exercise: Exercise
      readonly score: number
      readonly total: number
    }

// The switch is shared by every project of the origin, so it is not in the storage of Puntillo.
export interface CounterOptOut {
  isOff(): boolean
  setOff(off: boolean): void
  canSave(): boolean
}

// Never throws and never waits: an event that cannot be sent is lost.
export interface VisitCounter {
  count(event: CounterEvent): void
}

// keepOn() keeps the screen of the device on, again after the page has been hidden, until
// release(). Where the browser cannot or will not, nothing happens. Neither throws.
export interface ScreenWakeLock {
  keepOn(): void
  release(): void
}
